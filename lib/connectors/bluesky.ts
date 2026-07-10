import type { Connector, RawMention } from './types';
import { collect, fetchJson, truncate } from './util';

type BskyPost = {
  uri: string;
  author: { handle: string; displayName?: string };
  record: { text?: string; createdAt?: string; langs?: string[] };
  likeCount?: number; repostCount?: number; replyCount?: number;
};

// public.api.bsky.app risulta bloccato da alcune reti/CDN: proviamo più host.
const HOSTS = ['api.bsky.app', 'public.api.bsky.app'];

async function search(keyword: string): Promise<RawMention[]> {
  let data: { posts?: BskyPost[] } = {};
  for (const host of HOSTS) {
    try {
      data = await fetchJson<{ posts?: BskyPost[] }>(
        `https://${host}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(keyword)}&limit=50&sort=latest`,
      );
      break;
    } catch (e) {
      if (host === HOSTS[HOSTS.length - 1]) throw e;
    }
  }
  return (data.posts ?? []).map((p) => {
    const rkey = p.uri.split('/').pop();
    return {
      source: 'bluesky',
      externalId: p.uri,
      url: `https://bsky.app/profile/${p.author.handle}/post/${rkey}`,
      content: truncate(p.record.text ?? '', 1000),
      author: p.author.displayName || p.author.handle,
      authorHandle: `@${p.author.handle}`,
      publishedAt: p.record.createdAt ? new Date(p.record.createdAt) : new Date(),
      language: p.record.langs?.[0]?.slice(0, 2),
      engagement: {
        likes: p.likeCount ?? 0,
        shares: p.repostCount ?? 0,
        comments: p.replyCount ?? 0,
      },
    } satisfies RawMention;
  }).filter((m) => m.content);
}

export const bluesky: Connector = {
  id: 'bluesky',
  label: 'Bluesky',
  tier: 'free',
  enabled: () => true,
  async fetchMentions(q) {
    return collect(q.anyTerms.slice(0, 4).map(search));
  },
};
