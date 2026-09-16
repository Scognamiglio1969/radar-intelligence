import type { Connector, ListeningQuery, RawMention } from './types';
import { stripHtml, truncate } from './util';
import { cfg } from '@/lib/connector-config';

// ---------------------------------------------------------------------------
// NewsData.io — notizie da oltre centomila testate, in ottanta lingue.
//
// Il piano gratuito dà 200 crediti al giorno, una ricerca ne costa uno e
// restituisce al massimo dieci articoli; l'uso commerciale è ammesso, che è il
// motivo per cui è questa la fonte di notizie con chiave che conviene a Radar.
// Per non bruciare la quota si fa UNA ricerca per progetto a ogni raccolta:
// una query booleana con tutti i termini che stanno nei cento caratteri che
// l'API accetta. Il resto dei termini ruota al giro successivo (lib/ingest).
//
// Il testo integrale ("content") nel piano gratuito arriva come segnaposto:
// lo si scarta, e l'articolo si arricchisce dopo come tutti gli altri
// (lib/article-enrich).
// ---------------------------------------------------------------------------

const MAX_QUERY = 100;

type Article = {
  article_id?: string;
  title?: string;
  link?: string;
  description?: string | null;
  content?: string | null;
  pubDate?: string;
  pubDateTZ?: string;
  source_id?: string;
  source_name?: string;
  creator?: string[] | null;
  language?: string;
  country?: string[] | string;
};

type Response = {
  status: string;
  results?: Article[] | { message?: string; code?: string };
  nextPage?: string;
};

/** NewsData restituisce la lingua per esteso ("italian"): Radar usa i codici. */
const LANG: Record<string, string> = {
  italian: 'it', english: 'en', french: 'fr', german: 'de', spanish: 'es', portuguese: 'pt',
  dutch: 'nl', polish: 'pl', russian: 'ru', ukrainian: 'uk', arabic: 'ar', chinese: 'zh',
  japanese: 'ja', korean: 'ko', turkish: 'tr', greek: 'el', swedish: 'sv', norwegian: 'no',
  danish: 'da', finnish: 'fi', czech: 'cs', romanian: 'ro', hungarian: 'hu', hindi: 'hi',
  indonesian: 'id', hebrew: 'he', catalan: 'ca',
};

export function languageCode(lang?: string): string | undefined {
  if (!lang) return undefined;
  const l = lang.toLowerCase().trim();
  return LANG[l] ?? (l.length === 2 ? l : undefined);
}

/**
 * La query più ricca che sta in cento caratteri: termini in OR, i vincoli AND
 * e NOT del progetto in coda finché c'è spazio. Quello che non ci sta lo
 * applica comunque il filtro centrale di lib/ingest.
 */
export function newsdataQuery(q: ListeningQuery, max = MAX_QUERY): string {
  const quote = (t: string) => (t.includes(' ') ? `"${t.replace(/"/g, '')}"` : t.replace(/"/g, ''));
  const terms: string[] = [];
  for (const t of q.anyTerms) {
    const next = [...terms, quote(t)];
    if (`(${next.join(' OR ')})`.length > max) break;
    terms.push(quote(t));
  }
  if (!terms.length) return '';
  let out = terms.length > 1 ? `(${terms.join(' OR ')})` : terms[0];
  for (const t of q.allTerms) {
    const next = `${out} AND ${quote(t)}`;
    if (next.length > max) break;
    out = next;
  }
  for (const t of q.excludeTerms) {
    const next = `${out} NOT ${quote(t)}`;
    if (next.length > max) break;
    out = next;
  }
  return out;
}

/** "2026-09-16 14:26:45" è in UTC: senza la Z JavaScript la leggerebbe come ora locale. */
export function parseNewsdataDate(s?: string): Date {
  if (!s) return new Date(NaN);
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
}

const PAID_ONLY = /only available in (paid|professional|corporate)/i;

export function toMention(a: Article): RawMention | null {
  if (!a.title || !a.link) return null;
  const description = a.description && !PAID_ONLY.test(a.description) ? stripHtml(a.description) : '';
  const content = a.content && !PAID_ONLY.test(a.content) ? stripHtml(a.content) : '';
  const country = Array.isArray(a.country) ? a.country[0] : a.country;
  return {
    source: 'newsdata',
    externalId: a.article_id ?? a.link,
    url: a.link,
    title: truncate(stripHtml(a.title), 300),
    content: truncate(content || description || stripHtml(a.title), 1500),
    author: a.source_name ?? a.source_id,
    authorHandle: a.source_id,
    community: a.creator?.filter(Boolean).join(', ') || undefined,
    publishedAt: parseNewsdataDate(a.pubDate),
    language: languageCode(a.language),
    country: country ?? undefined,
  };
}

export const newsdata: Connector = {
  id: 'newsdata',
  label: 'NewsData.io',
  tier: 'freekey',
  enabled: () => Boolean(cfg('NEWSDATA_API_KEY')),
  disabledReason: 'Missing NEWSDATA_API_KEY (free at newsdata.io/register)',
  async fetchMentions(q) {
    const key = cfg('NEWSDATA_API_KEY');
    if (!key) return [];
    const query = newsdataQuery(q);
    if (!query) return [];
    const params = new URLSearchParams({ apikey: key, q: query, removeduplicate: '1' });
    // Al massimo cinque lingue: è il limite dell'API per parametro.
    if (q.languages.length) params.set('language', q.languages.slice(0, 5).join(','));

    const res = await fetch(`https://newsdata.io/api/1/latest?${params}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => null) as Response | null;
    if (!res.ok || !data || data.status !== 'success' || !Array.isArray(data.results)) {
      const msg = data && !Array.isArray(data.results) ? data.results?.message : undefined;
      // 429 è la quota del giorno finita: lo si dice così, perché "HTTP 429"
      // non spiega che domani riparte da sola.
      if (res.status === 429) throw new Error('NewsData.io: crediti del giorno esauriti (200 sul piano gratuito), riprende domani');
      throw new Error(`NewsData.io: ${msg ?? `HTTP ${res.status}`}`);
    }
    return data.results.map(toMention).filter((m): m is RawMention => m !== null);
  },
};
