import { XMLParser } from 'fast-xml-parser';
import type { Connector, RawMention } from './types';
import { collect, fetchText, stripHtml, truncate } from './util';

// Feed RSS/Atom personalizzati: qualsiasi sito che espone un feed
// (testate, blog, Google Alerts, subreddit, canali YouTube…).
// Modello watchlist: i feed si configurano per progetto in Gestione progetti.

let watchedFeeds: string[] = [];

/** Impostato dall'ingest prima del fetch, coi feed del progetto corrente. */
export function setRssFeeds(feeds: string[]) {
  watchedFeeds = feeds.filter((f) => /^https?:\/\//i.test(f.trim())).map((f) => f.trim());
}

type RssItem = {
  title?: unknown; link?: unknown; pubDate?: string; description?: unknown;
  'content:encoded'?: unknown; guid?: unknown;
  // Atom
  updated?: string; published?: string; summary?: unknown; content?: unknown; id?: string;
};

const text = (v: unknown): string => {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && '#text' in (v as Record<string, unknown>)) {
    return String((v as Record<string, unknown>)['#text'] ?? '');
  }
  return String(v);
};

function atomLink(link: unknown): string {
  if (typeof link === 'string') return link;
  const links = Array.isArray(link) ? link : [link];
  for (const l of links) {
    const o = l as Record<string, unknown> | null;
    if (o?.['@_href'] && (!o['@_rel'] || o['@_rel'] === 'alternate')) return String(o['@_href']);
  }
  return '';
}

async function fetchFeed(url: string): Promise<RawMention[]> {
  const xml = await fetchText(url);
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  const feedHost = new URL(url).host.replace(/^www\./, '');

  // RSS 2.0 oppure Atom
  let items: RssItem[] = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  if (!Array.isArray(items)) items = [items];
  const feedTitle = text(parsed?.rss?.channel?.title ?? parsed?.feed?.title) || feedHost;

  return items.slice(0, 40).map((it) => {
    const title = stripHtml(text(it.title));
    const link = text(it.link) || atomLink(it.link) || text(it.guid) || it.id || '';
    const body = stripHtml(text(it['content:encoded']) || text(it.description) || text(it.summary) || text(it.content));
    const date = it.pubDate ?? it.published ?? it.updated;
    return {
      source: 'rss',
      externalId: link || `${feedHost}:${title}`,
      url: link || undefined,
      title,
      content: truncate(body || title, 1000),
      author: feedTitle,
      community: feedTitle,
      publishedAt: date ? new Date(date) : new Date(),
    } satisfies RawMention;
  }).filter((m) => m.title && !Number.isNaN(m.publishedAt.getTime()));
}

export const rss: Connector = {
  id: 'rss',
  label: 'Feed RSS personalizzati',
  tier: 'free',
  enabled: () => true,
  async fetchMentions() {
    if (watchedFeeds.length === 0) return [];
    return collect(watchedFeeds.slice(0, 15).map(fetchFeed));
  },
};
