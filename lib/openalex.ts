// Evidenza di ricerca via OpenAlex (api.openalex.org): indice aperto di ~250M
// lavori accademici, gratuito e SENZA chiave. È l'unica fonte di ricerca davvero
// interrogabile PER TEMA (gli archivi statistici — ISTAT, Eurostat, World Bank —
// sono indicizzati per codice indicatore, non per argomento).
//
// Serve a dare "ciccia" al Point of View: chi studia il tema (istituti, paesi),
// quanto se ne pubblica nel tempo, e i lavori più citati con link all'originale.
// Non entra MAI nelle mention: è evidenza esterna, tenuta separata dai dati raccolti.

const API = 'https://api.openalex.org/works';

export type ResearchWork = {
  title: string; year: number | null; citations: number;
  url: string; institution: string | null; openAccess: boolean;
};
export type ResearchInstitution = { name: string; works: number };
export type ResearchEvidence = {
  query: string;
  /** ok = dati validi · empty = nessuna letteratura sul tema · unavailable = API
   *  irraggiungibile o limite di richieste raggiunto (riprova più tardi). */
  status: 'ok' | 'empty' | 'unavailable';
  total: number;
  /** Opere per anno (ultimi anni completi): l'attenzione della ricerca nel tempo. */
  byYear: { year: number; n: number }[];
  /** Crescita % degli ultimi 3 anni sui 3 precedenti; null se dati insufficienti. */
  growthPct: number | null;
  /** I due totali dietro growthPct, per poterla verificare a schermo. */
  last3: number | null;
  prev3: number | null;
  topInstitutions: ResearchInstitution[];
  topWorks: ResearchWork[];
  /** Dove si fa ricerca su questo tema: il quadro per paese/area. È la risposta
   *  alla domanda "quali istituti, in quale geografia" — gli archivi statistici
   *  (ISTAT, Eurostat, World Bank) non sanno rispondere per tema, OpenAlex sì. */
  byCountry: { code: string; name: string; works: number }[];
  /** Fronte di ricerca: i lavori più citati degli ultimi ~18 mesi. Sono i
   *  segnali precoci da leggere quando la ricerca corre avanti al mercato. */
  recentWorks: ResearchWork[];
};

/** OpenAlex chiede un contatto per la "polite pool". Opzionale: solo da env,
 *  così non spediamo mai l'email dell'utente a un servizio esterno. */
function politeParam(): string {
  const m = process.env.OPENALEX_MAILTO?.trim();
  return m ? `&mailto=${encodeURIComponent(m)}` : '';
}

/** OpenAlex limita a crediti per IP (1000 ogni ~4h, 10 a chiamata). Distinguo il
 *  "limite raggiunto / servizio giù" dal "nessun risultato": sono cose diverse. */
async function fetchJson<T>(url: string): Promise<{ data: T | null; limited: boolean }> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Radar/1.0 (media intelligence)' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!res.ok) return { data: null, limited: res.status === 429 || res.status === 403 || res.status >= 500 };
    return { data: (await res.json()) as T, limited: false };
  } catch {
    return { data: null, limited: true }; // timeout o rete: trattato come indisponibilità
  }
}

type GroupResp = { group_by?: { key: string; key_display_name: string; count: number }[] };
type WorksResp = {
  meta?: { count: number };
  results?: {
    title: string | null;
    publication_year: number | null;
    cited_by_count: number;
    doi: string | null;
    id: string;
    open_access?: { is_oa?: boolean };
    authorships?: { institutions?: { display_name: string }[] }[];
  }[];
};

/**
 * Fotografia della ricerca accademica su un tema.
 * Tre chiamate parallele (gratuite): lavori top, istituzioni, andamento annuale.
 */
export async function researchEvidence(terms: string[]): Promise<ResearchEvidence | null> {
  const clean = terms.filter(Boolean).map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return null;
  // Query lunghe restringono troppo (nome+4 keyword → poche decine di lavori):
  // parto larga (nome + 1-2 keyword) e uso il resto solo come ripiego.
  const primary = clean.slice(0, 2).join(' ');
  const fallback = clean[0];

  // Cache giornaliera: senza, ogni apertura della pagina spendeva 3 chiamate del
  // budget OpenAlex (condiviso per IP, quindi facile da esaurire su Vercel).
  const { getMeta, setMeta } = await import('@/lib/db');
  const key = `openalex:v3:${primary.toLowerCase()}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await getMeta<ResearchEvidence>(key);
  if (cached && cached.status === 'ok') return cached;

  const run = async (query: string) => {
    // Cerco su titolo+abstract invece che sul full-text: dà un conteggio che
    // significa davvero "lavori SU questo tema", non "che citano le parole".
    const f = `filter=title_and_abstract.search:${encodeURIComponent(query)}`;
    const p = politeParam();
    // Fronte recente: ultimi 18 mesi, ordinati per citazioni.
    const since = new Date(Date.now() - 548 * 86400_000).toISOString().slice(0, 10);
    const [works, insts, years, countries, recent] = await Promise.all([
      fetchJson<WorksResp>(`${API}?${f}&per-page=8&sort=cited_by_count:desc${p}`),
      fetchJson<GroupResp>(`${API}?${f}&group_by=institutions.id&per-page=8${p}`),
      fetchJson<GroupResp>(`${API}?${f}&group_by=publication_year${p}`),
      fetchJson<GroupResp>(`${API}?${f}&group_by=authorships.institutions.country_code&per-page=12${p}`),
      // type:article + is_paratext:false = igiene: senza, in cima finiscono
      // libri e atti di convegno con conteggi citazionali gonfiati, che sul
      // "fronte di ricerca" sembrano errori.
      fetchJson<WorksResp>(`${API}?${f},from_publication_date:${since},type:article,is_paratext:false&per-page=5&sort=cited_by_count:desc${p}`),
    ]);
    return { works, insts, years, countries, recent, query };
  };

  let r = await run(primary);
  // Troppo pochi risultati con la query composta? Riprovo col solo tema.
  if (!r.works.limited && (r.works.data?.meta?.count ?? 0) < 25 && fallback !== primary) {
    const alt = await run(fallback);
    if ((alt.works.data?.meta?.count ?? 0) > (r.works.data?.meta?.count ?? 0)) r = alt;
  }

  const { works, insts, years, countries, recent, query } = r;
  if (!works.data) {
    // Nessun dato: distinguo il limite/servizio giù dal tema senza letteratura.
    const out: ResearchEvidence = {
      query, status: works.limited ? 'unavailable' : 'empty',
      total: 0, byYear: [], growthPct: null, last3: null, prev3: null,
      topInstitutions: [], topWorks: [], byCountry: [], recentWorks: [],
    };
    return out;
  }

  const thisYear = new Date().getFullYear();
  const byYear = (years.data?.group_by ?? [])
    .map((g) => ({ year: Number(g.key), n: g.count }))
    .filter((r) => Number.isFinite(r.year) && r.year >= thisYear - 9 && r.year <= thisYear)
    .sort((a, b) => a.year - b.year);

  // Crescita: ultimi 3 anni vs i 3 precedenti (l'anno corrente è parziale, lo escludo).
  let growthPct: number | null = null;
  let last3: number | null = null;
  let prev3: number | null = null;
  const complete = byYear.filter((r) => r.year < thisYear);
  if (complete.length >= 6) {
    last3 = complete.slice(-3).reduce((s, r) => s + r.n, 0);
    prev3 = complete.slice(-6, -3).reduce((s, r) => s + r.n, 0);
    if (prev3 > 0) growthPct = Math.round(((last3 - prev3) / prev3) * 100);
  }

  type RawWork = NonNullable<WorksResp['results']>[number];
  const toWork = (w: RawWork): ResearchWork => ({
    title: (w.title ?? 'untitled').slice(0, 200),
    year: w.publication_year,
    citations: w.cited_by_count,
    url: w.doi ? `https://doi.org/${w.doi.replace(/^https?:\/\/doi\.org\//, '')}` : w.id,
    institution: w.authorships?.find((a) => a.institutions?.length)?.institutions?.[0]?.display_name ?? null,
    openAccess: Boolean(w.open_access?.is_oa),
  });

  const total = works.data.meta?.count ?? 0;
  const result: ResearchEvidence = {
    query,
    status: total === 0 ? 'empty' : 'ok',
    total,
    byYear,
    growthPct, last3, prev3,
    topInstitutions: (insts.data?.group_by ?? [])
      .filter((g) => g.key_display_name && g.key_display_name !== 'unknown')
      .slice(0, 8)
      .map((g) => ({ name: g.key_display_name, works: g.count })),
    topWorks: (works.data.results ?? []).slice(0, 8).map(toWork),
    byCountry: (countries.data?.group_by ?? [])
      .filter((g) => g.key && g.key !== 'unknown' && g.key_display_name)
      .slice(0, 10)
      .map((g) => ({ code: g.key.toUpperCase(), name: g.key_display_name, works: g.count })),
    recentWorks: (recent.data?.results ?? []).slice(0, 5).map(toWork),
  };

  if (result.status === 'ok') await setMeta(key, result);
  return result;
}

/** Segnale della ricerca su UN tema: quanto se ne pubblica e se sta accelerando. */
export type TopicResearch = {
  topic: string;
  /** false = chiamata fallita/limitata: il segnale è IGNOTO, non "zero".
   *  Distinguerli è essenziale: uno zero finto farebbe bollare il tema come
   *  "hype" (mercato senza ricerca dietro), che è una conclusione sbagliata. */
  ok: boolean;
  works: number;
  /** Crescita % degli ultimi 2 anni completi sui 2 precedenti (null se scarso). */
  growthPct: number | null;
};

/**
 * Andamento della ricerca per i temi che emergono dall'ascolto: serve a
 * incrociare "di cosa parla il mercato" con "cosa sta studiando la ricerca".
 * Una chiamata per tema (max 6), con cache giornaliera per non erodere il
 * budget OpenAlex, che è a crediti per IP.
 */
export async function topicResearchTrends(topics: string[]): Promise<TopicResearch[]> {
  const list = topics.filter(Boolean).slice(0, 6);
  if (list.length === 0) return [];

  const { getMeta, setMeta } = await import('@/lib/db');
  const key = `openalex:topics:v2:${list.join('|').toLowerCase()}:${new Date().toISOString().slice(0, 10)}`;
  const cached = await getMeta<TopicResearch[]>(key);
  // Riuso la cache solo se COMPLETA: un risultato parziale non deve congelare
  // per tutto il giorno dei falsi "zero ricerca".
  if (cached?.length && cached.every((r) => r.ok)) return cached;

  const thisYear = new Date().getFullYear();
  const out = await Promise.all(list.map(async (topic) => {
    // Ricerca a FRASE esatta: la full-text su parole sciolte è rumore puro
    // ("model release" → 5,4M lavori contro 12k a frase), e su quel rumore la
    // classificazione hype/validated sarebbe arbitraria.
    const phrase = encodeURIComponent(`"${topic.replace(/"/g, '')}"`);
    const { data } = await fetchJson<GroupResp>(
      `${API}?search=${phrase}&group_by=publication_year${politeParam()}`,
    );
    if (!data?.group_by) return { topic, ok: false, works: 0, growthPct: null };
    const years = new Map(
      data.group_by
        .filter((g) => /^\d{4}$/.test(g.key))
        .map((g) => [Number(g.key), g.count] as const),
    );
    const works = [...years.values()].reduce((s, n) => s + n, 0);
    // Ultimi 2 anni COMPLETI vs i 2 precedenti (l'anno in corso è parziale).
    const sum = (from: number, to: number) => {
      let t = 0;
      for (let y = from; y <= to; y++) t += years.get(y) ?? 0;
      return t;
    };
    const recent = sum(thisYear - 2, thisYear - 1);
    const prior = sum(thisYear - 4, thisYear - 3);
    const growthPct = prior >= 5 ? Math.round(((recent - prior) / prior) * 100) : null;
    return { topic, ok: true, works, growthPct };
  }));

  // Salvo solo se sono riusciti TUTTI: così un errore momentaneo viene riprovato.
  if (out.every((r) => r.ok)) await setMeta(key, out);
  return out;
}
