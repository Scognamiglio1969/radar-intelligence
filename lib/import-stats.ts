import { asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { importRows } from '@/lib/db/schema';
import { parseDateTime, parseNumber } from '@/lib/import-normalize';

// ---------------------------------------------------------------------------
// Quello che un analista guarda davvero.
//
// Un nome di colonna e tre valori di esempio dicono poco: "Follower" può essere
// il totale che uno ha oggi o quanti ne ha guadagnati questo mese, e le due
// cose si sommano in modi opposti. La differenza non sta nel nome — sta nei
// numeri: un totale non scende mai, un incremento sì.
//
// Qui si calcola quella evidenza, dalle righe che sono già in archivio. È
// deterministica e verificabile, e serve a due cose:
//
//   1. dare al modello qualcosa su cui ragionare invece che un nome da
//      interpretare — è la differenza fra un parere e una lettura;
//   2. accorgersi da soli delle trappole classiche dei fogli fatti a mano: la
//      riga dei totali in fondo, la colonna che è un identificativo, la data
//      che in metà righe è testo.
// ---------------------------------------------------------------------------

export type ColumnStats = {
  name: string;
  /** Che cosa contiene: numeri, date, testo, o un misto. */
  reads: 'number' | 'date' | 'text' | 'mixed' | 'empty';
  filled: number;
  distinct: number;
  /**
   * Tutti i valori presenti sono diversi fra loro.
   *
   * È un fatto, non una conclusione: anche "Mi piace" ha sessanta valori
   * diversi su sessanta post, e non è affatto una chiave. La differenza la fa
   * il tipo, ed è per questo che la chiave del foglio si sceglie a parte.
   *
   * Si tollera qualche riga vuota, perché la riga dei totali in fondo lascia
   * l'identificativo in bianco — ed è proprio nei fogli fatti a mano che
   * riconoscere una colonna di ID conta di più.
   */
  unique: boolean;
  /** Sempre lo stesso valore: nel foglio non aggiunge niente, ma dice qualcosa. */
  constant: string | null;
  /** Numeri: gli estremi e il centro. */
  min?: number;
  max?: number;
  median?: number;
  /** Quanti zeri: distinguere "zero" da "vuoto" cambia ogni media. */
  zeros?: number;
  /**
   * Nell'ordine in cui sono scritte le righe i valori non calano mai.
   *
   * Su una serie storica è il segno di un totale cumulato — i follower che
   * uno HA, non quelli che ha guadagnato. Su un elenco ordinato per data può
   * essere una coincidenza: è un indizio, non una conclusione.
   */
  monotonic?: boolean;
  /** Sta fra 0 e 1, o fra 0 e 100 con decimali: è un tasso, non un conteggio. */
  looksLikeRate?: boolean;
  /** Date: da quando a quando, e ogni quanto. */
  from?: string;
  to?: string;
  cadence?: 'giornaliera' | 'mensile' | 'irregolare';
  /** Testo: quanto è lungo in media. */
  avgLength?: number;
  samples: string[];
  /**
   * I valori distinti, fino a un tetto.
   *
   * Servono a una domanda che nessuna statistica di colonna può porre da sola:
   * questi due fogli parlano delle STESSE cose? Otto nomi di manager che
   * ricorrono in due tabelle diverse dicono che le due tabelle si possono
   * mettere in relazione — ed è la prima cosa che si chiede chi ha davanti
   * più tabelle.
   */
  values?: string[];
};

export type SheetStats = {
  rows: number;
  columns: ColumnStats[];
  /** La colonna che identifica la riga, se esiste. */
  key: string | null;
  /** L'ultima riga sembra la somma delle altre: nei fogli fatti a mano capita. */
  totalRow: { rowIndex: number; evidence: string } | null;
  /** Righe identiche fra loro. */
  duplicates: number;
};

const isBlank = (v: unknown) => v === null || v === undefined || String(v).trim() === '';

/**
 * Il valore è un numero, oppure no.
 *
 * parseNumber risponde sempre — restituisce 0 su quello che non capisce, ed è
 * la scelta giusta quando si importa una colonna che si SA essere numerica.
 * Qui invece la domanda è un'altra: "questa colonna è fatta di numeri?". Con
 * uno zero al posto di un rifiuto ogni colonna di testo diventerebbe una
 * colonna di zeri, e le statistiche direbbero il falso.
 */
function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (isBlank(v)) return null;
  const s = String(v).trim();
  // Cifre, separatori, segno, percentuale e i suffissi di scala.
  if (!/^[+-]?[\d.,\s]*\d[\d.,\s]*\s*(%|k|m|mln|mila)?$/i.test(s)) return null;
  const n = parseNumber(s);
  return Number.isFinite(n) ? n : null;
}

function median(nums: number[]): number {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Ogni quanto arrivano le date: giorno per giorno, mese per mese, o a caso. */
function cadenceOf(dates: Date[]): ColumnStats['cadence'] {
  if (dates.length < 3) return 'irregolare';
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length && gaps.length < 200; i++) {
    const g = (sorted[i].getTime() - sorted[i - 1].getTime()) / 86400_000;
    if (g > 0) gaps.push(g);
  }
  if (!gaps.length) return 'irregolare';
  const med = median(gaps);
  if (med <= 1.5) return 'giornaliera';
  if (med >= 26 && med <= 32) return 'mensile';
  return 'irregolare';
}

/**
 * Le statistiche di un foglio, dalle righe grezze già in archivio.
 *
 * Si campiona: su un foglio da centomila righe le prime duemila dicono già
 * tutto quello che serve a capire di che cosa è fatto, e leggerle tutte
 * costerebbe minuti per una domanda a cui si risponde in un secondo.
 */
export async function sheetStats(fileId: number, sample = 2000): Promise<SheetStats> {
  const db = await getDb();
  const raw = await db.select({ data: importRows.data }).from(importRows)
    .where(eq(importRows.fileId, fileId)).orderBy(asc(importRows.rowIndex)).limit(sample);
  const rows = raw.map((r) => r.data as Record<string, unknown>);
  if (!rows.length) return { rows: 0, columns: [], key: null, totalRow: null, duplicates: 0 };

  const names = Object.keys(rows[0]);
  const columns: ColumnStats[] = names.map((name) => {
    const values = rows.map((r) => r[name]);
    const filled = values.filter((v) => !isBlank(v)).length;
    const present = values.filter((v) => !isBlank(v));
    const distinct = new Set(present.map((v) => String(v).trim())).size;

    const nums: number[] = [];
    const dates: Date[] = [];
    let textLen = 0, texts = 0;
    for (const v of present) {
      const n = asNumber(v);
      if (n !== null) { nums.push(n); continue; }
      const d = parseDateTime(v);
      if (d) { dates.push(d); continue; }
      texts++; textLen += String(v).length;
    }

    const total = present.length || 1;
    const reads: ColumnStats['reads'] = present.length === 0 ? 'empty'
      : nums.length / total > 0.8 ? 'number'
        : dates.length / total > 0.8 ? 'date'
          : texts / total > 0.8 ? 'text' : 'mixed';

    const stats: ColumnStats = {
      name,
      reads,
      filled: Math.round((filled / rows.length) * 100),
      distinct,
      unique: distinct > 1 && distinct === filled && filled >= rows.length * 0.9,
      constant: distinct === 1 ? String(present[0]).slice(0, 60) : null,
      samples: present.slice(0, 3).map((v) => String(v).slice(0, 80)),
    };

    // Le etichette si raccolgono, i testi lunghi e i numeri no: confrontare
    // sessanta post fra loro non dice niente, confrontare otto nomi sì.
    if ((reads === 'text' || reads === 'mixed') && distinct > 1 && distinct <= 200) {
      const set = new Set<string>();
      for (const v of present) {
        const t = String(v).trim();
        if (t.length <= 60) set.add(t);
        if (set.size >= 200) break;
      }
      if (set.size > 1) stats.values = [...set];
    }

    if (reads === 'number' && nums.length) {
      stats.min = Math.min(...nums);
      stats.max = Math.max(...nums);
      stats.median = Math.round(median(nums) * 100) / 100;
      stats.zeros = nums.filter((n) => n === 0).length;
      stats.monotonic = nums.length > 3 && nums.every((n, i) => i === 0 || n >= nums[i - 1]);
      const frac = nums.some((n) => !Number.isInteger(n));
      stats.looksLikeRate = frac && ((stats.max <= 1 && stats.min >= 0) || (stats.max <= 100 && stats.min >= 0));
    }
    if (reads === 'date' && dates.length) {
      const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
      stats.from = sorted[0].toISOString().slice(0, 10);
      stats.to = sorted[sorted.length - 1].toISOString().slice(0, 10);
      stats.cadence = cadenceOf(dates);
    }
    if (texts) stats.avgLength = Math.round(textLen / texts);
    return stats;
  });

  // La riga dei totali: ultima riga, con i numeri molto più grandi del resto e
  // le colonne di testo vuote. In un foglio fatto a mano è normale; importata
  // come dato raddoppia ogni somma.
  let totalRow: SheetStats['totalRow'] = null;
  if (rows.length > 4) {
    const last = rows[rows.length - 1];
    const numCols = columns.filter((c) => c.reads === 'number' && c.median);
    const big = numCols.filter((c) => {
      const v = asNumber(last[c.name]);
      return v !== null && c.median! > 0 && v > c.median! * (rows.length / 3);
    });
    const textEmpty = columns.filter((c) => c.reads === 'text' && isBlank(last[c.name]));
    if (numCols.length >= 2 && big.length >= Math.ceil(numCols.length * 0.6)) {
      totalRow = {
        rowIndex: rows.length - 1,
        evidence: `l'ultima riga ha ${big.length} valori molto più grandi della mediana`
          + (textEmpty.length ? ` e ${textEmpty.length} colonne di testo vuote` : ''),
      };
    }
  }

  const seen = new Set<string>();
  let duplicates = 0;
  for (const r of rows) {
    const k = JSON.stringify(r);
    if (seen.has(k)) duplicates++; else seen.add(k);
  }

  // La chiave si cerca fra le colonne che possono esserlo: un testo o un
  // identificativo. Una misura con tutti i valori diversi resta una misura —
  // chiamarla chiave manderebbe l'analisi in una direzione sbagliata.
  const key = columns.find((c) => c.unique && (c.reads === 'text' || c.reads === 'mixed'))?.name
    ?? null;

  return { rows: rows.length, columns, key, totalRow, duplicates };
}
