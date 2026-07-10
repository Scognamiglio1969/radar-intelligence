import type { Connector, RawMention } from './types';
import { fetchJson, stripHtml, truncate } from './util';
import { cfg } from '@/lib/connector-config';

// Facebook via Meta Graph API: post delle pagine collegate al token
// (modello watchlist: le pagine pubbliche di terzi non sono accessibili).
// Si attiva con META_ACCESS_TOKEN + FACEBOOK_PAGE_ID (anche più id, virgola).

const G = 'https://graph.facebook.com/v21.0';

type FbPost = {
  id: string; message?: string; permalink_url?: string; created_time?: string;
  shares?: { count?: number };
  reactions?: { summary?: { total_count?: number } };
  comments?: { summary?: { total_count?: number } };
};

async function pagePosts(pageId: string): Promise<RawMention[]> {
  const token = cfg('META_ACCESS_TOKEN')!;
  const data = await fetchJson<{ data?: FbPost[] }>(
    `${G}/${pageId.trim()}/posts?fields=message,permalink_url,created_time,shares,reactions.summary(true),comments.summary(true)&limit=30&access_token=${token}`,
  );
  return (data.data ?? []).map((p) => ({
    source: 'facebook',
    externalId: p.id,
    url: p.permalink_url,
    content: truncate(stripHtml(p.message ?? ''), 1200),
    community: `pagina ${pageId.trim()}`,
    publishedAt: p.created_time ? new Date(p.created_time) : new Date(),
    engagement: {
      likes: p.reactions?.summary?.total_count ?? 0,
      comments: p.comments?.summary?.total_count ?? 0,
      shares: p.shares?.count ?? 0,
    },
  } satisfies RawMention)).filter((m) => m.content);
}

export const facebook: Connector = {
  id: 'facebook',
  label: 'Facebook',
  tier: 'premium',
  enabled: () => Boolean(cfg('META_ACCESS_TOKEN') && cfg('FACEBOOK_PAGE_ID')),
  disabledReason: 'Requires Meta Access Token and Facebook Page ID (Graph API): enter them here',
  async fetchMentions() {
    const pages = (cfg('FACEBOOK_PAGE_ID') ?? '').split(',').filter(Boolean).slice(0, 5);
    const results = await Promise.allSettled(pages.map(pagePosts));
    return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
  },
};
