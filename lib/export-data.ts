import { and, desc, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { mentions } from '@/lib/db/schema';
import {
  audienceData, benchmarkData, briefList, contentData, dashboardData,
} from '@/lib/data';
import { getRecentAlerts } from '@/lib/alerts';
import { getTrends } from '@/lib/trends';
import { getNarratives } from '@/lib/narratives';
import { getTimeline } from '@/lib/timeline';
import { geoDistribution, emotionDistribution, brandHealthReport, momentumQuadrant, semanticConstellation, sovOverTime, conversationFlow, influencerNetwork, crisisAnatomy, authorPyramid } from '@/lib/insights';
import { SOURCE_META } from '@/lib/connectors';
import type { projects } from '@/lib/db/schema';

export type Project = typeof projects.$inferSelect;

// Le sezioni esportabili vivono in un modulo condiviso senza dipendenze server
// (lib/export-sections), così client e server usano la stessa lista.
export { EXPORT_SECTIONS, ALL_SECTION_IDS, type SectionId } from '@/lib/export-sections';
import { ALL_SECTION_IDS, type SectionId } from '@/lib/export-sections';

/** Legge ?sections=a,b,c (default: tutte) e ?days=N (default 30, cap 90). */
export function parseExportOptions(url: URL): { sections: Set<SectionId>; days: number } {
  const raw = url.searchParams.get('sections');
  const ids = raw
    ? raw.split(',').map((s) => s.trim()).filter((s): s is SectionId => ALL_SECTION_IDS.includes(s as SectionId))
    : ALL_SECTION_IDS;
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days')) || 30));
  return { sections: new Set(ids.length ? ids : ALL_SECTION_IDS), days };
}

/** Tutti i dati del progetto che finiscono negli export (Excel, Word, PPT, PDF). */
export async function collectExportData(project: Project, days = 30) {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000);

  const [dashboard, benchmark, audience, ratings, briefs, alerts, trends, narratives, timeline, geo, emotions, momentum, constellation, sov, flow, network, crisis, pyramid, allMentions] = await Promise.all([
    dashboardData(project.id),
    benchmarkData(project.id),
    audienceData(project.id),
    contentData(project.id),
    briefList(project.id),
    getRecentAlerts(project.id, 20),
    getTrends(project.id),
    getNarratives(project.id),
    getTimeline(project.id),
    geoDistribution(project.id, days),
    emotionDistribution(project.id, days),
    momentumQuadrant(project.id, 14),
    semanticConstellation(project.id, 14),
    sovOverTime(project.id, 30),
    conversationFlow(project.id, 14),
    influencerNetwork(project.id, 14),
    crisisAnatomy(project.id, 14),
    authorPyramid(project.id, 14),
    db.select().from(mentions)
      .where(and(eq(mentions.projectId, project.id), gte(mentions.publishedAt, since)))
      .orderBy(desc(mentions.publishedAt))
      .limit(3000),
  ]);
  const health = await brandHealthReport(project.id, 14);

  return { project, dashboard, benchmark, audience, ratings, briefs, alerts, trends, narratives, timeline, geo, emotions, momentum, constellation, sov, flow, network, crisis, pyramid, health, allMentions };
}

export type ExportData = Awaited<ReturnType<typeof collectExportData>>;

export function sourceLabel(id: string): string {
  return SOURCE_META[id]?.label ?? id;
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'progetto';
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Markdown del brief → blocchi semplici per Word/PPT/PDF. */
export function briefToBlocks(md: string): { type: 'h2' | 'bullet' | 'p'; text: string }[] {
  const clean = (s: string) => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim();
  const blocks: { type: 'h2' | 'bullet' | 'p'; text: string }[] = [];
  let headerSkipped = false;
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    // Righe separatore di tabella markdown (|---|---|) o orizzontali (---): scartale
    if (/^\|?\s*:?-{2,}.*$/.test(line.replace(/\|/g, '-')) || /^-{3,}$/.test(line)) continue;
    if (line.startsWith('##')) { blocks.push({ type: 'h2', text: clean(line.replace(/^#+\s*/, '')) }); continue; }
    if (line.startsWith('#')) { blocks.push({ type: 'h2', text: clean(line.replace(/^#+\s*/, '')) }); continue; }
    // Riga di tabella markdown → celle unite da " · " come punto elenco
    if (line.startsWith('|') && line.includes('|')) {
      const cells = line.split('|').map((c) => clean(c)).filter(Boolean);
      if (cells.length === 0) continue;
      // Salta la prima riga di intestazione della tabella
      if (!headerSkipped) { headerSkipped = true; continue; }
      blocks.push({ type: 'bullet', text: cells.join('  ·  ') });
      continue;
    }
    if (/^[-*•]\s+/.test(line)) blocks.push({ type: 'bullet', text: clean(line.replace(/^[-*•]\s+/, '')) });
    else blocks.push({ type: 'p', text: clean(line) });
  }
  return blocks;
}
