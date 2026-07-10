import { sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { getCurrentProject } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { getNarratives } from '@/lib/narratives';
import { getTimeline } from '@/lib/timeline';
import { getRecentAlerts } from '@/lib/alerts';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

const TZ = 'Europe/Rome';

// ---------------------------------------------------------------------------
// 2. Mappa Temi × Sentiment (volume, sentiment medio, crescita)
// ---------------------------------------------------------------------------
export type TopicPoint = { topic: string; volume: number; sentiment: number; growth: number };

export async function topicSentimentMap(projectId: number, days = 14): Promise<TopicPoint[]> {
  const db = await getDb();
  const windowStart = Date.now() - days * 86400_000;

  // Finestra ADATTIVA: se il progetto ha meno storico dei `days` richiesti,
  // uso l'arco realmente coperto dai dati e lo spezzo a metà. Così entrambe
  // le metà hanno dati e la "crescita" non è falsata da una prima metà vuota.
  // Considero solo le mention CON temi (analizzate dall'AI): è lì che esiste
  // lo storico su cui misurare la crescita relativa.
  const [range] = (await db.execute(sql`
    SELECT extract(epoch FROM min(published_at)) * 1000 AS first_ms
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${new Date(windowStart).toISOString()}::timestamptz
      AND topics IS NOT NULL AND jsonb_array_length(topics) > 0
  `)).rows as { first_ms: number | null }[];

  const firstMs = range?.first_ms ? Math.max(windowStart, Number(range.first_ms)) : windowStart;
  const now = Date.now();
  const midMs = firstMs + (now - firstMs) / 2;
  const since = new Date(firstMs).toISOString();
  const mid = new Date(midMs).toISOString();

  const rows = await db.execute(sql`
    SELECT t AS topic,
      count(*) AS volume,
      avg(sentiment_score) AS sentiment,
      count(*) FILTER (WHERE published_at >= ${mid}::timestamptz) AS recent,
      count(*) FILTER (WHERE published_at < ${mid}::timestamptz) AS older
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY t
    HAVING count(*) >= 4
    ORDER BY count(*) DESC
    LIMIT 24
  `);

  // Totali di topic-instance nelle due metà: servono per la QUOTA (peso relativo),
  // così la crescita non è falsata dall'aumento del volume complessivo.
  const [tot] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE published_at >= ${mid}::timestamptz) AS recent_total,
      count(*) FILTER (WHERE published_at < ${mid}::timestamptz) AS older_total
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
  `)).rows as { recent_total: number; older_total: number }[];

  const recentTotal = Math.max(1, Number(tot?.recent_total ?? 0));
  const olderTotal = Math.max(1, Number(tot?.older_total ?? 0));

  return (rows.rows as { topic: string; volume: number; sentiment: number | null; recent: number; older: number }[])
    .map((r) => {
      const recent = Number(r.recent);
      const older = Number(r.older);
      const recentShare = recent / recentTotal;
      const olderShare = older / olderTotal;
      // Variazione del peso relativo: +% = il tema guadagna importanza rispetto agli altri.
      // Se il tema è nuovo (nessuna presenza prima) e ora è significativo → cap positivo.
      let growth: number;
      if (olderShare < 1e-6) growth = recentShare > 0 ? 120 : 0;
      else growth = ((recentShare - olderShare) / olderShare) * 100;
      growth = Math.max(-100, Math.min(150, Math.round(growth)));
      return {
        topic: r.topic,
        volume: Number(r.volume),
        sentiment: r.sentiment === null ? 0 : Math.round(Number(r.sentiment) * 100) / 100,
        growth,
      };
    });
}

// ---------------------------------------------------------------------------
// 3. Heatmap giorno-della-settimana × ora (fuso Italia)
// ---------------------------------------------------------------------------
export async function hourlyHeatmap(projectId: number, days = 30): Promise<number[][]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = await db.execute(sql`
    SELECT
      EXTRACT(DOW FROM (published_at AT TIME ZONE ${TZ}))::int AS dow,
      EXTRACT(HOUR FROM (published_at AT TIME ZONE ${TZ}))::int AS hour,
      count(*) AS n
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY 1, 2
  `);
  // grid[dow 0=domenica..6][hour 0..23]; lo riordino lun→dom in UI
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of rows.rows as { dow: number; hour: number; n: number }[]) {
    grid[Number(r.dow)][Number(r.hour)] = Number(r.n);
  }
  return grid;
}

// ---------------------------------------------------------------------------
// 1. Sentiment Waterfall: variazione netta del sentiment giorno per giorno
// ---------------------------------------------------------------------------
export type WaterfallDay = { day: string; delta: number; cumulative: number; base: number; up: boolean };

export async function sentimentWaterfall(projectId: number, days = 14): Promise<{
  steps: WaterfallDay[]; swings: { day: string; title: string; url: string | null; sentiment: string | null }[];
}> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  // Contributo netto giornaliero = (positivi - negativi)
  const rows = await db.execute(sql`
    SELECT to_char(date_trunc('day', published_at AT TIME ZONE ${TZ}), 'YYYY-MM-DD') AS day,
      count(*) FILTER (WHERE sentiment = 'positivo') - count(*) FILTER (WHERE sentiment = 'negativo') AS delta
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz AND sentiment IS NOT NULL
    GROUP BY 1 ORDER BY 1
  `);
  let cumulative = 0;
  const steps: WaterfallDay[] = (rows.rows as { day: string; delta: number }[]).map((r) => {
    const delta = Number(r.delta);
    const start = cumulative;
    cumulative += delta;
    return { day: r.day, delta, cumulative, base: Math.min(start, cumulative), up: delta >= 0 };
  });

  // Giorni con lo swing più forte → contenuto più impattante di quel giorno
  const topSwings = [...steps].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 3).filter((s) => Math.abs(s.delta) >= 3);
  const swings = [] as { day: string; title: string; url: string | null; sentiment: string | null }[];
  for (const s of topSwings) {
    const dayStart = `${s.day}T00:00:00`;
    const [m] = await db.execute(sql`
      SELECT title, content, url, sentiment FROM mentions
      WHERE project_id = ${projectId}
        AND to_char(date_trunc('day', published_at AT TIME ZONE ${TZ}), 'YYYY-MM-DD') = ${s.day}
        AND sentiment = ${s.up ? 'positivo' : 'negativo'}
      ORDER BY engagement_score DESC LIMIT 1
    `).then((r) => r.rows as { title: string | null; content: string; url: string | null; sentiment: string | null }[]);
    void dayStart;
    if (m) swings.push({ day: s.day, title: (m.title ?? m.content).slice(0, 120), url: m.url, sentiment: m.sentiment });
  }
  return { steps, swings };
}

// ---------------------------------------------------------------------------
// 4. Cluster conversazionali (famiglie di discorso) — AI, cache giornaliera
// ---------------------------------------------------------------------------
export type Cluster = { family: string; share: number; sentiment: string; example: string };

const CLUSTER_SYSTEM = `Sei un analista di conversazioni. Classifica la conversazione su un tema in FAMIGLIE DI DISCORSO (il "frame" con cui se ne parla), scegliendo da questa lista:
prezzo/costi, qualità/prodotto, scandalo/controversia, ironia/meme, politica/regolamentazione, customer care/assistenza, etica/valori, innovazione/tecnologia, business/mercato, sicurezza/rischi.
Sulla base dei temi e dei contenuti forniti, restituisci un array JSON di 4-7 oggetti { "family": "<una delle famiglie>", "share": <percentuale stimata 0-100>, "sentiment": "positivo|neutro|negativo", "example": "<frase esempio in italiano, max 12 parole>" }. Le share devono sommare ~100. Rispondi SOLO con l'array JSON.`;

export async function getClusters(projectId: number, force = false): Promise<Cluster[] | null> {
  const key = `clusters:${projectId}:${new Date().toISOString().slice(0, 10)}`;
  if (!force) {
    const cached = await getMeta<Cluster[]>(key);
    if (cached) return cached;
  }
  if (!claudeAvailable()) return null;
  const db = await getDb();
  const since = new Date(Date.now() - 14 * 86400_000).toISOString();
  const topics = await db.execute(sql`
    SELECT t AS topic, count(*) AS n FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 20`);
  const sample = await db.execute(sql`
    SELECT coalesce(title, content) AS text FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    ORDER BY engagement_score DESC LIMIT 25`);
  if ((topics.rows as unknown[]).length < 3) return null;

  const text = await callClaude(
    MODELS.sonnet, 'cluster_conversazionali', CLUSTER_SYSTEM,
    `Temi: ${(topics.rows as { topic: string; n: number }[]).map((t) => `${t.topic} (${t.n})`).join(', ')}\n\nContenuti:\n${(sample.rows as { text: string }[]).map((s) => `- ${String(s.text).slice(0, 160)}`).join('\n').slice(0, 6000)}`,
    1500,
  );
  if (!text) return null;
  try {
    const start = text.indexOf('[');
    const parsed = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as Cluster[];
    const clean = parsed.filter((c) => c.family && c.share).slice(0, 8);
    await setMeta(key, clean);
    return clean;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 5. Grafico Causa-Effetto — AI, cache giornaliera
// ---------------------------------------------------------------------------
export type CausalChain = { cause: string; date: string | null; effects: string[]; narratives: string[] };

const CAUSAL_SYSTEM = `Sei un analista di media intelligence. Ricostruisci le catene CAUSA → EFFETTO del periodo: quali eventi/notizie hanno prodotto conseguenze misurabili (picchi di volume, cambi di sentiment, nuove narrazioni).
Basati SOLO sui dati forniti (eventi timeline, alert, trend, narrazioni). Restituisci un array JSON di 3-5 oggetti:
{ "cause": "<evento/notizia scatenante, in italiano>", "date": "YYYY-MM-DD o null", "effects": ["<conseguenza numerica/osservata>", ...], "narratives": ["<narrazione emersa>", ...] }.
Sii concreto e onesto: se un nesso è debole, non inventarlo. Rispondi SOLO con l'array JSON.`;

export async function getCausalChains(projectId: number, force = false): Promise<CausalChain[] | null> {
  const key = `causal:${projectId}:${new Date().toISOString().slice(0, 10)}`;
  if (!force) {
    const cached = await getMeta<CausalChain[]>(key);
    if (cached) return cached;
  }
  if (!claudeAvailable()) return null;

  const [timeline, alerts, trends, narratives] = await Promise.all([
    getTimeline(projectId), getRecentAlerts(projectId, 10), getTrends(projectId), getNarratives(projectId),
  ]);
  if (timeline.length + alerts.length + trends.length === 0) return null;

  const payload = {
    eventi: timeline.slice(0, 15).map((e) => ({ data: e.eventDate, titolo: e.title })),
    alert: alerts.map((a) => ({ data: new Date(a.createdAt).toISOString().slice(0, 10), tipo: a.type, msg: a.message })),
    trend: trends.map((t) => ({ tema: t.topic, x: t.score, spiegazione: t.explanation })),
    narrazioni: narratives.map((n) => ({ titolo: n.title, coordinata: n.coordinated === 1, post: n.mentionCount })),
  };
  const text = await callClaude(
    MODELS.sonnet, 'causa_effetto', CAUSAL_SYSTEM, JSON.stringify(payload).slice(0, 9000), 1600,
  );
  if (!text) return null;
  try {
    const start = text.indexOf('[');
    const parsed = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as CausalChain[];
    const clean = parsed.filter((c) => c.cause).slice(0, 5);
    await setMeta(key, clean);
    return clean;
  } catch {
    return null;
  }
}

export async function currentProjectForInsights() {
  return getCurrentProject();
}
