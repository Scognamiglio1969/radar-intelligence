import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { getMeta, setMeta } from '@/lib/db';
import { setConnectorConfig } from '@/lib/connector-config';

// Gestione (server-only) delle credenziali che l'utente inserisce dall'app per
// attivare i connettori premium, senza toccare codice o variabili d'ambiente.
// Le credenziali sono globali per l'istanza (legate all'account aziendale) e
// salvate cifrate a riposo nella tabella `meta`.

export type CredField = { env: string; label: string; hint?: string; secret: boolean };

/**
 * Campi richiesti da ogni connettore premium. La chiave `env` coincide con la
 * variabile d'ambiente storica, così il connettore legge indifferentemente dal
 * valore salvato o, in mancanza, dalla env var (fallback).
 */
export const CREDENTIAL_FIELDS: Record<string, CredField[]> = {
  anthropic: [
    { env: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', hint: 'from console.anthropic.com', secret: true },
  ],
  openai: [
    { env: 'OPENAI_API_KEY', label: 'OpenAI API key', hint: 'from platform.openai.com', secret: true },
  ],
  grok: [
    { env: 'XAI_API_KEY', label: 'xAI (Grok) API key', hint: 'from console.x.ai', secret: true },
  ],
  reddit: [
    { env: 'REDDIT_CLIENT_ID', label: 'Client ID', hint: 'Reddit app of type "script", the string under the name', secret: true },
    { env: 'REDDIT_CLIENT_SECRET', label: 'Client Secret', hint: 'the app’s "secret" field', secret: true },
  ],
  youtube: [
    { env: 'YOUTUBE_API_KEY', label: 'API Key', hint: 'free key from Google Cloud Console (YouTube Data API v3)', secret: true },
  ],
  x: [
    { env: 'X_BEARER_TOKEN', label: 'Bearer Token', hint: 'X API v2, Basic plan', secret: true },
  ],
  instagram: [
    { env: 'META_ACCESS_TOKEN', label: 'Meta Access Token', hint: 'Meta app + Instagram Business account', secret: true },
    { env: 'INSTAGRAM_USER_ID', label: 'Instagram User ID', secret: false },
  ],
  facebook: [
    { env: 'META_ACCESS_TOKEN', label: 'Meta Access Token', hint: 'The same token as the Meta app', secret: true },
    { env: 'FACEBOOK_PAGE_ID', label: 'Facebook Page ID', hint: 'one or more, comma-separated', secret: false },
  ],
  tiktok: [
    { env: 'TIKTOK_CLIENT_KEY', label: 'Client Key', hint: 'TikTok Research API', secret: true },
    { env: 'TIKTOK_CLIENT_SECRET', label: 'Client Secret', secret: true },
  ],
  linkedin: [
    { env: 'LINKEDIN_ACCESS_TOKEN', label: 'Access Token', hint: 'Community Management API', secret: true },
    { env: 'LINKEDIN_ORG_ID', label: 'Organization ID', secret: false },
  ],
  linkedin_web: [
    { env: 'TAVILY_API_KEY', label: 'Tavily API Key', hint: 'free key from app.tavily.com (1,000 searches/month)', secret: true },
  ],
  newsapi: [
    { env: 'NEWSAPI_KEY', label: 'API Key', hint: 'newsapi.org', secret: true },
  ],
};

const META_KEY = 'connector_credentials_v1';

// ---- cifratura AES-256-GCM, chiave derivata dal secret dell'app ----
function keyBytes(): Buffer {
  const secret = process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'sr-dev-secret-change-me';
  return scryptSync(secret, 'connector-cred-salt', 32);
}

function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

function decrypt(blob: string): string {
  const [ivB, tagB, dataB] = blob.split(':');
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivB, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB, 'base64')), decipher.final()]).toString('utf8');
}

type Store = Record<string, string>;

async function loadStore(): Promise<Store> {
  const blob = await getMeta<string>(META_KEY);
  if (!blob) return {};
  try {
    return JSON.parse(decrypt(blob)) as Store;
  } catch {
    return {};
  }
}

/** Idrata la cache sincrona letta dai connettori. Chiamare prima di enabled()/fetch. */
export async function hydrateConnectorCredentials(): Promise<void> {
  setConnectorConfig(await loadStore());
}

/** Read one stored credential (decrypted) by env-var name — always fresh from the DB. */
export async function getStoredKey(env: string): Promise<string | undefined> {
  const v = (await loadStore())[env];
  return v && v.trim() ? v.trim() : undefined;
}

/**
 * Salva/aggiorna le credenziali di un connettore. Regole sui campi vuoti:
 * - campo NON segreto vuoto  => cancella (l'utente lo sta rimuovendo);
 * - campo segreto vuoto      => lascia invariato (non riscriviamo mai i segreti
 *   nel form, quindi un submit senza digitarli non deve azzerarli).
 */
export async function saveConnectorCredentials(connectorId: string, values: Record<string, string>): Promise<void> {
  const fields = CREDENTIAL_FIELDS[connectorId];
  if (!fields) return;
  const store = await loadStore();
  for (const f of fields) {
    const raw = (values[f.env] ?? '').trim();
    if (raw) store[f.env] = raw;
    else if (!f.secret) delete store[f.env];
  }
  await setMeta(META_KEY, encrypt(JSON.stringify(store)));
  setConnectorConfig(store);
}

function mask(v?: string): string | undefined {
  if (!v) return undefined;
  const t = v.trim();
  if (!t) return undefined;
  return t.length <= 4 ? '••••' : `••••${t.slice(-4)}`;
}

export type CredFieldStatus = {
  env: string; label: string; hint?: string; secret: boolean;
  set: boolean;
  /** Valore corrente: mascherato per i segreti, in chiaro per gli id pubblici. */
  display?: string;
  /** true se il valore proviene dalla env var embeddata, non dal salvataggio utente. */
  fromEnv: boolean;
};

export type ConnectorCredStatus = {
  configured: boolean;
  fields: CredFieldStatus[];
};

/** Stato di tutte le credenziali premium per la UI (nessun segreto in chiaro). */
export async function getConnectorCredStatuses(): Promise<Record<string, ConnectorCredStatus>> {
  const store = await loadStore();
  const out: Record<string, ConnectorCredStatus> = {};
  for (const [id, fields] of Object.entries(CREDENTIAL_FIELDS)) {
    const fs = fields.map((f) => {
      const dbVal = store[f.env];
      const envVal = process.env[f.env];
      const val = (dbVal && dbVal.trim()) ? dbVal : (envVal && envVal.trim() ? envVal : undefined);
      return {
        env: f.env, label: f.label, hint: f.hint, secret: f.secret,
        set: Boolean(val),
        display: f.secret ? mask(val) : (val || undefined),
        fromEnv: Boolean(!(dbVal && dbVal.trim()) && val),
      } satisfies CredFieldStatus;
    });
    out[id] = { configured: fs.every((f) => f.set), fields: fs };
  }
  return out;
}
