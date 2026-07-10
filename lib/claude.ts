import Anthropic from '@anthropic-ai/sdk';
import { sql, and, isNull, eq, desc, gte, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { apiUsage, mentions, stories, briefs, type Quality } from '@/lib/db/schema';
import { NEWS_SOURCES } from '@/lib/connectors';

const HAIKU = 'claude-haiku-4-5';
const SONNET = 'claude-sonnet-4-6';

// USD per milione di token
const PRICES: Record<string, { input: number; output: number }> = {
  [HAIKU]: { input: 1, output: 5 },
  [SONNET]: { input: 3, output: 15 },
};

function getClient(): Anthropic | null {
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}

export function claudeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Tetto mensile di spesa API in USD (env API_BUDGET_USD, default 6). */
export function monthlyBudgetUsd(): number {
  const n = Number(process.env.API_BUDGET_USD);
  return Number.isFinite(n) && n > 0 ? n : 6;
}

/** Spesa API del mese corrente in USD. */
export async function monthSpendUsd(): Promise<number> {
  const db = await getDb();
  const start = new Date();
  start.setDate(1); start.setHours(0, 0, 0, 0);
  const [row] = await db.select({ cost: sql<number | null>`sum(${apiUsage.costUsd})` })
    .from(apiUsage).where(gte(apiUsage.ts, start));
  return Number(row.cost ?? 0);
}

export const MODELS = { haiku: HAIKU, sonnet: SONNET };

/** Rimuove i surrogati UTF-16 spaiati (emoji spezzate dai troncamenti): renderebbero invalido il JSON della richiesta. */
function sanitize(s: string): string {
  return s
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

export async function callClaude(model: string, purpose: string, system: string, user: string, maxTokens: number): Promise<string | null> {
  const client = getClient();
  if (!client) return null;
  system = sanitize(system);
  user = sanitize(user);
  // Freno di emergenza: mai superare il tetto mensile.
  const spend = await monthSpendUsd();
  if (spend >= monthlyBudgetUsd()) {
    console.warn(`[claude] tetto di spesa raggiunto ($${spend.toFixed(2)}/$${monthlyBudgetUsd()}): chiamata "${purpose}" saltata`);
    return null;
  }
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
  });
  const price = PRICES[model] ?? { input: 3, output: 15 };
  const cost = (msg.usage.input_tokens * price.input + msg.usage.output_tokens * price.output) / 1_000_000;
  const db = await getDb();
  await db.insert(apiUsage).values({
    model, purpose,
    inputTokens: msg.usage.input_tokens,
    outputTokens: msg.usage.output_tokens,
    costUsd: cost,
  });
  const block = msg.content.find((b) => b.type === 'text');
  return block?.type === 'text' ? block.text : null;
}

/** Estrae il primo JSON valido da una risposta che può contenere testo attorno. */
function parseJson<T>(text: string | null): T | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  const start = Math.min(
    ...['[', '{'].map((c) => { const i = cleaned.indexOf(c); return i === -1 ? Infinity : i; }),
  );
  if (!Number.isFinite(start)) return null;
  const candidate = cleaned.slice(start);
  const end = Math.max(candidate.lastIndexOf(']'), candidate.lastIndexOf('}'));
  try {
    return JSON.parse(candidate.slice(0, end + 1)) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// 1. Analisi mention (Haiku, batch): lingua, sentiment, temi, entità
// ---------------------------------------------------------------------------

type AnalysisRow = {
  id: number; language: string; sentiment: 'positivo' | 'neutro' | 'negativo';
  sentiment_score: number; relevance: number; relevance_reason: string;
  topics: string[]; entities: string[];
};

const ANALYSIS_SYSTEM = `Sei un analista di social listening. Ricevi il tema monitorato e un array JSON di contenuti (news, post social).
Per OGNI elemento restituisci un oggetto con:
- id: lo stesso id ricevuto
- language: codice ISO 639-1 della lingua del testo (es. "it", "en")
- sentiment: "positivo", "neutro" o "negativo" — riferito al tono del contenuto verso il tema di cui parla
- sentiment_score: numero da -1 (molto negativo) a 1 (molto positivo)
- relevance: 1-5, quanto il contenuto è rilevante e importante per chi monitora il tema (5 = centrale e di peso, 3 = attinente ma ordinario, 1 = marginale o fuori tema)
- relevance_reason: massimo 12 parole in italiano che motivano il giudizio di rilevanza
- topics: massimo 3 temi in italiano, brevi (1-3 parole, minuscole)
- entities: massimo 5 entità nominate (brand, aziende, persone, prodotti)
Rispondi SOLO con l'array JSON, nessun altro testo.`;

export async function analyzePendingMentions(projectId: number, theme: string, limit = 80): Promise<{ analyzed: number; pending: number }> {
  const db = await getDb();
  // Nuove mention + backfill graduale della rilevanza sui contenuti recenti
  // già analizzati prima che esistessero le stelle
  const d3 = new Date(Date.now() - 3 * 86400_000);
  const pendingCond = sql`(${mentions.analyzedAt} IS NULL OR (${mentions.relevance} IS NULL AND ${mentions.publishedAt} >= ${d3.toISOString()}::timestamptz))`;
  const pending = await db.select({
    id: mentions.id, title: mentions.title, content: mentions.content, source: mentions.source,
  }).from(mentions)
    .where(and(eq(mentions.projectId, projectId), pendingCond))
    .orderBy(desc(mentions.publishedAt))
    .limit(limit);

  if (pending.length === 0 || !claudeAvailable()) {
    return { analyzed: 0, pending: pending.length };
  }

  const chunks: typeof pending[] = [];
  for (let i = 0; i < pending.length; i += 20) chunks.push(pending.slice(i, i + 20));

  let analyzed = 0;
  await Promise.all(chunks.map(async (chunk) => {
    const payload = chunk.map((m) => ({
      id: m.id,
      text: `${m.title ?? ''} ${m.content}`.slice(0, 400).trim(),
    }));
    try {
      const text = await callClaude(
        HAIKU, 'analisi_mention', ANALYSIS_SYSTEM,
        `Tema monitorato: ${theme}\n\n${JSON.stringify(payload)}`, 3800,
      );
      const rows = parseJson<AnalysisRow[]>(text);
      if (!rows) return;
      const sentimentMap: Record<string, string> = { positivo: 'positivo', neutro: 'neutro', negativo: 'negativo' };
      for (const r of rows) {
        if (!chunk.some((m) => m.id === r.id)) continue;
        await db.update(mentions).set({
          language: r.language?.slice(0, 5),
          sentiment: sentimentMap[r.sentiment] ?? 'neutro',
          sentimentScore: Math.max(-1, Math.min(1, Number(r.sentiment_score) || 0)),
          relevance: Math.max(1, Math.min(5, Math.round(Number(r.relevance)) || 3)),
          relevanceReason: r.relevance_reason?.slice(0, 200) ?? null,
          topics: (r.topics ?? []).slice(0, 3),
          entities: (r.entities ?? []).slice(0, 5),
          analyzedAt: new Date(),
        }).where(eq(mentions.id, r.id));
        analyzed++;
      }
    } catch (e) {
      console.error('Analisi batch fallita:', e);
    }
  }));

  return { analyzed, pending: pending.length - analyzed };
}

// ---------------------------------------------------------------------------
// 2. Content ratings (Sonnet): quality score dei contenuti top per engagement
// ---------------------------------------------------------------------------

const QUALITY_SYSTEM = `Sei un analista di contenuti social. Ricevi un array JSON di contenuti con engagement alto.
Per OGNI elemento restituisci:
- id: lo stesso id
- score: 0-100, qualità complessiva del contenuto (informatività, credibilità, rilevanza per il tema)
- relevance: 0-100, pertinenza rispetto al tema monitorato
- virality: 0-100, potenziale di diffusione
- risk: "basso", "medio" o "alto" — rischio reputazionale/disinformazione per chi opera nel settore
- note: una frase in italiano (max 15 parole) che motiva il giudizio
Rispondi SOLO con l'array JSON.`;

export async function scoreTopContent(projectId: number, topic: string): Promise<number> {
  const db = await getDb();
  if (!claudeAvailable()) return 0;
  const since = new Date(Date.now() - 7 * 86400_000);
  const top = await db.select({
    id: mentions.id, title: mentions.title, content: mentions.content,
    source: mentions.source, engagementScore: mentions.engagementScore,
  }).from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, since),
      isNull(mentions.quality),
      sql`${mentions.engagementScore} > 0`,
    ))
    .orderBy(desc(mentions.engagementScore))
    .limit(20);
  if (top.length === 0) return 0;

  const payload = top.map((m) => ({
    id: m.id, source: m.source, text: `${m.title ?? ''} ${m.content}`.slice(0, 500).trim(),
  }));
  const text = await callClaude(
    SONNET, 'content_ratings', QUALITY_SYSTEM,
    `Tema monitorato: ${topic}\n\n${JSON.stringify(payload)}`, 3500,
  );
  const rows = parseJson<(Quality & { id: number })[]>(text);
  if (!rows) return 0;
  let updated = 0;
  for (const r of rows) {
    if (!top.some((m) => m.id === r.id)) continue;
    await db.update(mentions).set({
      quality: {
        score: Math.max(0, Math.min(100, Number(r.score) || 0)),
        relevance: Math.max(0, Math.min(100, Number(r.relevance) || 0)),
        virality: Math.max(0, Math.min(100, Number(r.virality) || 0)),
        risk: ['basso', 'medio', 'alto'].includes(r.risk) ? r.risk : 'basso',
        note: r.note,
      },
    }).where(eq(mentions.id, r.id));
    updated++;
  }
  return updated;
}

// ---------------------------------------------------------------------------
// 3. Raggruppamento news in storie (Sonnet)
// ---------------------------------------------------------------------------

const STORIES_SYSTEM = `Sei un media analyst. Ricevi titoli di news (con id) sullo stesso settore.
Raggruppa quelli che parlano della STESSA storia/evento (anche in lingue diverse).
Rispondi SOLO con un array JSON di oggetti: { "title": "titolo della storia in italiano", "summary": "sintesi in 1-2 frasi in italiano", "ids": [id, ...] }.
Includi solo storie con almeno 2 articoli. Ignora gli articoli non raggruppabili.`;

export async function clusterNewsStories(projectId: number): Promise<number> {
  const db = await getDb();
  if (!claudeAvailable()) return 0;
  const since = new Date(Date.now() - 48 * 3600_000);
  const news = await db.select({ id: mentions.id, title: mentions.title })
    .from(mentions)
    .where(and(
      eq(mentions.projectId, projectId),
      gte(mentions.publishedAt, since),
      inArray(mentions.source, NEWS_SOURCES),
      isNull(mentions.storyId),
    ))
    .orderBy(desc(mentions.publishedAt))
    .limit(60);
  if (news.length < 4) return 0;

  const payload = news.filter((n) => n.title).map((n) => ({ id: n.id, title: n.title!.slice(0, 150) }));
  const text = await callClaude(SONNET, 'clustering_storie', STORIES_SYSTEM, JSON.stringify(payload), 3000);
  const groups = parseJson<{ title: string; summary: string; ids: number[] }[]>(text);
  if (!groups) return 0;

  let created = 0;
  for (const g of groups) {
    const validIds = (g.ids ?? []).filter((id) => news.some((n) => n.id === id));
    if (validIds.length < 2 || !g.title) continue;
    const [story] = await db.insert(stories).values({
      projectId, title: g.title, summary: g.summary ?? null,
    }).returning();
    await db.update(mentions).set({ storyId: story.id }).where(inArray(mentions.id, validIds));
    created++;
  }
  return created;
}

// ---------------------------------------------------------------------------
// 4. Daily brief (Sonnet)
// ---------------------------------------------------------------------------

const BRIEF_SYSTEM = `Sei un senior media intelligence analyst. Scrivi un briefing esecutivo GIORNALIERO in italiano, in Markdown, per un decisore che monitora un settore.
Struttura richiesta:
## In sintesi (3 bullet essenziali)
## Cosa è successo (le storie principali, con contesto)
## Sentiment e conversazioni (tono, dove si discute, temi emergenti)
## Rischi e opportunità (concreti, azionabili)
Massimo 500 parole. Tono professionale e diretto. Basati SOLO sui dati forniti; se i dati sono pochi dillo apertamente.`;

export async function generateDailyBrief(projectId: number, projectName: string, briefData: unknown): Promise<boolean> {
  const db = await getDb();
  if (!claudeAvailable()) return false;
  const text = await callClaude(
    SONNET, 'daily_brief', BRIEF_SYSTEM,
    `Settore monitorato: ${projectName}\nData: ${new Date().toLocaleDateString('it-IT', { dateStyle: 'full' })}\n\nDati delle ultime 24 ore:\n${JSON.stringify(briefData).slice(0, 9000)}`,
    1300,
  );
  if (!text) return false;
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(briefs).values({ projectId, briefDate: today, content: text })
    .onConflictDoUpdate({
      target: [briefs.projectId, briefs.briefDate],
      set: { content: text, createdAt: new Date() },
    });
  return true;
}
