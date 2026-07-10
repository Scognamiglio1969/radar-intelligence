import type { Connector, RawMention } from './types';
import { truncate } from './util';
import { cfg } from '@/lib/connector-config';

// TikTok Research API (accesso su approvazione, riservato a ricerca/business).
// Si attiva con TIKTOK_CLIENT_KEY + TIKTOK_CLIENT_SECRET nelle env var.

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: cfg('TIKTOK_CLIENT_KEY')!,
      client_secret: cfg('TIKTOK_CLIENT_SECRET')!,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`TikTok OAuth: HTTP ${res.status}`);
  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.token;
}

type TkVideo = {
  id: string; video_description?: string; create_time?: number;
  username?: string; like_count?: number; comment_count?: number;
  share_count?: number; view_count?: number; hashtag_names?: string[];
};

export const tiktok: Connector = {
  id: 'tiktok',
  label: 'TikTok',
  tier: 'premium',
  enabled: () => Boolean(cfg('TIKTOK_CLIENT_KEY') && cfg('TIKTOK_CLIENT_SECRET')),
  disabledReason: 'Requires TikTok Client Key and Secret (Research API): enter them here',
  async fetchMentions(q) {
    const token = await getToken();
    const end = new Date();
    const start = new Date(end.getTime() - 7 * 86400_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
    const res = await fetch(
      'https://open.tiktokapis.com/v2/research/video/query/?fields=id,video_description,create_time,username,like_count,comment_count,share_count,view_count,hashtag_names',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: {
            or: q.anyTerms.slice(0, 5).map((k) => ({
              operation: 'IN', field_name: 'keyword', field_values: [k],
            })),
          },
          start_date: fmt(start),
          end_date: fmt(end),
          max_count: 50,
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!res.ok) throw new Error(`TikTok Research: HTTP ${res.status}`);
    const data = await res.json() as { data?: { videos?: TkVideo[] } };
    return (data.data?.videos ?? []).map((v) => ({
      source: 'tiktok',
      externalId: v.id,
      url: v.username ? `https://www.tiktok.com/@${v.username}/video/${v.id}` : undefined,
      content: truncate(v.video_description ?? '', 1000),
      author: v.username,
      authorHandle: v.username ? `@${v.username}` : undefined,
      publishedAt: v.create_time ? new Date(v.create_time * 1000) : new Date(),
      engagement: {
        likes: v.like_count ?? 0,
        comments: v.comment_count ?? 0,
        shares: v.share_count ?? 0,
        views: v.view_count,
      },
      reach: v.view_count,
    } satisfies RawMention)).filter((m) => m.content);
  },
};
