import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { importFiles, mentions, metricPoints } from '@/lib/db/schema';
import { looksLikePerson, personFromSheetName, PERSON_FIELD } from '@/lib/sheet-archetype';

/**
 * Rimette il nome della persona nelle righe che l'hanno perso.
 *
 * I file importati prima che Radar leggesse il nome dal titolo del foglio
 * hanno centinaia di post senza autore: la persona c'è, ma nessuna riga lo
 * dice, e la sua scheda risulta vuota. Rifare l'import a mano sarebbe la
 * risposta sbagliata a un difetto che non ha commesso l'utente.
 *
 * È idempotente e si accorge subito quando non c'è niente da fare: la seconda
 * volta il file ha già la costante e non viene nemmeno toccato.
 */
async function attachSheetPeople(projectId: number): Promise<void> {
  const db = await getDb();
  const files = await db.select({
    id: importFiles.id, sheetName: importFiles.sheetName,
    kind: importFiles.kind, constants: importFiles.constants,
  }).from(importFiles)
    .where(and(eq(importFiles.projectId, projectId), eq(importFiles.people, 1)));

  for (const f of files) {
    const constants = (f.constants ?? {}) as Record<string, string>;
    if (constants[PERSON_FIELD]) continue;
    const person = personFromSheetName(f.sheetName ?? '');
    if (!person) continue;

    await db.update(importFiles)
      .set({ constants: { ...constants, [PERSON_FIELD]: person } })
      .where(eq(importFiles.id, f.id));

    // Solo le righe rimaste senza autore: dove il foglio aveva una colonna
    // autore quello è il dato vero e non si tocca.
    if (f.kind === 'mentions') {
      await db.update(mentions)
        .set({ author: person })
        .where(and(eq(mentions.importFileId, f.id), sql`${mentions.author} is null`));
    }
  }
}

// ---------------------------------------------------------------------------
// Personal branding: la scheda di una persona.
//
// Quando un file segue delle PERSONE invece che dei canali, le domande
// cambiano. Non "quanto pesa Instagram sul mix", ma: sta crescendo? pubblica
// abbastanza? che formato le rende meglio? chi la segue davvero?
//
// Tutti i numeri qui vengono da SQL. Il modello, se e quando interviene, li
// commenta soltanto — la stessa regola del Point of View.
// ---------------------------------------------------------------------------

export type PersonCard = {
  name: string;
  /** Follower all'ultima rilevazione, e quanti ne ha guadagnati nel periodo. */
  followers: { latest: number; gained: number; from: string; to: string } | null;
  /** Ritmo: quanti contenuti al mese, e la tendenza rispetto alla prima metà. */
  rhythm: { perMonth: number; total: number; months: number; trend: number | null } | null;
  /** Le medie che contano, per confrontarla con gli altri. */
  averages: { metric: string; value: number }[];
  /** Che formato le rende di più (dai campi conservati o dalle dimensioni). */
  formats: { name: string; posts: number; avgEngagement: number }[];
  /** Chi la segue: aziende, ruoli, luoghi. */
  audience: { dimension: string; rows: { name: string; share: number }[] }[];
  /** Il contenuto migliore e il peggiore, per capire cosa ha funzionato. */
  best: { title: string; engagement: number; date: string } | null;
  worst: { title: string; engagement: number; date: string } | null;
};

/**
 * Le persone seguite in questo progetto.
 *
 * Si parte dai fogli che il riconoscimento ha marcato come "di persone" — è
 * il segnale più affidabile, perché nasce dalla forma del file — e si ricade
 * sulle entità che sembrano nomi propri solo quando quel segnale manca.
 */
export async function detectPeople(projectId: number): Promise<string[]> {
  const db = await getDb();

  await attachSheetPeople(projectId);

  const flagged = await db.select({ id: importFiles.id, sheetName: importFiles.sheetName })
    .from(importFiles)
    .where(and(eq(importFiles.projectId, projectId), eq(importFiles.people, 1)));
  const names = new Set<string>();

  // Il nome scritto nel nome del foglio. Un foglio di post per manager non ha
  // una colonna con la persona: se non lo si legge da qui, quella persona non
  // esiste per nessuna delle pagine che vengono dopo.
  for (const f of flagged) {
    const p = personFromSheetName(f.sheetName ?? '');
    if (p) names.add(p);
  }

  if (flagged.length) {
    // Una lettura sola per due domande: chi è l'entità della serie, e come si
    // chiamano le colonne. Erano due scansioni identiche della stessa tabella,
    // e su un progetto da quaranta fogli si sentivano tutte e due.
    const rows = await db.select({ entity: metricPoints.entity, metric: metricPoints.metric })
      .from(metricPoints)
      .where(and(
        eq(metricPoints.projectId, projectId),
        sql`${metricPoints.importFileId} in ${flagged.map((f) => f.id)}`,
      ))
      .groupBy(metricPoints.entity, metricPoints.metric);
    for (const r of rows) {
      if (looksLikePerson(r.entity)) names.add(r.entity);
      // I fogli larghi mettono una persona per COLONNA: lì il nome è la metrica.
      const clean = r.metric.replace(/\s*(delta|totale|total)\s*$/i, '').trim();
      if (looksLikePerson(clean)) names.add(clean);
    }
  }

  if (!names.size) {
    const rows = await db.select({ entity: metricPoints.entity, n: sql<number>`count(*)` })
      .from(metricPoints).where(eq(metricPoints.projectId, projectId))
      .groupBy(metricPoints.entity);
    for (const r of rows) if (Number(r.n) >= 3 && looksLikePerson(r.entity)) names.add(r.entity);
  }
  return mergeSamePerson([...names]);
}

/**
 * La stessa persona compare con nomi diversi.
 *
 * Un file reale la chiama "Acquaviva" nel foglio dei post, "RICCARDO
 * ACQUAVIVA" nella colonna dei follower e "ACQUAVIVA" in quella mensile.
 * Trattarle come tre persone triplicherebbe le schede e dividerebbe i suoi
 * dati in tre. Il cognome — l'ultima parola — è la chiave; si tiene il nome
 * più completo, che è quello leggibile.
 */
export function mergeSamePerson(names: string[]): string[] {
  const byKey = new Map<string, string[]>();
  for (const n of names) {
    const key = (n.trim().split(/[\s_]+/).pop() ?? n).toLowerCase();
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(n);
  }
  return [...byKey.values()]
    .map((group) => {
      // Il più informativo: più parole, e a parità quello scritto per esteso.
      const best = group.sort((a, b) => {
        const wa = a.trim().split(/\s+/).length, wb = b.trim().split(/\s+/).length;
        if (wa !== wb) return wb - wa;
        return a.length - b.length;
      })[0];
      // "MARCO SESANA" in maiuscolo si legge male: si normalizza.
      return best === best.toUpperCase() && best.length > 3
        ? best.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
        : best;
    })
    .sort((a, b) => a.localeCompare(b));
}

const FOLLOWER = /(follower|iscritti|subscriber|fan)/i;
const PUBLISH = /(updates|pubblicazion|post|contenuti)/i;
const AVERAGE = /(medi[oa]|avg|average|rate|tasso)/i;

/** Quanto matcha una persona: nome esatto, oppure contenuto nella metrica. */
function matches(person: string, text: string): boolean {
  const p = person.toLowerCase();
  const t = text.toLowerCase();
  if (t === p) return true;
  // "MONACELLI delta" o "MASSIMO MONACELLI" per la persona "Monacelli".
  const surname = p.split(/\s+/).pop() ?? p;
  return surname.length >= 4 && t.includes(surname);
}

export async function personCard(projectId: number, person: string): Promise<PersonCard> {
  const db = await getDb();

  const points = await db.select({
    metric: metricPoints.metric, entity: metricPoints.entity,
    date: metricPoints.date, value: metricPoints.value, dims: metricPoints.dims,
  }).from(metricPoints).where(eq(metricPoints.projectId, projectId));

  // I punti che parlano di questa persona: o l'entità è lei, o lo è la metrica
  // (nei fogli larghi con una colonna per persona).
  const mine = points.filter((p) => matches(person, p.entity) || matches(person, p.metric));

  // --- Follower: primo e ultimo valore della serie di pubblico ---
  const fol = mine.filter((p) => FOLLOWER.test(p.metric) || (matches(person, p.metric) && !/delta/i.test(p.metric)))
    .filter((p) => !/delta/i.test(p.metric))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const followers = fol.length >= 2 ? {
    latest: Math.round(fol[fol.length - 1].value),
    gained: Math.round(fol[fol.length - 1].value - fol[0].value),
    from: fol[0].date.toISOString().slice(0, 10),
    to: fol[fol.length - 1].date.toISOString().slice(0, 10),
  } : null;

  // --- Ritmo di pubblicazione ---
  const pub = mine.filter((p) => PUBLISH.test(p.metric) && !AVERAGE.test(p.metric))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  let rhythm: PersonCard['rhythm'] = null;
  if (pub.length >= 2) {
    const total = pub.reduce((s, p) => s + p.value, 0);
    const months = new Set(pub.map((p) => p.date.toISOString().slice(0, 7))).size;
    const half = Math.floor(pub.length / 2);
    const first = pub.slice(0, half).reduce((s, p) => s + p.value, 0);
    const second = pub.slice(half).reduce((s, p) => s + p.value, 0);
    rhythm = {
      total: Math.round(total),
      months,
      perMonth: Math.round((total / Math.max(1, months)) * 10) / 10,
      trend: first > 0 ? Math.round(((second - first) / first) * 100) : null,
    };
  }

  // --- Medie: si mediano, non si sommano ---
  const avgMap = new Map<string, number[]>();
  for (const p of mine) {
    if (!AVERAGE.test(p.metric)) continue;
    if (!avgMap.has(p.metric)) avgMap.set(p.metric, []);
    avgMap.get(p.metric)!.push(p.value);
  }
  const averages = [...avgMap.entries()]
    .map(([metric, vals]) => ({
      metric,
      value: Math.round((vals.reduce((s, v) => s + v, 0) / vals.length) * 100) / 100,
    }))
    .sort((a, b) => b.value - a.value).slice(0, 6);

  // --- Audience: le dimensioni dei fogli di composizione ---
  const dimMap = new Map<string, Map<string, number[]>>();
  for (const p of mine) {
    for (const [dim, val] of Object.entries(p.dims ?? {})) {
      if (!val) continue;
      // Il tempo non è una dimensione del pubblico: "Mese Anno" fra le
      // ripartizioni dell'audience produce percentuali senza senso.
      if (/(mese|anno|month|year|data|date|periodo|giorno|day)/i.test(dim)) continue;
      if (!dimMap.has(dim)) dimMap.set(dim, new Map());
      const inner = dimMap.get(dim)!;
      if (!inner.has(val)) inner.set(val, []);
      inner.get(val)!.push(p.value);
    }
  }
  const audience = [...dimMap.entries()].map(([dimension, inner]) => {
    const rows = [...inner.entries()]
      .map(([name, vals]) => ({ name, share: vals.reduce((s, v) => s + v, 0) / vals.length }))
      .sort((a, b) => b.share - a.share).slice(0, 8);
    return { dimension, rows };
  }).filter((d) => d.rows.length > 1).slice(0, 3);

  // --- I contenuti: formato che rende, migliore e peggiore ---
  const posts = await db.select({
    title: mentions.title, content: mentions.content, custom: mentions.custom,
    engagementScore: mentions.engagementScore, publishedAt: mentions.publishedAt,
    author: mentions.author,
  }).from(mentions).where(and(
    eq(mentions.projectId, projectId),
    sql`(${mentions.author} ilike ${'%' + person + '%'} or ${mentions.community} ilike ${'%' + person + '%'})`,
  ));

  // Il ritmo, quando nessun foglio lo dichiara, lo dicono i post stessi.
  // Contarli è più preciso che leggerlo da una serie "pubblicazioni": è il
  // dato di partenza invece del suo riassunto, e non richiede che il file
  // contenga anche un rendiconto mensile.
  if (!rhythm && posts.length >= 2) {
    const mesi = new Set(posts.map((p) => p.publishedAt.toISOString().slice(0, 7)));
    const ordinati = [...posts].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
    const meta = Math.floor(ordinati.length / 2);
    const primaMeta = new Set(ordinati.slice(0, meta).map((p) => p.publishedAt.toISOString().slice(0, 7))).size;
    const secondaMeta = new Set(ordinati.slice(meta).map((p) => p.publishedAt.toISOString().slice(0, 7))).size;
    // La tendenza confronta due RITMI, non due conteggi: metà periodo può
    // durare tre mesi e l'altra otto, e allora i totali non si confrontano.
    const r1 = meta / Math.max(1, primaMeta);
    const r2 = (ordinati.length - meta) / Math.max(1, secondaMeta);
    rhythm = {
      total: posts.length,
      months: mesi.size,
      perMonth: Math.round((posts.length / Math.max(1, mesi.size)) * 10) / 10,
      trend: r1 > 0 ? Math.round(((r2 - r1) / r1) * 100) : null,
    };
  }

  const byFormat = new Map<string, { posts: number; eng: number }>();
  for (const p of posts) {
    const f = (p.custom ?? {})['Formato'] ?? (p.custom ?? {})['Format'] ?? null;
    if (!f) continue;
    const cur = byFormat.get(f) ?? { posts: 0, eng: 0 };
    cur.posts++; cur.eng += p.engagementScore;
    byFormat.set(f, cur);
  }
  const formats = [...byFormat.entries()]
    .map(([name, v]) => ({ name, posts: v.posts, avgEngagement: Math.round(v.eng / v.posts) }))
    .sort((a, b) => b.avgEngagement - a.avgEngagement).slice(0, 6);

  const ranked = [...posts].filter((p) => p.engagementScore > 0)
    .sort((a, b) => b.engagementScore - a.engagementScore);
  const asItem = (p: typeof ranked[number] | undefined) => (p ? {
    title: (p.title || p.content).slice(0, 120),
    engagement: Math.round(p.engagementScore),
    date: p.publishedAt.toISOString().slice(0, 10),
  } : null);

  return {
    name: person,
    followers, rhythm, averages, formats, audience,
    best: asItem(ranked[0]),
    worst: asItem(ranked[ranked.length - 1]),
  };
}

/** Confronto fra persone su una metrica media: la classifica del team. */
export async function peopleRanking(
  projectId: number, people: string[],
  /** Le schede già calcolate: ricalcolarle qui raddoppiava il lavoro della pagina. */
  ready?: PersonCard[],
): Promise<{ name: string; followers: number | null; perMonth: number | null; engagement: number | null }[]> {
  const cards = ready ?? await Promise.all(people.map((p) => personCard(projectId, p)));
  return cards.map((c) => ({
    name: c.name,
    followers: c.followers?.latest ?? null,
    perMonth: c.rhythm?.perMonth ?? null,
    engagement: c.averages.find((a) => /engagement/i.test(a.metric))?.value ?? null,
  })).sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
}

/**
 * Le serie nel tempo di una persona: pubblico e ritmo di pubblicazione.
 *
 * Sono due misure di natura diversa — uno stock e un flusso — e per questo
 * vivono in due grafici e non su due assi dello stesso: il rapporto fra le due
 * curve lo deciderebbe chi sceglie le scale, non i dati.
 */
export async function personSeries(projectId: number, person: string): Promise<{
  followers: { date: string; value: number }[];
  publishing: { date: string; value: number }[];
  engagement: { date: string; value: number }[];
}> {
  const db = await getDb();
  const points = await db.select({
    metric: metricPoints.metric, entity: metricPoints.entity,
    date: metricPoints.date, value: metricPoints.value,
  }).from(metricPoints).where(eq(metricPoints.projectId, projectId));

  const mine = points.filter((p) => matches(person, p.entity) || matches(person, p.metric));
  const pick = (test: (m: string) => boolean) => {
    const byDay = new Map<string, number>();
    for (const p of mine) {
      if (!test(p.metric)) continue;
      const day = p.date.toISOString().slice(0, 10);
      // Più fogli possono portare la stessa misura nello stesso mese: si tiene
      // il valore più alto invece di sommarli, che raddoppierebbe.
      byDay.set(day, Math.max(byDay.get(day) ?? 0, p.value));
    }
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value }));
  };

  return {
    followers: pick((m) => (FOLLOWER.test(m) || matches(person, m)) && !/delta/i.test(m)),
    publishing: pick((m) => PUBLISH.test(m) && !AVERAGE.test(m)),
    engagement: pick((m) => /engagement/i.test(m) && AVERAGE.test(m)),
  };
}

/** Una linea per persona sullo stesso grafico: il confronto diretto. */
export async function peopleFollowerSeries(
  projectId: number, people: string[],
): Promise<{ name: string; points: { date: string; value: number }[] }[]> {
  const series = await Promise.all(people.map(async (p) => ({
    name: p, points: (await personSeries(projectId, p)).followers,
  })));
  return series.filter((s) => s.points.length >= 2)
    .sort((a, b) => (b.points.at(-1)?.value ?? 0) - (a.points.at(-1)?.value ?? 0));
}

/**
 * Quante persone contiene questo progetto — per il menù.
 *
 * Deve costare poco: gira su ogni pagina. Legge solo la tabella dei file, che
 * ha una riga per foglio, senza toccare le menzioni né le serie. Il nome sta
 * fra le costanti se l'import l'ha già scritto, e si ricava dal titolo del
 * foglio quando il file è stato caricato prima che Radar lo leggesse.
 *
 * Può contare meno persone di `detectPeople` — quelle nascoste in una colonna
 * di un foglio largo qui non si vedono — e va bene così: serve a dire "ci sono
 * delle persone, sono di là", non a fare una statistica.
 */
export async function countPeople(projectId: number): Promise<number> {
  const db = await getDb();
  const files = await db.select({
    sheetName: importFiles.sheetName, filename: importFiles.filename,
    constants: importFiles.constants,
  }).from(importFiles)
    .where(and(eq(importFiles.projectId, projectId), eq(importFiles.people, 1)));

  const names = new Set<string>();
  for (const f of files) {
    const c = (f.constants ?? {}) as Record<string, string>;
    const name = c[PERSON_FIELD] ?? personFromSheetName(f.sheetName ?? f.filename);
    if (name) names.add(name);
  }
  return mergeSamePerson([...names]).length;
}
