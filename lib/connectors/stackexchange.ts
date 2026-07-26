import { collect, fetchJson, stripHtml, truncate } from './util';
import type { Connector, RawMention } from './types';
import { cfg } from '@/lib/connector-config';

// Rete Stack Exchange: non solo Stack Overflow — 170+ community tematiche
// (soldi, viaggi, lavoro, genitori...), ognuna con la stessa API. Gratis
// senza chiave, ma verificato dal vivo che il tetto per IP senza chiave è
// basso (visto quota_max=300 nei test); una chiave gratuita (stackapps.com)
// lo alza a 10.000/giorno — per questo resta "free" (funziona da subito) con
// una chiave OPZIONALE per il volume, non "freekey" (che qui vorrebbe dire
// spento finché non la inserisci, e non è così).
//
// Ricerca sul TITOLO (intitle=), non sul testo intero: verificato dal vivo
// che la ricerca full-text (q=) restituisce risultati estranei al tema
// (una domanda su un servizio Windows è comparsa cercando "artificial
// intelligence" — stesso problema di rumore già risolto per OpenAlex).
// Il corpo della domanda non è incluso nei risultati di ricerca dell'API
// (verificato: nessun campo "question.body" nello schema restituito) — si
// userebbe una seconda chiamata per recuperarlo, qui evitata per restare a
// una sola richiesta per sito/termine; il titolo di una domanda tecnica è
// già di per sé un testo compiuto.

const SITES: Record<string, string> = {
  stackoverflow: 'Stack Overflow',
  superuser: 'Super User',
  money: 'Money Stack Exchange',
  workplace: 'The Workplace Stack Exchange',
  travel: 'Travel Stack Exchange',
  parenting: 'Parenting Stack Exchange',
};

type SeItem = {
  question_id: number; title: string; link: string;
  tags?: string[]; score: number; answer_count: number; view_count: number;
  creation_date: number; owner?: { display_name?: string };
};

async function searchSite(term: string, site: string, label: string): Promise<RawMention[]> {
  const key = cfg('STACK_EXCHANGE_KEY');
  const params = new URLSearchParams({
    order: 'desc', sort: 'activity', intitle: term, site, pagesize: '20', filter: 'default',
    ...(key ? { key } : {}),
  });
  const data = await fetchJson<{ items?: SeItem[] }>(`https://api.stackexchange.com/2.3/search?${params}`);
  return (data.items ?? []).map((it) => {
    const title = stripHtml(it.title);
    return {
      source: 'stackexchange',
      externalId: String(it.question_id),
      url: it.link,
      title: truncate(title, 300),
      content: truncate(title, 300),
      author: it.owner?.display_name ? stripHtml(it.owner.display_name) : undefined,
      community: label,
      publishedAt: new Date(it.creation_date * 1000),
      language: 'en',
      engagement: { likes: it.score, comments: it.answer_count },
      reach: it.view_count,
    } satisfies RawMention;
  });
}

export const stackExchange: Connector = {
  id: 'stackexchange',
  label: 'Stack Exchange',
  tier: 'free',
  enabled: () => true,
  async fetchMentions(q) {
    const terms = q.anyTerms.slice(0, 3);
    if (terms.length === 0) return [];
    const jobs = terms.flatMap((t) => Object.entries(SITES).map(([site, label]) => searchSite(t, site, label)));
    return collect(jobs);
  },
};
