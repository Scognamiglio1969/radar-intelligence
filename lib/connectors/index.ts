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
import { newsapi } from './newsapi';

export const CONNECTORS: Connector[] = [
  // Gratuite
  googleNews, gdelt, reddit, bluesky, mastodon, hackerNews, youtube, telegram, rss,
  // Premium (si attivano con le chiavi API)
  xTwitter, instagram, facebook, tiktok, linkedin, newsapi,
];

export const NEWS_SOURCES = ['googlenews', 'gdelt'];

export const SOURCE_META: Record<string, { label: string; color: string }> = {
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
  linkedin: { label: 'LinkedIn', color: '#0a66c2' },
  newsapi: { label: 'NewsAPI', color: '#14b8a6' },
};
