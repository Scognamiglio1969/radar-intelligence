import type { Connector, RawMention } from './types';
import { fetchJson, truncate } from './util';
import { cfg } from '@/lib/connector-config';

type RedditPost = {
  data: {
    name: string; title: string; selftext: string; permalink: string;
    author: string; subreddit: string; created_utc: number;
    ups: number; num_comments: number; over_18: boolean;
  };
};

// Reddit blocca le richieste anonime da molte reti (403). Con un'app Reddit
// gratuita (reddit.com/prefs/apps → "script") e REDDIT_CLIENT_ID +
// REDDIT_CLIENT_SECRET nelle env var si usa l'OAuth application-only,
// che funziona sempre. Senza credenziali si tenta l'endpoint pubblico.

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string | null> {
  const id = cfg('REDDIT_CLIENT_ID');
  const secret = cfg('REDDIT_CLIENT_SECRET');
  if (!id || !secret) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.token;
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SocialRadar/1.0',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Reddit OAuth: HTTP ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

export const reddit: Connector = {
  id: 'reddit',
  label: 'Reddit',
  tier: 'freekey',
  enabled: () => Boolean(cfg('REDDIT_CLIENT_ID') && cfg('REDDIT_CLIENT_SECRET')),
  disabledReason: 'Requires a free Reddit app (type "script"): enter Client ID and Secret here',
  async fetchMentions(q) {
    const query = q.anyTerms.slice(0, 5).map((k) => `"${k.replace(/"/g, '')}"`).join(' OR ');
    if (!query) return [];
    const token = await getToken();
    const base = token ? 'https://oauth.reddit.com' : 'https://www.reddit.com';
    const url = `${base}/search${token ? '' : '.json'}?q=${encodeURIComponent(query)}&sort=new&t=week&limit=100&raw_json=1`;
    const data = await fetchJson<{ data?: { children?: RedditPost[] } }>(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    return (data.data?.children ?? [])
      .filter((p) => !p.data.over_18)
      .map((p) => ({
        source: 'reddit',
        externalId: p.data.name,
        url: `https://www.reddit.com${p.data.permalink}`,
        title: p.data.title,
        content: truncate(p.data.selftext || p.data.title, 1500),
        author: p.data.author,
        authorHandle: `u/${p.data.author}`,
        community: `r/${p.data.subreddit}`,
        publishedAt: new Date(p.data.created_utc * 1000),
        engagement: { likes: p.data.ups, comments: p.data.num_comments },
      } satisfies RawMention));
  },
};
