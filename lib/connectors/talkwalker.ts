import type { Connector, ListeningQuery, RawMention } from './types';
import { truncate } from './util';
import { cfg } from '@/lib/connector-config';

// ---------------------------------------------------------------------------
// Talkwalker (API aziendale, a pagamento).
//
// È l'unica fonte che NON si interroga da sola: vive dentro i progetti in
// modalità 'talkwalker', dove è l'unica attiva. Un progetto listening non la
// chiama mai — ogni chiamata consuma credits del contratto (10 per ricerca più
// 1 per risultato), e non si spendono soldi dell'azienda per sbaglio.
//
// NON si riscrive la ricerca: si punta a un TOPIC già configurato in
// Talkwalker (`topic=<id>`, senza `q`) e si prende quello che quel topic
// raccoglie, tag e correzioni fatte in Talkwalker compresi. Il topic speciale
// `search` significa "tutto quello che il progetto raccoglie": è il modo per
// portarsi dentro il flusso senza decidere prima cosa cercare.
//
// Doc: developer.talkwalker.com — GET /api/v1/search/p/<project>/results
// (fuori progetto: /api/v1/search/results). Token dal Customer Success Manager.
// ---------------------------------------------------------------------------

/** Risultati per chiamata: 10 credits fissi + 1 per risultato. */
const DEFAULT_HPP = 100;
/** Talkwalker accetta al massimo 50 operandi e 4096 caratteri per query. */
const MAX_OPERANDS = 50;

type TalkwalkerDoc = {
  url?: string; title?: string; content?: string; published?: number;
  lang?: string; sentiment?: number; source_type?: string | string[];
  engagement?: number; reach?: number;
  extra_author_attributes?: { name?: string; short_name?: string };
  extra_source_attributes?: { name?: string; world_data?: { country?: string } };
};

const quote = (t: string) => `"${t.replace(/"/g, '').trim()}"`;

/**
 * Query in sintassi Talkwalker: ("a" OR "b") AND "c" AND NOT "d".
 * Il tetto di 50 operandi è dell'API: sforarlo fa fallire la chiamata, e una
 * chiamata fallita per una parola di troppo è comunque una chiamata pagata.
 */
export function talkwalkerQuery(q: ListeningQuery): string {
  let budget = MAX_OPERANDS;
  const take = <T>(list: T[]) => {
    const out = list.slice(0, Math.max(0, budget));
    budget -= out.length;
    return out;
  };
  // Gli esclusi e gli AND valgono più degli OR: tolgono rumore, quindi si
  // servono per primi quando il budget di operandi è stretto.
  const all = take(q.allTerms ?? []);
  const not = take(q.excludeTerms ?? []);
  const any = take(q.anyTerms ?? []);

  const parts: string[] = [];
  if (any.length) parts.push(`(${any.map(quote).join(' OR ')})`);
  parts.push(...all.map(quote));
  const positive = parts.join(' AND ');
  const negative = not.map((t) => `NOT ${quote(t)}`).join(' AND ');
  const full = [positive, negative].filter(Boolean).join(' AND ');
  return full.slice(0, 4096);
}

/** I documenti editoriali vanno letti come articoli, i social come post. */
function sourceOf(doc: TalkwalkerDoc): 'talkwalker' | 'talkwalker_news' {
  const raw = Array.isArray(doc.source_type) ? doc.source_type.join(' ') : doc.source_type ?? '';
  return /news|blog|press|magazine|online_news/i.test(raw) ? 'talkwalker_news' : 'talkwalker';
}

export function mapDocument(doc: TalkwalkerDoc): RawMention | null {
  const content = doc.content ?? doc.title ?? '';
  const externalId = doc.url ?? `${doc.published ?? ''}:${(doc.title ?? content).slice(0, 80)}`;
  if (!content.trim() || !externalId.trim()) return null;
  const author = doc.extra_author_attributes ?? {};
  const source = doc.extra_source_attributes ?? {};
  return {
    source: sourceOf(doc),
    externalId,
    url: doc.url,
    title: doc.title ? truncate(doc.title, 300) : undefined,
    content: truncate(content, 800),
    author: author.name ?? author.short_name ?? source.name,
    authorHandle: author.short_name,
    community: source.name,
    publishedAt: doc.published ? new Date(doc.published) : new Date(),
    language: doc.lang,
    country: source.world_data?.country,
    // Talkwalker dà engagement e reach già aggregati: non si sa da quali
    // interazioni siano composti, quindi non si inventa una scomposizione.
    engagement: typeof doc.engagement === 'number' ? { likes: doc.engagement } : undefined,
    reach: typeof doc.reach === 'number' ? doc.reach : undefined,
  };
}

/** Topic jolly: tutti i documenti raccolti dalle ricerche del progetto. */
export const ALL_TOPICS = 'search';

type ResourceNode = { id?: string; title?: string; name?: string; type?: string; children?: unknown; nodes?: unknown };

/** Raccoglie ogni nodo che abbia insieme un id e un nome: un id senza nome non è
 * mostrabile, un nome senza id non è interrogabile. Serve perché la forma esatta
 * dell'albero non è fissata dalla documentazione. */
function collectNamedNodes(root: unknown): Map<string, string> {
  const found = new Map<string, string>();
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (!node || typeof node !== 'object') return;
    const n = node as ResourceNode;
    const label = n.title ?? n.name;
    if (typeof n.id === 'string' && n.id && typeof label === 'string' && label) found.set(n.id, label);
    for (const v of Object.values(node as Record<string, unknown>)) {
      if (v && typeof v === 'object') walk(v);
    }
  };
  walk(root);
  return found;
}

/**
 * Topic configurati in un progetto Talkwalker.
 *
 * Si usa la **Topic API** (`/topics/list`), l'endpoint indicato dal supporto
 * Talkwalker: è una GET, quindi basta un token di sola lettura. Se non risponde
 * si ripiega sulla Resources API, che la documentazione dà per token
 * read/write — così un token read_only non lascia comunque la lista vuota.
 * Nessuna delle due consuma credits.
 */
export async function listTalkwalkerTopics(projectId: string): Promise<{ id: string; label: string }[]> {
  // Demo pubblica: topic di fantasia, nessuna chiamata a Talkwalker.
  if (process.env.DEMO_MODE === '1') {
    return [
      { id: 'brand', label: 'Brand – all mentions' }, { id: 'leadership', label: 'CEO & leadership' },
      { id: 'esg', label: 'ESG & sustainability' }, { id: 'crisis', label: 'Crisis watch' },
      { id: 'products', label: 'Products & launches' },
    ];
  }
  const token = cfg('TALKWALKER_ACCESS_TOKEN');
  if (!token || !projectId) return [];
  const base = (cfg('TALKWALKER_BASE_URL') ?? 'https://api.talkwalker.com').replace(/\/+$/, '');
  const p = encodeURIComponent(projectId);

  const call = async (path: string, params: Record<string, string> = {}) => {
    const url = new URL(base + path);
    url.searchParams.set('access_token', token);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => null) as
      { status_message?: string; result_topics?: unknown; result_resources?: unknown } | null;
    if (!res.ok) throw new Error(`Talkwalker ${res.status}: ${body?.status_message ?? 'richiesta rifiutata'}`);
    return body;
  };

  let firstError: Error | null = null;
  try {
    const body = await call(`/api/v2/talkwalker/p/${p}/topics/list`);
    const found = collectNamedNodes(body?.result_topics);
    if (found.size > 0) return [...found].map(([id, label]) => ({ id, label }));
  } catch (e) {
    firstError = e as Error;
  }

  try {
    const body = await call(`/api/v2/talkwalker/p/${p}/resources`, { type: 'search' });
    return [...collectNamedNodes(body?.result_resources)].map(([id, label]) => ({ id, label }));
  } catch (e) {
    throw firstError ?? (e as Error);
  }
}

export const talkwalker: Connector = {
  id: 'talkwalker',
  label: 'Talkwalker (API)',
  tier: 'premium',
  enabled: () => Boolean(cfg('TALKWALKER_ACCESS_TOKEN')),
  disabledReason: 'Requires a Talkwalker API token: ask your Customer Success Manager for a read_only token, then enter it here',
  async fetchMentions(q) {
    const token = cfg('TALKWALKER_ACCESS_TOKEN');
    if (!token) return [];
    // Precedenza: i topic scelti in Talkwalker; poi, solo se non ce ne sono,
    // la query booleana del progetto Radar; in mancanza di entrambi si prende
    // tutto quello che il progetto Talkwalker raccoglie.
    const topics = (q.talkwalkerTopics ?? []).filter(Boolean);
    const query = topics.length ? '' : talkwalkerQuery(q);
    const fallbackAll = !topics.length && !query;

    const project = q.talkwalkerProject?.trim();
    const base = (cfg('TALKWALKER_BASE_URL') ?? 'https://api.talkwalker.com').replace(/\/+$/, '');
    const path = project
      ? `/api/v1/search/p/${encodeURIComponent(project)}/results`
      : '/api/v1/search/results';
    const hpp = Math.min(500, Math.max(1, Number(cfg('TALKWALKER_HPP') ?? DEFAULT_HPP)));

    const url = new URL(base + path);
    url.searchParams.set('access_token', token);
    if (query) url.searchParams.set('q', query);
    for (const t of topics) url.searchParams.append('topic', t);
    if (fallbackAll) url.searchParams.set('topic', ALL_TOPICS);
    url.searchParams.set('hpp', String(hpp));
    url.searchParams.set('time_range', cfg('TALKWALKER_TIME_RANGE') ?? '7d');
    url.searchParams.set('sort_by', 'published');
    url.searchParams.set('sort_order', 'desc');
    url.searchParams.set('hl', 'false');

    const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
    const body = await res.json().catch(() => null) as
      | { status_code?: string | number; status_message?: string; result_content?: { data?: unknown[] } }
      | null;
    if (!res.ok) {
      // Il messaggio dell'API è più utile del codice: 401 = token, 403 = progetto.
      throw new Error(`Talkwalker ${res.status}: ${body?.status_message ?? 'chiamata rifiutata'}`);
    }
    const items = (body?.result_content?.data ?? []) as { data?: TalkwalkerDoc }[];
    return items
      .map((item) => mapDocument((item?.data ?? item) as TalkwalkerDoc))
      .filter((m): m is RawMention => m !== null);
  },
};
