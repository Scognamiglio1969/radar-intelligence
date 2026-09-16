import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { clinicalTrials, mentions, projects, type TrialNews } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Studi clinici: le evidenze dietro le notizie di salute.
//
// Un titolo dice "il nuovo farmaco cura l'obesità". Il registro degli studi
// dice se quel farmaco è in fase 1 su quaranta persone o in fase 3 con i
// risultati pubblicati. Messi uno accanto all'altro raccontano la cosa che
// interessa davvero: dove il rumore ha superato l'evidenza, e dove
// un'evidenza solida non la racconta nessuno.
//
// ClinicalTrials.gov (National Library of Medicine) è gratuito e senza
// chiave. I termini da seguire sono del progetto e separati dalle sue parole
// chiave: "Juventus" o "Bitcoin" in un registro di studi clinici trovano solo
// rumore, quindi la sezione resta spenta finché qualcuno non li sceglie.
// ---------------------------------------------------------------------------

const API = 'https://clinicaltrials.gov/api/v2/studies';
const UA = 'Radar/1.0 (media intelligence)';

type Study = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string; officialTitle?: string };
    statusModule?: {
      overallStatus?: string;
      startDateStruct?: { date?: string };
      completionDateStruct?: { date?: string };
      primaryCompletionDateStruct?: { date?: string };
      studyFirstPostDateStruct?: { date?: string };
      lastUpdatePostDateStruct?: { date?: string };
    };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string; class?: string } };
    designModule?: { studyType?: string; phases?: string[]; enrollmentInfo?: { count?: number } };
    conditionsModule?: { conditions?: string[] };
    armsInterventionsModule?: { interventions?: { type?: string; name?: string }[] };
    contactsLocationsModule?: { locations?: { country?: string }[] };
  };
  hasResults?: boolean;
};

export function toTrialRow(s: Study, query: string) {
  const p = s.protocolSection;
  const id = p?.identificationModule?.nctId;
  const title = p?.identificationModule?.briefTitle ?? p?.identificationModule?.officialTitle;
  if (!p || !id || !title) return null;
  const countries = [...new Set((p.contactsLocationsModule?.locations ?? [])
    .map((l) => l.country).filter((c): c is string => Boolean(c)))];
  return {
    nctId: id,
    title: title.slice(0, 500),
    status: p.statusModule?.overallStatus ?? 'UNKNOWN',
    phases: p.designModule?.phases ?? [],
    studyType: p.designModule?.studyType ?? null,
    sponsor: p.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
    sponsorClass: p.sponsorCollaboratorsModule?.leadSponsor?.class ?? null,
    conditions: (p.conditionsModule?.conditions ?? []).slice(0, 12),
    interventions: (p.armsInterventionsModule?.interventions ?? [])
      .filter((i) => i.name)
      .map((i) => ({ type: i.type ?? 'OTHER', name: i.name! }))
      .slice(0, 12),
    enrollment: p.designModule?.enrollmentInfo?.count ?? null,
    startDate: p.statusModule?.startDateStruct?.date ?? null,
    completionDate: p.statusModule?.primaryCompletionDateStruct?.date ?? p.statusModule?.completionDateStruct?.date ?? null,
    firstPosted: p.statusModule?.studyFirstPostDateStruct?.date ?? null,
    lastUpdate: p.statusModule?.lastUpdatePostDateStruct?.date ?? null,
    hasResults: s.hasResults ? 1 : 0,
    countries: countries.slice(0, 40),
    query,
  };
}

async function searchStudies(term: string): Promise<Study[]> {
  const params = new URLSearchParams({
    'query.term': term, pageSize: '100', sort: 'LastUpdatePostDate:desc', format: 'json',
  });
  const res = await fetch(`${API}?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(25000), cache: 'no-store',
  });
  if (!res.ok) throw new Error(`ClinicalTrials.gov: HTTP ${res.status}`);
  const data = await res.json() as { studies?: Study[] };
  return data.studies ?? [];
}

// --- Dai termini dell'utente ai termini del registro -------------------------------

/** Quanti studi trova un termine: la prova che il registro lo capisce. */
export async function countStudies(term: string): Promise<number> {
  const params = new URLSearchParams({ 'query.term': term, pageSize: '1', countTotal: 'true', format: 'json' });
  const res = await fetch(`${API}?${params}`, {
    headers: { 'User-Agent': UA, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000), cache: 'no-store',
  });
  if (!res.ok) return 0;
  const data = await res.json() as { totalCount?: number };
  return data.totalCount ?? 0;
}

// Il registro è in inglese. I termini medici italiani più comuni si traducono
// qui, senza modello: una tabella corta sbaglia meno di una traduzione libera,
// e quello che non conosce lo dice invece di inventarlo.
const IT_EN: Record<string, string> = {
  obesita: 'obesity', sovrappeso: 'overweight', diabete: 'diabetes', tumore: 'cancer', tumori: 'cancer',
  cancro: 'cancer', carcinoma: 'carcinoma', leucemia: 'leukemia', linfoma: 'lymphoma', melanoma: 'melanoma',
  ictus: 'stroke', infarto: 'myocardial infarction', cuore: 'heart disease', cardiopatia: 'heart disease',
  ipertensione: 'hypertension', colesterolo: 'cholesterol', alzheimer: 'alzheimer', demenza: 'dementia',
  parkinson: 'parkinson', depressione: 'depression', ansia: 'anxiety', autismo: 'autism', schizofrenia: 'schizophrenia',
  emicrania: 'migraine', dolore: 'pain', asma: 'asthma', artrite: 'arthritis', osteoporosi: 'osteoporosis',
  sclerosi: 'sclerosis', epilessia: 'epilepsy', insonnia: 'insomnia', sonno: 'sleep', fumo: 'smoking',
  alcol: 'alcohol', vaccino: 'vaccine', vaccini: 'vaccine', gravidanza: 'pregnancy', menopausa: 'menopause',
  fertilita: 'fertility', reni: 'kidney disease', rene: 'kidney disease', fegato: 'liver disease',
  epatite: 'hepatitis', polmonite: 'pneumonia', influenza: 'influenza', malaria: 'malaria', tubercolosi: 'tuberculosis',
  anziani: 'aging', invecchiamento: 'aging', nutrizione: 'nutrition', dieta: 'diet', esercizio: 'exercise',
  riabilitazione: 'rehabilitation', telemedicina: 'telemedicine', ia: 'artificial intelligence',
  ai: 'artificial intelligence', intelligenza: 'artificial intelligence', artificiale: 'artificial intelligence',
  robotica: 'robotic surgery', genetica: 'genetic', terapia: 'therapy', farmaco: 'drug', dimagrimento: 'weight loss',
  peso: 'weight loss',
};

const NOISE = new Set(['ricerca', 'tema', 'sul', 'sulla', 'studio', 'studi', 'nuovo', 'nuova', 'effetti', 'trattamento',
  'della', 'delle', 'degli', 'nella', 'nelle', 'research', 'study', 'studies', 'about', 'with', 'from', 'effect', 'effects']);

const foldIt = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Le parole di una frase che possono essere un termine del registro, tradotte se servono. */
export function candidateTerms(phrase: string): string[] {
  const out: string[] = [];
  for (const raw of phrase.split(/[\s,;/]+/)) {
    const w = foldIt(raw).replace(/[^a-z0-9-]/g, '');
    if (!w || NOISE.has(w)) continue;
    const t = IT_EN[w] ?? (w.length >= 5 ? raw.replace(/[^\p{L}\p{N}-]/gu, '') : null);
    if (t && !out.some((x) => foldIt(x) === foldIt(t))) out.push(t);
  }
  return out;
}

export type TermResolution = { input: string; kept: { term: string; studies: number }[]; dropped: string[] };

/**
 * Trasforma quello che l'utente ha scritto in termini che il registro capisce.
 *
 * Un termine che trova studi resta com'è. Una frase che non ne trova ("semaglutide
 * e ricerca AI sul tema obesità", visto dal vivo: zero studi) si spezza nelle
 * parole utili, si traduce dove serve e si tiene solo ciò che il registro
 * riconosce — dicendolo, perché l'utente deve sapere che cosa si sta seguendo.
 */
export async function resolveTrialTerms(inputs: string[], max = 5): Promise<{ terms: string[]; notes: TermResolution[] }> {
  const terms: { term: string; studies: number }[] = [];
  const notes: TermResolution[] = [];
  for (const input of inputs) {
    const direct = await countStudies(input);
    if (direct > 0) { terms.push({ term: input, studies: direct }); continue; }
    const candidates = candidateTerms(input).slice(0, 6);
    // Prima l'incrocio: chi scrive "semaglutide e ricerca AI sul tema obesità"
    // intende gli studi che tengono insieme le tre cose, non tutti gli studi
    // sull'obesità (ventimila). Il registro cerca le parole tutte insieme.
    if (candidates.length > 1) {
      const combined = candidates.join(' ');
      const n = await countStudies(combined);
      if (n >= 5) {
        notes.push({ input, kept: [{ term: combined, studies: n }], dropped: [] });
        terms.push({ term: combined, studies: n });
        continue;
      }
    }
    const counted = await Promise.all(candidates.map(async (c) => ({ term: c, studies: await countStudies(c) })));
    // Dal più specifico al più generico: con un tetto di termini, quelli che
    // trovano poche centinaia di studi dicono di più di quelli che ne trovano
    // ventimila.
    const found = counted.filter((c) => c.studies > 0).sort((a, b) => a.studies - b.studies);
    // Il termine più specifico fa da ancora: un termine generico gli si
    // aggancia quando la coppia trova ancora studi ("semaglutide obesity"
    // invece di tutti i ventimila studi sull'obesità).
    const kept: { term: string; studies: number }[] = found.slice(0, 1);
    for (const other of found.slice(1)) {
      const pair = `${found[0].term} ${other.term}`;
      const n = await countStudies(pair);
      kept.push(n >= 5 ? { term: pair, studies: n } : other);
    }
    notes.push({ input, kept, dropped: counted.filter((c) => c.studies === 0).map((c) => c.term) });
    terms.push(...kept);
  }
  const unique = terms.filter((t, i) => terms.findIndex((x) => foldIt(x.term) === foldIt(t.term)) === i);
  return { terms: unique.slice(0, max).map((t) => t.term), notes };
}

// --- Le fasi, lette come un lettore le intende ---------------------------------------

/** 0 = nessuna fase dichiarata (studi osservazionali), 0.5 = fase 1 precoce, poi 1…4. */
export function phaseRank(phases: string[]): number {
  let best = 0;
  for (const p of phases) {
    // Prima la fase precoce: "EARLY_PHASE1" contiene "PHASE1", e letta come
    // fase 1 piena farebbe sembrare più maturo uno studio esplorativo.
    if (p === 'EARLY_PHASE1') { best = Math.max(best, 0.5); continue; }
    const m = /^PHASE(\d)$/.exec(p);
    if (m) best = Math.max(best, Number(m[1]));
  }
  return best;
}

export function phaseLabel(phases: string[], lang: 'it' | 'en' = 'it'): string {
  if (!phases.length || phases.every((p) => p === 'NA')) return lang === 'it' ? 'senza fase' : 'no phase';
  return phases.map((p) => (p === 'EARLY_PHASE1' ? (lang === 'it' ? 'fase 1 precoce' : 'early phase 1') : p.replace('PHASE', lang === 'it' ? 'fase ' : 'phase '))).join(' / ');
}

export const STATUS_LABEL: Record<string, string> = {
  RECRUITING: 'recluta', NOT_YET_RECRUITING: 'non ancora avviato', ACTIVE_NOT_RECRUITING: 'in corso',
  ENROLLING_BY_INVITATION: 'su invito', COMPLETED: 'concluso', TERMINATED: 'interrotto',
  SUSPENDED: 'sospeso', WITHDRAWN: 'ritirato', UNKNOWN: 'stato ignoto', WITHHELD: 'riservato',
  AVAILABLE: 'accesso allargato', NO_LONGER_AVAILABLE: 'non più disponibile',
};

// Un intervento generico non identifica uno studio: "placebo" o "computed
// tomography" sono in migliaia di notizie che non parlano di nessuno di questi
// studi. Si tengono solo i tipi che portano un NOME proprio — un farmaco, un
// dispositivo, una terapia — e fra questi si scartano le etichette di comodo.
const NAMED_TYPES = new Set(['DRUG', 'BIOLOGICAL', 'DEVICE', 'GENETIC', 'COMBINATION_PRODUCT', 'RADIATION', 'DIETARY_SUPPLEMENT']);
const GENERIC = /^(placebo|matching placebo|standard of care|usual care|active control|active comparator|control|saline|no intervention|observation|questionnaire|survey|diet|exercise|behavioral|drug|vaccine|surgery|standard therapy|best supportive care|best practice|sham|vehicle|biospecimen collection|computed tomography|magnetic resonance imaging|mri|ct scan|x-ray|ultrasound|laboratory biomarker analysis|quality-of-life assessment|chemotherapy|radiation therapy|radiotherapy|device|software|artificial intelligence|ai|machine learning|app|mobile app|mobile application)$/i;

/** I nomi con cui uno studio può comparire in una notizia. */
export function newsTerms(trial: { nctId: string; interventions: { type?: string; name: string }[] }): string[] {
  const names = trial.interventions
    .filter((i) => !i.type || NAMED_TYPES.has(i.type))
    .map((i) => i.name.replace(/\s*\(.*?\)\s*/g, ' ').trim())
    .filter((n) => n.length >= 5 && !GENERIC.test(n) && !/^placebo/i.test(n));
  return [...new Set([trial.nctId, ...names])].slice(0, 6);
}

// --- Raccolta ---------------------------------------------------------------------

export async function ingestTrials(projectId: number): Promise<{ tried: number; trials: number }> {
  const db = await getDb();
  const [project] = await db.select({ terms: projects.evidenceTerms }).from(projects).where(eq(projects.id, projectId));
  const terms = (project?.terms ?? []).slice(0, 5);
  if (!terms.length) return { tried: 0, trials: 0 };

  let stored = 0;
  for (const term of terms) {
    const rows = (await searchStudies(term))
      .map((s) => toTrialRow(s, term))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    // A blocchi, non uno per uno: cento studi erano cento andate e ritorno.
    // Lo stesso studio può tornare due volte nella stessa pagina di risultati,
    // e un blocco non può aggiornare due volte la stessa riga.
    const unique = [...new Map(rows.map((r) => [r.nctId, r])).values()];
    for (let i = 0; i < unique.length; i += 50) {
      await db.insert(clinicalTrials).values(unique.slice(i, i + 50).map((r) => ({ projectId, ...r })))
        .onConflictDoUpdate({
          target: [clinicalTrials.projectId, clinicalTrials.nctId],
          set: {
            title: sql`excluded.title`, status: sql`excluded.status`, phases: sql`excluded.phases`,
            enrollment: sql`excluded.enrollment`, completionDate: sql`excluded.completion_date`,
            lastUpdate: sql`excluded.last_update`, hasResults: sql`excluded.has_results`,
            interventions: sql`excluded.interventions`, countries: sql`excluded.countries`,
            fetchedAt: sql`now()`,
          },
        });
    }
    stored += rows.length;
  }
  await linkTrialNews(projectId);
  return { tried: terms.length, trials: stored };
}

const DAY = 86400_000;

/**
 * Quante menzioni del progetto nominano ciascuno studio o i suoi trattamenti.
 *
 * UNA sola lettura delle menzioni: una ricerca con tutti i nomi trova le
 * menzioni che ne contengono almeno uno, e solo su quelle si guarda quale. La prima versione interrogava l'archivio una volta per nome,
 * e su un progetto da ventimila menzioni ci metteva più di due minuti.
 *
 * I conteggi restano PER NOME: un trattamento ha le sue menzioni, non quelle
 * dello studio in cui compare accanto a un farmaco più famoso.
 */
export async function linkTrialNews(projectId: number, now = new Date()): Promise<void> {
  const db = await getDb();
  const trials = await db.select({ id: clinicalTrials.id, nctId: clinicalTrials.nctId, interventions: clinicalTrials.interventions })
    .from(clinicalTrials).where(eq(clinicalTrials.projectId, projectId));
  if (!trials.length) return;
  const since = new Date(now.getTime() - 90 * DAY);
  const d30 = now.getTime() - 30 * DAY;

  const termsOf = new Map(trials.map((t) => [t.id, newsTerms(t)]));
  const allTerms = [...new Set([...termsOf.values()].flat().map((t) => t.toLowerCase()))];
  if (!allTerms.length) return;
  // Ricerca full-text di Postgres, non un'espressione regolare: sui dati
  // veri (96.634 menzioni, 265 nomi) 9,5 secondi contro 59. Trova le
  // menzioni candidate; quale nome contengano lo decide il confronto qui sotto.
  const query = sql.join(allTerms.map((t) => sql`phraseto_tsquery('simple', ${t})`), sql` || `);

  const rows = await db.select({
    id: mentions.id, at: mentions.publishedAt, eng: mentions.engagementScore,
    text: sql<string>`lower(coalesce(${mentions.title}, '') || ' ' || ${mentions.content})`,
  }).from(mentions).where(and(
    eq(mentions.projectId, projectId),
    gte(mentions.publishedAt, since),
    sql`to_tsvector('simple', coalesce(${mentions.title}, '') || ' ' || ${mentions.content}) @@ (${query})`,
  )).limit(20000);

  const byTerm = new Map<string, { id: number; at: Date; eng: number }[]>();
  for (const r of rows) {
    for (const term of allTerms) {
      if (!r.text.includes(term)) continue;
      const list = byTerm.get(term) ?? [];
      list.push({ id: r.id, at: r.at, eng: r.eng });
      byTerm.set(term, list);
    }
  }

  const summarize = (list: { id: number; at: Date; eng: number }[]) => ({
    total: list.length,
    last30: list.filter((r) => r.at.getTime() >= d30).length,
    sampleIds: [...list].sort((a, b) => b.eng - a.eng).slice(0, 8).map((r) => r.id),
  });

  const updates: { id: number; news: TrialNews }[] = [];
  for (const t of trials) {
    const terms = termsOf.get(t.id) ?? [];
    const union = new Map<number, { id: number; at: Date; eng: number }>();
    const perTerm: Record<string, { total: number; last30: number; sampleIds: number[] }> = {};
    for (const term of terms) {
      const list = byTerm.get(term.toLowerCase()) ?? [];
      perTerm[term.toLowerCase()] = summarize(list);
      for (const r of list) union.set(r.id, r);
    }
    updates.push({ id: t.id, news: { ...summarize([...union.values()]), terms, byTerm: perTerm, at: now.toISOString() } });
  }
  // Un'istruzione per blocco invece di una per studio: centoquaranta
  // aggiornamenti singoli costavano più di un minuto di andata e ritorno.
  for (let i = 0; i < updates.length; i += 100) {
    const chunk = updates.slice(i, i + 100);
    const values = sql.join(chunk.map((u) => sql`(${u.id}::int, ${JSON.stringify(u.news)}::jsonb)`), sql`, `);
    await db.execute(sql`
      update clinical_trials as c set news = v.news
      from (values ${values}) as v(id, news)
      where c.id = v.id`);
  }
}

// --- Rumore contro evidenza ---------------------------------------------------------

export type Gap = 'hype' | 'untold' | 'aligned' | 'quiet';

/**
 * Il rapporto fra quanto si parla di un trattamento e quanto è maturo.
 *
 * "hype": se ne parla molto, ma gli studi sono al massimo in fase 2 e senza
 * risultati — le notizie corrono più dell'evidenza.
 * "untold": c'è uno studio in fase 3 o con risultati, e quasi nessuno lo
 * racconta.
 */
export function gapOf(mentionsCount: number, maxPhase: number, anyResults: boolean, loud = 10): Gap {
  const mature = maxPhase >= 3 || anyResults;
  if (mentionsCount >= loud && !mature) return 'hype';
  if (mature && mentionsCount <= 2) return 'untold';
  if (mentionsCount === 0) return 'quiet';
  return 'aligned';
}

export type InterventionRow = {
  name: string; trials: number; maxPhase: number; anyResults: boolean;
  recruiting: number; sponsors: string[]; mentions: number; last30: number; gap: Gap; sampleIds: number[];
};

export async function trialsData(projectId: number) {
  const db = await getDb();
  const [project] = await db.select({ terms: projects.evidenceTerms }).from(projects).where(eq(projects.id, projectId));
  const rows = await db.select().from(clinicalTrials).where(eq(clinicalTrials.projectId, projectId))
    .orderBy(desc(clinicalTrials.lastUpdate)).limit(1000);

  const byStatus = new Map<string, number>();
  const byPhase = new Map<string, number>();
  const sponsors = new Map<string, { n: number; cls: string | null }>();
  const countries = new Map<string, number>();
  const upcoming: typeof rows = [];
  const today = new Date().toISOString().slice(0, 10);
  const inYear = new Date(Date.now() + 365 * DAY).toISOString().slice(0, 10);

  // "Semaglutide 1.0 mg" e "Semaglutide Pen Injector" sono la semaglutide:
  // contate a parte, lo stesso farmaco occupa mezza tabella. Un nome che
  // comincia con un altro nome già presente si riporta a quello.
  const allNames = [...new Set(rows.flatMap((t) => newsTerms(t).slice(1)).map((n) => n.toLowerCase()))]
    .sort((a, b) => a.length - b.length);
  const canonical = (name: string) => {
    const n = name.toLowerCase();
    return allNames.find((base) => base !== n && n.startsWith(`${base} `)) ?? n;
  };

  const interventions = new Map<string, InterventionRow>();
  for (const t of rows) {
    byStatus.set(t.status, (byStatus.get(t.status) ?? 0) + 1);
    const ph = phaseLabel(t.phases);
    byPhase.set(ph, (byPhase.get(ph) ?? 0) + 1);
    if (t.sponsor) {
      const s = sponsors.get(t.sponsor) ?? { n: 0, cls: t.sponsorClass };
      s.n++;
      sponsors.set(t.sponsor, s);
    }
    for (const c of t.countries) countries.set(c, (countries.get(c) ?? 0) + 1);
    // "In arrivo": studi ancora aperti la cui conclusione principale cade
    // nei prossimi dodici mesi — le notizie di domani, con la data.
    if (t.completionDate && t.completionDate >= today && t.completionDate <= inYear
      && !['COMPLETED', 'TERMINATED', 'WITHDRAWN'].includes(t.status)) upcoming.push(t);

    const seen = new Set<string>();
    for (const i of newsTerms(t).slice(1)) {
      const own = i.toLowerCase();
      const key = canonical(i);
      // Uno studio conta una volta per farmaco, anche se ne elenca tre dosi.
      if (seen.has(key)) continue;
      seen.add(key);
      const cur = interventions.get(key) ?? {
        name: key === own ? i : (newsTerms(t).slice(1).find((x) => x.toLowerCase() === key) ?? key.replace(/^./, (c) => c.toUpperCase())),
        trials: 0, maxPhase: 0, anyResults: false, recruiting: 0, sponsors: [],
        mentions: 0, last30: 0, gap: 'quiet' as Gap, sampleIds: [],
      };
      cur.trials++;
      cur.maxPhase = Math.max(cur.maxPhase, phaseRank(t.phases));
      cur.anyResults ||= t.hasResults === 1;
      if (t.status === 'RECRUITING') cur.recruiting++;
      if (t.sponsor && !cur.sponsors.includes(t.sponsor)) cur.sponsors.push(t.sponsor);
      // Le menzioni di un trattamento sono quelle del SUO nome, non quelle
      // dello studio: uno studio che confronta l'insulina con la semaglutide
      // non deve prestare all'insulina le notizie sulla semaglutide.
      const counts = t.news?.byTerm?.[key] ?? t.news?.byTerm?.[own];
      if (counts) {
        cur.mentions = Math.max(cur.mentions, counts.total);
        cur.last30 = Math.max(cur.last30, counts.last30);
        if (counts.sampleIds.length > cur.sampleIds.length) cur.sampleIds = counts.sampleIds;
      }
      interventions.set(key, cur);
    }
  }
  const interventionRows = [...interventions.values()]
    .map((i) => ({ ...i, gap: gapOf(i.mentions, i.maxPhase, i.anyResults) }))
    .sort((a, b) => b.mentions - a.mentions || b.trials - a.trials)
    .slice(0, 40);

  upcoming.sort((a, b) => (a.completionDate ?? '').localeCompare(b.completionDate ?? ''));

  return {
    terms: project?.terms ?? [],
    total: rows.length,
    trials: rows.slice(0, 200),
    byStatus: [...byStatus.entries()].map(([status, n]) => ({ status, n })).sort((a, b) => b.n - a.n),
    byPhase: [...byPhase.entries()].map(([phase, n]) => ({ phase, n })).sort((a, b) => b.n - a.n),
    sponsors: [...sponsors.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.n - a.n).slice(0, 12),
    countries: [...countries.entries()].map(([country, n]) => ({ country, n })).sort((a, b) => b.n - a.n).slice(0, 12),
    upcoming: upcoming.slice(0, 20),
    interventions: interventionRows,
    withNews: rows.filter((t) => (t.news?.total ?? 0) > 0).length,
  };
}

