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
import { stackExchange } from './stackexchange';
import { github } from './github';
import { discord } from './discord';
import { secEdgar } from './sec-edgar';
import { arxiv } from './arxiv';

export const CONNECTORS: Connector[] = [
  // Gratuite (alcune richiedono una chiave gratuita: reddit, youtube, discord)
  googleNews, gdelt, reddit, bluesky, mastodon, hackerNews, youtube, telegram, rss, linkedinWeb, stackExchange, github, discord, secEdgar, arxiv,
  // Premium (si attivano con le chiavi API a pagamento)
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
  googlenews: 'article', gdelt: 'article', newsapi: 'article', rss: 'article', upload: 'article', 'sec-edgar': 'article',
  reddit: 'post', bluesky: 'post', mastodon: 'post', hackernews: 'post', youtube: 'post',
  x: 'post', telegram: 'post', instagram: 'post', facebook: 'post', tiktok: 'post',
  linkedin: 'post', linkedin_web: 'post', stackexchange: 'post', github: 'post', discord: 'post',
  arxiv: 'article',
};
/** Fonte sconosciuta: si presume post, la classe più prudente per il valore media. */
export const kindOf = (source: string): MentionKind => SOURCE_KIND[source] ?? 'post';

/**
 * Categoria tematica di una fonte — non ha effetto sui dati, serve solo a
 * organizzare la pagina Fonti: con 22 connettori un unico elenco piatto per
 * livello (gratis/gratis con chiave/a pagamento) è illeggibile.
 */
export type SourceCategory = 'general' | 'tech' | 'social' | 'video' | 'finance' | 'academic';
export const SOURCE_CATEGORY: Record<string, SourceCategory> = {
  googlenews: 'general', gdelt: 'general', newsapi: 'general', rss: 'general',
  hackernews: 'tech', stackexchange: 'tech', github: 'tech',
  reddit: 'social', bluesky: 'social', mastodon: 'social', x: 'social',
  instagram: 'social', facebook: 'social', tiktok: 'social', telegram: 'social',
  discord: 'social', linkedin: 'social', linkedin_web: 'social',
  youtube: 'video',
  'sec-edgar': 'finance',
  arxiv: 'academic',
};
export const CATEGORY_ORDER: SourceCategory[] = ['general', 'finance', 'academic', 'tech', 'social', 'video'];
export const CATEGORY_LABEL: Record<SourceCategory, string> = {
  general: 'General & news', finance: 'Financial & corporate', academic: 'Academic',
  tech: 'Tech & developer', social: 'Social & messaging', video: 'Video',
};

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
  stackexchange: {
    label: 'Stack Exchange', color: '#f48024',
    note: 'Questions matching your terms in their title, across Stack Overflow and 5 other Stack Exchange communities (money, workplace, travel, parenting, general computing). Works with no key, at a shared low quota; add a free key to raise it.',
  },
  github: {
    label: 'GitHub', color: '#e2e8f0',
    note: 'Issues and pull requests matching your terms in their title, across all of public GitHub, with the full issue text and its reaction/comment counts. Automated bot-authored issues (changelog trackers, digests) are filtered out. Works with no key, at a low rate limit; add a free token to raise it.',
  },
  discord: {
    label: 'Discord', color: '#5865f2',
    note: 'Messages from the channels of a server you administer, via an official bot (watchlist model, like Facebook) — not search across other people’s servers, which Discord does not offer. Requires a free bot token and the Message Content Intent enabled for it.',
  },
  'sec-edgar': {
    label: 'SEC EDGAR', color: '#2c5aa0',
    note: 'Official SEC filings (8-K material events, 10-K/10-Q reports, DEF 14A proxy statements) by any US-listed company matching your terms — free, no key, US government data. Filing text is not included in the search results, so entries are built from the company, filing type and exhibit description, with a link to the full document.',
  },
  arxiv: {
    label: 'arXiv', color: '#b31b1b',
    note: 'Academic papers (CS, physics, math, quantitative biology and more) matching your terms, with the full abstract — official free API, no key. Server-side search does light stemming (verified live: "Claude" also matched an unrelated astronomy survey named "CLAUDS"), so results are re-checked here for a literal match in title or abstract.',
  },
  upload: {
    label: 'Imported file', color: '#94a3b8',
    note: 'Rows imported from your Excel/CSV files: content, authors and dates are exactly what the file contains — nothing is collected from the web.',
  },
};
