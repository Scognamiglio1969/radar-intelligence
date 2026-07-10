import type { Connector, RawMention } from './types';
import { collect, fetchJson, truncate } from './util';
import { cfg } from '@/lib/connector-config';

// Instagram via Meta Graph API: ricerca per hashtag (richiede account
// Instagram Business collegato a una pagina Facebook e app Meta approvata).
// Si attiva con META_ACCESS_TOKEN + INSTAGRAM_USER_ID nelle env var.

const G = 'https://graph.facebook.com/v21.0';

type IgMedia = {
  id: string; caption?: string; permalink?: string; timestamp?: string;
  like_count?: number; comments_count?: number; username?: string;
};

async function hashtagMedia(tag: string): Promise<RawMention[]> {
  const token = cfg('META_ACCESS_TOKEN')!;
  const userId = cfg('INSTAGRAM_USER_ID')!;
  const search = await fetchJson<{ data?: { id: string }[] }>(
    `${G}/ig_hashtag_search?user_id=${userId}&q=${encodeURIComponent(tag)}&access_token=${token}`,
  );
  const hashtagId = search.data?.[0]?.id;
  if (!hashtagId) return [];
  const media = await fetchJson<{ data?: IgMedia[] }>(
    `${G}/${hashtagId}/recent_media?user_id=${userId}&fields=id,caption,permalink,timestamp,like_count,comments_count,username&limit=40&access_token=${token}`,
  );
  return (media.data ?? []).map((m) => ({
    source: 'instagram',
    externalId: m.id,
    url: m.permalink,
    content: truncate(m.caption ?? '', 1000),
    author: m.username,
    authorHandle: m.username ? `@${m.username}` : undefined,
    community: `#${tag}`,
    publishedAt: m.timestamp ? new Date(m.timestamp) : new Date(),
    engagement: { likes: m.like_count ?? 0, comments: m.comments_count ?? 0 },
  } satisfies RawMention)).filter((m) => m.content);
}

export const instagram: Connector = {
  id: 'instagram',
  label: 'Instagram',
  tier: 'premium',
  enabled: () => Boolean(cfg('META_ACCESS_TOKEN') && cfg('INSTAGRAM_USER_ID')),
  disabledReason: 'Requires Meta Access Token and Instagram User ID (Business account + Meta app): enter them here',
  async fetchMentions(q) {
    const tags = [...new Set(
      q.anyTerms.map((k) => k.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()).filter((t) => t.length >= 3),
    )].slice(0, 3);
    return collect(tags.map(hashtagMedia));
  },
};
