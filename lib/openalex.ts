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
};

/** OpenAlex chiede un contatto per la "polite pool". Opzionale: solo da env,
 *  così non spediamo mai l'email dell'utente a un servizio esterno. */
function politeParam(): string {
  const m = process.env.OPENALEX_MAILTO?.trim();
  return m ? `&mailto=${encodeURIComponent(m)}` : '';
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'Radar/1.0 (media intelligence)' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
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
  const query = terms.filter(Boolean).slice(0, 4).join(' ').trim();
  if (!query) return null;
  const q = encodeURIComponent(query);
  const p = politeParam();

  const [works, insts, years] = await Promise.all([
    fetchJson<WorksResp>(`${API}?search=${q}&per-page=8&sort=cited_by_count:desc${p}`),
    fetchJson<GroupResp>(`${API}?search=${q}&group_by=institutions.id&per-page=8${p}`),
    fetchJson<GroupResp>(`${API}?search=${q}&group_by=publication_year${p}`),
  ]);
  if (!works) return null;

  const thisYear = new Date().getFullYear();
  const byYear = (years?.group_by ?? [])
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

  return {
    query,
    total: works.meta?.count ?? 0,
    byYear,
    growthPct, last3, prev3,
    topInstitutions: (insts?.group_by ?? [])
      .filter((g) => g.key_display_name && g.key_display_name !== 'unknown')
      .slice(0, 8)
      .map((g) => ({ name: g.key_display_name, works: g.count })),
    topWorks: (works.results ?? []).slice(0, 8).map((w) => ({
      title: (w.title ?? 'untitled').slice(0, 200),
      year: w.publication_year,
      citations: w.cited_by_count,
      url: w.doi ? `https://doi.org/${w.doi.replace(/^https?:\/\/doi\.org\//, '')}` : w.id,
      institution: w.authorships?.find((a) => a.institutions?.length)?.institutions?.[0]?.display_name ?? null,
      openAccess: Boolean(w.open_access?.is_oa),
    })),
  };
}
