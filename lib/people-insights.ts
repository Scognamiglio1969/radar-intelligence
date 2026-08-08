import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { importFiles, mentions, metricPoints } from '@/lib/db/schema';
import { looksLikePerson } from '@/lib/sheet-archetype';

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

  const flagged = await db.select({ id: importFiles.id }).from(importFiles)
    .where(and(eq(importFiles.projectId, projectId), eq(importFiles.people, 1)));
  const names = new Set<string>();

  if (flagged.length) {
    const rows = await db.select({ entity: metricPoints.entity }).from(metricPoints)
      .where(and(
        eq(metricPoints.projectId, projectId),
        sql`${metricPoints.importFileId} in ${flagged.map((f) => f.id)}`,
      ))
      .groupBy(metricPoints.entity);
    for (const r of rows) if (looksLikePerson(r.entity)) names.add(r.entity);

    // I fogli larghi mettono una persona per COLONNA: lì il nome è la metrica.
    const cols = await db.select({ metric: metricPoints.metric }).from(metricPoints)
      .where(and(
        eq(metricPoints.projectId, projectId),
        sql`${metricPoints.importFileId} in ${flagged.map((f) => f.id)}`,
      ))
      .groupBy(metricPoints.metric);
    for (const c of cols) {
      const clean = c.metric.replace(/\s*(delta|totale|total)\s*$/i, '').trim();
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
): Promise<{ name: string; followers: number | null; perMonth: number | null; engagement: number | null }[]> {
  const cards = await Promise.all(people.map((p) => personCard(projectId, p)));
  return cards.map((c) => ({
    name: c.name,
    followers: c.followers?.latest ?? null,
    perMonth: c.rhythm?.perMonth ?? null,
    engagement: c.averages.find((a) => /engagement/i.test(a.metric))?.value ?? null,
  })).sort((a, b) => (b.followers ?? 0) - (a.followers ?? 0));
}
