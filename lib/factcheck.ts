import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { factChecks, mentions, projects, type Circulation, type FactReview } from '@/lib/db/schema';
import { cfg } from '@/lib/connector-config';

// ---------------------------------------------------------------------------
// Verifiche: le affermazioni già controllate dai fact-checker, e quanto
// circolano ancora nelle conversazioni del progetto.
//
// Un fact-check da solo è un articolo. Quello che nessuno strumento di
// listening mette in fila è il passo dopo: una bufala smentita a marzo che a
// settembre gira ancora, e magari cresce. Qui i due pezzi si incontrano — la
// verifica viene da Google Fact Check Tools (ClaimReview, lo standard usato da
// oltre cento testate), la circolazione dalle menzioni di Radar.
//
// Niente modello: i verdetti si leggono dalle parole dei fact-checker e le
// affermazioni si ritrovano nelle menzioni per parole, non per significato.
// È meno potente di una ricerca semantica e molto più onesto: quando Radar
// dice "circola ancora" può mostrare le menzioni che lo provano.
// ---------------------------------------------------------------------------

export type Verdict = 'false' | 'misleading' | 'mixed' | 'true' | 'unverifiable' | 'contested' | 'other';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

// L'ordine conta: "mostly false" è fuorviante prima che falso, "not true" è
// falso prima che vero, "half true" è misto prima che vero, "incorrect"
// contiene "correct".
const RULES: [Verdict, RegExp][] = [
  ['misleading', /\b(misleading|fuorviant\w*|trompeu\w*|irrefuhrend|enganos\w*|missing context|out of context|lacks context|decontestualizzat\w*|senza contesto|fuori contesto|exaggerat\w*|esagerat\w*|distort\w*|partly false|partially false|parzialmente fals\w*|mostly false|in gran parte fals\w*|manipulat\w*|manipolat\w*|sin contexto|hors contexte|teilweise falsch)\b/],
  ['mixed', /\b(half[- ]true|mixture|mixed|mezza verita|parzialmente ver\w*|partly true|partially true|in parte ver\w*|c'e del vero|medio verdad\w*|verdadero pero|plutot vrai|teilweise richtig)\b/],
  ['unverifiable', /\b(unproven|unverified|unverifiable|non verificabil\w*|non dimostrat\w*|no evidence|insufficient evidence|not enough evidence|prove insufficienti|sin evidencia|sin pruebas|research in progress|satire|satira|satirical|unsupported)\b/],
  ['false', /\b(false|falso|falsa|falsi|fake|bufala|hoax|pants on fire|incorrect|not true|untrue|faux|fausse|falsch|wrong|fabricated|scam|truffa|debunked|smentit\w*|inventat\w*|errat\w*|mentira|enganoso total|infondat\w*|baseless)\b/],
  ['true', /\b(true|vero|vera|veri|correct|corretto|accurate|mostly true|in gran parte ver\w*|verdadero|verdadera|vrai|vraie|richtig|zutreffend|confirmed|confermat\w*)\b/],
];

/** Il verdetto di una singola recensione, dalle parole del fact-checker. */
export function verdictOf(rating: string): Verdict {
  const r = fold(rating ?? '').trim();
  if (!r) return 'other';
  for (const [v, re] of RULES) if (re.test(r)) return v;
  return 'other';
}

/**
 * Il verdetto dell'affermazione, dalle sue recensioni.
 *
 * Falso e fuorviante vanno nella stessa direzione e non sono un disaccordo:
 * vince il più severo. Un "vero" accanto a un "falso" invece sì, ed è una
 * notizia in sé — la si chiama "contestata" invece di sceglierne una.
 */
export function claimVerdict(ratings: string[]): Verdict {
  const vs = ratings.map(verdictOf).filter((v) => v !== 'other');
  if (!vs.length) return 'other';
  const set = new Set(vs);
  if (set.size === 1) return vs[0];
  const negative = [...set].every((v) => v === 'false' || v === 'misleading');
  if (negative) return set.has('false') ? 'false' : 'misleading';
  if ((set.has('true') || set.has('mixed')) && (set.has('false') || set.has('misleading'))) return 'contested';
  const counts = new Map<Verdict, number>();
  for (const v of vs) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** La chiave di un'affermazione: stesso testo e stesso autore sono la stessa affermazione. */
export function claimKey(claim: string, claimant?: string | null): string {
  const norm = `${fold(claim).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 240)}|${fold(claimant ?? '').trim()}`;
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(36)}-${norm.length}`;
}

const STOP = new Set(`
a ad al alla alle agli ai all anche ancora avere aveva che chi come con contro cosa cui da dal dalla dalle dai degli dei del della delle dello di dopo e ed era essere fa fra gli ha hanno ho il in la le lo loro ma mai molto ne nei nel nella nelle non nostro o per perche piu poi puo quale quando quanto quella quelle quelli quello questa queste questi questo se sei senza si sia siamo sono sta stato su sua sue sui sul sulla suo tra tutti tutto un una uno vengono viene
the and for are but not you all any can had her was one our out day get has him his how man new now old see two way who boy did its let put say she too use that with have this will your from they know want been good much some time very when come here just like long make many more only over such take than them well were what said says claim claims video photo image shows show about after also because could does into most other people should since their there these those through under which while would years year being
el la los las del que por para con una uno como pero mas sus este esta estos estas fue son ser han sin sobre entre
le les des une est pour dans pas plus par sur avec sont ont aux cette ces qui
der die das und ist nicht mit ein eine den dem des sich auf fur von zu im
`.split(/\s+/).filter(Boolean));

/**
 * Le parole con cui ritrovare un'affermazione nelle menzioni.
 *
 * Le più lunghe e non comuni: sono quelle che distinguono QUESTA affermazione
 * da tutte le altre sullo stesso tema. Il termine del progetto da solo non
 * basta, ce l'hanno tutte.
 */
export function distinctiveTerms(claim: string, max = 3): string[] {
  const words = (claim.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [])
    .map((w) => w.replace(/['’-]+$/g, ''))
    .filter((w) => {
      const f = fold(w);
      if (STOP.has(f)) return false;
      if (/^\d+$/.test(f)) return f.length >= 3; // un anno o una cifra sì, "5" no
      return f.length >= 4;
    });
  const seen = new Set<string>();
  const unique = words.filter((w) => {
    const f = fold(w);
    if (seen.has(f)) return false;
    seen.add(f);
    return true;
  });
  return [...unique].sort((a, b) => b.length - a.length).slice(0, max);
}

// --- La fonte ---------------------------------------------------------------------

type ApiReview = {
  publisher?: { name?: string; site?: string };
  url?: string; title?: string; reviewDate?: string; textualRating?: string; languageCode?: string;
};
type ApiClaim = { text?: string; claim?: string; claimant?: string; claimDate?: string; claimReview?: ApiReview[] };

export const factCheckKey = () => cfg('GOOGLE_FACTCHECK_API_KEY') ?? cfg('YOUTUBE_API_KEY');
export const factCheckEnabled = () => Boolean(factCheckKey());

async function searchClaims(query: string, key: string, languageCode?: string): Promise<ApiClaim[]> {
  const params = new URLSearchParams({ query, pageSize: '50', maxAgeDays: '730', key });
  if (languageCode) params.set('languageCode', languageCode);
  const res = await fetch(`https://factchecktools.googleapis.com/v1alpha1/claims:search?${params}`, {
    signal: AbortSignal.timeout(20000), cache: 'no-store',
  });
  if (res.status === 403) {
    const body = await res.text();
    // Due cause diverse con due rimedi diversi, e Google le distingue solo
    // nel testo: l'API spenta nel progetto, o la chiave limitata ad altre API
    // (il caso della chiave YouTube riusata, verificato dal vivo).
    throw new Error(/not been used|disabled/i.test(body)
      ? 'Fact Check Tools API non abilitata nel progetto Google di questa chiave: abilitala in Google Cloud → API e servizi'
      : /blocked/i.test(body)
        ? 'La chiave Google è limitata ad altre API: aggiungi "Fact Check Tools API" alle sue restrizioni, o usa una chiave dedicata'
        : 'Fact Check: chiave rifiutata (403)');
  }
  if (!res.ok) throw new Error(`Fact Check: HTTP ${res.status}`);
  const data = await res.json() as { claims?: ApiClaim[] };
  return data.claims ?? [];
}

export function toRow(c: ApiClaim, query: string) {
  const claim = (c.text ?? c.claim ?? '').trim();
  const reviews: FactReview[] = (c.claimReview ?? [])
    .filter((r) => r.url && r.textualRating)
    .map((r) => ({
      publisher: r.publisher?.name || r.publisher?.site || new URL(r.url!).host,
      site: r.publisher?.site,
      url: r.url!,
      title: r.title,
      reviewDate: r.reviewDate,
      rating: r.textualRating!,
      language: r.languageCode,
    }));
  if (!claim || !reviews.length) return null;
  // Il termine cercato deve esserci davvero: la ricerca di Google è larga, e
  // "Claude" trova anche Claude Monet.
  const haystack = fold(`${claim} ${reviews.map((r) => r.title ?? '').join(' ')}`);
  if (!haystack.includes(fold(query))) return null;
  const claimDate = c.claimDate ? new Date(c.claimDate) : null;
  return {
    claimKey: claimKey(claim, c.claimant),
    claim: claim.slice(0, 1000),
    claimant: c.claimant?.slice(0, 200) ?? null,
    claimDate: claimDate && !Number.isNaN(claimDate.getTime()) ? claimDate : null,
    reviews,
    verdict: claimVerdict(reviews.map((r) => r.rating)),
    language: reviews[0]?.language?.slice(0, 2) ?? null,
    query,
  };
}

/** Raccoglie le verifiche per i termini del progetto e ne misura la circolazione. */
export async function ingestFactChecks(projectId: number): Promise<{ tried: number; claims: number }> {
  const key = factCheckKey();
  if (!key) return { tried: 0, claims: 0 };
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project || project.mode === 'upload') return { tried: 0, claims: 0 };

  const terms = project.keywords.slice(0, 8);
  const langs = (project.languages ?? []).filter((l) => l !== 'en').slice(0, 2);
  const calls: { q: string; lang?: string }[] = [];
  for (const q of terms) {
    calls.push({ q });
    for (const lang of langs) calls.push({ q, lang });
  }

  let stored = 0;
  let lastError: Error | null = null;
  for (const c of calls.slice(0, 16)) {
    try {
      const rows = (await searchClaims(c.q, key, c.lang))
        .map((x) => toRow(x, c.q))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      // A blocchi, e senza doppioni nello stesso blocco (una query che trova
      // la stessa affermazione due volte romperebbe l'aggiornamento).
      const unique = [...new Map(rows.map((r) => [r.claimKey, r])).values()];
      for (let i = 0; i < unique.length; i += 50) {
        await db.insert(factChecks).values(unique.slice(i, i + 50).map((r) => ({ projectId, ...r })))
          .onConflictDoUpdate({
            target: [factChecks.projectId, factChecks.claimKey],
            set: { reviews: sql`excluded.reviews`, verdict: sql`excluded.verdict`, lastSeen: sql`now()` },
          });
      }
      stored += rows.length;
    } catch (e) {
      lastError = e as Error;
      // Una chiave rifiutata non migliora alla chiamata dopo.
      if (/403|abilitata/.test(lastError.message)) break;
    }
  }
  // L'esito si salva: una chiave rifiutata altrimenti produce una pagina
  // vuota e muta, indistinguibile da "nessuna verifica sul tema".
  await setMeta('factcheck_status', lastError && stored === 0
    ? { ok: false, error: lastError.message, at: new Date().toISOString() }
    : { ok: true, at: new Date().toISOString() });
  if (lastError && stored === 0) throw lastError;
  await measureCirculation(projectId);
  return { tried: calls.length, claims: stored };
}

// --- La circolazione -----------------------------------------------------------------

const DAY = 86400_000;

/** Classifica il momento di un'affermazione: è il cuore della pagina. */
export type Signal = 'debunked-growing' | 'debunked-circulating' | 'debunked-quiet' | 'contested' | 'confirmed' | 'open';

export function signalOf(verdict: Verdict, c: Pick<Circulation, 'last7' | 'prev7' | 'total'> | null): Signal {
  const debunked = verdict === 'false' || verdict === 'misleading';
  if (debunked) {
    if (!c || c.last7 === 0) return 'debunked-quiet';
    return c.last7 > c.prev7 ? 'debunked-growing' : 'debunked-circulating';
  }
  if (verdict === 'contested') return 'contested';
  if (verdict === 'true') return 'confirmed';
  return 'open';
}

/**
 * Per ogni affermazione: quante menzioni degli ultimi 90 giorni contengono
 * tutte le sue parole distintive, quante nell'ultima settimana e in quella
 * prima, da quali fonti, e le più viste come prova.
 *
 * Una sola lettura dell'archivio (ricerca full-text con tutte le
 * affermazioni in OR), poi l'attribuzione qui: una ricerca per affermazione
 * su un progetto da centomila menzioni erano centoventi letture complete.
 */
export async function measureCirculation(projectId: number, now = new Date()): Promise<number> {
  const db = await getDb();
  const claims = await db.select({ id: factChecks.id, claim: factChecks.claim })
    .from(factChecks).where(eq(factChecks.projectId, projectId))
    .orderBy(desc(factChecks.lastSeen)).limit(120);
  const since = new Date(now.getTime() - 90 * DAY);
  const d7 = now.getTime() - 7 * DAY;
  const d14 = now.getTime() - 14 * DAY;

  const withTerms = claims
    .map((c) => ({ ...c, terms: distinctiveTerms(c.claim) }))
    .filter((c) => c.terms.length >= 2);

  type Hit = { id: number; source: string; at: Date; eng: number; text: string };
  let rows: Hit[] = [];
  if (withTerms.length) {
    const query = sql.join(
      withTerms.map((c) => sql`plainto_tsquery('simple', ${c.terms.join(' ')})`),
      sql` || `,
    );
    rows = await db.select({
      id: mentions.id, source: mentions.source, at: mentions.publishedAt, eng: mentions.engagementScore,
      text: sql<string>`lower(coalesce(${mentions.title}, '') || ' ' || ${mentions.content})`,
    }).from(mentions).where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, since),
      sql`to_tsvector('simple', coalesce(${mentions.title}, '') || ' ' || ${mentions.content}) @@ (${query})`,
    )).limit(20000);
  }

  const updates: { id: number; circulation: Circulation }[] = [];
  for (const c of withTerms) {
    const needles = c.terms.map((t) => t.toLowerCase());
    const mine = rows.filter((r) => needles.every((t) => r.text.includes(t)));
    const sources: Record<string, number> = {};
    let last7 = 0;
    let prev7 = 0;
    let lastSeen: Date | null = null;
    for (const r of mine) {
      sources[r.source] = (sources[r.source] ?? 0) + 1;
      const t = r.at.getTime();
      if (t >= d7) last7++;
      else if (t >= d14) prev7++;
      if (!lastSeen || r.at > lastSeen) lastSeen = r.at;
    }
    updates.push({
      id: c.id,
      circulation: {
        total: mine.length, last7, prev7, sources,
        sampleIds: [...mine].sort((a, b) => b.eng - a.eng).slice(0, 8).map((r) => r.id),
        lastSeen: lastSeen?.toISOString() ?? null,
        terms: c.terms,
        at: now.toISOString(),
      },
    });
  }
  for (let i = 0; i < updates.length; i += 100) {
    const values = sql.join(updates.slice(i, i + 100).map((u) => sql`(${u.id}::int, ${JSON.stringify(u.circulation)}::jsonb)`), sql`, `);
    await db.execute(sql`
      update fact_checks as f set circulation = v.circulation
      from (values ${values}) as v(id, circulation)
      where f.id = v.id`);
  }
  return claims.length;
}

// --- I dati della pagina -------------------------------------------------------------

export type FactCheckRow = typeof factChecks.$inferSelect & { signal: Signal };

export async function factCheckData(projectId: number) {
  const db = await getDb();
  const rows = await db.select().from(factChecks).where(eq(factChecks.projectId, projectId))
    .orderBy(desc(factChecks.lastSeen)).limit(500);
  const claims: FactCheckRow[] = rows.map((r) => ({ ...r, signal: signalOf(r.verdict as Verdict, r.circulation) }));

  const byVerdict = new Map<string, number>();
  const byPublisher = new Map<string, { n: number; site?: string }>();
  const byMonth = new Map<string, number>();
  for (const c of claims) {
    byVerdict.set(c.verdict, (byVerdict.get(c.verdict) ?? 0) + 1);
    for (const r of c.reviews) {
      const p = byPublisher.get(r.publisher) ?? { n: 0, site: r.site };
      p.n++;
      byPublisher.set(r.publisher, p);
      const month = (r.reviewDate ?? '').slice(0, 7);
      if (month) byMonth.set(month, (byMonth.get(month) ?? 0) + 1);
    }
  }

  const order: Record<Signal, number> = {
    'debunked-growing': 0, 'debunked-circulating': 1, contested: 2, confirmed: 3, open: 4, 'debunked-quiet': 5,
  };
  claims.sort((a, b) => order[a.signal] - order[b.signal]
    || (b.circulation?.last7 ?? 0) - (a.circulation?.last7 ?? 0)
    || (b.circulation?.total ?? 0) - (a.circulation?.total ?? 0));

  return {
    claims,
    total: claims.length,
    byVerdict: [...byVerdict.entries()].map(([verdict, n]) => ({ verdict, n })).sort((a, b) => b.n - a.n),
    publishers: [...byPublisher.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n).slice(0, 12),
    months: [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-18).map(([month, n]) => ({ month, n })),
    stillCirculating: claims.filter((c) => c.signal === 'debunked-growing' || c.signal === 'debunked-circulating').length,
    enabled: factCheckEnabled(),
    status: await getMeta<{ ok: boolean; error?: string; at: string }>('factcheck_status'),
  };
}
