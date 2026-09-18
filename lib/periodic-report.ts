import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { mentions, periodicReports, projects } from '@/lib/db/schema';
import { buildPointOfView, getPovCached, povAgeDays, type FactPack, type PointOfView } from '@/lib/pov';
import { collectExportData, sourceLabel, type ExportData, type Project } from '@/lib/export-data';
import { SECTION_RENDERERS, type ReportPage } from '@/lib/report-pdf';
import type { SectionId } from '@/lib/export-sections';
import { getContentLocale, type ContentLocale } from '@/lib/content-locale';
import { formatDate, formatNumber } from '@/lib/i18n-dict';

// ---------------------------------------------------------------------------
// Report periodico: POV + Brief + i numeri del periodo.
//
// Non è un secondo motore di documenti: è una SCALETTA generata, che passa
// dallo stesso renderer PDF del report personalizzato. Un ritocco grafico lì
// arriva qui da solo.
//
// Sul Point of View vale la politica scelta (opzione A): le cadenze brevi
// RIUSANO la tesi già in cache invece di generarne una nuova ogni volta —
// una tesi di fondo che regge una settimana è realistica, e generarne una per
// ogni cadenza attiva su ogni progetto sarebbe la voce di spesa principale
// dell'app. Dal mensile in su si genera una tesi fresca sulla finestra giusta.
//
// In cambio, la provenienza è SEMPRE dichiarata nel documento: quando la tesi
// è stata scritta, su quale finestra, su quante mention e se è stata riusata.
// Un lettore deve poter distinguere una tesi di stamattina da una di sei
// giorni fa, perché nel frattempo il mercato può essersi mosso.
// ---------------------------------------------------------------------------

export type Cadence =
  | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export const CADENCES: {
  key: Cadence; label: string; days: number;
  /** Finestra della tesi. null = riusa quella in cache, non generarne una nuova. */
  povDays: number | null;
}[] = [
  { key: 'daily', label: 'Giornaliero', days: 1, povDays: null },
  { key: 'weekly', label: 'Settimanale', days: 7, povDays: null },
  { key: 'biweekly', label: 'Quindicinale', days: 14, povDays: null },
  { key: 'monthly', label: 'Mensile', days: 30, povDays: 30 },
  { key: 'quarterly', label: 'Trimestrale', days: 90, povDays: 90 },
  { key: 'semiannual', label: 'Semestrale', days: 180, povDays: 180 },
  { key: 'annual', label: 'Annuale', days: 365, povDays: 365 },
];

export const CADENCE = new Map(CADENCES.map((c) => [c.key, c]));
export const isCadence = (v: unknown): v is Cadence => CADENCE.has(v as Cadence);

/** Da dove viene la tesi che il lettore sta leggendo. Sempre stampata. */
export type Provenance = {
  povGeneratedAt: string | null;
  povAgeDays: number | null;
  povWindowDays: number | null;
  povMentions: number | null;
  povSources: number | null;
  /** true = tesi riusata dalla cache; false = generata per questo report. */
  povReused: boolean;
  periodFrom: string;
  periodTo: string;
  periodMentions: number;
  generatedAt: string;
};

export type PeriodicReport = {
  id: number; projectId: number; cadence: Cadence;
  periodStart: string; periodEnd: string;
  pages: ReportPage[]; provenance: Provenance; pov: PointOfView | null; createdAt: Date;
};

const fmt = (d: Date) => d.toISOString().slice(0, 10);
const longDate = (locale: ContentLocale, s: string) => formatDate(locale, s, { day: 'numeric', month: 'long', year: 'numeric' });

/** I numeri del periodo, da SQL. Nessun modello li tocca. */
async function periodStats(projectId: number, from: Date, to: Date) {
  const db = await getDb();
  const span = to.getTime() - from.getTime();
  const prevFrom = new Date(from.getTime() - span);

  const window = and(
    eq(mentions.projectId, projectId),
    gte(mentions.publishedAt, from),
    lt(mentions.publishedAt, to),
  );

  const [[now], [prev], peak, bySource] = await Promise.all([
    db.select({
      n: sql<number>`count(*)`,
      s: sql<number | null>`avg(${mentions.sentimentScore})`,
      sources: sql<number>`count(distinct ${mentions.source})`,
      authors: sql<number>`count(distinct ${mentions.author})`,
    }).from(mentions).where(window),
    db.select({ n: sql<number>`count(*)` }).from(mentions).where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, prevFrom),
      lt(mentions.publishedAt, from),
    )),
    db.select({
      day: sql<string>`to_char(${mentions.publishedAt}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)`,
    }).from(mentions).where(window)
      .groupBy(sql`1`).orderBy(desc(sql`2`)).limit(1),
    db.select({ source: mentions.source, n: sql<number>`count(*)` })
      .from(mentions).where(window).groupBy(mentions.source).orderBy(desc(sql`2`)).limit(3),
  ]);

  const total = Number(now?.n ?? 0);
  const before = Number(prev?.n ?? 0);
  return {
    total,
    prev: before,
    changePct: before > 0 ? Math.round(((total - before) / before) * 100) : null,
    sentiment: now?.s === null || now?.s === undefined ? null : Number(now.s),
    sources: Number(now?.sources ?? 0),
    authors: Number(now?.authors ?? 0),
    peak: peak[0] ? { day: peak[0].day, n: Number(peak[0].n) } : null,
    topSources: bySource.map((r) => ({ source: r.source, n: Number(r.n) })),
  };
}

/** L'apertura del report: prosa deterministica, costruita sui numeri appena letti. */
export function periodSummary(stats: Awaited<ReturnType<typeof periodStats>>, from: string, to: string, locale: ContentLocale): string {
  const n = (value: number) => formatNumber(locale, value);
  if (locale === 'en') {
    const parts = [
      `From ${longDate(locale, from)} to ${longDate(locale, to)}, ${n(stats.total)} mentions were collected`
      + (stats.changePct === null ? ' (there is no previous period to compare)' : `, ${stats.changePct >= 0 ? '+' : ''}${stats.changePct}% versus the previous period, which had ${n(stats.prev)}`)
      + `, from ${stats.sources} sources and ${n(stats.authors)} distinct authors.`,
    ];
    if (stats.sentiment !== null) parts.push(`Average sentiment was ${stats.sentiment.toFixed(2)} on a -1 to +1 scale: ${stats.sentiment > 0.15 ? 'positive-leaning' : stats.sentiment < -0.15 ? 'negative-leaning' : 'broadly neutral'}.`);
    if (stats.peak) parts.push(`The busiest day was ${longDate(locale, stats.peak.day)}, with ${n(stats.peak.n)} mentions.`);
    if (stats.topSources.length) parts.push(`The leading sources were ${stats.topSources.map((s) => `${sourceLabel(s.source)} (${n(s.n)})`).join(', ')}.`);
    return parts.join(' ');
  }
  const parts: string[] = [
    `Dal ${longDate(locale, from)} al ${longDate(locale, to)} sono state raccolte ${n(stats.total)} menzioni`
    + (stats.changePct === null
      ? ' (non c\'è un periodo precedente con cui confrontarle)'
      : `, ${stats.changePct >= 0 ? '+' : ''}${stats.changePct}% rispetto al periodo precedente, che ne aveva ${n(stats.prev)}`)
    + `, da ${stats.sources} fonti e ${n(stats.authors)} autori distinti.`,
  ];
  if (stats.sentiment !== null) {
    const label = stats.sentiment > 0.15 ? 'orientato al positivo'
      : stats.sentiment < -0.15 ? 'orientato al negativo' : 'sostanzialmente neutro';
    parts.push(`Il sentiment medio del periodo è ${stats.sentiment.toFixed(2)} su una scala da -1 a +1: ${label}.`);
  }
  if (stats.peak) {
    parts.push(`Il giorno più intenso è stato il ${longDate(locale, stats.peak.day)}, con ${n(stats.peak.n)} menzioni.`);
  }
  if (stats.topSources.length) {
    parts.push(`Le fonti che hanno pesato di più: ${stats.topSources.map((s) => `${sourceLabel(s.source)} (${n(s.n)})`).join(', ')}.`);
  }
  return parts.join(' ');
}

/** La nota di provenienza della tesi. È il requisito esplicito: mai omessa. */
export function provenanceNote(p: Provenance, locale: ContentLocale): string {
  const n = (value: number) => formatNumber(locale, value);
  if (locale === 'en') {
    if (!p.povGeneratedAt) return `No Point of View was available when this report was generated, so this document contains only figures and facts for the period. Period covered: ${longDate(locale, p.periodFrom)} to ${longDate(locale, p.periodTo)}, ${n(p.periodMentions)} mentions.`;
    const when = formatDate(locale, p.povGeneratedAt, { dateStyle: 'long', timeStyle: 'short' });
    const age = p.povAgeDays === 0 ? 'today' : p.povAgeDays === 1 ? 'yesterday' : `${p.povAgeDays} days ago`;
    return `Point of View provenance — ${p.povReused ? 'reused' : 'generated for this report'} on ${when} (${age}), over a ${p.povWindowDays}-day window containing ${n(p.povMentions ?? 0)} mentions from ${p.povSources ?? 0} sources. ${p.povReused ? 'It was not regenerated for this period: the underlying interpretation is the current one, while figures on previous pages cover this report period.' : 'It was written from the indicated window, not the entire archive.'} This report covers ${longDate(locale, p.periodFrom)} to ${longDate(locale, p.periodTo)} and contains ${n(p.periodMentions)} mentions.`;
  }
  if (!p.povGeneratedAt) {
    return 'Nessuna tesi (Point of View) era disponibile al momento della generazione di questo report: '
      + 'questo documento riporta quindi solo i numeri e i fatti del periodo. '
      + `Periodo coperto: dal ${longDate(locale, p.periodFrom)} al ${longDate(locale, p.periodTo)}, ${n(p.periodMentions)} menzioni.`;
  }
  const when = formatDate(locale, p.povGeneratedAt, { dateStyle: 'long', timeStyle: 'short' });
  const age = p.povAgeDays === 0 ? 'oggi stesso'
    : p.povAgeDays === 1 ? 'ieri' : `${p.povAgeDays} giorni fa`;
  return `Provenienza della tesi — Point of View ${p.povReused ? 'riusato' : 'generato per questo report'} il ${when} (${age}), `
    + `su una finestra di ${p.povWindowDays} giorni che conteneva ${n(p.povMentions ?? 0)} menzioni `
    + `da ${p.povSources ?? 0} fonti. `
    + (p.povReused
      ? 'Non è stata rigenerata per questo periodo: la lettura di fondo è quella corrente, i numeri delle pagine precedenti sono invece quelli del periodo di questo report.'
      : 'È stata scritta sui dati della finestra indicata, non su quelli dell\'intero archivio.')
    + ` Il periodo coperto da questo report va dal ${longDate(locale, p.periodFrom)} al ${longDate(locale, p.periodTo)} e contiene ${n(p.periodMentions)} menzioni.`;
}

/** Le sezioni che compongono un'edizione, nell'ordine. Quelle senza dati saltano. */
const OUTLINE: { title: string; sections: SectionId[] }[] = [
  { title: 'Il periodo in numeri', sections: ['kpi', 'kpiStandard', 'volume', 'sentiment', 'topics'] },
  { title: 'Quanto reggono i numeri', sections: ['reliability'] },
  { title: 'La tesi', sections: ['pov'] },
  { title: 'I fatti del periodo', sections: ['brief', 'alerts', 'timeline'] },
  { title: 'Il confronto', sections: ['benchmark', 'sov'] },
];

/**
 * Genera un'edizione: legge i numeri, decide la tesi secondo la cadenza e
 * compone la scaletta. Non salva: pensarci al chiamante.
 */
export async function buildPeriodicReport(project: Project, cadence: Cadence, requestedLocale?: ContentLocale): Promise<{
  periodStart: string; periodEnd: string; pages: ReportPage[]; provenance: Provenance;
  pov: PointOfView | null;
}> {
  const locale = requestedLocale ?? await getContentLocale();
  const spec = CADENCE.get(cadence)!;
  const to = new Date();
  const from = new Date(to.getTime() - spec.days * 86400_000);

  const [stats, data] = await Promise.all([
    periodStats(project.id, from, to),
    collectExportData(project, spec.days),
  ]);

  // La tesi: riusata per le cadenze brevi, fresca dal mensile in su.
  let pov: PointOfView | null = null;
  let facts: FactPack | null = null;
  let reused = true;
  if (spec.povDays === null) {
    const cached = await getPovCached(project.id, 90);
    pov = cached.pov;
    facts = cached.facts;
  } else {
    const built = await buildPointOfView(project.id, spec.povDays);
    pov = built.pov;
    facts = built.facts;
    reused = false;
    // Una generazione fallita (chiave assente, tetto di spesa) non deve far
    // fallire il report: si ripiega sulla tesi in cache e lo si dichiara.
    if (!pov) {
      const cached = await getPovCached(project.id, 90);
      pov = cached.pov;
      if (pov) { facts = cached.facts; reused = true; }
    }
  }

  const provenance: Provenance = {
    povGeneratedAt: pov?.generatedAt ?? null,
    povAgeDays: pov ? povAgeDays(pov) : null,
    povWindowDays: pov ? (reused ? 90 : spec.povDays) : null,
    // Senza tesi non esiste "su quanti dati è stata scritta": lasciare qui i
    // numeri del fact pack farebbe sembrare che una tesi ci fosse.
    povMentions: pov ? facts?.total ?? null : null,
    povSources: pov ? facts?.sources.length ?? null : null,
    povReused: reused,
    periodFrom: fmt(from),
    periodTo: fmt(to),
    periodMentions: stats.total,
    generatedAt: new Date().toISOString(),
  };

  // La tesi in cache è quella del progetto, non del periodo: se il report la
  // riusa, il PDF deve mostrarla comunque, quindi si inietta nei dati passati
  // al renderer invece di lasciarlo leggere una cache diversa.
  const withPov: ExportData = { ...data, pov: { facts: facts ?? data.pov.facts, pov } };

  const pages: ReportPage[] = [];
  const outline = locale === 'it' ? OUTLINE : [
    { title: 'The period in numbers', sections: ['kpi', 'volume', 'sentiment', 'topics'] as SectionId[] },
    { title: 'The point of view', sections: ['pov'] as SectionId[] },
    { title: 'Facts from the period', sections: ['brief', 'alerts', 'timeline'] as SectionId[] },
    { title: 'Comparison', sections: ['benchmark', 'sov'] as SectionId[] },
  ];
  for (const group of outline) {
    const isPov = group.sections.length === 1 && group.sections[0] === 'pov';
    const isNumbers = group.sections[0] === 'kpi';
    const sections = group.sections.filter((s) => SECTION_RENDERERS[s].has(withPov));
    if (!sections.length && !isPov) continue;
    const page: ReportPage = { title: group.title, blocks: [] };
    if (isNumbers) {
      page.blocks.push({ type: 'text', text: periodSummary(stats, fmt(from), fmt(to), locale), role: 'intro' });
    }
    page.blocks.push(...sections.map((s) => ({ type: 'chart' as const, section: s })));
    // La provenienza chiude la pagina della tesi: sta accanto a ciò che qualifica.
    if (isPov) {
      page.blocks.push({ type: 'text', text: provenanceNote(provenance, locale), role: 'free' });
    }
    if (page.blocks.length) pages.push(page);
  }

  return { periodStart: fmt(from), periodEnd: fmt(to), pages, provenance, pov };
}

// --- Archivio delle edizioni ------------------------------------------------

export async function saveEdition(
  projectId: number, cadence: Cadence,
  built: Awaited<ReturnType<typeof buildPeriodicReport>>,
): Promise<number> {
  const db = await getDb();
  const [row] = await db.insert(periodicReports).values({
    projectId, cadence,
    periodStart: built.periodStart, periodEnd: built.periodEnd,
    pages: built.pages, provenance: built.provenance, pov: built.pov,
  }).returning({ id: periodicReports.id });
  return row.id;
}

export async function listEditions(projectId: number, limit = 40): Promise<PeriodicReport[]> {
  const db = await getDb();
  const rows = await db.select().from(periodicReports)
    .where(eq(periodicReports.projectId, projectId))
    .orderBy(desc(periodicReports.createdAt)).limit(limit);
  return rows.map((r) => ({
    ...r, cadence: r.cadence as Cadence,
    pages: (r.pages ?? []) as ReportPage[],
    provenance: r.provenance as Provenance,
    pov: (r.pov ?? null) as PointOfView | null,
  }));
}

export async function getEdition(id: number, projectId: number): Promise<PeriodicReport | null> {
  const db = await getDb();
  const [r] = await db.select().from(periodicReports)
    .where(and(eq(periodicReports.id, id), eq(periodicReports.projectId, projectId)));
  return r ? {
    ...r, cadence: r.cadence as Cadence,
    pages: (r.pages ?? []) as ReportPage[],
    provenance: r.provenance as Provenance,
    pov: (r.pov ?? null) as PointOfView | null,
  } : null;
}

export async function deleteEdition(id: number, projectId: number): Promise<void> {
  const db = await getDb();
  await db.delete(periodicReports)
    .where(and(eq(periodicReports.id, id), eq(periodicReports.projectId, projectId)));
}

/** L'ultima edizione di una cadenza, per sapere se ne va prodotta un'altra. */
export async function lastEdition(projectId: number, cadence: Cadence): Promise<Date | null> {
  const db = await getDb();
  const [r] = await db.select({ at: periodicReports.createdAt }).from(periodicReports)
    .where(and(eq(periodicReports.projectId, projectId), eq(periodicReports.cadence, cadence)))
    .orderBy(desc(periodicReports.createdAt)).limit(1);
  return r?.at ?? null;
}

// --- Cadenze attive e ciclo automatico --------------------------------------
//
// Quali cadenze siano accese è una preferenza del progetto, non uno schema:
// vive in `meta`, dove stanno già le altre impostazioni, invece che in una
// tabella che avrebbe una riga sola per cadenza.

const scheduleKey = (projectId: number) => `periodic:${projectId}`;

export async function getSchedule(projectId: number): Promise<Cadence[]> {
  const raw = await getMeta<unknown>(scheduleKey(projectId));
  return Array.isArray(raw) ? raw.filter(isCadence) : [];
}

export async function setSchedule(projectId: number, cadences: unknown[]): Promise<Cadence[]> {
  const clean = [...new Set(cadences.filter(isCadence))];
  await setMeta(scheduleKey(projectId), clean);
  return clean;
}

/**
 * Produce le edizioni scadute di tutti i progetti. Chiamata dal cron.
 *
 * "Scaduta" è misurata sull'ULTIMA edizione prodotta, non sul calendario: se
 * il cron salta un giorno il numero esce comunque, e se è già uscito stamattina
 * non ne esce un secondo. Gli errori di un progetto non fermano gli altri —
 * una chiave AI mancante su un progetto non deve azzerare il giro di tutti.
 */
export async function runDueEditions(): Promise<{ generated: number; failed: number; skipped: number }> {
  const db = await getDb();
  const all = await db.select().from(projects);
  let generated = 0, failed = 0, skipped = 0;

  for (const project of all) {
    const active = await getSchedule(project.id);
    for (const cadence of active) {
      const spec = CADENCE.get(cadence)!;
      const last = await lastEdition(project.id, cadence);
      // Tolleranza di mezza giornata: un cron che parte con qualche ora di
      // ritardo non deve far slittare l'edizione al giorno dopo.
      if (last && Date.now() - last.getTime() < (spec.days * 86400_000) - 43_200_000) { skipped++; continue; }
      try {
        const built = await buildPeriodicReport(project, cadence);
        await saveEdition(project.id, cadence, built);
        generated++;
      } catch (e) {
        console.error(`[periodic] ${project.name} / ${cadence} fallito:`, e);
        failed++;
      }
    }
  }
  return { generated, failed, skipped };
}
