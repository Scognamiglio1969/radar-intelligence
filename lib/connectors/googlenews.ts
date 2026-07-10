import { XMLParser } from 'fast-xml-parser';
import { booleanQuery, type Connector, type RawMention } from './types';
import { collect, fetchText, stripHtml, truncate } from './util';

type Locale = { hl: string; gl: string; ceid: string };

const BY_LANGUAGE: Record<string, Locale> = {
  it: { hl: 'it', gl: 'IT', ceid: 'IT:it' },
  en: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  es: { hl: 'es', gl: 'ES', ceid: 'ES:es' },
  fr: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
  de: { hl: 'de', gl: 'DE', ceid: 'DE:de' },
  pt: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
};

export const BY_COUNTRY: Record<string, Locale> = {
  IT: { hl: 'it', gl: 'IT', ceid: 'IT:it' },
  US: { hl: 'en-US', gl: 'US', ceid: 'US:en' },
  GB: { hl: 'en-GB', gl: 'GB', ceid: 'GB:en' },
  FR: { hl: 'fr', gl: 'FR', ceid: 'FR:fr' },
  DE: { hl: 'de', gl: 'DE', ceid: 'DE:de' },
  ES: { hl: 'es', gl: 'ES', ceid: 'ES:es' },
  BR: { hl: 'pt-BR', gl: 'BR', ceid: 'BR:pt-419' },
  MX: { hl: 'es-419', gl: 'MX', ceid: 'MX:es-419' },
  CA: { hl: 'en-CA', gl: 'CA', ceid: 'CA:en' },
  AU: { hl: 'en-AU', gl: 'AU', ceid: 'AU:en' },
  IN: { hl: 'en-IN', gl: 'IN', ceid: 'IN:en' },
  NL: { hl: 'nl', gl: 'NL', ceid: 'NL:nl' },
  PL: { hl: 'pl', gl: 'PL', ceid: 'PL:pl' },
  JP: { hl: 'ja', gl: 'JP', ceid: 'JP:ja' },
};

type RssItem = {
  title?: string; link?: string; pubDate?: string; description?: string;
  source?: { '#text'?: string } | string;
};

async function fetchFeed(query: string, loc: Locale, lang?: string): Promise<RawMention[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=${loc.hl}&gl=${loc.gl}&ceid=${loc.ceid}`;
  const xml = await fetchText(url);
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  let items: RssItem[] = parsed?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  return items.slice(0, 60).map((it) => {
    const sourceName = typeof it.source === 'string' ? it.source : it.source?.['#text'];
    const title = stripHtml(String(it.title ?? ''));
    return {
      source: 'googlenews',
      externalId: String(it.link ?? title),
      url: it.link ? String(it.link) : undefined,
      title,
      content: truncate(stripHtml(String(it.description ?? '')) || title, 800),
      author: sourceName,
      community: sourceName,
      publishedAt: it.pubDate ? new Date(it.pubDate) : new Date(),
      language: lang,
    } satisfies RawMention;
  }).filter((m) => m.title && !Number.isNaN(m.publishedAt.getTime()));
}

export const googleNews: Connector = {
  id: 'googlenews',
  label: 'Google News',
  tier: 'free',
  enabled: () => true,
  async fetchMentions(q) {
    const query = booleanQuery(q);
    if (!query) return [];
    // Con paesi selezionati usiamo le loro edizioni locali; altrimenti
    // un'edizione per ogni lingua del progetto. Una richiesta per edizione.
    const locales: { loc: Locale; lang?: string }[] = q.countries.length
      ? q.countries.filter((c) => BY_COUNTRY[c]).slice(0, 6).map((c) => ({ loc: BY_COUNTRY[c] }))
      : q.languages.filter((l) => BY_LANGUAGE[l]).slice(0, 6).map((l) => ({ loc: BY_LANGUAGE[l], lang: l }));
    if (locales.length === 0) locales.push({ loc: BY_LANGUAGE.en, lang: 'en' });
    return collect(locales.map(({ loc, lang }) => fetchFeed(query, loc, lang)));
  },
};
