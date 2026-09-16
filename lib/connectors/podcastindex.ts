import type { Connector, RawMention } from './types';
import { collect, excerptAround, stripHtml, truncate } from './util';
import { cfg } from '@/lib/connector-config';

// ---------------------------------------------------------------------------
// Podcast Index — gli episodi dei podcast che parlano del tema.
//
// L'audio è il canale che Radar non vedeva: un tema può essere discusso per
// ore in trasmissioni che nessun feed di notizie riporta. Podcast Index è la
// directory aperta dei podcast, gestita da una non profit, con chiave e
// segreto gratuiti.
//
// La ricerca per "persona" è quella giusta anche per un tema: cerca nel titolo
// e nella descrizione degli episodi, oltre che nei nomi. Come per le altre
// fonti larghe, ogni episodio si ricontrolla qui per una corrispondenza
// letterale.
//
// Si legge la descrizione, non l'audio: un episodio che nomina il tema solo a
// voce non si trova, e questo va detto a chi legge i numeri.
// ---------------------------------------------------------------------------

const BASE = 'https://api.podcastindex.org/api/1.0';
const UA = 'Radar/1.0 (media intelligence)';

type Episode = {
  id: number;
  title?: string;
  link?: string;
  description?: string;
  datePublished?: number;
  enclosureUrl?: string;
  duration?: number | null;
  feedId?: number;
  feedTitle?: string;
  feedAuthor?: string;
  feedLanguage?: string;
};

/** SHA-1 esadecimale con Web Crypto: i connettori finiscono anche nel bundle del browser. */
async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Le intestazioni di autenticazione: chiave, data e hash di chiave + segreto + data. */
export async function podcastIndexHeaders(key: string, secret: string, now = Date.now()): Promise<Record<string, string>> {
  const date = String(Math.floor(now / 1000));
  return {
    'User-Agent': UA,
    'X-Auth-Key': key,
    'X-Auth-Date': date,
    Authorization: await sha1Hex(key + secret + date),
  };
}

/** "it-IT", "en-us", "Italian" → "it". */
export function feedLanguage(l?: string): string | undefined {
  if (!l) return undefined;
  const code = l.trim().toLowerCase().slice(0, 2);
  return /^[a-z]{2}$/.test(code) ? code : undefined;
}

export function episodeToMention(e: Episode, term: string): RawMention | null {
  const title = stripHtml(e.title ?? '');
  const description = stripHtml(e.description ?? '');
  if (!title || !e.datePublished) return null;
  if (!`${title} ${description}`.toLowerCase().includes(term.toLowerCase())) return null;
  const minutes = e.duration ? Math.round(e.duration / 60) : null;
  return {
    source: 'podcastindex',
    externalId: String(e.id),
    url: e.link || e.enclosureUrl,
    title: truncate(title, 300),
    content: excerptAround(description || title, term, 1500),
    author: e.feedAuthor || e.feedTitle,
    // Lo show è la "community" dell'episodio: è così che si contano le
    // trasmissioni che tornano sul tema, non solo gli episodi.
    community: e.feedTitle ? `${e.feedTitle}${minutes ? ` · ${minutes} min` : ''}` : undefined,
    authorHandle: e.feedId ? `feed:${e.feedId}` : undefined,
    publishedAt: new Date(e.datePublished * 1000),
    language: feedLanguage(e.feedLanguage),
  };
}

async function search(term: string, key: string, secret: string): Promise<RawMention[]> {
  const url = `${BASE}/search/byperson?q=${encodeURIComponent(term)}&max=40&fulltext`;
  const res = await fetch(url, {
    headers: await podcastIndexHeaders(key, secret),
    signal: AbortSignal.timeout(20000),
    cache: 'no-store',
  });
  if (res.status === 401) throw new Error('Podcast Index: chiave o segreto non validi');
  if (!res.ok) throw new Error(`Podcast Index: HTTP ${res.status}`);
  const data = await res.json() as { items?: Episode[] };
  return (data.items ?? [])
    .map((e) => episodeToMention(e, term))
    .filter((m): m is RawMention => m !== null);
}

export const podcastIndex: Connector = {
  id: 'podcastindex',
  label: 'Podcast Index',
  tier: 'freekey',
  enabled: () => Boolean(cfg('PODCASTINDEX_API_KEY') && cfg('PODCASTINDEX_API_SECRET')),
  disabledReason: 'Missing PODCASTINDEX_API_KEY / PODCASTINDEX_API_SECRET (free at api.podcastindex.org)',
  async fetchMentions(q) {
    const key = cfg('PODCASTINDEX_API_KEY');
    const secret = cfg('PODCASTINDEX_API_SECRET');
    if (!key || !secret) return [];
    return collect(q.anyTerms.slice(0, 3).map((t) => search(t, key, secret)));
  },
};
