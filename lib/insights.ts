import { eq, sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { benchmarkEntities } from '@/lib/db/schema';
import { SOURCE_META } from '@/lib/connectors';
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
      // Se il tema è nuovo (nessuna presenza prima) e ora è significativo → cap positive.
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
      count(*) FILTER (WHERE sentiment = 'positive') - count(*) FILTER (WHERE sentiment = 'negative') AS delta
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
        AND sentiment = ${s.up ? 'positive' : 'negative'}
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

const CLUSTER_SYSTEM = `You are a conversation analyst. Classify the conversation about a topic into FAMILIES OF DISCOURSE (the "frame" it is discussed with), choosing from this list:
price/cost, quality/product, scandal/controversy, irony/meme, politics/regulation, customer care/support, ethics/values, innovation/technology, business/market, safety/risks.
Based on the provided topics and content, return a JSON array of 4-7 objects { "family": "<one of the families>", "share": <estimated percentage 0-100>, "sentiment": "positive|neutral|negative", "example": "<example sentence in English, max 12 words>" }. The shares must sum to ~100. Respond ONLY with the JSON array.`;

export async function getClusters(projectId: number, force = false): Promise<Cluster[] | null> {
  const key = `clusters:${projectId}:${new Date().toISOString().slice(0, 10)}`;
  if (!force) {
    const cached = await getMeta<Cluster[]>(key);
    if (cached) return cached;
  }
  if (!await claudeAvailable()) return null;
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

const CAUSAL_SYSTEM = `You are a media intelligence analyst. Reconstruct the CAUSE → EFFECT chains of the period: which events/news produced measurable consequences (volume spikes, sentiment shifts, new narratives).
Base it ONLY on the provided data (timeline events, alerts, trends, narratives). Return a JSON array of 3-5 objects:
{ "cause": "<triggering event/news, in English>", "date": "YYYY-MM-DD or null", "effects": ["<numeric/observed consequence>", ...], "narratives": ["<narrative that emerged>", ...] }.
Be concrete and honest: if a link is weak, don't invent it. Respond ONLY with the JSON array.`;

export async function getCausalChains(projectId: number, force = false): Promise<CausalChain[] | null> {
  const key = `causal:${projectId}:${new Date().toISOString().slice(0, 10)}`;
  if (!force) {
    const cached = await getMeta<CausalChain[]>(key);
    if (cached) return cached;
  }
  if (!await claudeAvailable()) return null;

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

// ---------------------------------------------------------------------------
// 3. Flusso della conversazione (Sankey: Fonte → Topic → Sentiment)
// ---------------------------------------------------------------------------
export type FlowNode = { key: string; label: string; layer: number; value: number; kind: string };
export type FlowLink = { source: string; target: string; value: number };
export type ConversationFlow = { nodes: FlowNode[]; links: FlowLink[] };

export async function conversationFlow(projectId: number, days = 14): Promise<ConversationFlow> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const st = (await db.execute(sql`
    SELECT source, t AS topic, count(*) AS n
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY source, t
  `)).rows as { source: string; topic: string; n: number }[];

  const ts = (await db.execute(sql`
    SELECT t AS topic, coalesce(sentiment, 'neutral') AS sentiment, count(*) AS n
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY t, coalesce(sentiment, 'neutral')
  `)).rows as { topic: string; sentiment: string; n: number }[];

  // Top fonti e top topic per volume.
  const srcTot = new Map<string, number>();
  const topTot = new Map<string, number>();
  for (const r of st) {
    srcTot.set(r.source, (srcTot.get(r.source) ?? 0) + Number(r.n));
    topTot.set(r.topic, (topTot.get(r.topic) ?? 0) + Number(r.n));
  }
  const topN = (m: Map<string, number>, k: number) =>
    new Set([...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([x]) => x));
  const keepSrc = topN(srcTot, 6);
  const keepTop = topN(topTot, 8);
  const sentiments = ['positive', 'neutral', 'negative'];

  const links: FlowLink[] = [];
  const linkAgg = new Map<string, number>();
  const addLink = (s: string, t: string, n: number) => linkAgg.set(`${s}${t}`, (linkAgg.get(`${s}${t}`) ?? 0) + n);

  for (const r of st) {
    if (!keepSrc.has(r.source) || !keepTop.has(r.topic)) continue;
    addLink(`s:${r.source}`, `t:${r.topic}`, Number(r.n));
  }
  for (const r of ts) {
    if (!keepTop.has(r.topic)) continue;
    const sent = sentiments.includes(r.sentiment) ? r.sentiment : 'neutral';
    addLink(`t:${r.topic}`, `x:${sent}`, Number(r.n));
  }
  for (const [key, value] of linkAgg) {
    const [source, target] = key.split('');
    links.push({ source, target, value });
  }

  // Nodi con valore = somma dei flussi entranti/uscenti.
  const nodeVal = new Map<string, number>();
  for (const l of links) {
    nodeVal.set(l.source, (nodeVal.get(l.source) ?? 0) + l.value);
    nodeVal.set(l.target, (nodeVal.get(l.target) ?? 0) + l.value);
  }
  const nodes: FlowNode[] = [];
  for (const s of keepSrc) if (nodeVal.has(`s:${s}`)) nodes.push({ key: `s:${s}`, label: SOURCE_META[s]?.label ?? s, layer: 0, value: nodeVal.get(`s:${s}`)!, kind: 'source' });
  for (const t of keepTop) if (nodeVal.has(`t:${t}`)) nodes.push({ key: `t:${t}`, label: t, layer: 1, value: nodeVal.get(`t:${t}`)!, kind: 'topic' });
  for (const x of sentiments) if (nodeVal.has(`x:${x}`)) nodes.push({ key: `x:${x}`, label: x, layer: 2, value: nodeVal.get(`x:${x}`)!, kind: x });

  return { nodes, links };
}

// ---------------------------------------------------------------------------
// 1. Share of Voice nel tempo (streamgraph delle entità benchmark)
// ---------------------------------------------------------------------------
export type SovSeries = { entities: string[]; days: { day: string;[entity: string]: number | string }[] };

export async function sovOverTime(projectId: number, days = 30): Promise<SovSeries> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const entities = await db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId));
  if (entities.length === 0) return { entities: [], days: [] };

  // Griglia giorni completa (anche i giorni a zero) per uno streamgraph continuo.
  const grid: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    grid.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
  }
  const byDay = new Map<string, Record<string, number>>();
  for (const d of grid) byDay.set(d, {});

  for (const e of entities) {
    const kws = e.keywords.length ? e.keywords : [e.name];
    const rows = (await db.execute(sql`
      SELECT to_char(published_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, count(*) AS n
      FROM mentions
      WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz${kwFilter(kws)}
      GROUP BY day
    `)).rows as { day: string; n: number }[];
    const m = new Map(rows.map((r) => [r.day, Number(r.n)]));
    for (const d of grid) {
      const rec = byDay.get(d)!;
      rec[e.name] = m.get(d) ?? 0;
    }
  }

  return {
    entities: entities.map((e) => e.name),
    days: grid.map((d) => ({ day: d, ...byDay.get(d)! })),
  };
}

// ---------------------------------------------------------------------------
// 8. Costellazione semantica (frequenza termini + co-occorrenza + sentiment)
// ---------------------------------------------------------------------------
export type ConstellationNode = { term: string; freq: number; sentiment: number };
export type ConstellationEdge = { a: string; b: string; weight: number };
export type Constellation = { nodes: ConstellationNode[]; edges: ConstellationEdge[] };

export async function semanticConstellation(projectId: number, days = 14, maxNodes = 26): Promise<Constellation> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  // Frequenza e sentiment medio per topic
  const freqRows = (await db.execute(sql`
    SELECT t AS term, count(*) AS freq, avg(sentiment_score) AS sentiment
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
    GROUP BY t
    HAVING count(*) >= 3
    ORDER BY count(*) DESC
    LIMIT ${maxNodes}
  `)).rows as { term: string; freq: number; sentiment: number | null }[];

  const nodes: ConstellationNode[] = freqRows.map((r) => ({
    term: r.term, freq: Number(r.freq),
    sentiment: r.sentiment === null ? 0 : Math.round(Number(r.sentiment) * 100) / 100,
  }));
  const keep = new Set(nodes.map((n) => n.term));
  if (nodes.length < 2) return { nodes, edges: [] };

  // Co-occorrenza: coppie di topic presenti nella stessa mention (solo termini tenuti)
  const rows = (await db.execute(sql`
    SELECT topics FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
      AND topics IS NOT NULL AND jsonb_array_length(topics) >= 2
  `)).rows as { topics: string[] }[];

  const pairCount = new Map<string, number>();
  for (const r of rows) {
    const ts = [...new Set((r.topics ?? []).filter((t) => keep.has(t)))].sort();
    for (let i = 0; i < ts.length; i++) {
      for (let j = i + 1; j < ts.length; j++) {
        const key = `${ts[i]}${ts[j]}`;
        pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
      }
    }
  }
  const edges: ConstellationEdge[] = [...pairCount.entries()]
    .filter(([, w]) => w >= 2)
    .map(([key, weight]) => { const [a, b] = key.split(''); return { a, b, weight }; })
    .sort((x, y) => y.weight - x.weight)
    .slice(0, 60);

  return { nodes, edges };
}

// ---------------------------------------------------------------------------
// 7. Momentum Quadrant (volume × accelerazione → matrice strategica 2×2)
// ---------------------------------------------------------------------------
export type QuadrantPoint = {
  topic: string; volume: number; acceleration: number; sentiment: number; quadrant: string;
};

function quadrantOf(volHigh: boolean, accel: number): string {
  if (accel >= 0) return volHigh ? 'Rising stars' : 'Emerging';
  return volHigh ? 'Steady' : 'Declining';
}

export async function momentumQuadrant(projectId: number, days = 14): Promise<QuadrantPoint[]> {
  const db = await getDb();
  const now = Date.now();
  const since = new Date(now - days * 86400_000).toISOString();
  const mid = new Date(now - (days / 2) * 86400_000).toISOString();

  const rows = (await db.execute(sql`
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
    LIMIT 30
  `)).rows as { topic: string; volume: number; sentiment: number | null; recent: number; older: number }[];

  if (rows.length === 0) return [];
  const volumes = rows.map((r) => Number(r.volume)).sort((a, b) => a - b);
  const medianVol = volumes[Math.floor(volumes.length / 2)];

  return rows.map((r) => {
    const recent = Number(r.recent), older = Number(r.older);
    // Accelerazione: variazione % del volume nella seconda metà vs la prima.
    let accel: number;
    if (older === 0) accel = recent > 0 ? 100 : 0;
    else accel = ((recent - older) / older) * 100;
    accel = Math.max(-100, Math.min(200, Math.round(accel)));
    const volume = Number(r.volume);
    return {
      topic: r.topic, volume,
      acceleration: accel,
      sentiment: r.sentiment === null ? 0 : Math.round(Number(r.sentiment) * 100) / 100,
      quadrant: quadrantOf(volume >= medianVol, accel),
    };
  });
}

// ---------------------------------------------------------------------------
// 5. Brand Health Index (indice composito 0-100 + sotto-metriche + sparkline)
// ---------------------------------------------------------------------------
export type HealthComponent = { key: string; label: string; value: number; weight: number };
export type BrandHealth = {
  score: number; grade: string;
  components: HealthComponent[];
  spark: number[]; // indice sentiment giornaliero (0-100) sugli ultimi 14 giorni
  total: number;
};

function grade(score: number): string {
  return score >= 80 ? 'Excellent' : score >= 65 ? 'Good' : score >= 50 ? 'Fair' : 'At risk';
}

// Filtro keyword opzionale: se presente, limita alle mention che citano
// almeno una keyword (nel titolo o nel testo). Serve a isolare il tuo brand
// o un competitor dentro la conversazione generale sul tema.
function kwFilter(keywords?: string[]) {
  if (!keywords || keywords.length === 0) return sql``;
  const ors = keywords.map((k) => sql`content ILIKE ${'%' + k + '%'} OR title ILIKE ${'%' + k + '%'}`);
  return sql` AND (${sql.join(ors, sql` OR `)})`;
}

/**
 * Health index composito (0-100) su un sottoinsieme di mention. Senza keyword
 * misura l'intero TEMA/mercato; con le keyword di un'entità misura quel brand.
 */
export async function healthFor(projectId: number, days = 14, keywords?: string[]): Promise<BrandHealth> {
  const db = await getDb();
  const now = Date.now();
  const since = new Date(now - days * 86400_000).toISOString();
  const mid = new Date(now - (days / 2) * 86400_000).toISOString();
  const kw = kwFilter(keywords);

  const [agg] = (await db.execute(sql`
    SELECT
      count(*) AS total,
      avg(sentiment_score) AS avg_sent,
      count(*) FILTER (WHERE sentiment = 'positive') AS pos,
      count(*) FILTER (WHERE sentiment = 'negative') AS neg,
      count(*) FILTER (WHERE sentiment IN ('positive','negative')) AS classified,
      count(*) FILTER (WHERE engagement_score > 0) AS resonant,
      count(*) FILTER (WHERE published_at >= ${mid}::timestamptz) AS recent,
      count(*) FILTER (WHERE published_at < ${mid}::timestamptz) AS older
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz${kw}
  `)).rows as {
    total: number; avg_sent: number | null; pos: number; neg: number;
    classified: number; resonant: number; recent: number; older: number;
  }[];

  const total = Number(agg?.total ?? 0);
  const avgSent = agg?.avg_sent === null || agg?.avg_sent === undefined ? 0 : Number(agg.avg_sent);
  const classified = Math.max(1, Number(agg?.classified ?? 0));
  const older = Math.max(1, Number(agg?.older ?? 0));
  const recent = Number(agg?.recent ?? 0);

  const sentiment = Math.round(((avgSent + 1) / 2) * 100);
  const positivity = Math.round((Number(agg?.pos ?? 0) / classified) * 100);
  const changePct = ((recent - older) / older) * 100;
  const momentum = Math.round(Math.max(0, Math.min(100, 50 + changePct / 2)));
  const reach = Math.round((Number(agg?.resonant ?? 0) / Math.max(1, total)) * 100);

  const components: HealthComponent[] = [
    { key: 'sentiment', label: 'Sentiment', value: sentiment, weight: 0.35 },
    { key: 'positivity', label: 'Positive share', value: positivity, weight: 0.25 },
    { key: 'momentum', label: 'Momentum', value: momentum, weight: 0.2 },
    { key: 'reach', label: 'Resonance', value: reach, weight: 0.2 },
  ];
  const score = total === 0 ? 0 : Math.round(components.reduce((s, c) => s + c.value * c.weight, 0));

  const daily = (await db.execute(sql`
    SELECT to_char(published_at AT TIME ZONE ${TZ}, 'YYYY-MM-DD') AS day, avg(sentiment_score) AS s
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz${kw}
    GROUP BY day ORDER BY day
  `)).rows as { day: string; s: number | null }[];
  const spark = daily.map((d) => Math.round(((Number(d.s ?? 0) + 1) / 2) * 100));

  return { score, grade: grade(score), components, spark, total };
}

/** Retro-compatibilità: la salute dell'intero tema. */
export async function brandHealth(projectId: number, days = 14): Promise<BrandHealth> {
  return healthFor(projectId, days);
}

export type CompareItem = { name: string; score: number; total: number; isBrand: boolean };
export type HealthReport = {
  theme: BrandHealth;
  brand: { name: string; health: BrandHealth } | null;
  compare: CompareItem[]; // brand + competitor, ordinati per score (vuoto se nessuna entità)
};

/**
 * Report completo: salute del tema (mercato) sempre; se una benchmark entity è
 * marcata come "tuo brand", anche la sua salute e il confronto con i competitor.
 */
export async function brandHealthReport(projectId: number, days = 14): Promise<HealthReport> {
  const db = await getDb();
  const theme = await healthFor(projectId, days);
  const entities = await db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, projectId));
  const ownBrand = entities.find((e) => e.isOwnBrand === 1) ?? null;

  const brand = ownBrand
    ? { name: ownBrand.name, health: await healthFor(projectId, days, ownBrand.keywords.length ? ownBrand.keywords : [ownBrand.name]) }
    : null;

  // Confronto: brand + competitor (solo se c'è un brand definito).
  let compare: CompareItem[] = [];
  if (ownBrand) {
    compare = await Promise.all(entities.map(async (e) => {
      const h = e.id === ownBrand.id && brand ? brand.health
        : await healthFor(projectId, days, e.keywords.length ? e.keywords : [e.name]);
      return { name: e.name, score: h.score, total: h.total, isBrand: e.isOwnBrand === 1 };
    }));
    compare.sort((a, b) => b.score - a.score);
  }

  return { theme, brand, compare };
}

// ---------------------------------------------------------------------------
// 6. Distribuzione geografica (inferita dalla lingua della conversazione)
// ---------------------------------------------------------------------------
// La lingua è l'unico segnale geografico persistito su ogni mention: ogni
// codice ISO 639-1 viene mappato al paese/area rappresentativa, con centroide
// (lon/lat) per posizionarlo sulla mappa e bandiera per etichettarlo.
type GeoMeta = { country: string; flag: string; lon: number; lat: number };
const LANG_GEO: Record<string, GeoMeta> = {
  it: { country: 'Italy', flag: '🇮🇹', lon: 12.5, lat: 42.5 },
  en: { country: 'English-speaking', flag: '🇬🇧', lon: -2, lat: 52 },
  es: { country: 'Spanish-speaking', flag: '🇪🇸', lon: -3.7, lat: 40.4 },
  fr: { country: 'French-speaking', flag: '🇫🇷', lon: 2.3, lat: 46.6 },
  de: { country: 'German-speaking', flag: '🇩🇪', lon: 10.4, lat: 51.2 },
  pt: { country: 'Portuguese-speaking', flag: '🇧🇷', lon: -47, lat: -12 },
  nl: { country: 'Netherlands', flag: '🇳🇱', lon: 5.3, lat: 52.1 },
  pl: { country: 'Poland', flag: '🇵🇱', lon: 19.1, lat: 52 },
  ru: { country: 'Russian-speaking', flag: '🇷🇺', lon: 45, lat: 56 },
  ar: { country: 'Arabic-speaking', flag: '🇸🇦', lon: 45, lat: 24 },
  zh: { country: 'Chinese-speaking', flag: '🇨🇳', lon: 104, lat: 35 },
  ja: { country: 'Japan', flag: '🇯🇵', lon: 138, lat: 36 },
  ko: { country: 'Korea', flag: '🇰🇷', lon: 127.8, lat: 36.5 },
  tr: { country: 'Turkey', flag: '🇹🇷', lon: 35, lat: 39 },
  ro: { country: 'Romania', flag: '🇷🇴', lon: 25, lat: 46 },
  hu: { country: 'Hungary', flag: '🇭🇺', lon: 19.5, lat: 47.2 },
  cs: { country: 'Czechia', flag: '🇨🇿', lon: 15.5, lat: 49.8 },
  el: { country: 'Greece', flag: '🇬🇷', lon: 22, lat: 39 },
  sv: { country: 'Sweden', flag: '🇸🇪', lon: 15, lat: 62 },
  da: { country: 'Denmark', flag: '🇩🇰', lon: 9.5, lat: 56 },
  fi: { country: 'Finland', flag: '🇫🇮', lon: 26, lat: 64 },
  no: { country: 'Norway', flag: '🇳🇴', lon: 8.5, lat: 61 },
  uk: { country: 'Ukraine', flag: '🇺🇦', lon: 31, lat: 49 },
  he: { country: 'Israel', flag: '🇮🇱', lon: 35, lat: 31.5 },
  hi: { country: 'India', flag: '🇮🇳', lon: 79, lat: 22 },
  id: { country: 'Indonesia', flag: '🇮🇩', lon: 113, lat: -1 },
  vi: { country: 'Vietnam', flag: '🇻🇳', lon: 106, lat: 16 },
  th: { country: 'Thailand', flag: '🇹🇭', lon: 101, lat: 15 },
  sk: { country: 'Slovakia', flag: '🇸🇰', lon: 19.5, lat: 48.7 },
  bg: { country: 'Bulgaria', flag: '🇧🇬', lon: 25, lat: 42.7 },
  hr: { country: 'Croatia', flag: '🇭🇷', lon: 15.5, lat: 45.1 },
  sr: { country: 'Serbia', flag: '🇷🇸', lon: 21, lat: 44 },
  ca: { country: 'Catalonia', flag: '🇪🇸', lon: 1.5, lat: 41.6 },
  sl: { country: 'Slovenia', flag: '🇸🇮', lon: 14.8, lat: 46.1 },
};

// ---------------------------------------------------------------------------
// 2b. Emotion radar (distribuzione delle emozioni dominanti)
// ---------------------------------------------------------------------------
const EMOTION_ORDER = ['joy', 'trust', 'fear', 'anger', 'sadness', 'surprise'] as const;
export type EmotionSlice = { emotion: string; value: number; share: number };

export async function emotionDistribution(projectId: number, days = 30): Promise<EmotionSlice[]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = (await db.execute(sql`
    SELECT lower(emotion) AS emotion, count(*) AS n
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
      AND emotion IS NOT NULL
    GROUP BY lower(emotion)
  `)).rows as { emotion: string; n: number }[];

  const map = new Map(rows.map((r) => [r.emotion, Number(r.n)]));
  const total = [...map.values()].reduce((s, n) => s + n, 0);
  if (total === 0) return [];
  return EMOTION_ORDER.map((e) => {
    const value = map.get(e) ?? 0;
    return { emotion: e, value, share: Math.round((value / total) * 1000) / 10 };
  });
}

export type GeoPoint = {
  lang: string; country: string; flag: string;
  lon: number; lat: number; volume: number; sentiment: number | null; share: number;
};

export async function geoDistribution(projectId: number, days = 30): Promise<GeoPoint[]> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const rows = (await db.execute(sql`
    SELECT lower(language) AS lang, count(*) AS n, avg(sentiment_score) AS sent
    FROM mentions
    WHERE project_id = ${projectId} AND published_at >= ${since}::timestamptz
      AND language IS NOT NULL AND language <> ''
    GROUP BY lower(language)
    ORDER BY n DESC
  `)).rows as { lang: string; n: number; sent: number | null }[];

  const known = rows.filter((r) => LANG_GEO[r.lang]);
  const total = known.reduce((s, r) => s + Number(r.n), 0) || 1;
  return known.map((r) => {
    const g = LANG_GEO[r.lang];
    return {
      lang: r.lang, country: g.country, flag: g.flag, lon: g.lon, lat: g.lat,
      volume: Number(r.n),
      sentiment: r.sent === null ? null : Math.round(Number(r.sent) * 100) / 100,
      share: Math.round((Number(r.n) / total) * 1000) / 10,
    };
  });
}
