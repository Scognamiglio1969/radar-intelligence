import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects, mentions as mentionsTable } from '@/lib/db/schema';
import { dashboardData, listeningData, briefList, normSentimentValue } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { getNarratives } from '@/lib/narratives';
import { cfg } from '@/lib/connector-config';

// ---------------------------------------------------------------------------
// Radar come server MCP.
//
// Un endpoint solo (/api/mcp, streamable HTTP) per due mondi: Claude lo aggiunge
// come server remoto, Copilot Studio lo importa come custom connector — è
// l'unico transport che Copilot Studio parla.
//
// Tutti i tool sono in SOLA LETTURA e a costo zero: leggono quello che la
// pipeline ha già calcolato, non chiamano né l'AI né le fonti esterne. Nessuno
// di essi spende budget Claude o credits Talkwalker.
// ---------------------------------------------------------------------------

export const MCP_TOKEN_ENV = 'RADAR_MCP_TOKEN';

/** Il token che protegge l'endpoint. Assente = MCP spento (non "aperto"). */
export function mcpToken(): string | undefined {
  return cfg(MCP_TOKEN_ENV);
}

/** Confronto a tempo costante: un token si verifica, non si "controlla". */
export function tokenMatches(given: string | null | undefined, expected: string): boolean {
  const a = given ?? '';
  let diff = a.length ^ expected.length;
  for (let i = 0; i < Math.max(a.length, expected.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (expected.charCodeAt(i) || 0);
  }
  return diff === 0;
}

/** Estrae il bearer/api-key dalla richiesta, nelle due forme che i client usano. */
export function readToken(headers: Headers): string | null {
  const auth = headers.get('authorization');
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return headers.get('x-api-key');
}

type ToolText = { content: Array<{ type: 'text'; text: string }>; isError?: boolean };

function ok(payload: unknown, note?: string): ToolText {
  const body = JSON.stringify(payload, null, 2);
  return { content: [{ type: 'text', text: note ? `${note}\n\n${body}` : body }] };
}

function fail(msg: string): ToolText {
  return { content: [{ type: 'text', text: msg }], isError: true };
}

const MAX_EXCERPT = 300;

function compactMention(m: typeof mentionsTable.$inferSelect) {
  return {
    id: m.id,
    date: m.publishedAt?.toISOString() ?? null,
    source: m.source,
    kind: m.kind,
    title: m.title,
    url: m.url,
    author: m.author ?? m.authorHandle,
    language: m.language,
    country: m.country,
    sentiment: m.sentiment ? normSentimentValue(m.sentiment) : null,
    relevance: m.relevance,
    topics: m.topics,
    engagement: m.engagementScore,
    reach: m.reach,
    excerpt: (m.content ?? '').slice(0, MAX_EXCERPT) || null,
  };
}

async function resolveProject(id?: number) {
  const db = await getDb();
  const rows = id
    ? await db.select().from(projects).where(eq(projects.id, id))
    : await db.select().from(projects).orderBy(projects.id).limit(1);
  return rows[0] ?? null;
}

export function createRadarMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'radar', version: '1.0.0' },
    {
      instructions:
        'Radar: media intelligence and social listening. Projects come in three kinds — ' +
        '"listening" (Radar collects from the web), "upload" (data imported from files) and ' +
        '"talkwalker" (mentions read from the corporate Talkwalker API). Every tool here is ' +
        'read-only and free: it returns what the pipeline already computed, and never spends ' +
        'AI budget or Talkwalker credits. Start from radar_projects to get the project ids.',
    },
  );

  server.registerTool(
    'radar_projects',
    {
      title: 'List Radar projects',
      description: 'Lists the projects with their id, kind (listening / upload / talkwalker), query keywords and languages. Start here: every other tool takes a project_id.',
      inputSchema: {},
    },
    async () => {
      const db = await getDb();
      const rows = await db.select().from(projects).orderBy(projects.id);
      return ok({
        projects: rows.map((p) => ({
          id: p.id,
          name: p.name,
          kind: p.mode,
          keywords: p.keywords,
          all_terms: p.allTerms,
          exclude_terms: p.excludeTerms,
          languages: p.languages,
          talkwalker_project: p.talkwalkerProject ?? undefined,
        })),
      });
    },
  );

  server.registerTool(
    'radar_overview',
    {
      title: 'Project overview',
      description: 'The dashboard in numbers: mentions over the last 7 days, average sentiment, active sources, daily volume by source over 14 days, sentiment split, top topics and the latest daily brief.',
      inputSchema: { project_id: z.number().int().optional().describe('Project id (default: the first one)') },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const d = await dashboardData(project.id);
      return ok({
        project: { id: project.id, name: project.name, kind: project.mode },
        kpi_7d: d.kpi,
        volume_by_day: d.volumeByDay,
        sentiment: d.sentimentDist,
        top_topics: d.topTopics,
        latest_brief: d.latestBrief ? { date: d.latestBrief.briefDate, content: d.latestBrief.content } : null,
      });
    },
  );

  server.registerTool(
    'radar_mentions',
    {
      title: 'Search mentions',
      description: 'Searches the mentions of a project with the same filters as the Listening page: free text, source, sentiment, language, article vs post, minimum AI relevance, time window. Returns 40 per page, compacted.',
      inputSchema: {
        project_id: z.number().int().optional(),
        q: z.string().optional().describe('Free text searched in title and content'),
        source: z.string().optional().describe('Source id, e.g. googlenews, talkwalker, reddit'),
        sentiment: z.enum(['positive', 'neutral', 'negative']).optional(),
        language: z.string().optional().describe('Language code, e.g. it, en'),
        kind: z.enum(['article', 'post']).optional().describe('Press coverage or social post'),
        days: z.number().int().min(1).max(365).optional().describe('Only the last N days'),
        min_relevance: z.number().int().min(1).max(5).optional().describe('Only mentions rated at least N stars by the AI'),
        sort_by: z.enum(['data', 'engagement', 'rilevanza']).optional().describe('date (default), engagement or relevance'),
        page: z.number().int().min(1).optional(),
      },
    },
    async (args) => {
      const project = await resolveProject(args.project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const res = await listeningData(project.id, {
        q: args.q, source: args.source, sentiment: args.sentiment, language: args.language,
        kind: args.kind, days: args.days, minRelevance: args.min_relevance,
        sortBy: args.sort_by, page: args.page,
      });
      return ok(
        { total: res.total, page: res.page, page_size: res.pageSize, mentions: res.rows.map(compactMention) },
        `${res.rows.length} mentions of ${res.total} matching, page ${res.page}.`,
      );
    },
  );

  server.registerTool(
    'radar_trends',
    {
      title: 'Emerging topics',
      description: 'Topics whose speed in the last 24 hours is anomalous against the previous days, with the AI explanation when the daily run produced one. Computed by SQL, no cost.',
      inputSchema: { project_id: z.number().int().optional() },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const trends = await getTrends(project.id);
      return ok({
        trends: trends.map((t) => ({
          topic: t.topic, last_24h: t.n24, baseline: t.baseline,
          score: t.score, explanation: t.explanation,
        })),
      });
    },
  );

  server.registerTool(
    'radar_narratives',
    {
      title: 'Narratives',
      description: 'Clusters of messages pushing the same thesis, with stance, the accounts carrying them and a coordination flag. Detected by the daily run; reading them costs nothing.',
      inputSchema: { project_id: z.number().int().optional() },
    },
    async ({ project_id }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const narratives = await getNarratives(project.id);
      return ok({
        narratives: narratives.map((n) => ({
          title: n.title, description: n.description, stance: n.stance,
          coordinated: Boolean(n.coordinated), accounts: n.accounts, mentions: n.mentionCount,
        })),
      });
    },
  );

  server.registerTool(
    'radar_briefs',
    {
      title: 'Daily briefs',
      description: 'The AI daily briefs already generated for the project, most recent first. Reading them is free — they were paid for when they were written.',
      inputSchema: {
        project_id: z.number().int().optional(),
        limit: z.number().int().min(1).max(30).optional().describe('How many (default 5)'),
      },
    },
    async ({ project_id, limit }) => {
      const project = await resolveProject(project_id);
      if (!project) return fail('No project found. Use radar_projects to list them.');
      const list = await briefList(project.id);
      return ok({ briefs: list.slice(0, limit ?? 5).map((b) => ({ date: b.briefDate, content: b.content })) });
    },
  );

  return server;
}
