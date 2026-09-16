// ---------------------------------------------------------------------------
// Provider-agnostic AI engine. Radar can run on Anthropic (Claude), OpenAI,
// xAI (Grok) or Azure OpenAI (Microsoft Foundry) — the last one for companies
// that require corporate data to stay inside a Microsoft tenant: the admin
// picks the engine and enters its key in Settings →
// Budget. Every AI feature goes through lib/claude.ts → this module, so the
// choice applies app-wide. Models are editable per provider, so future model
// names work without code changes.
// ---------------------------------------------------------------------------

export type AiProviderId = 'anthropic' | 'openai' | 'grok' | 'azure';

export type AiProviderDef = {
  id: AiProviderId;
  label: string;
  /** Env-var name the key is stored under (UI-entered keys use the same name). */
  keyEnv: string;
  /** OpenAI-compatible chat-completions endpoint (absent for Anthropic: SDK). */
  endpoint?: string;
  /**
   * Env/credential name holding a tenant-specific base URL (Azure OpenAI: every
   * customer has its own resource). When set, it wins over `endpoint`.
   */
  endpointEnv?: string;
  /** How the key travels: bearer token (OpenAI-style) or `api-key` header (Azure). */
  authHeader?: 'bearer' | 'api-key';
  /** Which body field caps the output ("max_tokens" vs "max_completion_tokens"). */
  maxTokensField?: 'max_tokens' | 'max_completion_tokens';
  /** Default models per tier — overridable from the UI (meta ai_models_<id>). */
  models: { fast: string; smart: string };
  /**
   * USD per 1M tokens, used by the internal spend meter. Kept reasonably
   * current for the default models; unknown models fall back to defaultPrice.
   */
  prices: Record<string, { input: number; output: number }>;
  defaultPrice: { input: number; output: number };
};

export const AI_PROVIDERS: Record<AiProviderId, AiProviderDef> = {
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    keyEnv: 'ANTHROPIC_API_KEY',
    models: { fast: 'claude-haiku-4-5', smart: 'claude-sonnet-4-6' },
    prices: {
      'claude-haiku-4-5': { input: 1, output: 5 },
      'claude-sonnet-4-6': { input: 3, output: 15 },
      'claude-sonnet-5': { input: 3, output: 15 },
      'claude-opus-4-8': { input: 5, output: 25 },
    },
    defaultPrice: { input: 3, output: 15 },
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    keyEnv: 'OPENAI_API_KEY',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    maxTokensField: 'max_completion_tokens',
    models: { fast: 'gpt-5-mini', smart: 'gpt-5' },
    prices: {
      'gpt-5': { input: 1.25, output: 10 },
      'gpt-5-mini': { input: 0.25, output: 2 },
      'gpt-5-nano': { input: 0.05, output: 0.4 },
      'gpt-4.1': { input: 2, output: 8 },
      'gpt-4o': { input: 2.5, output: 10 },
    },
    defaultPrice: { input: 2.5, output: 10 },
  },
  grok: {
    id: 'grok',
    label: 'Grok (xAI)',
    keyEnv: 'XAI_API_KEY',
    endpoint: 'https://api.x.ai/v1/chat/completions',
    maxTokensField: 'max_tokens',
    models: { fast: 'grok-4-fast', smart: 'grok-4' },
    prices: {
      'grok-4': { input: 3, output: 15 },
      'grok-4-fast': { input: 0.2, output: 0.5 },
    },
    defaultPrice: { input: 3, output: 15 },
  },
  azure: {
    id: 'azure',
    label: 'Azure OpenAI (Microsoft)',
    keyEnv: 'AZURE_OPENAI_API_KEY',
    endpointEnv: 'AZURE_OPENAI_ENDPOINT',
    authHeader: 'api-key',
    maxTokensField: 'max_completion_tokens',
    // On Azure the "model" is the deployment name chosen by the customer:
    // these are only the most common ones, editable from the UI.
    models: { fast: 'gpt-4o-mini', smart: 'gpt-4o' },
    prices: {
      'gpt-4o': { input: 2.5, output: 10 },
      'gpt-4o-mini': { input: 0.15, output: 0.6 },
      'gpt-4.1': { input: 2, output: 8 },
      'gpt-4.1-mini': { input: 0.4, output: 1.6 },
      'gpt-5': { input: 1.25, output: 10 },
      'gpt-5-mini': { input: 0.25, output: 2 },
    },
    defaultPrice: { input: 2.5, output: 10 },
  },
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[];

/** The active engine. Admin-set (meta ai_provider); Anthropic by default. */
export async function aiProvider(): Promise<AiProviderId> {
  const { getMeta } = await import('@/lib/db');
  const v = await getMeta<string>('ai_provider');
  return v && v in AI_PROVIDERS ? (v as AiProviderId) : 'anthropic';
}

/** Effective fast/smart models for a provider: UI override or defaults. */
export async function aiModels(provider: AiProviderId): Promise<{ fast: string; smart: string }> {
  const { getMeta } = await import('@/lib/db');
  const o = await getMeta<{ fast?: string; smart?: string }>(`ai_models_${provider}`);
  const d = AI_PROVIDERS[provider].models;
  return {
    fast: (o?.fast ?? '').trim() || d.fast,
    smart: (o?.smart ?? '').trim() || d.smart,
  };
}

/** Effective API key for a provider: UI-entered (encrypted store) or env var. */
export async function providerKey(provider: AiProviderId): Promise<string | undefined> {
  const { getStoredKey } = await import('@/lib/connector-credentials');
  const env = AI_PROVIDERS[provider].keyEnv;
  const stored = await getStoredKey(env);
  const key = (stored || process.env[env] || '').trim();
  return key || undefined;
}

/**
 * Azure gives you a resource URL, not an endpoint: people paste it in every
 * shape they find in the portal. Accept them all and build the v1 chat URL —
 * `https://<resource>.openai.azure.com/openai/v1/chat/completions`, which since
 * the v1 GA API needs no `api-version` and speaks the OpenAI dialect.
 */
export function azureChatUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, '');
  base = base.replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  if (!/\/openai\/v1$/.test(base)) base = `${base.replace(/\/openai$/, '')}/openai/v1`;
  return `${base}/chat/completions`;
}

/** Effective chat endpoint: fixed for OpenAI/xAI, tenant-specific for Azure. */
export async function providerEndpoint(provider: AiProviderId): Promise<string | undefined> {
  const def = AI_PROVIDERS[provider];
  if (def.endpointEnv) {
    const { getStoredKey } = await import('@/lib/connector-credentials');
    const stored = await getStoredKey(def.endpointEnv);
    const raw = (stored || process.env[def.endpointEnv] || '').trim();
    return raw ? azureChatUrl(raw) : undefined;
  }
  return def.endpoint;
}

export function priceFor(provider: AiProviderId, model: string): { input: number; output: number } {
  const def = AI_PROVIDERS[provider];
  return def.prices[model] ?? def.defaultPrice;
}

export type AiCallResult = { text: string | null; inputTokens: number; outputTokens: number };

/**
 * One chat call against an OpenAI-compatible endpoint (OpenAI, xAI). Returns
 * the text plus token usage for the spend meter.
 */
export async function callOpenAICompat(
  provider: AiProviderId, key: string, model: string, system: string, user: string, maxTokens: number,
): Promise<AiCallResult> {
  const def = AI_PROVIDERS[provider];
  const endpoint = await providerEndpoint(provider);
  if (!endpoint) {
    throw new Error(
      def.endpointEnv
        ? `${def.label}: missing ${def.endpointEnv} (the resource URL, e.g. https://my-resource.openai.azure.com)`
        : `${provider} has no HTTP endpoint`,
    );
  }
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    [def.maxTokensField ?? 'max_tokens']: maxTokens,
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(def.authHeader === 'api-key' ? { 'api-key': key } : { Authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errText = (await res.text()).slice(0, 300);
    throw new Error(`${def.label} API ${res.status}: ${errText}`);
  }
  const data = await res.json() as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    text: data.choices?.[0]?.message?.content ?? null,
    inputTokens: Number(data.usage?.prompt_tokens ?? 0),
    outputTokens: Number(data.usage?.completion_tokens ?? 0),
  };
}
