import { booleanQuery, type Connector, type RawMention } from './types';
import { fetchJson, truncate } from './util';
import { cfg } from '@/lib/connector-config';

// Connettore X/Twitter (API v2, piano Basic $200/mese).
// Già pronto: si attiva aggiungendo X_BEARER_TOKEN nelle variabili d'ambiente,
// senza toccare codice.

type Tweet = {
  id: string; text: string; created_at: string; lang?: string; author_id: string;
  public_metrics?: { retweet_count: number; reply_count: number; like_count: number; impression_count?: number };
};
type XUser = { id: string; name: string; username: string };

export const xTwitter: Connector = {
  id: 'x',
  label: 'X (Twitter)',
  tier: 'premium',
  enabled: () => Boolean(cfg('X_BEARER_TOKEN')),
  disabledReason: 'Requires an X Bearer Token (Basic API, $200/mo): enter it here in Settings',
  async fetchMentions(q) {
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
  },
};
