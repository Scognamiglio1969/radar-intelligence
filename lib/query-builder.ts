import { XMLParser } from 'fast-xml-parser';
import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { benchmarkEntities, mentions, projects } from '@/lib/db/schema';
import { callClaudeDetailed, MODELS, type AiFailure } from '@/lib/claude';
import { repairJson } from '@/lib/import-agent';
import { fetchText, stripHtml } from '@/lib/connectors/util';
import { BY_COUNTRY } from '@/lib/connectors/googlenews';
import {
  compilePlan, legacyFields, LIMITS, planFromLegacy, planFromRules, validatePlan,
  type CompiledQuery, type QueryPlan,
} from '@/lib/query-plan';

// ---------------------------------------------------------------------------
// Dal linguaggio naturale alle query, e dalle query alla prova dei fatti.
//
// Tre passi, nello stesso ordine in cui li farebbe un analista:
//
//   CAPIRE     il modello legge la richiesta e propone i concetti con i loro
//              termini (nelle lingue del progetto, con alias e omonimi da
//              escludere) e le combinazioni che la richiesta implica;
//   VALIDARE   lib/query-plan scarta quello che non regge;
//   PROVARE    ogni termine e ogni query si provano su Google News prima di
//              salvare: quanto portano, con quali titoli, quali termini non
//              trovano niente e quali portano da soli quasi tutto il volume.
//
// Il modello non vede dati e non decide niente di definitivo: la proposta
// resta modificabile, e la prova è fatta sui risultati veri.
// ---------------------------------------------------------------------------

type ProjectLike = { name: string; languages: string[]; countries: string[] };

const SYSTEM = `You design media-monitoring queries from a plain-language request.
Return ONLY a JSON object:
{
 "concepts": [ { "id": "short-id", "label": "Human name", "role": "subject|context|competitor|noise", "terms": ["..."], "note": "why these terms" } ],
 "queries":  [ { "id": "short-id", "name": "Human name", "kind": "core|context|competitor|comparison", "all": ["concept-id", ...], "none": ["concept-id", ...] } ]
}

CONCEPTS
- subject: what the user wants to monitor (company, brand, person, product). Terms: the official name, the common short name, well-known abbreviations or stock tickers, the main product/brand names clearly tied to it. Never invent social handles or URLs.
- context: each situation, fact or theme the user relates the subject to (e.g. a political protest). Terms: the concrete words people actually write, 1-3 words each, in EVERY project language, including examples the user gave. 4-12 terms.
- competitor: one concept per competitor named or clearly implied. Terms: official and common names.
- noise: only when a name is ambiguous (e.g. "Jaguar" the animal, "Apple" the fruit, a surname shared with a footballer). Terms: words that identify the wrong meaning. Omit if nothing is ambiguous.
- Terms are what appears in text: no boolean operators, no quotes, no hashtags unless the hashtag itself is the common form.

QUERIES (at most ${LIMITS.enabledQueries})
- one "core" query with the subject alone;
- one "context" query per context: [subject, context];
- one "competitor" query per competitor: [competitor];
- add a "comparison" query [subject, competitor] only if the user asks to compare them directly;
- every query lists the noise concepts that apply to it in "none".
Keep ids lowercase with dashes. Write labels and notes in the user's language.`;

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '');
  const start = cleaned.indexOf('{');
  if (start < 0) return null;
  const body = cleaned.slice(start, cleaned.lastIndexOf('}') + 1);
  try { return JSON.parse(body); } catch { /* troncato: si ripara */ }
  try { return repairJson(cleaned.slice(start)); } catch { return null; }
}

export type BuildResult = {
  plan: QueryPlan;
  warnings: string[];
  /** Perché l'AI non ha risposto, se si è ripiegato sulle regole. */
  aiFailure?: AiFailure;
};

/** La proposta di piano per una richiesta: dal modello, o dalle regole se il modello manca. */
export async function buildPlan(brief: string, project: ProjectLike): Promise<BuildResult> {
  const text = brief.trim().slice(0, 2000);
  // Demo pubblica: l'AI è spenta. La richiesta d'esempio riceve la proposta
  // che il costruttore produce per lei; le altre, la lettura a regole.
  if (process.env.DEMO_MODE === '1') {
    const { DEMO_PLAN } = await import('@/lib/db/demo-extra');
    if (/aurora/i.test(text)) {
      return { plan: { ...DEMO_PLAN, brief: text }, warnings: ['Public demo: this AI proposal was generated in advance for the example request.'] };
    }
    return { plan: planFromRules(text), warnings: ['Public demo: AI is off, so this is the rule-based reading. Try the Aurora Mobility example to see the AI proposal.'] };
  }
  const langs = project.languages.length ? project.languages.join(', ') : 'it, en';
  const user = `Project: ${project.name}
Languages: ${langs}
Countries: ${project.countries.join(', ') || 'worldwide'}
Request: ${text}`;
  const { text: out, failure } = await callClaudeDetailed(MODELS.sonnet, 'query_builder', SYSTEM, user, 3500);
  const parsed = out ? extractJson(out) : null;
  if (parsed && typeof parsed === 'object') {
    const { plan, warnings } = validatePlan({ ...(parsed as object), brief: text, origin: 'ai' });
    if (plan.queries.length) return { plan, warnings };
    warnings.push('La proposta dell’AI non conteneva query utilizzabili: uso una lettura a regole.');
    const fallback = planFromRules(text);
    return { plan: fallback, warnings };
  }
  const fallback = planFromRules(text);
  return {
    plan: fallback,
    warnings: ['L’AI non ha risposto: questa è una prima lettura a regole, da rifinire a mano.'],
    aiFailure: failure ?? { why: 'empty', message: 'Risposta non leggibile.' },
  };
}

// --- La prova sul campo ---------------------------------------------------------

export type Sample = { title: string; source?: string; url?: string; date?: string };
export type TermProbe = { conceptId: string; term: string; hits: number; capped: boolean; samples: Sample[] };
export type QueryProbe = {
  queryId: string; hits: number; capped: boolean; samples: Sample[];
  /** Il termine dell'ancora che da solo porta la maggior parte dei risultati. */
  dominant?: { term: string; share: number };
};
export type PlanProbe = {
  edition: string; days: number; terms: TermProbe[]; queries: QueryProbe[]; at: string;
  /** Demo pubblica: risultati simulati, non letti da Google News. */
  simulated?: boolean;
};

const PROBE_DAYS = 7;
const MAX_ITEMS = 100;

function edition(project: ProjectLike) {
  const country = project.countries.find((c) => BY_COUNTRY[c]);
  if (country) return { code: country, loc: BY_COUNTRY[country] };
  const byLang: Record<string, string> = { it: 'IT', en: 'US', es: 'ES', fr: 'FR', de: 'DE', pt: 'BR', nl: 'NL', pl: 'PL', ja: 'JP' };
  const code = byLang[project.languages[0] ?? 'it'] ?? 'US';
  return { code, loc: BY_COUNTRY[code] };
}

/** La sintassi di Google News: spazio = AND, OR esplicito, meno per escludere. */
export function newsSyntax(q: Pick<CompiledQuery, 'anchor' | 'groups' | 'exclude'>): string {
  const quote = (t: string) => (/\s/.test(t) ? `"${t}"` : t);
  const group = (ts: string[]) => (ts.length === 1 ? quote(ts[0]) : `(${ts.map(quote).join(' OR ')})`);
  return [group(q.anchor), ...q.groups.map(group), ...q.exclude.map((t) => `-${quote(t)}`)].join(' ');
}

async function searchNews(query: string, loc: { hl: string; gl: string; ceid: string }): Promise<{ n: number; items: Sample[] }> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} when:${PROBE_DAYS}d`)}&hl=${loc.hl}&gl=${loc.gl}&ceid=${loc.ceid}`;
  const xml = await fetchText(url);
  const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
  let items = parsed?.rss?.channel?.item ?? [];
  if (!Array.isArray(items)) items = [items];
  const list = (items as { title?: string; link?: string; pubDate?: string; source?: { '#text'?: string } | string }[])
    .map((it) => ({
      title: stripHtml(String(it.title ?? '')),
      source: typeof it.source === 'string' ? it.source : it.source?.['#text'],
      url: it.link ? String(it.link) : undefined,
      date: it.pubDate ? new Date(it.pubDate).toISOString() : undefined,
    }))
    .filter((s) => s.title);
  return { n: list.length, items: list };
}

/** Esegue compiti in parallelo, pochi alla volta: Google News non ama le raffiche. */
async function pool<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

/**
 * Prova il piano: ogni termine da solo, e ogni query attiva, sull'ultima
 * settimana di Google News nell'edizione del progetto. Gratuito, senza chiave.
 */
export async function probePlan(plan: QueryPlan, project: ProjectLike): Promise<PlanProbe> {
  const ed = edition(project);
  if (process.env.DEMO_MODE === '1') return simulatedProbe(plan, ed.code);
  const terms = plan.concepts
    .filter((c) => c.role !== 'noise')
    .flatMap((c) => c.terms.map((term) => ({ conceptId: c.id, term })))
    .slice(0, 40);

  const termProbes = await pool(terms, 4, async (t): Promise<TermProbe> => {
    try {
      const r = await searchNews(/\s/.test(t.term) ? `"${t.term}"` : t.term, ed.loc);
      return { ...t, hits: r.n, capped: r.n >= MAX_ITEMS, samples: r.items.slice(0, 3) };
    } catch {
      return { ...t, hits: -1, capped: false, samples: [] };
    }
  });
  const hitsOf = new Map(termProbes.map((p) => [p.term, p.hits]));

  const compiled = compilePlan(plan);
  const queryProbes = await pool(compiled, 3, async (q): Promise<QueryProbe> => {
    let r = { n: -1, items: [] as Sample[] };
    try { r = await searchNews(newsSyntax(q), ed.loc); } catch { /* resta -1 */ }
    // Un termine che da solo porta quasi tutto il volume dell'ancora è il
    // primo sospettato di essere troppo generico.
    const anchorHits = q.anchor.map((t) => ({ term: t, hits: Math.max(0, hitsOf.get(t) ?? 0) }));
    const total = anchorHits.reduce((s, x) => s + x.hits, 0);
    const top = [...anchorHits].sort((a, b) => b.hits - a.hits)[0];
    const dominant = q.anchor.length > 1 && top && total >= 30 && top.hits / total >= 0.8
      ? { term: top.term, share: Math.round((top.hits / total) * 100) } : undefined;
    return { queryId: q.id, hits: r.n, capped: r.n >= MAX_ITEMS, samples: r.items.slice(0, 4), dominant };
  });

  return { edition: ed.code, days: PROBE_DAYS, terms: termProbes, queries: queryProbes, at: new Date().toISOString() };
}

/**
 * La prova sul campo della demo: numeri stabili ricavati dal testo dei
 * termini e titoli d'esempio di fantasia. Dichiarata come simulata, perché
 * un'azienda inventata su Google News non troverebbe niente.
 */
function simulatedProbe(plan: QueryPlan, code: string): PlanProbe {
  const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const byTerm: Record<string, number> = { sciopero: 100, protesta: 100, 'city council': 100, 'speed limit': 64, Ruota: 100, 'Aurora app': 0 };
  const terms = plan.concepts.filter((c) => c.role !== 'noise').flatMap((c) => c.terms.map((term) => {
    const hits = byTerm[term] ?? (hash(term) % 60) + 4;
    return { conceptId: c.id, term, hits, capped: hits >= 100, samples: [] };
  }));
  const samples: Record<string, string[]> = {
    aurora: ['Aurora Mobility expands its scooter fleet to three new cities', 'Aurora e-bikes top a user satisfaction survey'],
    'aurora-strike': ['Riders strike halts Aurora Mobility deliveries in Milan', 'Sciopero dei rider: presidio davanti alla sede di Aurora Mobility'],
    'aurora-bans': ['City council weighs an e-scooter ban that would hit Aurora scooters'],
    'aurora-volta': ['Aurora Mobility and Volta Ride trade blows over pricing'],
    volta: ['Volta Ride launches a monthly subscription', 'Volta scooters return to the streets after a safety recall'],
    ruota: ['Ruota bike opens its first hub in Turin', 'Ruota raises a Series B round', 'Ruota app: the new map is live'],
    metrolink: [],
  };
  const hitsByQuery: Record<string, number> = { aurora: 47, 'aurora-strike': 12, 'aurora-bans': 5, 'aurora-volta': 3, volta: 21, ruota: 100, metrolink: 0 };
  const queries = compilePlan(plan).map((q) => ({
    queryId: q.id,
    hits: hitsByQuery[q.id] ?? (hash(q.id) % 30) + 1,
    capped: (hitsByQuery[q.id] ?? 0) >= 100,
    samples: (samples[q.id] ?? []).map((title) => ({ title, source: 'City Wire', url: 'https://example.com' })),
    dominant: q.id === 'ruota' ? { term: 'Ruota', share: 94 } : undefined,
  }));
  return { edition: code, days: PROBE_DAYS, terms, queries, at: new Date().toISOString(), simulated: true };
}

// --- Il piano del progetto --------------------------------------------------------

/** Il piano salvato, o quello ricavato dalla vecchia query (non ancora salvato). */
export async function projectPlan(projectId: number): Promise<{ plan: QueryPlan; saved: boolean } | null> {
  const db = await getDb();
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) return null;
  if (p.queryPlan) return { plan: validatePlan(p.queryPlan).plan, saved: true };
  if (!p.keywords.length) return null;
  const entities = await db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId));
  return { plan: planFromLegacy(p, entities), saved: false };
}

/**
 * Salva il piano e allinea tutto quello che il resto di Radar legge.
 *
 * Nessuna cancellazione: le entità del Benchmark si aggiornano o si
 * aggiungono, quelle che il piano non conosce restano dove sono.
 */
export async function savePlan(projectId: number, input: unknown): Promise<{ plan: QueryPlan; warnings: string[] }> {
  const { plan, warnings } = validatePlan(input);
  if (!plan.queries.some((q) => q.enabled)) throw new Error('Serve almeno una query attiva.');
  const db = await getDb();
  const legacy = legacyFields(plan);
  const [current] = await db.select({ mode: projects.mode }).from(projects).where(eq(projects.id, projectId));
  // Un progetto Talkwalker tiene la sua ricerca: i campi della vecchia query
  // sono il suo ripiego verso Talkwalker, e scriverli qui spenderebbe
  // crediti per una ricerca che l'utente non ha chiesto.
  const lens = current?.mode === 'talkwalker';
  await db.update(projects).set({
    queryPlan: plan,
    ...(lens ? {} : { keywords: legacy.keywords, allTerms: [], excludeTerms: legacy.excludeTerms }),
    ...(plan.brief ? { semanticContext: plan.brief.slice(0, 600) } : {}),
  }).where(eq(projects.id, projectId));

  const existing = await db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId));
  const byName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));
  const hasBrand = legacy.entities.some((e) => e.isOwnBrand);
  if (hasBrand) await db.update(benchmarkEntities).set({ isOwnBrand: 0 }).where(eq(benchmarkEntities.projectId, projectId));
  for (const e of legacy.entities) {
    const found = byName.get(e.name.toLowerCase());
    if (found) {
      await db.update(benchmarkEntities).set({ keywords: e.keywords, isOwnBrand: e.isOwnBrand ? 1 : 0 })
        .where(eq(benchmarkEntities.id, found.id));
    } else {
      await db.insert(benchmarkEntities).values({ projectId, name: e.name, keywords: e.keywords, isOwnBrand: e.isOwnBrand ? 1 : 0 });
    }
  }
  return { plan, warnings };
}

const DAY = 86400_000;

/**
 * Rietichetta le menzioni degli ultimi 30 giorni con le query che le trovano.
 * Una query nuova ha subito i suoi numeri, senza aspettare la prossima raccolta.
 */
export async function retagMentions(projectId: number, plan: QueryPlan, days = 30): Promise<number> {
  const db = await getDb();
  const since = new Date(Date.now() - days * DAY);
  const text = sql`lower(coalesce(${mentions.title}, '') || ' ' || ${mentions.content})`;
  const anyOf = (terms: string[]) => sql`${text} like any (${sql.raw('array[')}${sql.join(terms.map((t) => sql`${`%${t.toLowerCase()}%`}`), sql`, `)}${sql.raw(']')})`;

  await db.update(mentions).set({ queryIds: [] })
    .where(and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, since)));
  let tagged = 0;
  for (const q of compilePlan(plan)) {
    const conds = [
      eq(mentions.projectId, projectId), gte(mentions.publishedAt, since), anyOf(q.anchor),
      ...q.groups.map(anyOf),
      ...(q.exclude.length ? [sql`not (${anyOf(q.exclude)})`] : []),
    ];
    const res = await db.update(mentions)
      .set({ queryIds: sql`coalesce(${mentions.queryIds}, '[]'::jsonb) || ${JSON.stringify([q.id])}::jsonb` })
      .where(and(...conds))
      .returning({ id: mentions.id });
    tagged += res.length;
  }
  return tagged;
}

export type QueryStats = { queryId: string; last7: number; last30: number; sources: Record<string, number>; lastSeen: string | null };

/** Quanto sta rendendo ogni query, dalle menzioni già in archivio. */
export async function queryStats(projectId: number): Promise<QueryStats[]> {
  const db = await getDb();
  const res = await db.execute(sql`
    select q as query_id,
      count(*) filter (where published_at >= now() - interval '7 days')::int as last7,
      count(*)::int as last30,
      max(published_at)::text as last_seen
    from mentions, jsonb_array_elements_text(coalesce(query_ids, '[]'::jsonb)) as q
    where project_id = ${projectId} and published_at >= now() - interval '30 days'
    group by q`);
  const bySource = await db.execute(sql`
    select q as query_id, source, count(*)::int as n
    from mentions, jsonb_array_elements_text(coalesce(query_ids, '[]'::jsonb)) as q
    where project_id = ${projectId} and published_at >= now() - interval '30 days'
    group by 1, 2`);
  const sources = new Map<string, Record<string, number>>();
  for (const r of bySource.rows as { query_id: string; source: string; n: number }[]) {
    const m = sources.get(r.query_id) ?? {};
    m[r.source] = Number(r.n);
    sources.set(r.query_id, m);
  }
  return (res.rows as { query_id: string; last7: number; last30: number; last_seen: string | null }[]).map((r) => ({
    queryId: r.query_id, last7: Number(r.last7), last30: Number(r.last30),
    sources: sources.get(r.query_id) ?? {}, lastSeen: r.last_seen,
  }));
}
