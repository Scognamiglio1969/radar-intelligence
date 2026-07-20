// Unica fonte di verità delle sezioni esportabili: la usano SIA il configuratore
// (client, components/export-bar.tsx) SIA i renderer (server, lib/export-data.ts
// e app/api/export/*). Nessun import: così può stare nel bundle client senza
// trascinarsi dietro il codice server. Aggiungere una sezione qui la rende
// disponibile in tutti e quattro i formati e nel selettore, senza disallineamenti.

export type ExportSection = { id: string; label: string; group: string };

export const EXPORT_SECTIONS = [
  // Overview — il colpo d'occhio del progetto
  { id: 'kpi', label: 'Summary (KPIs)', group: 'Overview' },
  { id: 'health', label: 'Brand Health Index', group: 'Overview' },
  { id: 'trends', label: 'Emerging trends', group: 'Overview' },
  { id: 'volume', label: 'Volume by source', group: 'Overview' },
  { id: 'sentiment', label: 'Sentiment', group: 'Overview' },
  { id: 'topics', label: 'Top topics', group: 'Overview' },
  // Deep analysis — le analisi avanzate
  { id: 'emotions', label: 'Emotion radar', group: 'Deep analysis' },
  { id: 'momentum', label: 'Momentum quadrant', group: 'Deep analysis' },
  { id: 'flow', label: 'Conversation flow', group: 'Deep analysis' },
  { id: 'constellation', label: 'Semantic constellation', group: 'Deep analysis' },
  { id: 'geo', label: 'Geographic map', group: 'Deep analysis' },
  { id: 'crisis', label: 'Crisis radar & peak', group: 'Deep analysis' },
  // Benchmark & audience — confronti e chi parla
  { id: 'benchmark', label: 'Benchmark', group: 'Benchmark & audience' },
  { id: 'sov', label: 'Share of Voice over time', group: 'Benchmark & audience' },
  { id: 'audience', label: 'Audience', group: 'Benchmark & audience' },
  { id: 'network', label: 'Influencer network', group: 'Benchmark & audience' },
  { id: 'pyramid', label: 'Author pyramid', group: 'Benchmark & audience' },
  // Intelligence — narrazione e sintesi
  { id: 'narratives', label: 'Narratives', group: 'Intelligence' },
  { id: 'timeline', label: 'Event timeline', group: 'Intelligence' },
  { id: 'alerts', label: 'Alerts', group: 'Intelligence' },
  { id: 'brief', label: 'Daily brief', group: 'Intelligence' },
  // Raw data — dati grezzi
  { id: 'content', label: 'Top content', group: 'Raw data' },
  { id: 'mentions', label: 'Mentions list', group: 'Raw data' },
] as const satisfies readonly ExportSection[];

export type SectionId = (typeof EXPORT_SECTIONS)[number]['id'];
export const ALL_SECTION_IDS = EXPORT_SECTIONS.map((s) => s.id) as SectionId[];

/** Ordine dei gruppi per il selettore. */
export const SECTION_GROUPS = [
  'Overview', 'Deep analysis', 'Benchmark & audience', 'Intelligence', 'Raw data',
] as const;
