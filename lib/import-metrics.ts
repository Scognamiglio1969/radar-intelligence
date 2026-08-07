import { parseDateTime, parseNumber, cleanText } from '@/lib/import-normalize';
import type { ColumnProfile } from '@/lib/import-profile';

// ---------------------------------------------------------------------------
// Da foglio di aggregati a serie di metriche.
//
// I database veri non contengono solo post. Contengono tabelle di misure:
// follower per piattaforma e per mese, pubblicazioni per canale, engagement
// medio per manager, quote di audience per azienda o per ruolo. Non hanno un
// testo né un autore: non sono mention.
//
// Qualunque forma abbiano — larga (una colonna per entità) o lunga (una riga
// per entità) — si riducono tutte allo stesso punto minimo:
//
//     chi (entity) · che cosa (metric) · quando (date) · quanto (value) · come (dims)
//
// È questa riduzione che permette di caricare file mai visti prima senza
// pretendere che abbiano un formato deciso in anticipo.
// ---------------------------------------------------------------------------

export type MetricMap = {
  /** Colonna della data. Obbligatoria: una serie senza tempo non è una serie. */
  date: string;
  /** Colonna che dice CHI. Assente = l'entità è il foglio stesso. */
  entity?: string;
  /** Colonne dei valori: ognuna diventa una serie col nome della colonna. */
  metrics: string[];
  /** Colonne che qualificano il punto: canale, pillar, azienda, ruolo. */
  dims?: string[];
  /** Nome dell'entità quando non c'è una colonna che la dica (default: il foglio). */
  entityLabel?: string;
};

export type MetricPoint = {
  entity: string;
  metric: string;
  date: Date;
  value: number;
  dims: Record<string, string>;
};

export type MetricReport = {
  rows: number;
  points: number;
  /** Righe saltate perché la data non era leggibile nemmeno a cascata. */
  datesFailed: number;
  /** Celle vuote o non numeriche: normali in una matrice sparsa. */
  emptyValues: number;
  metrics: string[];
  entities: number;
  from: string | null;
  to: string | null;
};

/**
 * Una percentuale scritta come 0,16 vale 16%: va tenuta com'è, perché è il
 * foglio a decidere l'unità. Qui si normalizza solo ciò che è ambiguo per il
 * PARSER, non ciò che è ambiguo per l'analista.
 */
function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return null;
  const s = String(v).trim();
  if (!s || /^[a-z\s]+$/i.test(s)) return null;      // "Totale", "n/d", "-"
  const n = parseNumber(s);
  return Number.isFinite(n) && (n !== 0 || /0/.test(s)) ? n : null;
}

/**
 * Trasforma le righe in punti.
 *
 * Due comportamenti nascono da come sono fatti i fogli veri:
 *  - la DATA si riempie a cascata. Nei blocchi di audience compare solo sulla
 *    prima riga del blocco e le successive la ereditano; senza questo si
 *    perderebbe tutto tranne la prima riga.
 *  - una cella vuota NON diventa uno zero. Zero e "non rilevato" sono cose
 *    diverse, e confonderle falsa ogni media.
 */
export function deriveMetrics(
  raw: Record<string, unknown>[], map: MetricMap, fallbackEntity: string,
): { points: MetricPoint[]; report: MetricReport } {
  const points: MetricPoint[] = [];
  const report: MetricReport = {
    rows: raw.length, points: 0, datesFailed: 0, emptyValues: 0,
    metrics: [], entities: 0, from: null, to: null,
  };
  const metrics = new Set<string>();
  const entities = new Set<string>();
  let lastDate: Date | null = null;
  let lastEntity = '';

  for (const row of raw) {
    const d = parseDateTime(row[map.date]);
    if (d) lastDate = d;
    const date = d ?? lastDate;
    if (!date) { report.datesFailed++; continue; }

    let entity = fallbackEntity;
    if (map.entity) {
      const e = cleanText(row[map.entity]);
      if (e) lastEntity = e;
      entity = lastEntity || fallbackEntity;
    }

    const dims: Record<string, string> = {};
    for (const dim of map.dims ?? []) {
      const v = cleanText(row[dim]);
      if (v) dims[dim] = v;
    }

    for (const col of map.metrics) {
      const value = toNumber(row[col]);
      if (value === null) { report.emptyValues++; continue; }
      points.push({ entity, metric: col, date, value, dims });
      metrics.add(col);
      entities.add(entity);
    }
  }

  points.sort((a, b) => a.date.getTime() - b.date.getTime());
  report.points = points.length;
  report.metrics = [...metrics];
  report.entities = entities.size;
  report.from = points[0]?.date.toISOString().slice(0, 10) ?? null;
  report.to = points[points.length - 1]?.date.toISOString().slice(0, 10) ?? null;
  return { points, report };
}

// --- Riconoscimento: questo foglio è fatto di misure o di post? -------------

const TEXT_HINT = /(testo|text|copy|descri|content|messaggio|post|titolo|title|caption|commento sui dati)/i;
const DATE_HINT = /(data|date|mese|month|giorno|day|periodo|anno)/i;
const ID_HINT = /^(id|count|n\.?|number|rank|ranking|progr)/i;

/**
 * Un foglio è di METRICHE quando non ha niente da leggere e molto da contare:
 * nessuna colonna di testo lungo, una data, e più colonne numeriche.
 *
 * È la distinzione che evita l'errore peggiore — trattare una tabella di
 * follower mensili come se fossero post, ottenendo 36 "mention" senza testo.
 */
export function looksLikeMetrics(profiles: ColumnProfile[], rowCount: number): boolean {
  const hasLongText = profiles.some((p) =>
    p.kind === 'text' && p.avgLength >= 40 && p.distinct > Math.max(3, rowCount * 0.5));
  if (hasLongText) return false;
  const hasDate = profiles.some((p) => p.kind === 'date' || DATE_HINT.test(p.name));
  const numeric = profiles.filter((p) => p.kind === 'number' && !ID_HINT.test(p.name.trim()));
  return hasDate && numeric.length >= 2;
}

/** Proposta di mappatura per un foglio di metriche, dai soli profili. */
export function proposeMetricMap(all: ColumnProfile[]): MetricMap | null {
  const byName = (re: RegExp) => all.find((p) => re.test(p.name));
  // La data: si preferisce una colonna davvero di tipo data, poi il nome.
  const date = all.find((p) => p.kind === 'date')
    ?? byName(/^(data|date|mese anno|mese|month|periodo)$/i)
    ?? byName(DATE_HINT);
  if (!date) return null;

  // Fogli a BLOCCHI affiancati: dopo la fusione dell'intestazione doppia i nomi
  // portano il prefisso del blocco ("DATI COMPANY · %"). Blocchi diversi sono
  // tabelle diverse messe l'una accanto all'altra: proporre una mappatura che
  // le mescola darebbe un grafico che somma mele e pere. Ci si limita al blocco
  // della colonna data, e gli altri restano a disposizione dell'utente.
  const block = date.name.includes(' · ') ? date.name.split(' · ')[0] : null;
  const profiles = block ? all.filter((p) => p.name.startsWith(`${block} · `)) : all;

  // L'entità: una colonna testuale con pochi valori distinti e un nome che
  // parla di chi ("Manager", "Canale", "Brand", "Azienda").
  const entity = profiles.find((p) =>
    p.kind === 'text' && p.distinct <= 60
    && /(manager|canale|channel|brand|account|profilo|entit|azienda|company|piattaforma|platform|nome)/i.test(p.name));

  const isMeta = (p: ColumnProfile) =>
    p === date || p === entity || ID_HINT.test(p.name.trim())
    || /^(mese|anno|month|year|giorno|day|mese #|mese anno|progessione mese)$/i.test(p.name.trim());

  const metrics = profiles.filter((p) => p.kind === 'number' && !isMeta(p)).map((p) => p.name);
  // Le dimensioni: il resto del testo, purché non sia un testo lungo.
  const dims = profiles
    .filter((p) => p !== entity && p.kind === 'text' && p.distinct <= 80 && p.avgLength < 60 && !TEXT_HINT.test(p.name))
    .map((p) => p.name);

  if (!metrics.length) return null;
  return { date: date.name, entity: entity?.name, metrics, dims };
}
