import type { Connector, RawMention } from './types';
import { collect, fetchJson, stripHtml, truncate } from './util';

type Hit = {
  objectID: string; title?: string; story_title?: string; url?: string;
  comment_text?: string; author: string; created_at: string;
  points?: number; num_comments?: number;
};

async function search(keyword: string): Promise<RawMention[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(keyword)}&tags=(story,comment)&hitsPerPage=50`;
  const data = await fetchJson<{ hits?: Hit[] }>(url);
  return (data.hits ?? []).map((h) => {
    const title = h.title || h.story_title || '';
    const body = h.comment_text ? stripHtml(h.comment_text) : title;
    return {
      source: 'hackernews',
      externalId: h.objectID,
      url: `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: truncate(title, 300),
      content: truncate(body, 1200),
      author: h.author,
      community: 'Hacker News',
      publishedAt: new Date(h.created_at),
      language: 'en',
      engagement: { likes: h.points ?? 0, comments: h.num_comments ?? 0 },
    } satisfies RawMention;
  }).filter((m) => m.content);
}

export const hackerNews: Connector = {
  id: 'hackernews',
  label: 'Hacker News',
  tier: 'free',
  enabled: () => true,
  async fetchMentions(q) {
    return collect(q.anyTerms.slice(0, 4).map(search));
  },
};
