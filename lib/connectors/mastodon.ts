import type { Connector, RawMention } from './types';
import { collect, fetchJson, stripHtml, truncate } from './util';

const INSTANCES = ['mastodon.social', 'mastodon.uno'];

type Status = {
  id: string; url: string; content: string; created_at: string; language?: string;
  account: { acct: string; display_name?: string };
  favourites_count: number; reblogs_count: number; replies_count: number;
};

async function tagTimeline(instance: string, tag: string): Promise<RawMention[]> {
  const url = `https://${instance}/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=40`;
  const statuses = await fetchJson<Status[]>(url);
  if (!Array.isArray(statuses)) return [];
  return statuses.map((s) => ({
    source: 'mastodon',
    externalId: `${instance}:${s.id}`,
    url: s.url,
    content: truncate(stripHtml(s.content), 1000),
    author: s.account.display_name || s.account.acct,
    authorHandle: `@${s.account.acct}`,
    community: instance,
    publishedAt: new Date(s.created_at),
    language: s.language ?? undefined,
    engagement: {
      likes: s.favourites_count,
      shares: s.reblogs_count,
      comments: s.replies_count,
    },
  } satisfies RawMention)).filter((m) => m.content);
}

export const mastodon: Connector = {
  id: 'mastodon',
  label: 'Mastodon',
  tier: 'free',
  enabled: () => true,
  async fetchMentions(q) {
    // Le timeline per hashtag sono pubbliche senza chiave; keyword → hashtag.
    const tags = [...new Set(
      q.anyTerms.map((k) => k.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase()).filter((t) => t.length >= 3),
    )].slice(0, 4);
    const tasks = INSTANCES.flatMap((inst) => tags.map((t) => tagTimeline(inst, t)));
    return collect(tasks);
  },
};
