import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { studioCharts } from '@/lib/db/schema';
import { sourceLabel } from '@/lib/source-label';
import { PALETTES, type PaletteId } from '@/lib/entity-colors';
import type { StudioRendered } from '@/lib/report-pdf';

// ---------------------------------------------------------------------------
// Studio Graph: costruire un grafico scegliendo i campi.
//
// Radar ha due tipi di dato con forme diverse — le MENTION (righe con un testo
// e delle metriche) e le MISURE (serie chi/che cosa/quando/quanto). Qui
// vengono presentate come un unico catalogo di campi, divisi in DIMENSIONI
// (come tagliare) e MISURE (che cosa contare), così la scelta si fa nel
// linguaggio della domanda e non in quello delle tabelle.
//
// Nessun campo arriva dal client come frammento di SQL: si sceglie da un
// elenco chiuso, e il server traduce l'id in espressione. È l'unica difesa
// seria contro un'iniezione, e vale anche a proteggere l'utente da sé stesso.
// ---------------------------------------------------------------------------

export type StudioSource = 'mentions' | 'metrics';

export type ChartKind = 'line' | 'area' | 'bar' | 'hbar' | 'scatter' | 'bubble' | 'pie';

export type Aggregation = 'count' | 'sum' | 'avg' | 'max' | 'min' | 'last';

export type Field = {
  id: string;
  label: string;
  /** dimension = come tagliare · measure = che cosa contare */
  role: 'dimension' | 'measure';
  /** Note per l'utente: cosa contiene, quando ha senso usarlo. */
  hint?: string;
  /** Quanti valori distinti: una dimensione con 3.000 valori non è leggibile. */
  distinct?: number;
};

export type StudioSpec = {
  source: StudioSource;
  chart: ChartKind;
  /** Asse X: la dimensione lungo cui si dispone il grafico. */
  x: string;
  /** Asse Y: la misura, con la sua aggregazione. */
  y: string;
  yAgg: Aggregation;
  /** Asse Z: una seconda dimensione (serie/colore) o una seconda misura (dimensione della bolla). */
  z?: string;
  zAgg?: Aggregation;
  days: number;
  limit: number;
  palette: string;
};

export type StudioResult = {
  /** Righe già pronte per il grafico: x, valore, e la serie di appartenenza. */
  rows: { x: string; y: number; z?: string; size?: number }[];
  /** I nomi delle serie, nell'ordine in cui prendono i colori. */
  series: string[];
  xLabel: string;
  yLabel: string;
  zLabel?: string;
  total: number;
  /** Avvertenze oneste sulla combinazione scelta. */
  warnings: string[];
};

// --- Il catalogo -----------------------------------------------------------

const MENTION_DIMENSIONS: Field[] = [
  { id: 'day', label: 'Giorno', role: 'dimension', hint: 'la data di pubblicazione, giorno per giorno' },
  { id: 'week', label: 'Settimana', role: 'dimension', hint: 'aggrega per settimana: meno rumore del giorno' },
  { id: 'month', label: 'Mese', role: 'dimension', hint: 'aggrega per mese: la vista da lontano' },
  { id: 'hour', label: 'Ora del giorno', role: 'dimension', hint: 'da 0 a 23: quando esce e quando funziona' },
  { id: 'weekday', label: 'Giorno della settimana', role: 'dimension', hint: 'lunedì…domenica' },
  { id: 'source', label: 'Fonte', role: 'dimension', hint: 'la piattaforma o la testata' },
  { id: 'author', label: 'Autore', role: 'dimension' },
  { id: 'community', label: 'Community', role: 'dimension' },
  { id: 'language', label: 'Lingua', role: 'dimension' },
  { id: 'sentiment', label: 'Sentiment', role: 'dimension', hint: 'positivo / neutro / negativo' },
  { id: 'emotion', label: 'Emozione', role: 'dimension' },
  { id: 'kind', label: 'Tipo', role: 'dimension', hint: 'articolo o post' },
];

const MENTION_MEASURES: Field[] = [
  { id: 'count', label: 'Numero di contenuti', role: 'measure', hint: 'quante righe: la misura più solida, c’è sempre' },
  { id: 'engagement_score', label: 'Engagement', role: 'measure', hint: 'like + 2×commenti + 3×condivisioni + viste/200' },
  { id: 'reach', label: 'Reach', role: 'measure' },
  { id: 'likes', label: 'Like', role: 'measure' },
  { id: 'comments', label: 'Commenti', role: 'measure' },
  { id: 'shares', label: 'Condivisioni', role: 'measure' },
  { id: 'views', label: 'Visualizzazioni', role: 'measure' },
  { id: 'sentiment_score', label: 'Punteggio sentiment', role: 'measure', hint: 'da -1 a +1: da mediare, non da sommare' },
];

const METRIC_DIMENSIONS: Field[] = [
  { id: 'day', label: 'Giorno', role: 'dimension' },
  { id: 'month', label: 'Mese', role: 'dimension' },
  { id: 'entity', label: 'Entità', role: 'dimension', hint: 'chi: un canale, un manager, un brand' },
  { id: 'metric', label: 'Metrica', role: 'dimension', hint: 'che cosa: follower, impression, engagement…' },
];

const METRIC_MEASURES: Field[] = [
  { id: 'value', label: 'Valore', role: 'measure', hint: 'il numero della misura' },
  { id: 'count', label: 'Numero di rilevazioni', role: 'measure' },
];

/**
 * Il catalogo REALE del progetto: alle dimensioni fisse si aggiungono i campi
 * conservati dagli Excel (pillar, campagna, area semantica) e le dimensioni
 * delle misure. Offrire un campo che il progetto non ha significa costruire un
 * grafico vuoto e non capire perché.
 */
export async function studioFields(projectId: number, source: StudioSource): Promise<Field[]> {
  const db = await getDb();

  if (source === 'metrics') {
    const dims = await db.execute(sql`
      select distinct jsonb_object_keys(dims) as k from metric_points where project_id = ${projectId}
    `);
    const extra: Field[] = (dims.rows as { k: string }[])
      .filter((r) => r.k)
      .map((r) => ({ id: `dim:${r.k}`, label: r.k, role: 'dimension' as const, hint: 'dimensione del foglio importato' }));
    return [...METRIC_DIMENSIONS, ...extra, ...METRIC_MEASURES];
  }

  const custom = await db.execute(sql`
    select distinct jsonb_object_keys(custom) as k from mentions
    where project_id = ${projectId} and custom is not null
  `);
  const extra: Field[] = (custom.rows as { k: string }[])
    .filter((r) => r.k)
    .map((r) => ({ id: `custom:${r.k}`, label: r.k, role: 'dimension' as const, hint: 'campo conservato dal file importato' }));

  return [...MENTION_DIMENSIONS, ...extra, ...MENTION_MEASURES];
}

// --- Dalla scelta all'SQL --------------------------------------------------

/** L'espressione di una DIMENSIONE. Solo id noti: niente SQL dal client. */
function dimExpr(source: StudioSource, id: string) {
  if (id.startsWith('custom:')) return sql`custom ->> ${id.slice(7)}`;
  if (id.startsWith('dim:')) return sql`dims ->> ${id.slice(4)}`;
  const dateCol = source === 'mentions' ? sql`published_at` : sql`date`;
  switch (id) {
    case 'day': return sql`to_char(${dateCol}, 'YYYY-MM-DD')`;
    case 'week': return sql`to_char(date_trunc('week', ${dateCol}), 'YYYY-MM-DD')`;
    case 'month': return sql`to_char(date_trunc('month', ${dateCol}), 'YYYY-MM')`;
    case 'hour': return sql`lpad(extract(hour from ${dateCol})::text, 2, '0')`;
    case 'weekday': return sql`trim(to_char(${dateCol}, 'Day'))`;
    case 'source': return sql`source`;
    case 'author': return sql`author`;
    case 'community': return sql`community`;
    case 'language': return sql`language`;
    case 'sentiment': return sql`sentiment`;
    case 'emotion': return sql`emotion`;
    case 'kind': return sql`kind`;
    case 'entity': return sql`entity`;
    case 'metric': return sql`metric`;
    default: return null;
  }
}

/** L'espressione di una MISURA, già aggregata. */
function measureExpr(source: StudioSource, id: string, agg: Aggregation) {
  if (id === 'count') return sql`count(*)::float`;
  const col = source === 'metrics'
    ? (id === 'value' ? sql`value` : null)
    : id === 'engagement_score' ? sql`engagement_score`
      : id === 'reach' ? sql`reach::float`
        : id === 'sentiment_score' ? sql`sentiment_score`
          : ['likes', 'comments', 'shares', 'views'].includes(id)
            ? sql`(engagement ->> ${id})::float`
            : null;
  if (!col) return null;
  switch (agg) {
    case 'avg': return sql`avg(${col})`;
    case 'max': return sql`max(${col})`;
    case 'min': return sql`min(${col})`;
    case 'last': return sql`(array_agg(${col} order by ${source === 'mentions' ? sql`published_at` : sql`date`} desc))[1]`;
    default: return sql`sum(${col})`;
  }
}

// Le etichette dipendono dalla SORGENTE: `count` sui contenuti è "Numero di
// contenuti", sulle misure è "Numero di rilevazioni". Con una mappa sola la
// seconda schiacciava la prima, e il titolo del grafico contraddiceva il
// campo appena scelto.
const LABELS: Record<StudioSource, Map<string, string>> = {
  mentions: new Map([...MENTION_DIMENSIONS, ...MENTION_MEASURES].map((f) => [f.id, f.label])),
  metrics: new Map([...METRIC_DIMENSIONS, ...METRIC_MEASURES].map((f) => [f.id, f.label])),
};

export function fieldLabel(source: StudioSource, id: string): string {
  if (id.startsWith('custom:')) return id.slice(7);
  if (id.startsWith('dim:')) return id.slice(4);
  return LABELS[source].get(id) ?? id;
}

/**
 * Avvertenze oneste sulla combinazione scelta.
 *
 * Non si impedisce niente — a volte una scelta insolita è quella giusta — ma
 * non si lascia nemmeno costruire in silenzio un grafico che mente.
 */
export function specWarnings(spec: StudioSpec, result: { series: string[]; rows: unknown[] }): string[] {
  const w: string[] = [];
  const isRate = /(rate|%|perc|medi|avg|score|punteggio)/i.test(fieldLabel(spec.source, spec.y));

  if (isRate && spec.yAgg === 'sum') {
    w.push(`"${fieldLabel(spec.source, spec.y)}" sembra una media o un tasso: sommarlo dà un numero senza significato. Meglio la media.`);
  }
  if (spec.chart === 'pie' && result.rows.length > 4) {
    w.push(`La torta con ${result.rows.length} fette si legge male: confrontare angoli è difficile. Con barre orizzontali si legge a colpo d’occhio.`);
  }
  if ((spec.chart === 'line' || spec.chart === 'area') && !/(day|week|month|hour)/.test(spec.x)) {
    w.push(`La linea suggerisce una continuità che "${fieldLabel(spec.source, spec.x)}" non ha: fra due categorie non c’è un percorso. Con le barre il confronto è corretto.`);
  }
  if (result.series.length > 8) {
    w.push(`${result.series.length} serie: oltre otto i colori non si distinguono più. Le minori vengono raccolte in "Altro".`);
  }
  return w;
}

/** Esegue la specifica e restituisce righe pronte per il grafico. */
export async function runStudio(projectId: number, spec: StudioSpec): Promise<StudioResult> {
  const db = await getDb();
  const table = spec.source === 'mentions' ? sql`mentions` : sql`metric_points`;
  const dateCol = spec.source === 'mentions' ? sql`published_at` : sql`date`;

  const x = dimExpr(spec.source, spec.x);
  const y = measureExpr(spec.source, spec.y, spec.yAgg);
  if (!x || !y) throw new Error('Campi non validi per questa sorgente');

  // Z può essere una seconda dimensione (una serie per colore) oppure una
  // seconda misura (la dimensione della bolla): dipende dal tipo di grafico.
  const zIsSize = spec.chart === 'bubble';
  const z = spec.z ? (zIsSize
    ? measureExpr(spec.source, spec.z, spec.zAgg ?? 'sum')
    : dimExpr(spec.source, spec.z)) : null;

  const since = new Date(Date.now() - spec.days * 86400_000);
  const limit = Math.min(500, Math.max(1, spec.limit));

  // Il raggruppamento usa le POSIZIONI, non le espressioni: due parametri
  // distinti che portano lo stesso testo (`dims ->> $1` nella select e
  // `dims ->> $4` nel group by) per Postgres non sono la stessa cosa, e la
  // query fallisce con "column must appear in the GROUP BY clause".
  const rows = await db.execute(sql`
    select ${x} as x, ${y} as y ${z ? sql`, ${z} as z` : sql``}
    from ${table}
    where project_id = ${projectId} and ${dateCol} >= ${since.toISOString()}
      and ${x} is not null
    group by 1${z && !zIsSize ? sql`, 3` : sql``}
    order by ${/(day|week|month|hour)/.test(spec.x) ? sql`1 asc` : sql`2 desc`}
    limit ${limit}
  `);

  type Raw = { x: string; y: number; z?: string | number };
  const raw = (rows.rows as Raw[]).filter((r) => r.x !== null && r.y !== null);

  const out = raw.map((r) => ({
    x: String(r.x),
    y: Number(r.y),
    ...(z && !zIsSize ? { z: r.z === null || r.z === undefined ? '—' : String(r.z) } : {}),
    ...(z && zIsSize ? { size: Number(r.z ?? 0) } : {}),
  }));

  const series = z && !zIsSize
    ? [...new Set(out.map((r) => r.z as string))]
    : [fieldLabel(spec.source, spec.y)];

  // Le fonti si mostrano con il loro nome leggibile, non con lo slug tecnico.
  if (spec.x === 'source') for (const r of out) r.x = sourceLabel(r.x);
  if (spec.z === 'source') for (const r of out) if (r.z) r.z = sourceLabel(r.z);

  const result: StudioResult = {
    rows: out,
    series: spec.z === 'source' ? [...new Set(out.map((r) => r.z as string))] : series,
    xLabel: fieldLabel(spec.source, spec.x),
    yLabel: fieldLabel(spec.source, spec.y),
    zLabel: spec.z ? fieldLabel(spec.source, spec.z) : undefined,
    total: out.reduce((s, r) => s + r.y, 0),
    warnings: [],
  };
  result.warnings = specWarnings(spec, result);
  return result;
}

// ---------------------------------------------------------------------------
// Studio Graph dentro il report.
//
// Il report salva l'ID del grafico, non i suoi numeri: rigenerato fra un mese
// risponde con i dati di quel mese, come ogni altra sezione. Qui i grafici
// citati da una scaletta vengono eseguiti tutti insieme, prima di disegnare.
// ---------------------------------------------------------------------------

/** Esegue i grafici di Studio Graph citati da una scaletta di report. */
export async function resolveStudioBlocks(
  projectId: number,
  ids: number[],
): Promise<Map<number, StudioRendered>> {
  const out = new Map<number, StudioRendered>();
  const unique = [...new Set(ids)].filter((n) => Number.isFinite(n) && n > 0);
  if (!unique.length) return out;

  const db = await getDb();
  const charts = await db.select().from(studioCharts)
    .where(and(eq(studioCharts.projectId, projectId), inArray(studioCharts.id, unique)));

  for (const chart of charts) {
    const spec = chart.spec as unknown as StudioSpec;
    try {
      const res = await runStudio(projectId, spec);
      const paletteId = (spec.palette in PALETTES ? spec.palette : 'categorical') as PaletteId;
      out.set(chart.id, {
        title: chart.title,
        xLabel: res.xLabel,
        yLabel: res.yLabel,
        zLabel: res.zLabel,
        days: spec.days,
        palette: PALETTES[paletteId].colors,
        rows: res.rows.map((r) => ({ x: r.x, y: r.y, z: r.z })),
      });
    } catch {
      // Un grafico rotto (un campo personalizzato sparito dopo una
      // reimportazione) non deve far fallire l'intero PDF: la pagina lo dirà.
    }
  }
  return out;
}

/**
 * Le cifre di un grafico di Studio Graph, in righe brevi.
 *
 * È l'unica cosa che il modello vede quando deve commentarlo: gli stessi
 * numeri che il lettore ha davanti, mai le righe originali. Vale qui la regola
 * di tutto il report — i numeri vengono dal database, il modello scrive solo
 * la prosa.
 */
export function studioFacts(chart: StudioRendered): string {
  if (!chart.rows.length) return '';
  const n = (v: number) => (Number.isInteger(v) ? v.toLocaleString('it-IT')
    : v.toLocaleString('it-IT', { maximumFractionDigits: 2 }));

  const total = chart.rows.reduce((s, r) => s + r.y, 0);
  const lines = [
    `grafico "${chart.title}": ${chart.yLabel} per ${chart.xLabel}${chart.zLabel ? `, diviso per ${chart.zLabel}` : ''}`,
    `periodo del grafico: ultimi ${chart.days} giorni`,
    `totale: ${n(total)} su ${chart.rows.length} valori`,
  ];

  const series = [...new Set(chart.rows.map((r) => r.z).filter(Boolean))] as string[];
  if (series.length > 1) {
    // Con più serie contano i pesi relativi, non le singole celle.
    for (const z of series.slice(0, 8)) {
      const sum = chart.rows.filter((r) => r.z === z).reduce((s, r) => s + r.y, 0);
      lines.push(`serie "${z}": ${n(sum)} (${Math.round((sum / (total || 1)) * 100)}% del totale)`);
    }
  }

  // Le prime voci per valore, più gli estremi: bastano a scrivere un commento
  // onesto senza spedire al modello duecento righe.
  const byValue = [...chart.rows].sort((a, b) => b.y - a.y);
  for (const r of byValue.slice(0, 12)) {
    lines.push(`${r.x}${r.z ? ` · ${r.z}` : ''}: ${n(r.y)}`);
  }
  if (byValue.length > 12) {
    const last = byValue[byValue.length - 1];
    lines.push(`valore più basso — ${last.x}${last.z ? ` · ${last.z}` : ''}: ${n(last.y)}`);
  }
  return lines.join('\n');
}
