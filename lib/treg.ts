// treg (treg.to) — a tool-broker that fronts many data providers behind ONE
// token and ONE prepaid balance. Radar calls a *job* (e.g. "x.search.posts"),
// treg picks the provider, injects the upstream key server-side, and bills per
// hit. Radar never holds the provider's key.
//
// This lets a connector that today needs an expensive, approval-gated platform
// key (X Basic $200/mo, TikTok Research API, Meta business) run instead through
// treg at a fraction of a cent, with no per-platform key — exactly the BYO-key
// fallback the connectors already express through cfg(). The credential is the
// single TREG_TOKEN (a team token; send only X-Treg-Token).
//
// Everything here is FAIL-SOFT: a missing token, a network error, a non-2xx, or
// a routed miss all return { ok: false }. A broker being down must never throw
// into a collection pass — the connector simply yields no mentions and says so.

import { cfg } from '@/lib/connector-config';

const DEFAULT_BASE = 'https://treg.to';
const DEFAULT_MAX_COST_USD = 0.05;
const DEFAULT_TIMEOUT_MS = 20_000;

/** A brokered call is possible only when a token is configured. */
export function tregEnabled(): boolean {
  return Boolean(cfg('TREG_TOKEN'));
}

function tregBase(): string {
  return (cfg('TREG_BASE_URL') || DEFAULT_BASE).replace(/\/+$/, '');
}

function tregMaxCost(): number {
  const v = Number(cfg('TREG_MAX_COST_USD'));
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_MAX_COST_USD;
}

export interface TregResult<T = unknown> {
  ok: boolean;
  output: T | null;
  servedBy?: string;
  costUsd?: number;
  error?: string;
}

/**
 * Invoke a treg job: POST /call/<endpointId> with a JSON body, the provider key
 * injected server-side. Spend is capped per call via X-Treg-Route-Max-Cost.
 * Never throws. A routed miss (output == null) returns ok:false.
 */
export async function tregCall<T = unknown>(
  endpointId: string,
  body: Record<string, unknown>,
  opts?: { maxCostUsd?: number; timeoutMs?: number },
): Promise<TregResult<T>> {
  const token = cfg('TREG_TOKEN');
  if (!token) return { ok: false, output: null, error: 'no TREG_TOKEN' };

  const cap = opts?.maxCostUsd ?? tregMaxCost();
  try {
    const res = await fetch(`${tregBase()}/call/${endpointId}`, {
      method: 'POST',
      headers: {
        'X-Treg-Token': token,
        'content-type': 'application/json',
        'X-Treg-Route-Max-Cost': cap.toFixed(4),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      cache: 'no-store',
    });

    const servedBy = res.headers.get('X-Treg-Served-By') ?? undefined;
    const microRaw = res.headers.get('X-Treg-Cost-Micro');
    const micro = microRaw == null ? NaN : Number(microRaw);
    const costUsd = Number.isFinite(micro) ? micro / 1_000_000 : undefined;

    if (!res.ok) return { ok: false, output: null, servedBy, costUsd, error: `treg ${res.status}` };

    const data = (await res.json().catch(() => null)) as { output?: T } | null;
    const output = data?.output ?? null;
    if (output == null) return { ok: false, output: null, servedBy, costUsd, error: 'miss' };
    return { ok: true, output, servedBy, costUsd };
  } catch (e) {
    return { ok: false, output: null, error: e instanceof Error ? e.message : 'treg error' };
  }
}
