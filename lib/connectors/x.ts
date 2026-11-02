import { booleanQuery, type Connector, type ListeningQuery, type RawMention } from './types';
import { fetchJson, truncate } from './util';
import { cfg } from '@/lib/connector-config';
import { tregCall, tregEnabled } from '@/lib/treg';

// Connettore X/Twitter. Due strade, nell'ordine:
//  1. X API v2 (piano Basic $200/mese) se c'è X_BEARER_TOKEN — percorso nativo.
//  2. treg (treg.to) se c'è TREG_TOKEN — ricerca brokerata (job x.search.posts),
//     frazioni di centesimo a chiamata, nessuna chiave X. Fallback quando la
//     chiave a pagamento non c'è, nello stesso spirito BYO-key degli altri.

type Tweet = {
  id: string; text: string; created_at: string; lang?: string; author_id: string;
  public_metrics?: { retweet_count: number; reply_count: number; like_count: number; impression_count?: number };
};
type XUser = { id: string; name: string; username: string };

async function fetchViaNative(q: ListeningQuery): Promise<RawMention[]> {
  const token = cfg('X_BEARER_TOKEN')!;
  const bool = booleanQuery({ ...q, anyTerms: q.anyTerms.slice(0, 5) });
  if (!bool) return [];
  const query = `${bool} -is:retweet`;
  const url = `https://api.x.com/2/tweets/search/recent?query=${encodeURIComponent(query)}&max_results=50&tweet.fields=public_metrics,created_at,lang,author_id&expansions=author_id&user.fields=name,username`;
  const data = await fetchJson<{ data?: Tweet[]; includes?: { users?: XUser[] } }>(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const users = new Map((data.includes?.users ?? []).map((u) => [u.id, u]));
  return (data.data ?? []).map((t) => {
    const u = users.get(t.author_id);
    const m = t.public_metrics;
    return {
      source: 'x',
      externalId: t.id,
      url: `https://x.com/${u?.username ?? 'i'}/status/${t.id}`,
      content: truncate(t.text, 1000),
      author: u?.name,
      authorHandle: u ? `@${u.username}` : undefined,
      publishedAt: new Date(t.created_at),
      language: t.lang,
      engagement: {
        likes: m?.like_count ?? 0,
        shares: m?.retweet_count ?? 0,
        comments: m?.reply_count ?? 0,
        views: m?.impression_count,
      },
      reach: m?.impression_count,
    } satisfies RawMention;
  });
}

// --- treg path --------------------------------------------------------------

// Le righe di x.search.posts hanno forma "provider-native" (cambia per
// provider), quindi la mappatura legge ogni campo con più nomi possibili e
// scarta ciò che non riconosce. Esportata e pura: testabile senza rete.
export type TregXPost = {
  id?: string | number; id_str?: string; rest_id?: string;
  text?: string; full_text?: string; content?: string;
  created_at?: string; url?: string; lang?: string; language?: string;
  author?: string | { name?: string; screen_name?: string; username?: string; handle?: string };
  user?: { name?: string; screen_name?: string; username?: string; handle?: string };
  public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number; impression_count?: number };
  like_count?: number; favorite_count?: number; retweet_count?: number; reply_count?: number;
  view_count?: number; views?: number; impression_count?: number;
};

const num = (...vals: Array<number | undefined>): number => {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
};

export function mapTregXPost(p: TregXPost): RawMention | null {
  const id = p.id_str ?? p.rest_id ?? (p.id != null ? String(p.id) : undefined);
  const text = p.full_text ?? p.text ?? p.content;
  if (!id || !text) return null;

  const u = typeof p.author === 'object' ? p.author : p.user;
  const handle = (u?.username ?? u?.screen_name ?? u?.handle ?? (typeof p.author === 'string' ? p.author : undefined))?.replace(/^@/, '');
  const name = typeof p.author === 'string' ? undefined : u?.name;
  const pm = p.public_metrics;
  const views = num(pm?.impression_count, p.view_count, p.views, p.impression_count) || undefined;
  const when = p.created_at ? new Date(p.created_at) : new Date();

  return {
    source: 'x',
    externalId: String(id),
    url: p.url ?? (handle ? `https://x.com/${handle}/status/${id}` : undefined),
    content: truncate(text, 1000),
    author: name,
    authorHandle: handle ? `@${handle}` : undefined,
    publishedAt: Number.isNaN(when.getTime()) ? new Date() : when,
    language: p.lang ?? p.language,
    engagement: {
      likes: num(pm?.like_count, p.like_count, p.favorite_count),
      shares: num(pm?.retweet_count, p.retweet_count),
      comments: num(pm?.reply_count, p.reply_count),
      views,
    },
    reach: views,
  } satisfies RawMention;
}

async function fetchViaTreg(q: ListeningQuery): Promise<RawMention[]> {
  const bool = booleanQuery({ ...q, anyTerms: q.anyTerms.slice(0, 5) });
  if (!bool) return [];
  const r = await tregCall<{ posts?: TregXPost[] }>('treg.x.search.posts', { q: `${bool} -is:retweet` });
  if (!r.ok) return [];
  return (r.output?.posts ?? [])
    .map(mapTregXPost)
    .filter((m): m is RawMention => m !== null);
}

export const xTwitter: Connector = {
  id: 'x',
  label: 'X (Twitter)',
  tier: 'premium',
  // Nativo con X_BEARER_TOKEN, oppure brokerato con TREG_TOKEN.
  enabled: () => Boolean(cfg('X_BEARER_TOKEN') || tregEnabled()),
  disabledReason:
    'Requires an X Bearer Token (Basic API, $200/mo) OR a TREG_TOKEN (treg.to, pay-per-call): enter one in Settings',
  async fetchMentions(q) {
    if (cfg('X_BEARER_TOKEN')) return fetchViaNative(q);
    if (tregEnabled()) return fetchViaTreg(q);
    return [];
  },
};
