import type { Connector, RawMention } from './types';
import { booleanQuery } from './types';
import { truncate } from './util';
import { cfg } from '@/lib/connector-config';

// LinkedIn (web): post e articoli PUBBLICI di terzi trovati tramite l'indice di
// ricerca Tavily (API ufficiale, piano gratuito 1.000 ricerche/mese; a noi ne
// serve 1 per progetto per ciclo). Modello di acquisizione DIVERSO da
// "LinkedIn (page)" (API ufficiale LinkedIn): qui arrivano estratti parziali,
// senza metriche di engagement, ma di qualsiasi autore pubblico.
// Legale: si interroga l'API di Tavily, non i server LinkedIn.
// Si attiva con TAVILY_API_KEY (da app.tavily.com).

type TavilyResult = {
  title?: string;
  url?: string;
  content?: string;
  published_date?: string;
};

/** "Mario Rossi on LinkedIn: testo…" / "… | LinkedIn" → autore e titolo puliti. */
function parseTitle(raw: string): { author?: string; title: string } {
  const m = raw.match(/^(.{2,80}?) (?:on|su|auf|en|sur) LinkedIn[:：]\s*(.*)$/i);
  if (m) return { author: m[1].trim(), title: m[2].trim() || m[1].trim() };
  return { title: raw.replace(/\s*[|–-]\s*LinkedIn\s*$/i, '').trim() };
}

export const linkedinWeb: Connector = {
  id: 'linkedin_web',
  label: 'LinkedIn (web)',
  tier: 'freekey',
  enabled: () => Boolean(cfg('TAVILY_API_KEY')),
  disabledReason: 'Requires a free Tavily API key (app.tavily.com, 1,000 searches/month): enter it here',
  async fetchMentions(q) {
    const query = booleanQuery(q);
    if (!query) return [];

    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg('TAVILY_API_KEY')}`,
      },
      body: JSON.stringify({
        query,
        include_domains: ['linkedin.com'],
        time_range: 'week',
        max_results: 20,
        search_depth: 'basic',
      }),
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    const text = await res.text();
    if (!res.ok) {
      let reason = '';
      try {
        const body = JSON.parse(text) as { detail?: { error?: string } | string; error?: string };
        reason = typeof body.detail === 'string' ? body.detail : body.detail?.error ?? body.error ?? '';
      } catch { /* corpo non JSON */ }
      throw new Error(`Tavily HTTP ${res.status}${reason ? `: ${truncate(reason, 200)}` : ''}`);
    }
    const data = JSON.parse(text) as { results?: TavilyResult[] };

    return (data.results ?? [])
      .filter((r) => {
        try {
          return Boolean(r.url) && new URL(r.url!).hostname.endsWith('linkedin.com');
        } catch {
          return false;
        }
      })
      .map((r) => {
        const { author, title } = parseTitle(r.title ?? '');
        const pub = r.published_date ? new Date(r.published_date) : null;
        return {
          source: 'linkedin_web',
          externalId: r.url!,
          url: r.url!,
          title: truncate(title, 300),
          content: truncate(r.content ?? title, 800),
          author,
          authorHandle: author,
          community: r.url!.includes('/pulse/') ? 'article' : 'post',
          publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub : new Date(),
        } satisfies RawMention;
      })
      .filter((m) => m.content);
  },
};
