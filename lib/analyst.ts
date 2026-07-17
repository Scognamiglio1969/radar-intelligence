import Anthropic from '@anthropic-ai/sdk';
import { sql } from 'drizzle-orm';
import { getDb, getMeta } from '@/lib/db';
import { apiUsage } from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Capability gating — the Data Scientist only unlocks on an analyst-grade model.
// Bar: Claude Opus 4.8+ / Fable 5+, or top OpenAI (GPT-5+/o-series) and Grok (4+),
// or anything superior in the future.
// ---------------------------------------------------------------------------
export function isAnalystGrade(model: string): boolean {
  const m = (model || '').toLowerCase();
  const opus = m.match(/claude-opus-(\d+)-(\d+)/);
  if (opus && (Number(opus[1]) > 4 || (Number(opus[1]) === 4 && Number(opus[2]) >= 8))) return true;
  const fable = m.match(/claude-fable-(\d+)/);
  if (fable && Number(fable[1]) >= 5) return true;
  const gpt = m.match(/gpt-(\d+)/);
  if (gpt && Number(gpt[1]) >= 5) return true;
  if (/\bo[3-9]\b/.test(m)) return true;                 // OpenAI o3/o4… reasoning tier
  const grok = m.match(/grok-(\d+)/);
  if (grok && Number(grok[1]) >= 4) return true;
  return false;
}

/** The model the Data Scientist runs on. Admin-set (meta), default Opus 4.8. */
export async function analystModel(): Promise<string> {
  return (await getMeta<string>('ai_analyst_model')) || 'claude-opus-4-8';
}

/** The Data Scientist is available only with a key set AND an analyst-grade model. */
export async function analystAvailable(): Promise<{ ok: boolean; model: string; reason?: string }> {
  const model = await analystModel();
  if (process.env.DEMO_MODE === '1') return { ok: false, model, reason: 'Disabled in the public demo.' };
  const { anthropicKey } = await import('@/lib/claude');
  if (!(await anthropicKey())) return { ok: false, model, reason: 'No AI key configured (Budget tab).' };
  if (!isAnalystGrade(model)) {
    return { ok: false, model, reason: `“${model}” is not analyst-grade. Set an Opus 4.8+, Fable 5+, or a top OpenAI/Grok model in the Budget tab.` };
  }
  return { ok: true, model };
}

// ---------------------------------------------------------------------------
// Governed data sandbox — the ONLY way the analyst touches data.
// Read-only, single SELECT, scoped to the current project via a `data` view,
// hard row cap. Numbers in every report must come from here, never invented.
// ---------------------------------------------------------------------------

/** The schema the model is told it can query (the `data` relation = this project's mentions). */
export const DATA_SCHEMA = `You can run read-only SQL against ONE relation called "data" (PostgreSQL).
"data" is already filtered to the current project. One row = one mention. Columns:
  id (int), source (text: googlenews,gdelt,reddit,bluesky,mastodon,hackernews,youtube,telegram,rss,x,instagram,facebook,tiktok,linkedin,newsapi),
  url (text), title (text), content (text), author (text), author_handle (text), community (text),
  published_at (timestamptz), language (text, ISO-639-1), engagement_score (real), reach (int),
  sentiment (text: positive/neutral/negative), sentiment_score (real -1..1), emotion (text: joy/trust/fear/anger/sadness/surprise),
  relevance (int 1..5), topics (jsonb array of text), entities (jsonb array of text),
  quality (jsonb {score,relevance,virality,risk,note}), analyzed_at (timestamptz).
Use jsonb_array_elements_text(topics) to unnest topics. Always GROUP/aggregate; avoid selecting raw content in bulk.`;

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|attach|copy|vacuum|reindex|call|do|merge|comment|set|reset|pg_sleep|pg_read_file|pg_ls_dir|lo_import|lo_export|dblink|current_setting|version\s*\()\b/i;
// Direct access to base tables is blocked — the model must use `data`.
const BLOCKED_TABLES = /\b(mentions|users|meta|api_usage|share_links|projects|benchmark_entities|briefs|alerts|stories|trends|narratives|content_ideas|influencer_profiles|timeline_events|information_schema|pg_catalog|pg_)\w*/i;

export type QueryResult = { columns: string[]; rows: Record<string, unknown>[]; sql: string };
export type QueryError = { error: string };

export async function analystQuery(projectId: number, userSql: string, maxRows = 1000): Promise<QueryResult | QueryError> {
  let q = (userSql || '').trim().replace(/;+\s*$/g, '');
  if (!q) return { error: 'Empty query.' };
  if (q.includes(';')) return { error: 'Only a single statement is allowed (no “;”).' };
  if (!/^\s*(select|with)\b/i.test(q)) return { error: 'Only SELECT/WITH queries are allowed.' };
  if (FORBIDDEN.test(q)) return { error: 'Query contains a forbidden keyword (writes/DDL/system functions are not allowed).' };
  if (BLOCKED_TABLES.test(q)) return { error: 'Query only the “data” relation. Base tables are not accessible.' };

  const scoped = `data AS (SELECT * FROM mentions WHERE project_id = ${Number(projectId)})`;
  const inner = /^\s*with\b/i.test(q)
    ? q.replace(/^\s*with\s+/i, `WITH ${scoped}, `)
    : `WITH ${scoped} ${q}`;
  const finalSql = `SELECT * FROM (${inner}) _analyst LIMIT ${Math.min(5000, Math.max(1, maxRows))}`;

  const db = await getDb();
  try {
    const res = await Promise.race([
      db.execute(sql.raw(finalSql)),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Query timed out')), 8000)),
    ]);
    const rows = (res as { rows: Record<string, unknown>[] }).rows ?? [];
    const columns = rows.length ? Object.keys(rows[0]) : [];
    return { columns, rows, sql: q };
  } catch (e) {
    return { error: `SQL error: ${(e as Error).message}` };
  }
}

// ---------------------------------------------------------------------------
// The Data Scientist — agentic analysis. The model plans, runs governed SQL to
// gather EVERY number, then delivers a structured, source-cited report.
// ---------------------------------------------------------------------------
export type ReportChart = { type: 'bar' | 'line' | 'pie'; xKey: string; series: string[]; data: Record<string, unknown>[]; title?: string };
export type ReportTable = { columns: string[]; rows: (string | number | null)[][]; caption?: string };
export type ReportSection = {
  heading: string;
  body: string;                 // markdown narrative — numbers must trace to a query
  table?: ReportTable;
  chart?: ReportChart;
  cites?: number[];             // indexes into the queries[] provenance trail
};
export type Report = {
  title: string;
  audience: string;
  tldr: string[];
  kpis: { label: string; value: string; note?: string }[];
  sections: ReportSection[];
  methodology: string;
};
export type QueryTrace = { i: number; sql: string; rowCount: number; error?: string };
export type AnalysisResult = { report: Report; queries: QueryTrace[]; model: string; costUsd: number };

export const AUDIENCES: Record<string, string> = {
  clevel: 'C-LEVEL EXECUTIVE: one page. Lead with the decision and the business impact. 3 findings, 1-2 risks, 1 recommendation. Plain language, no jargon. Prefer a single clear chart and a compact KPI row.',
  analyst: 'ANALYST / PEER: rigorous and complete. Show methodology, tables, breakdowns, caveats and statistical judgement. Include the numbers behind every claim.',
  content: 'CONTENT / PR TEAM: what is resonating and what to do. Winning angles, communities and influential voices to engage, concrete next actions.',
};

// Curated "monstrous" analyses a world-class analyst would run (Phase-2 presets).
export const ANALYST_PRESETS: { key: string; label: string; audience: string; prompt: string }[] = [
  { key: 'crisis', label: 'Crisis post-mortem', audience: 'clevel', prompt: 'Diagnose the worst sentiment/volume episode in the last 30 days: when it started, what triggered it (topics, sources, the specific content that weighed most), how far it spread, whether it is recovering, and what to do now.' },
  { key: 'competitive', label: 'Competitive gap analysis', audience: 'clevel', prompt: 'Compare our brand vs the tracked competitors over the last 30 days on share of voice, sentiment and momentum. Where are we winning, where are we losing ground, and the single biggest opportunity.' },
  { key: 'narrative', label: 'Emerging narratives', audience: 'analyst', prompt: 'Identify the narratives forming in the conversation (recurring framings across topics), which are accelerating, their sentiment, and where they originate. Flag any that could become a risk.' },
  { key: 'influencer', label: 'Influencer & reach ROI', audience: 'content', prompt: 'Who are the highest-leverage authors and communities driving the conversation, how concentrated is the reach, and which specific voices we should engage first and why.' },
  { key: 'impact', label: 'Before/after impact', audience: 'analyst', prompt: 'Detect the most significant shift in the last 30 days (a spike or a sentiment turn), split the window before vs after it, quantify the change, judge whether it is meaningful, and explain what changed.' },
];

const SYSTEM = `You are Radar's senior data scientist for media intelligence. You produce rigorous, decision-grade analysis.
ABSOLUTE RULE: every number, percentage, ranking, date and quote in your report MUST come from a run_sql result. Never estimate, round from memory, or invent. If the data cannot support a claim, say so.
Method: plan the few metrics that answer the request, then use the run_sql tool to gather the evidence (aggregates, breakdowns, before/after, top items). Prefer FEWER, well-designed aggregate queries — aim for about 4-8 queries, never more than 10. Then deliver ONE final report. Do not keep querying once you have the evidence.
Cite your work: each section lists the indexes of the queries (0-based, in the order you ran them) that back its numbers.
${DATA_SCHEMA}
When done, respond with ONLY a JSON object (no prose, no code fences) matching:
{"title":str,"audience":str,"tldr":[str,...up to 4],"kpis":[{"label":str,"value":str,"note":str?},...],
 "sections":[{"heading":str,"body":str(markdown),"table":{"columns":[str],"rows":[[val]]}?,"chart":{"type":"bar|line|pie","xKey":str,"series":[str],"data":[{...}],"title":str?}?,"cites":[int]}...],
 "methodology":str}
Keep charts small (<= 20 rows) and built only from query results. Write in English.`;

const PRICE: Record<string, { in: number; out: number }> = {
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-fable-5': { in: 3, out: 15 },
};

function parseReport(text: string | null): Report | null {
  if (!text) return null;
  const cleaned = text.replace(/```json|```/g, '').trim();
  const s = cleaned.indexOf('{'); const e = cleaned.lastIndexOf('}');
  if (s === -1 || e === -1) return null;
  try { return JSON.parse(cleaned.slice(s, e + 1)) as Report; } catch { return null; }
}

export async function runAnalysis(projectId: number, projectName: string, question: string, audience: string): Promise<AnalysisResult | { error: string }> {
  const gate = await analystAvailable();
  if (!gate.ok) return { error: gate.reason ?? 'Data Scientist unavailable.' };
  const { anthropicKey, budgetUsd, currentSpendUsd } = await import('@/lib/claude');
  const key = await anthropicKey();
  if (!key) return { error: 'No AI key configured.' };
  if (await currentSpendUsd() >= await budgetUsd()) return { error: 'AI spend cap reached — raise or reset the budget.' };

  const model = gate.model;
  const client = new Anthropic({ apiKey: key });
  const tools: Anthropic.Tool[] = [{
    name: 'run_sql',
    description: 'Run one read-only SELECT against the project-scoped "data" relation and get the rows back.',
    input_schema: { type: 'object', properties: { sql: { type: 'string', description: 'A single SELECT/WITH query over "data".' } }, required: ['sql'] },
  }];
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: `Project: ${projectName}\nAudience: ${AUDIENCES[audience] ?? AUDIENCES.analyst}\n\nRequest: ${question}`,
  }];

  const queries: QueryTrace[] = [];
  const price = PRICE[model] ?? { in: 5, out: 25 };
  let costUsd = 0;
  const db = await getDb();
  const MAX_STEPS = 14;

  const finish = (text: string): AnalysisResult | null => {
    const report = parseReport(text);
    return report ? { report, queries, model, costUsd: Math.round(costUsd * 1e6) / 1e6 } : null;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    // Ultimi due giri (o dopo abbastanza query): niente più strumenti → il modello
    // DEVE produrre il report. Così non "gira a vuoto" senza convergere.
    const forceFinal = step >= MAX_STEPS - 2 || queries.length >= 10;
    let resp: Anthropic.Message;
    try {
      resp = await client.messages.create({
        model,
        max_tokens: forceFinal ? 8000 : 4500,
        system: forceFinal
          ? SYSTEM + '\n\nSTOP GATHERING. You have enough evidence. Do NOT request more queries. Output ONLY the final JSON report now, using the data already returned.'
          : SYSTEM,
        messages,
        ...(forceFinal ? {} : { tools }),
      });
    } catch (e) {
      return { error: `Model error: ${(e as Error).message}` };
    }
    costUsd += (resp.usage.input_tokens * price.in + resp.usage.output_tokens * price.out) / 1_000_000;
    await db.insert(apiUsage).values({ model, purpose: 'data_scientist', inputTokens: resp.usage.input_tokens, outputTokens: resp.usage.output_tokens, costUsd });

    const toolUses = forceFinal ? [] : resp.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) {
      const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('');
      const done = finish(text);
      if (done) return done;
      if (forceFinal) return { error: 'The analyst gathered the data but could not compile a valid report. Try a more specific request.' };
      // Ha risposto senza strumenti ma non è un report valido: lo spingo a produrlo.
      messages.push({ role: 'assistant', content: resp.content });
      messages.push({ role: 'user', content: 'Now output ONLY the final JSON report described in your instructions, using the evidence you already gathered. No prose, no code fences.' });
      continue;
    }

    messages.push({ role: 'assistant', content: resp.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const q = (tu.input as { sql?: string }).sql ?? '';
      const r = await analystQuery(projectId, q);
      const i = queries.length;
      if ('error' in r) {
        queries.push({ i, sql: q, rowCount: 0, error: r.error });
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ error: r.error }), is_error: true });
      } else {
        queries.push({ i, sql: r.sql, rowCount: r.rows.length });
        const capped = r.rows.slice(0, 200);
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify({ rows: capped, truncated: r.rows.length > 200 ? r.rows.length : undefined }) });
      }
    }
    messages.push({ role: 'user', content: toolResults });
  }
  return { error: 'Analysis did not converge — try a more specific question.' };
}
