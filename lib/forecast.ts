import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

// ---------------------------------------------------------------------------
// Proiezione della conversazione — pura statistica, nessuna AI.
//
// Non è una previsione nel senso forte: è "se il ritmo recente continua,
// dove va a finire" — una retta ai minimi quadrati sui giorni passati,
// estesa in avanti su un orizzonte che non supera mai la metà della finestra
// usata per stimarla (estrapolare oltre significherebbe inventare). Il
// principio è lo stesso di tutto il resto dell'app: mai spacciare un calcolo
// per certezza. La fascia intorno alla proiezione viene dalla dispersione
// reale dei giorni passati, non da un numero a caso.
// ---------------------------------------------------------------------------

const TZ = 'Europe/Rome';

/** Regressione lineare ai minimi quadrati: y = intercept + slope*x. Ignora i punti null. */
function leastSquares(points: { x: number; y: number | null }[]): {
  slope: number; intercept: number; r2: number; n: number;
} {
  const pts = points.filter((p): p is { x: number; y: number } => p.y !== null);
  const n = pts.length;
  if (n < 2) return { slope: 0, intercept: pts[0]?.y ?? 0, r2: 0, n };

  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;

  const ssRes = pts.reduce((s, p) => s + (p.y - (intercept + slope * p.x)) ** 2, 0);
  const ssTot = pts.reduce((s, p) => s + (p.y - my) ** 2, 0);
  const r2 = ssTot === 0 ? (ssRes === 0 ? 1 : 0) : Math.max(0, 1 - ssRes / ssTot);

  return { slope, intercept, r2, n };
}

export type ForecastDay = { day: string; volume: number; negShare: number | null };
export type ProjectedDay = { day: string; volume: number; low: number; high: number };

export type ConversationForecast = {
  history: ForecastDay[];
  projected: ProjectedDay[];
  volumeTrend: 'rising' | 'falling' | 'flat';
  volumePctPerWeek: number;
  /** Quanto ci si può fidare della proiezione: poco dato o rumore alto → bassa. */
  confidence: 'low' | 'medium' | 'high';
  /**
   * Se la quota di negatività sta salendo in modo consistente e proietta di
   * superare la soglia entro l'orizzonte, la data stimata — altrimenti null.
   * È l'allerta precoce: non "è già una crisi" ma "lo starebbe diventando
   * di questo passo".
   */
  negShareWarning: { thresholdPct: number; etaDay: string } | null;
};

const NEG_THRESHOLD = 0.30;     // quota di negatività considerata un allarme
const MIN_DAILY_FOR_SIGNAL = 3; // sotto, un giorno è troppo rado per contare nel trend

export async function conversationForecast(
  projectId: number, days = 30, horizon = 7,
): Promise<ConversationForecast> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000);

  const rows = (await db.execute(sql`
    SELECT to_char(published_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day,
      count(*) AS n,
      count(*) FILTER (WHERE sentiment = 'negative') AS neg
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since.toISOString()}::timestamptz
    GROUP BY day
  `)).rows as { day: string; n: number; neg: number }[];

  const byDay = new Map(rows.map((r) => [r.day, { n: Number(r.n), neg: Number(r.neg) }]));

  // Serie COMPLETA, zeri inclusi: senza i giorni muti la retta si stima solo
  // sui giorni parlanti e il ritmo reale (fatto anche di silenzi) va perso.
  const history: ForecastDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toLocaleDateString('en-CA', { timeZone: TZ });
    const r = byDay.get(d);
    history.push({
      day: d,
      volume: r?.n ?? 0,
      negShare: r && r.n >= MIN_DAILY_FOR_SIGNAL ? r.neg / r.n : null,
    });
  }

  const volFit = leastSquares(history.map((h, i) => ({ x: i, y: h.volume })));
  const meanVol = history.reduce((s, h) => s + h.volume, 0) / history.length;

  const resid = history.map((h, i) => h.volume - (volFit.intercept + volFit.slope * i));
  const rmse = Math.sqrt(resid.reduce((s, r) => s + r ** 2, 0) / Math.max(1, resid.length));

  // Orizzonte tenuto a metà della finestra: estrapolare più lontano di quanto
  // si è osservato è dove una proiezione smette di essere onesta.
  const h = Math.min(horizon, Math.max(3, Math.floor(days / 2)));
  const projected: ProjectedDay[] = [];
  for (let i = 0; i < h; i++) {
    const x = history.length + i;
    const day = new Date(Date.now() + (i + 1) * 86400_000).toLocaleDateString('en-CA', { timeZone: TZ });
    const y = Math.max(0, volFit.intercept + volFit.slope * x);
    // Banda all'80%: abbastanza larga da essere onesta, non così larga da
    // essere inutile. Cresce leggermente con la distanza, come è ragionevole
    // aspettarsi da un'estrapolazione.
    const band = rmse * 1.28 * (1 + i * 0.06);
    projected.push({ day, volume: Math.round(y), low: Math.round(Math.max(0, y - band)), high: Math.round(y + band) });
  }

  const pctPerWeek = meanVol > 0 ? (volFit.slope * 7 / meanVol) * 100 : 0;
  const volumeTrend: ConversationForecast['volumeTrend'] =
    pctPerWeek > 15 ? 'rising' : pctPerWeek < -15 ? 'falling' : 'flat';

  // Fiducia nella proiezione: poco volume o rumore che sovrasta il segnale
  // rendono la retta poco più che un disegno.
  const signalToNoise = rmse > 0 ? Math.abs(volFit.slope) / rmse : 0;
  const daysWithSignal = history.filter((h2) => h2.volume >= MIN_DAILY_FOR_SIGNAL).length;
  const confidence: ConversationForecast['confidence'] =
    daysWithSignal < 10 || meanVol < 3 ? 'low'
      : volFit.r2 >= 0.35 || signalToNoise >= 0.5 || volumeTrend === 'flat' ? 'high'
        : 'medium';

  // Allerta precoce sulla negatività: retta sulla quota giornaliera, solo sui
  // giorni abbastanza parlanti da dire qualcosa.
  const negPts = history.map((hh, i) => ({ x: i, y: hh.negShare }));
  const negFit = leastSquares(negPts);
  const recentNeg = [...history].reverse().find((hh) => hh.negShare !== null)?.negShare ?? null;

  let negShareWarning: ConversationForecast['negShareWarning'] = null;
  if (
    recentNeg !== null && recentNeg < NEG_THRESHOLD
    && negFit.n >= 6 && negFit.r2 >= 0.25
    && negFit.slope > 0.003            // almeno ~2 punti percentuali a settimana
  ) {
    const daysToThreshold = (NEG_THRESHOLD - recentNeg) / negFit.slope;
    if (daysToThreshold > 0 && daysToThreshold <= days) {
      negShareWarning = {
        thresholdPct: Math.round(NEG_THRESHOLD * 100),
        etaDay: new Date(Date.now() + daysToThreshold * 86400_000).toLocaleDateString('en-CA', { timeZone: TZ }),
      };
    }
  }

  return { history, projected, volumeTrend, volumePctPerWeek: Math.round(pctPerWeek), confidence, negShareWarning };
}
