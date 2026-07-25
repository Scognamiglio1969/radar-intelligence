import type { Connector } from './types';
import { googleNews } from './googlenews';
import { gdelt } from './gdelt';
import { reddit } from './reddit';
import { bluesky } from './bluesky';
import { mastodon } from './mastodon';
import { hackerNews } from './hackernews';
import { youtube } from './youtube';
import { xTwitter } from './x';
import { telegram } from './telegram';
import { rss } from './rss';
import { instagram } from './instagram';
import { facebook } from './facebook';
import { tiktok } from './tiktok';
import { linkedin } from './linkedin';
import { linkedinWeb } from './linkedin-web';
import { newsapi } from './newsapi';

export const CONNECTORS: Connector[] = [
  // Gratuite
  googleNews, gdelt, reddit, bluesky, mastodon, hackerNews, youtube, telegram, rss, linkedinWeb,
  // Premium (si attivano con le chiavi API)
  xTwitter, instagram, facebook, tiktok, linkedin, newsapi,
];

/**
 * Articolo di testata o post social?
 *
 * È la distinzione che separa una rassegna stampa dall'ascolto sociale: hanno
 * ritmi, autori e peso diversi, e vanno lette separate. Gli "upload" sono
 * ritagli stampa importati da file, quindi articoli.
 */
export type MentionKind = 'article' | 'post';
export const SOURCE_KIND: Record<string, MentionKind> = {
  googlenews: 'article', gdelt: 'article', newsapi: 'article', rss: 'article', upload: 'article',
  reddit: 'post', bluesky: 'post', mastodon: 'post', hackernews: 'post', youtube: 'post',
  x: 'post', telegram: 'post', instagram: 'post', facebook: 'post', tiktok: 'post',
  linkedin: 'post', linkedin_web: 'post',
};
/** Fonte sconosciuta: si presume post, la classe più prudente per il valore media. */
export const kindOf = (source: string): MentionKind => SOURCE_KIND[source] ?? 'post';

/**
 * Fonti valutate a CPM giornalistico nel valore media. Derivate dalla mappa qui
 * sopra per non avere due classificazioni divergenti — con l'eccezione degli
 * upload, la cui provenienza è ignota: contarli come stampa gonfierebbe il
 * valore di file che potrebbero contenere qualsiasi cosa.
 */
export const NEWS_SOURCES = Object.entries(SOURCE_KIND)
  .filter(([id, k]) => k === 'article' && id !== 'upload')
  .map(([id]) => id);

export const SOURCE_META: Record<string, { label: string; color: string; note?: string }> = {
  googlenews: { label: 'Google News', color: '#f59e0b' },
  gdelt: { label: 'GDELT', color: '#a78bfa' },
  reddit: { label: 'Reddit', color: '#ff4500' },
  bluesky: { label: 'Bluesky', color: '#38bdf8' },
  mastodon: { label: 'Mastodon', color: '#8b5cf6' },
  hackernews: { label: 'Hacker News', color: '#f97316' },
  youtube: { label: 'YouTube', color: '#ef4444' },
  x: { label: 'X (Twitter)', color: '#e2e8f0' },
  telegram: { label: 'Telegram', color: '#29b6f6' },
  rss: { label: 'RSS', color: '#fbbf24' },
  instagram: { label: 'Instagram', color: '#e1306c' },
  facebook: { label: 'Facebook', color: '#1877f2' },
  tiktok: { label: 'TikTok', color: '#fe2c55' },
  linkedin: {
    label: 'LinkedIn (page)', color: '#0a66c2',
    note: 'Posts from your own company page via the official LinkedIn API: full text and real metrics, but only your page.',
  },
  linkedin_web: {
    label: 'LinkedIn (web)', color: '#4c9ce8',
    note: 'Public LinkedIn posts and articles by anyone, found through the Tavily search index (official API): partial excerpts, no engagement metrics. A different acquisition model from "LinkedIn (page)".',
  },
  newsapi: { label: 'NewsAPI', color: '#14b8a6' },
  upload: {
    label: 'Imported file', color: '#94a3b8',
    note: 'Rows imported from your Excel/CSV files: content, authors and dates are exactly what the file contains — nothing is collected from the web.',
  },
};
