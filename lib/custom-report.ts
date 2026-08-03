import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { customReports } from '@/lib/db/schema';
import { callClaude, MODELS } from '@/lib/claude';
import { sourceLabel, type ExportData } from '@/lib/export-data';
import { ALL_SECTION_IDS, EXPORT_SECTIONS, type SectionId } from '@/lib/export-sections';
import type { ReportBlock, ReportPage } from '@/lib/report-pdf';

// ---------------------------------------------------------------------------
// Report personalizzati: scaletta + commenti.
//
// Regola non negoziabile, la stessa del Point of View: i NUMERI vengono
// dall'archivio, il MODELLO scrive solo la prosa. Per questo il commento AI
// non riceve mai le mention grezze: riceve un estratto di cifre già calcolate
// (sectionFacts) e ha il compito di interpretarle. Se il modello inventa un
// numero, quel numero non è nel documento — perché i grafici li disegna il
// codice, non lui.
// ---------------------------------------------------------------------------

export type { ReportBlock, ReportPage };

export type CustomReport = {
  id: number; projectId: number; title: string; days: number;
  pages: ReportPage[]; createdAt: Date; updatedAt: Date;
};

const SECTION_LABEL = new Map(EXPORT_SECTIONS.map((s) => [s.id as string, s.label]));

/** Scarta blocchi malformati: la scaletta arriva dal client e va ripulita. */
function sanitizePages(input: unknown): ReportPage[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 40).map((raw) => {
    const p = (raw ?? {}) as { title?: unknown; blocks?: unknown };
    const blocks: ReportBlock[] = Array.isArray(p.blocks)
      ? p.blocks.slice(0, 30).flatMap((b): ReportBlock[] => {
        const blk = (b ?? {}) as { type?: unknown; section?: unknown; text?: unknown; ai?: unknown };
        if (blk.type === 'chart' && ALL_SECTION_IDS.includes(blk.section as SectionId)) {
          return [{ type: 'chart', section: blk.section as SectionId }];
        }
        if (blk.type === 'text' && typeof blk.text === 'string') {
          return [{ type: 'text', text: blk.text.slice(0, 4000), ai: blk.ai === true }];
        }
        return [];
      })
      : [];
    return { title: typeof p.title === 'string' ? p.title.slice(0, 160) : '', blocks };
  });
}

export async function listReports(projectId: number): Promise<CustomReport[]> {
  const db = await getDb();
  const rows = await db.select().from(customReports)
    .where(eq(customReports.projectId, projectId))
    .orderBy(desc(customReports.updatedAt));
  return rows.map((r) => ({ ...r, pages: sanitizePages(r.pages) }));
}

export async function getReport(id: number, projectId: number): Promise<CustomReport | null> {
  const db = await getDb();
  const [r] = await db.select().from(customReports)
    .where(and(eq(customReports.id, id), eq(customReports.projectId, projectId)));
  return r ? { ...r, pages: sanitizePages(r.pages) } : null;
}

export async function createReport(projectId: number, title: string, days = 30): Promise<number> {
  const db = await getDb();
  const [r] = await db.insert(customReports).values({
    projectId, title: title.trim() || 'Report senza titolo', days,
    pages: [{ title: 'Pagina 1', blocks: [] }],
  }).returning({ id: customReports.id });
  return r.id;
}

export async function saveReport(
  id: number, projectId: number, patch: { title?: string; days?: number; pages?: unknown },
): Promise<void> {
  const db = await getDb();
  await db.update(customReports).set({
    ...(patch.title !== undefined ? { title: patch.title.trim() || 'Report senza titolo' } : {}),
    ...(patch.days !== undefined ? { days: Math.min(90, Math.max(1, patch.days)) } : {}),
    ...(patch.pages !== undefined ? { pages: sanitizePages(patch.pages) } : {}),
    updatedAt: new Date(),
  }).where(and(eq(customReports.id, id), eq(customReports.projectId, projectId)));
}

export async function deleteReport(id: number, projectId: number): Promise<void> {
  const db = await getDb();
  await db.delete(customReports)
    .where(and(eq(customReports.id, id), eq(customReports.projectId, projectId)));
}

// --- Le cifre che alimentano il commento ------------------------------------

const pct = (n: number, tot: number) => `${Math.round((n / (tot || 1)) * 100)}%`;

/**
 * Estratto numerico di una sezione, in righe brevi. È l'UNICA cosa che il
 * modello vede: niente testi delle mention, niente contesto inventabile.
 * Ritorna stringa vuota quando la sezione non ha dati.
 */
export function sectionFacts(d: ExportData, id: SectionId): string {
  switch (id) {
    case 'kpi': {
      const k = d.dashboard.kpi;
      return [
        `mention negli ultimi 7 giorni: ${k.total7}`,
        `sentiment medio: ${k.avgSentiment === null ? 'non ancora calcolato' : k.avgSentiment.toFixed(2)} (scala -1..+1)`,
        `fonti attive: ${k.sources}`,
        `temi rilevati: ${d.dashboard.topTopics.length}`,
      ].join('\n');
    }
    case 'health': {
      const t = d.health.theme;
      if (!t.total) return '';
      const lines = [`indice di salute del mercato: ${t.score}/100 (${t.grade}), su ${t.total} mention`];
      lines.push(...t.components.map((c) => `componente ${c.label}: ${c.value}`));
      if (d.health.brand) lines.push(`brand ${d.health.brand.name}: ${d.health.brand.health.score}/100, scarto dal mercato ${d.health.brand.health.score - t.score}`);
      for (const c of d.health.compare) lines.push(`classifica salute ${c.name}${c.isBrand ? ' (brand)' : ''}: ${c.score}`);
      return lines.join('\n');
    }
    case 'trends':
      return d.trends.slice(0, 8).map((t) => `tema "${t.topic}": ${t.n24} mention in 24h, accelerazione x${t.score.toFixed(1)}`).join('\n');
    case 'volume': {
      const rows = d.dashboard.volumeByDay.map((r) => ({ ...r, n: Number(r.n) }));
      if (!rows.length) return '';
      const perDay = new Map<string, number>();
      const perSource = new Map<string, number>();
      for (const r of rows) {
        perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.n);
        perSource.set(r.source, (perSource.get(r.source) ?? 0) + r.n);
      }
      const days = [...perDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const peak = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
      const tot = [...perDay.values()].reduce((s, n) => s + n, 0);
      return [
        `volume totale nel periodo: ${tot} mention su ${days.length} giorni`,
        `media giornaliera: ${Math.round(tot / days.length)}`,
        `giorno di picco: ${peak[0]} con ${peak[1]} mention`,
        `primo e ultimo giorno: ${days[0][0]} = ${days[0][1]}, ${days[days.length - 1][0]} = ${days[days.length - 1][1]}`,
        ...[...perSource.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
          .map(([s, n]) => `fonte ${sourceLabel(s)}: ${n} (${pct(n, tot)})`),
      ].join('\n');
    }
    case 'sentiment': {
      const tot = d.dashboard.sentimentDist.reduce((s, r) => s + r.n, 0);
      if (!tot) return '';
      return d.dashboard.sentimentDist.map((r) => `${r.sentiment}: ${r.n} (${pct(r.n, tot)})`).join('\n');
    }
    case 'topics':
      return d.dashboard.topTopics.slice(0, 12).map((t) => `tema "${t.topic}": ${Number(t.n)} mention`).join('\n');
    case 'emotions':
      return d.emotions.map((e) => `emozione ${e.emotion}: ${e.value}`).join('\n');
    case 'momentum':
      return d.momentum.slice(0, 12).map((p) => `tema "${p.topic}": volume ${p.volume}, accelerazione ${p.acceleration}%, quadrante ${p.quadrant}`).join('\n');
    case 'flow': {
      const lbl = new Map(d.flow.nodes.map((n) => [n.key, n.label]));
      return [...d.flow.links].sort((a, b) => b.value - a.value).slice(0, 14)
        .map((l) => `${lbl.get(l.source) ?? l.source} -> ${lbl.get(l.target) ?? l.target}: ${l.value}`).join('\n');
    }
    case 'constellation': {
      const terms = d.constellation.nodes.slice(0, 14).map((n) => `termine "${n.term}": ${n.freq}`);
      const edges = d.constellation.edges.slice(0, 8).map((e) => `co-occorrenza ${e.a} + ${e.b}: ${e.weight}`);
      return [...terms, ...edges].join('\n');
    }
    case 'geo':
      return d.geo.slice(0, 12).map((g) => `area ${g.country}: ${g.volume} mention (${g.share}%), sentiment ${g.sentiment === null ? 'n/d' : g.sentiment.toFixed(2)}`).join('\n');
    case 'crisis': {
      const pk = d.crisis.peak;
      if (!pk) return '';
      return [
        `rischio: ${d.crisis.risk}/100 (${d.crisis.level})`,
        ...d.crisis.drivers.map((x) => `driver ${x.label}: +${x.value}`),
        `giorno di picco ${pk.day}: ${pk.volume} mention, ${pk.negShare}% negative, sentiment ${pk.sentiment}`,
        ...pk.topics.map((t) => `tema del picco "${t.topic}": ${t.n}`),
      ].join('\n');
    }
    case 'benchmark': {
      const tot = d.benchmark.reduce((s, r) => s + r.total, 0);
      if (!tot) return '';
      return d.benchmark.map((r) => `${r.entity.name}: ${r.total} mention (${pct(r.total, tot)}), sentiment ${r.avgSentiment === null ? 'n/d' : r.avgSentiment.toFixed(2)}`).join('\n');
    }
    case 'sov': {
      if (!d.sov.entities.length) return '';
      const totals = d.sov.entities.map((e) => ({ e, n: d.sov.days.reduce((s, x) => s + Number(x[e] ?? 0), 0) }));
      const grand = totals.reduce((s, t) => s + t.n, 0);
      const half = Math.floor(d.sov.days.length / 2);
      return totals.sort((a, b) => b.n - a.n).map((t) => {
        const first = d.sov.days.slice(0, half).reduce((s, x) => s + Number(x[t.e] ?? 0), 0);
        const second = d.sov.days.slice(half).reduce((s, x) => s + Number(x[t.e] ?? 0), 0);
        return `${t.e}: ${t.n} mention (${pct(t.n, grand)}), prima metà periodo ${first} vs seconda metà ${second}`;
      }).join('\n');
    }
    case 'audience': {
      const lines = d.audience.communities.slice(0, 10).map((c) => `community ${c.community ?? 'n/d'} su ${sourceLabel(c.source)}: ${c.n}`);
      lines.push(...d.audience.languages.slice(0, 8).map((l) => `lingua ${l.language}: ${l.n}`));
      return lines.join('\n');
    }
    case 'network':
      return [...d.network.nodes].sort((a, b) => b.engagement - a.engagement).slice(0, 12)
        .map((n) => `autore ${n.label} (${n.community}): ${n.posts} post, engagement ${n.engagement}`).join('\n');
    case 'pyramid':
      return [
        `il livello più alto concentra il ${d.pyramid.topConcentration}% della reach`,
        ...d.pyramid.tiers.map((t) => `livello ${t.label}: ${t.authors} autori, ${t.sharePct}% della reach`),
      ].join('\n');
    case 'content':
      return d.ratings.slice(0, 10)
        .map((r) => `[${sourceLabel(r.source)}] engagement ${Math.round(r.engagementScore)} — ${(r.title || r.content).slice(0, 90)}`).join('\n');
    case 'pov': {
      const p = d.pov.pov;
      if (!p) return '';
      return [p.headline, ...p.blocks.map((b) => `${b.title}: ${b.stats.map((s) => `${s.value} ${s.label}`).join(', ')}`)].join('\n');
    }
    case 'narratives':
      return d.narratives.slice(0, 8).map((n) => `narrazione "${n.title}" (${n.stance ?? 'neutral'}${n.coordinated ? ', coordinata' : ''}): ${n.mentionCount} post`).join('\n');
    case 'timeline':
      return d.timeline.slice(0, 12).map((e) => `${new Date(e.eventDate).toLocaleDateString('it-IT')}: ${e.title}`).join('\n');
    case 'alerts':
      return d.alerts.slice(0, 10).map((a) => `[${a.severity}] ${a.message}`).join('\n');
    case 'brief':
      return d.briefs[0] ? d.briefs[0].content.slice(0, 2500) : '';
    case 'mentions':
      return `${d.allMentions.length} mention nel periodo, dalla più recente del ${d.allMentions[0] ? new Date(d.allMentions[0].publishedAt).toLocaleDateString('it-IT') : 'n/d'}`;
    default:
      return '';
  }
}

const SYSTEM = `Sei un analista di media intelligence. Ricevi le CIFRE già calcolate di uno o più grafici di un report.
Per ogni grafico scrivi un commento da inserire nel report, in 2-4 frasi:
- parti da ciò che il grafico mostra davvero, citando i numeri che ti sono stati dati;
- di' che cosa significa per chi legge (implicazione), non limitarti a ripetere la classifica;
- segnala l'eventuale anomalia o il dato controintuitivo, se c'è.
Vincoli assoluti:
- NON inventare cifre, percentuali, date o nomi che non compaiono nei dati ricevuti;
- niente formule di apertura tipo "questo grafico mostra", entra subito nel merito;
- niente elenchi puntati, niente markdown: prosa continua.
Rispondi SOLO con un oggetto JSON { "id_sezione": "commento", ... } usando esattamente gli id ricevuti.`;

/** Estrae il primo oggetto JSON dalla risposta. */
function parseObject(text: string | null): Record<string, string> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj)) if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    return out;
  } catch (e) {
    console.warn('[report] commento AI non interpretabile:', (e as Error).message, cleaned.slice(-160));
    return null;
  }
}

/**
 * Un commento per ciascuna sezione richiesta, in una sola chiamata: dieci
 * grafici commentati costano una richiesta, non dieci.
 * Le sezioni senza dati non vengono nemmeno inviate al modello.
 */
export async function generateComments(
  data: ExportData, sections: SectionId[],
): Promise<{ comments: Record<string, string>; empty: SectionId[]; available: boolean }> {
  const empty: SectionId[] = [];
  const parts: string[] = [];
  for (const id of sections) {
    const facts = sectionFacts(data, id);
    if (!facts.trim()) { empty.push(id); continue; }
    parts.push(`### ${id} — ${SECTION_LABEL.get(id) ?? id}\n${facts}`);
  }
  if (!parts.length) return { comments: {}, empty, available: true };

  const user = `Progetto: ${data.project.name}\nTema seguito: ${data.project.keywords.join(', ')}\n\n${parts.join('\n\n')}`;
  const text = await callClaude(MODELS.sonnet, 'report-comment', SYSTEM, user, 2000, true);
  if (text === null) return { comments: {}, empty, available: false };
  return { comments: parseObject(text) ?? {}, empty, available: true };
}
