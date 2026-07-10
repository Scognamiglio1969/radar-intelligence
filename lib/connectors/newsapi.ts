import type { Connector, RawMention } from './types';
import { fetchJson, truncate } from './util';
import { cfg } from '@/lib/connector-config';

// NewsAPI.org: aggregatore di ~150.000 testate con ricerca full-text booleana.
// Tier developer gratuito (100 richieste/giorno, no uso commerciale);
// produzione da $449/mese. Si attiva con NEWSAPI_KEY.

type Article = {
  title?: string; description?: string; url: string; publishedAt?: string;
  source?: { name?: string }; author?: string;
};

export const newsapi: Connector = {
  id: 'newsapi',
  label: 'NewsAPI (150k testate)',
  tier: 'premium',
  enabled: () => Boolean(cfg('NEWSAPI_KEY')),
  disabledReason: 'Serve la API Key NewsAPI (newsapi.org): inseriscila qui dalle Impostazioni',
  async fetchMentions(q) {
    // Sintassi booleana nativa di NewsAPI: AND / OR / NOT con parentesi
    const parts: string[] = [];
    if (q.anyTerms.length) parts.push(`(${q.anyTerms.slice(0, 6).map((t) => `"${t}"`).join(' OR ')})`);
    parts.push(...q.allTerms.map((t) => `AND "${t}"`));
    parts.push(...q.excludeTerms.map((t) => `NOT "${t}"`));
    const query = parts.join(' ');
    if (!query) return [];

    const lang = q.languages[0] ?? 'it';
    const data = await fetchJson<{ articles?: Article[] }>(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${lang}&sortBy=publishedAt&pageSize=100&apiKey=${cfg('NEWSAPI_KEY')}`,
    );
    return (data.articles ?? []).map((a) => ({
      source: 'newsapi',
      externalId: a.url,
      url: a.url,
      title: truncate(a.title ?? '', 300),
      content: truncate(a.description ?? a.title ?? '', 800),
      author: a.source?.name,
      community: a.source?.name,
      publishedAt: a.publishedAt ? new Date(a.publishedAt) : new Date(),
      language: lang,
    } satisfies RawMention)).filter((m) => m.title);
  },
};
