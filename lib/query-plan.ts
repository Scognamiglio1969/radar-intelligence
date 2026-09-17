// ---------------------------------------------------------------------------
// Il piano d'ascolto: le query costruite a mattoncini.
//
// Una query booleana scritta a mano è una stringa: correggere un sinonimo
// vuol dire trovarlo in dieci stringhe, e nessuno ricorda perché c'è. Qui la
// query è una COMBINAZIONE di concetti con un nome — il soggetto, un contesto,
// un competitor, il rumore da togliere — e ogni concetto porta i suoi termini
// una volta sola. Cambi i termini di "Protesta", cambiano tutte le query che
// la usano.
//
//   concetto   = un OR di termini (alias, sigle, account, altre lingue)
//   query      = l'AND dei concetti in `all`, meno l'OR dei concetti in `none`
//
// Questo modulo non tocca il database né il modello: tipi, validazione,
// traduzione in ricerche eseguibili, valutazione di un testo, esportazione in
// sintassi booleana. Tutto verificabile con un test.
// ---------------------------------------------------------------------------

export type ConceptRole = 'subject' | 'context' | 'competitor' | 'noise';

export type Concept = {
  id: string;
  label: string;
  role: ConceptRole;
  terms: string[];
  /** Perché questi termini: la ragione resta scritta accanto alla scelta. */
  note?: string;
};

export type QueryKind = 'core' | 'context' | 'competitor' | 'comparison' | 'custom';

export type QueryDef = {
  id: string;
  name: string;
  kind: QueryKind;
  /** Concetti richiesti insieme (AND fra concetti, OR dentro ciascuno). */
  all: string[];
  /** Concetti che escludono (OR dei loro termini). */
  none: string[];
  enabled: boolean;
};

export type QueryPlan = {
  version: 1;
  /** Quello che l'utente ha scritto: resta il riferimento di tutto. */
  brief: string;
  concepts: Concept[];
  queries: QueryDef[];
  /** Come è nato: dal modello, dal parser senza AI, o dalla vecchia query. */
  origin: 'ai' | 'rules' | 'legacy' | 'manual';
  updatedAt: string;
};

export const LIMITS = {
  concepts: 16,
  termsPerConcept: 20,
  termLength: 60,
  queries: 10,
  enabledQueries: 8,
} as const;

export const ROLE_LABEL: Record<ConceptRole, { it: string; en: string }> = {
  subject: { it: 'Soggetto', en: 'Subject' },
  context: { it: 'Contesto', en: 'Context' },
  competitor: { it: 'Competitor', en: 'Competitor' },
  noise: { it: 'Da escludere', en: 'Exclude' },
};

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function slugId(s: string, taken: Set<string> = new Set()): string {
  const base = fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'q';
  let id = base;
  for (let i = 2; taken.has(id); i++) id = `${base}-${i}`;
  taken.add(id);
  return id;
}

/** Un termine pulito: niente virgolette, spazi compressi, lunghezza sensata. */
export function cleanTerm(t: unknown): string | null {
  if (typeof t !== 'string') return null;
  const s = t.replace(/["“”«»]/g, '').replace(/\s+/g, ' ').trim();
  if (s.length < 2 || s.length > LIMITS.termLength) return null;
  // Un operatore scritto come termine rovinerebbe la query.
  if (/^(and|or|not|e|o|non)$/i.test(s)) return null;
  return s;
}

/**
 * Rende un piano sicuro da salvare ed eseguire, qualunque sia la sua origine.
 *
 * Il modello propone; qui si scarta quello che non regge: concetti senza
 * termini, termini ripetuti, query che citano concetti inesistenti, rumore
 * usato come requisito, doppioni. Quello che si scarta si dice.
 */
export function validatePlan(input: unknown): { plan: QueryPlan; warnings: string[] } {
  const warnings: string[] = [];
  const raw = (input ?? {}) as Partial<QueryPlan> & Record<string, unknown>;
  const ids = new Set<string>();
  const idMap = new Map<string, string>();
  const concepts: Concept[] = [];

  for (const c of (Array.isArray(raw.concepts) ? raw.concepts : []).slice(0, LIMITS.concepts * 2)) {
    const cc = c as Partial<Concept>;
    const label = typeof cc.label === 'string' ? cc.label.trim().slice(0, 60) : '';
    const role: ConceptRole = (['subject', 'context', 'competitor', 'noise'] as const).includes(cc.role as ConceptRole)
      ? cc.role as ConceptRole : 'context';
    const seen = new Set<string>();
    const terms: string[] = [];
    for (const t of Array.isArray(cc.terms) ? cc.terms : []) {
      const ct = cleanTerm(t);
      if (!ct || seen.has(fold(ct))) continue;
      seen.add(fold(ct));
      terms.push(ct);
    }
    if (!label || !terms.length) {
      if (label) warnings.push(`“${label}” non ha termini validi ed è stato tolto.`);
      continue;
    }
    if (concepts.length >= LIMITS.concepts) {
      warnings.push(`Troppi concetti: “${label}” e i successivi sono stati tolti.`);
      break;
    }
    const wanted = typeof cc.id === 'string' && cc.id.trim() ? cc.id.trim() : label;
    const id = slugId(wanted, ids);
    // Le query citano i concetti con l'id che avevano (o con l'etichetta):
    // se qui l'id cambia, i riferimenti devono seguirlo.
    if (!idMap.has(wanted)) idMap.set(wanted, id);
    if (!idMap.has(label)) idMap.set(label, id);
    idMap.set(id, id);
    concepts.push({
      id, label, role,
      terms: terms.slice(0, LIMITS.termsPerConcept),
      note: typeof cc.note === 'string' ? cc.note.slice(0, 200) : undefined,
    });
    if (terms.length > LIMITS.termsPerConcept) warnings.push(`“${label}”: tenuti i primi ${LIMITS.termsPerConcept} termini.`);
  }

  const byId = new Map(concepts.map((c) => [c.id, c]));
  const qids = new Set<string>();
  const signatures = new Set<string>();
  const queries: QueryDef[] = [];
  let enabled = 0;
  for (const q of (Array.isArray(raw.queries) ? raw.queries : []).slice(0, LIMITS.queries * 2)) {
    const qq = q as Partial<QueryDef>;
    const name = typeof qq.name === 'string' ? qq.name.trim().slice(0, 80) : '';
    const resolve = (list: unknown) => [...new Set((Array.isArray(list) ? list : [])
      .map((x) => (typeof x === 'string' ? idMap.get(x.trim()) : undefined))
      .filter((x): x is string => Boolean(x && byId.has(x))))];
    const all = resolve(qq.all);
    // Il rumore non può essere un requisito: se il modello ce l'ha messo, lo
    // si sposta fra le esclusioni invece di cercare proprio quello.
    const required = all.filter((id) => byId.get(id)!.role !== 'noise');
    const none = [...new Set([...resolve(qq.none), ...all.filter((id) => byId.get(id)!.role === 'noise')])]
      .filter((id) => !required.includes(id));
    if (!name || !required.length) {
      if (name) warnings.push(`La query “${name}” non richiede nessun concetto valido ed è stata tolta.`);
      continue;
    }
    const sig = `${[...required].sort().join('+')}|${[...none].sort().join('+')}`;
    if (signatures.has(sig)) {
      warnings.push(`La query “${name}” era identica a un'altra ed è stata tolta.`);
      continue;
    }
    if (queries.length >= LIMITS.queries) {
      warnings.push(`Troppe query: “${name}” e le successive sono state tolte.`);
      break;
    }
    signatures.add(sig);
    const on = qq.enabled !== false && enabled < LIMITS.enabledQueries;
    if (qq.enabled !== false && !on) warnings.push(`“${name}” è stata spenta: al massimo ${LIMITS.enabledQueries} query attive.`);
    if (on) enabled++;
    const kind: QueryKind = (['core', 'context', 'competitor', 'comparison', 'custom'] as const).includes(qq.kind as QueryKind)
      ? qq.kind as QueryKind : 'custom';
    const wanted = typeof qq.id === 'string' && qq.id.trim() ? qq.id.trim() : name;
    queries.push({ id: slugId(wanted, qids), name, kind, all: required, none, enabled: on });
  }

  return {
    plan: {
      version: 1,
      brief: typeof raw.brief === 'string' ? raw.brief.trim().slice(0, 2000) : '',
      concepts,
      queries,
      origin: (['ai', 'rules', 'legacy', 'manual'] as const).includes(raw.origin as QueryPlan['origin'])
        ? raw.origin as QueryPlan['origin'] : 'manual',
      updatedAt: new Date().toISOString(),
    },
    warnings,
  };
}

// --- Dal piano alle ricerche ----------------------------------------------------------

export type CompiledQuery = {
  id: string;
  name: string;
  /** I termini con cui si interroga la fonte: il primo concetto richiesto. */
  anchor: string[];
  /** Gli altri concetti richiesti: ognuno deve comparire con almeno un termine. */
  groups: string[][];
  exclude: string[];
};

/**
 * Le query attive, pronte per le fonti.
 *
 * L'ancora è il concetto con il nome più specifico: il soggetto o il
 * competitor prima del contesto. "Protesta" come parola di ricerca porta
 * tutte le proteste del mondo; "Azienda X" filtrato poi per protesta porta
 * quello che si voleva.
 */
export function compilePlan(plan: QueryPlan): CompiledQuery[] {
  const byId = new Map(plan.concepts.map((c) => [c.id, c]));
  const rank: Record<ConceptRole, number> = { subject: 0, competitor: 1, context: 2, noise: 3 };
  return plan.queries.filter((q) => q.enabled).map((q) => {
    const required = q.all.map((id) => byId.get(id)).filter((c): c is Concept => Boolean(c))
      .sort((a, b) => rank[a.role] - rank[b.role]);
    const [anchor, ...rest] = required;
    return {
      id: q.id,
      name: q.name,
      anchor: anchor?.terms ?? [],
      groups: rest.map((c) => c.terms),
      exclude: [...new Set(q.none.flatMap((id) => byId.get(id)?.terms ?? []))],
    };
  }).filter((q) => q.anchor.length);
}

/** Un testo soddisfa la query? Stessa regola del filtro centrale di raccolta. */
export function matchesQuery(q: Pick<CompiledQuery, 'anchor' | 'groups' | 'exclude'>, text: string): boolean {
  const t = fold(text);
  const has = (term: string) => t.includes(fold(term));
  if (!q.anchor.some(has)) return false;
  if (!q.groups.every((g) => g.some(has))) return false;
  return !q.exclude.some(has);
}

/** Le query di un piano che un testo soddisfa: diventano l'etichetta della menzione. */
export function queriesMatching(compiled: CompiledQuery[], text: string): string[] {
  return compiled.filter((q) => matchesQuery(q, text)).map((q) => q.id);
}

const quote = (t: string) => (/[\s-]/.test(t) ? `"${t}"` : t);
const orGroup = (terms: string[]) => (terms.length === 1 ? quote(terms[0]) : `(${terms.map(quote).join(' OR ')})`);

/**
 * La query in sintassi booleana standard, da copiare in Talkwalker,
 * Brandwatch o Google News: (a OR b) AND (c OR d) AND NOT (e OR f).
 */
export function toBoolean(q: Pick<CompiledQuery, 'anchor' | 'groups' | 'exclude'>): string {
  const parts = [orGroup(q.anchor), ...q.groups.map(orGroup)];
  let s = parts.join(' AND ');
  if (q.exclude.length) s += ` AND NOT ${orGroup(q.exclude)}`;
  return s;
}

/** La query letta come una frase, per chi non legge le parentesi. */
export function describeQuery(plan: QueryPlan, q: QueryDef, lang: 'it' | 'en' = 'it'): string {
  const byId = new Map(plan.concepts.map((c) => [c.id, c]));
  const names = q.all.map((id) => byId.get(id)?.label).filter(Boolean) as string[];
  const excluded = q.none.map((id) => byId.get(id)?.label).filter(Boolean) as string[];
  const list = (xs: string[], and: string) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${and} ${xs[xs.length - 1]}`);
  if (lang === 'en') {
    return `Finds what talks about ${list(names, 'and')}${excluded.length ? `, leaving out ${list(excluded, 'and')}` : ''}.`;
  }
  return `Trova quello che parla di ${list(names, 'e')}${excluded.length ? `, lasciando fuori ${list(excluded, 'e')}` : ''}.`;
}

// --- Dal piano ai campi che il resto di Radar già usa ---------------------------------

/**
 * I campi "vecchi" derivati dal piano: tutto il resto di Radar (trend,
 * rilevanza, verifiche, Benchmark) continua a leggere quelli, e deve
 * continuare a funzionare senza sapere che esiste un piano.
 */
export function legacyFields(plan: QueryPlan) {
  const active = new Set(plan.queries.filter((q) => q.enabled).flatMap((q) => q.all));
  const terms = (role: ConceptRole) => plan.concepts
    .filter((c) => c.role === role && active.has(c.id)).flatMap((c) => c.terms);
  const keywords = [...new Set([...terms('subject'), ...terms('context'), ...terms('competitor')])].slice(0, 60);
  const excludeTerms = [...new Set(plan.concepts.filter((c) => c.role === 'noise').flatMap((c) => c.terms))].slice(0, 40);
  const subject = plan.concepts.find((c) => c.role === 'subject');
  const entities = plan.concepts
    .filter((c) => c.role === 'competitor' || (c.role === 'subject' && c.id === subject?.id))
    .map((c) => ({ name: c.label, keywords: c.terms.slice(0, 10), isOwnBrand: c.role === 'subject' }));
  return { keywords, excludeTerms, entities };
}

/**
 * Il piano che corrisponde a una query scritta nel vecchio modo.
 *
 * Nessuna perdita: i termini OR diventano il soggetto, ogni termine AND un
 * contesto obbligatorio (così erano: tutti richiesti), i NOT il rumore, le
 * entità del Benchmark i competitor. Finché l'utente non salva, la raccolta
 * resta quella di prima.
 */
export function planFromLegacy(
  project: { name: string; keywords: string[]; allTerms?: string[] | null; excludeTerms?: string[] | null; semanticContext?: string | null },
  entities: { name: string; keywords: string[]; isOwnBrand?: number | boolean }[] = [],
): QueryPlan {
  const taken = new Set<string>();
  const concepts: Concept[] = [];
  const queries: QueryDef[] = [];
  const own = entities.find((e) => Boolean(e.isOwnBrand));
  const subject: Concept = {
    id: slugId(project.name, taken), label: project.name, role: 'subject',
    terms: project.keywords.length ? project.keywords : own?.keywords ?? [project.name],
    note: 'Dai termini “almeno uno” della vecchia query.',
  };
  concepts.push(subject);
  const contexts = (project.allTerms ?? []).map((t) => ({
    id: slugId(t, taken), label: t, role: 'context' as const, terms: [t],
    note: 'Termine “tutti richiesti” della vecchia query.',
  }));
  concepts.push(...contexts);
  let noise: Concept | null = null;
  if ((project.excludeTerms ?? []).length) {
    noise = { id: slugId('rumore', taken), label: 'Rumore', role: 'noise', terms: project.excludeTerms!, note: 'Termini esclusi della vecchia query.' };
    concepts.push(noise);
  }
  const qtaken = new Set<string>();
  queries.push({
    id: slugId(project.name, qtaken), name: project.name, kind: 'core',
    all: [subject.id, ...contexts.map((c) => c.id)], none: noise ? [noise.id] : [], enabled: true,
  });
  for (const e of entities.filter((x) => !x.isOwnBrand).slice(0, LIMITS.enabledQueries - 1)) {
    const c: Concept = { id: slugId(e.name, taken), label: e.name, role: 'competitor', terms: e.keywords.length ? e.keywords : [e.name] };
    concepts.push(c);
    queries.push({ id: slugId(e.name, qtaken), name: e.name, kind: 'competitor', all: [c.id], none: noise ? [noise.id] : [], enabled: true });
  }
  return validatePlan({
    version: 1, brief: project.semanticContext ?? '', concepts, queries, origin: 'legacy',
  }).plan;
}

// --- Senza modello: capire la richiesta con delle regole ------------------------------

/**
 * Una prima lettura della richiesta senza AI.
 *
 * Non è intelligente, è onesta: riconosce le forme più comuni ("monitorare X
 * in relazione a Y e ai competitor A, B e C") e lascia il resto all'utente.
 * Serve quando la chiave AI manca o il budget è finito: la pagina non deve
 * restare vuota.
 */
export function planFromRules(brief: string): QueryPlan {
  // "es." e "e.g." hanno un punto che non chiude la frase.
  const text = brief.replace(/\s+/g, ' ').trim()
    .replace(/\b(?:ad\s+)?es\.\s*/gi, 'es ').replace(/\be\.g\.\s*/gi, 'eg ');
  const taken = new Set<string>();
  const concepts: Concept[] = [];

  const splitList = (s: string) => s
    .split(/,|\s+e\s+|\s+ed\s+|\s+and\s+|\s+o\s+|\s+or\s+/i)
    // Un articolo si toglie solo se è una parola a sé: "La" di "Lamborghini" resta.
    .map((x) => x.replace(/^(?:(?:agli|alle|alla|degli|delle|dei|gli|ai|al|il|lo|la|le|i|the)\s+|l['’]\s*)/i, '').replace(/[.;:)]+$/, '').trim())
    .filter((x) => x.length >= 2);

  const competitorMatch = /(?:competitors?|concorrent[ei]|rival[ei]?)\s*(?::|come|quali|such as|like)?\s*([^.;]+)/i.exec(text);
  const competitors = competitorMatch ? splitList(competitorMatch[1]).slice(0, 6) : [];

  // "l'azienda X", anche scritto in fretta ("l'azined X"): la parola generica
  // davanti al nome non fa parte del nome.
  const subjectMatch = /(?:monitorare|seguire|ascoltare|monitor|track|follow)\s+(?:l['’]\s*a[a-z]{3,8}\s+|il\s+(?:brand|marchio|gruppo)\s+|la\s+(?:società|societa|marca)\s+|the\s+(?:company|brand)\s+)?(.+?)(?=\s+(?:in relazione|in rapporto|rispetto|riguardo|legat|con riferimento|e (?:ai|i|agli) (?:suoi )?(?:competitor|concorrent)|in relation|regarding|and (?:its )?competitors)|[.,;]|$)/i.exec(text);
  const subjectName = subjectMatch?.[1]?.trim().replace(/^["“]|["”]$/g, '');

  const contextRe = /(?:in relazione|in rapporto|rispetto|riguardo|con riferimento|in relation|regarding)\s+(?:(?:agli|alle|alla|ai|al|all['’]|a|to)\s+)?([^.;]+?)(?=,?\s+e\s+(?:(?:ai|agli|alle|i|ai suoi)\s+)?(?:competitor|concorrent)|,?\s+e\s+in relazione|\s+and\s+(?:its )?competitors|[.;]|$)/gi;
  // Un contesto e i suoi esempi: gli esempi fra parentesi sono altri modi di
  // dire la stessa cosa, non contesti diversi.
  const contexts: { head: string; examples: string[] }[] = [];
  for (const m of text.matchAll(contextRe)) {
    const chunk = m[1].trim();
    if (/competitor|concorrent/i.test(chunk)) continue;
    const inside = /\(([^)]*)\)?/.exec(chunk)?.[1];
    // "i fatti Y", "il tema Y": la parola generica non è il contesto.
    const head = chunk.replace(/\(.*$/, '')
      .replace(/^(?:fatti|fatto|temi|tema|eventi|evento|notizie|argomenti?|questioni?|facts?|topics?|events?)\s+/i, '')
      .trim();
    const examples = inside
      ? splitList(inside.replace(/^(?:es|eg)\s+/i, '')).map((e) => e.replace(/^(?:una?|un['’]|uno|the|an?)\s+/i, ''))
      : [];
    // "alle proteste e agli scioperi": due fatti, due contesti.
    const heads = head.split(/,?\s+e\s+(?:(?:a|ai|agli|alle|al|alla|allo)\s+)?/i)
      .map((h) => h.replace(/^(?:(?:agli|alle|alla|ai|al|gli|le|la|il|i)\s+|l['’]\s*)/i, '').trim())
      .filter(Boolean);
    if (heads.length) {
      heads.forEach((h, i) => contexts.push({ head: h, examples: i === heads.length - 1 ? examples : [] }));
    } else {
      for (const e of examples) contexts.push({ head: e, examples: [] });
    }
  }

  let subject: Concept | null = null;
  if (subjectName) {
    subject = { id: slugId(subjectName, taken), label: subjectName, role: 'subject', terms: [subjectName] };
    concepts.push(subject);
  }
  const ctx = contexts.slice(0, 4).map((c) => ({
    id: slugId(c.head, taken), label: c.head, role: 'context' as const, terms: [c.head, ...c.examples],
  }));
  concepts.push(...ctx);
  const comp = competitors.map((c) => ({ id: slugId(c, taken), label: c, role: 'competitor' as const, terms: [c] }));
  concepts.push(...comp);

  const qtaken = new Set<string>();
  const queries: QueryDef[] = [];
  if (subject) {
    queries.push({ id: slugId(subject.label, qtaken), name: subject.label, kind: 'core', all: [subject.id], none: [], enabled: true });
    for (const c of ctx) {
      queries.push({ id: slugId(`${subject.label} ${c.label}`, qtaken), name: `${subject.label} × ${c.label}`, kind: 'context', all: [subject.id, c.id], none: [], enabled: true });
    }
  }
  for (const c of comp) {
    queries.push({ id: slugId(c.label, qtaken), name: c.label, kind: 'competitor', all: [c.id], none: [], enabled: true });
  }
  if (!subject && !comp.length) {
    // Nessuna forma riconosciuta: la richiesta intera diventa il soggetto,
    // e l'utente la rifinisce a mano.
    const s: Concept = { id: slugId(text.slice(0, 40), taken), label: text.slice(0, 60), role: 'subject', terms: [text.slice(0, 60)] };
    concepts.push(s);
    queries.push({ id: slugId(s.label, qtaken), name: s.label, kind: 'core', all: [s.id], none: [], enabled: true });
  }
  return validatePlan({ version: 1, brief, concepts, queries, origin: 'rules' }).plan;
}
