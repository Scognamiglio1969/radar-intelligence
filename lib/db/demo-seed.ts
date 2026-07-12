import { eq, inArray } from 'drizzle-orm';
import type { DB } from './index';
import * as schema from './schema';
import type { Engagement } from './schema';

// Rich, realistic demo dataset for the public read-only demo (DEMO_MODE).
// No AI calls: sentiment, topics, briefs, clusters etc. are pre-generated here
// so every page is full of content at zero cost and zero abuse risk.

const SOURCES = ['gdelt', 'googlenews', 'reddit', 'bluesky', 'mastodon', 'hackernews', 'youtube', 'rss'] as const;

const TOPICS = [
  'model release', 'ai regulation', 'open source ai', 'ai safety',
  'funding', 'ai chips', 'enterprise adoption', 'ai ethics', 'job impact', 'chatbots',
];

const OUTLETS = ['Reuters', 'The Verge', 'TechCrunch', 'Bloomberg', 'The Guardian', 'Wired', 'Financial Times', 'Ars Technica', 'MIT Tech Review', 'Axios'];
const SUBREDDITS = ['r/artificial', 'r/MachineLearning', 'r/technology', 'r/singularity', 'r/OpenAI'];
const HANDLES = ['@ai_researcher', '@techanalyst', '@ml_daily', '@futureofwork', '@openai_watch', '@deepmind_fan', '@reg_watch', '@vc_insider', '@safety_first', '@builder_dao'];
const NAMES = ['Ada Whitfield', 'Marco Reyes', 'Lena Novak', 'Sam Okonkwo', 'Priya Nair', 'Tomás Berg', 'Yuki Tanaka', 'Elena Rossi', 'David Cohen', 'Grace Lin'];

const HEADLINES: Record<string, string[]> = {
  'model release': [
    'New frontier model beats prior benchmarks across reasoning tasks',
    'Startup unveils a smaller model that rivals the giants on coding',
    'Open-weights model release reshapes the competitive landscape',
    'Multimodal model can now analyze hours of video in one prompt',
  ],
  'ai regulation': [
    'Lawmakers propose new transparency rules for foundation models',
    'EU finalizes guidance on high-risk AI systems',
    'Regulators weigh disclosure requirements for training data',
    'Government opens consultation on AI liability framework',
  ],
  'open source ai': [
    'Community fine-tune tops leaderboards weeks after base release',
    'Open-source tooling makes self-hosting large models practical',
    'Permissive license sparks debate over commercial use',
  ],
  'ai safety': [
    'Researchers publish new evaluations for deceptive behavior',
    'Red-teaming report finds jailbreaks still slip through filters',
    'Interpretability work maps features inside a production model',
  ],
  funding: [
    'AI infrastructure startup raises a large Series B',
    'Chip challenger secures funding to take on incumbents',
    'Enterprise AI vendor doubles valuation in new round',
  ],
  'ai chips': [
    'Demand for accelerators outpaces supply again this quarter',
    'New inference chip claims major efficiency gains',
    'Cloud providers expand capacity to meet AI workloads',
  ],
  'enterprise adoption': [
    'Survey: most enterprises now run at least one AI pilot',
    'Bank deploys AI assistants across customer support',
    'Retailer credits AI for faster content production',
  ],
  'ai ethics': [
    'Study flags bias in automated hiring tools',
    'Artists push back over training-data consent',
    'Watchdog calls for clearer AI content labeling',
  ],
  'job impact': [
    'Report estimates which tasks are most exposed to automation',
    'Workers describe reskilling amid AI rollouts',
    'Analysts debate net effect of AI on employment',
  ],
  chatbots: [
    'Assistant gains memory and long-running task support',
    'Users report mixed results with new agentic features',
    'Chat interface adds voice and real-time browsing',
  ],
};

const SNIPPETS = [
  'Early testers say the improvement is noticeable on complex, multi-step problems.',
  'Analysts caution that headline benchmarks may not reflect real-world use.',
  'The move is expected to pressure competitors on both price and capability.',
  'Critics argue the rollout raises fresh questions about oversight.',
  'Supporters welcome the transparency but want independent verification.',
  'The announcement drew a wave of reactions across developer communities.',
];

// Deterministic PRNG so the demo dataset is stable across cold starts.
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemo(db: DB) {
  const existing = await db.select({ id: schema.projects.id }).from(schema.projects).limit(1);
  if (existing.length > 0) return;

  const rnd = mulberry32(20260707);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const now = Date.now();

  const [project] = await db.insert(schema.projects).values({
    name: 'Artificial Intelligence',
    keywords: ['artificial intelligence', 'generative AI', 'LLM'],
    languages: ['en'],
    visibility: 'shared',
    ownerId: 1,
    semanticContext: 'The global AI industry: model releases, regulation, chips, funding, safety and enterprise adoption.',
    brandVoice: 'Clear, credible and concise; informed but not hyped.',
  }).returning();
  const pid = project.id;

  await db.insert(schema.benchmarkEntities).values([
    { projectId: pid, name: 'OpenAI', keywords: ['OpenAI', 'ChatGPT', 'GPT'] },
    { projectId: pid, name: 'Anthropic', keywords: ['Anthropic', 'Claude'], isOwnBrand: 1 },
    { projectId: pid, name: 'Google', keywords: ['Gemini', 'DeepMind'] },
    { projectId: pid, name: 'Meta', keywords: ['Meta AI', 'Llama'] },
  ]);

  // ---- Mentions ----
  type Row = typeof schema.mentions.$inferInsert;
  const rows: Row[] = [];
  const langs = ['en', 'en', 'en', 'en', 'es', 'fr', 'de'];
  let idc = 0;
  for (let i = 0; i < 190; i++) {
    const source = pick(SOURCES);
    const topic = pick(TOPICS);
    const title = pick(HEADLINES[topic]);
    // Recent-weighted date over 30 days, with a spike in the last 3 days.
    const spike = rnd() < 0.28;
    const ageDays = spike ? rnd() * 3 : Math.pow(rnd(), 1.6) * 30;
    const publishedAt = new Date(now - ageDays * 86400_000);
    const isNews = source === 'gdelt' || source === 'googlenews' || source === 'rss';
    const r = rnd();
    const sentiment = r < 0.5 ? 'neutral' : r < 0.8 ? 'positive' : 'negative';
    const sentimentScore = sentiment === 'positive' ? 0.3 + rnd() * 0.6 : sentiment === 'negative' ? -0.3 - rnd() * 0.6 : -0.15 + rnd() * 0.3;
    const likes = isNews ? 0 : Math.floor(rnd() * 900);
    const comments = isNews ? 0 : Math.floor(rnd() * 180);
    const shares = isNews ? 0 : Math.floor(rnd() * 120);
    const views = source === 'youtube' ? Math.floor(rnd() * 90000) : undefined;
    const engagement: Engagement = { likes, comments, shares, views };
    const engagementScore = likes + 2 * comments + 3 * shares + (views ?? 0) / 200;
    const topics = [topic, ...(rnd() < 0.5 ? [pick(TOPICS)] : [])].filter((v, k, a) => a.indexOf(v) === k);
    const relevance = Math.max(1, Math.min(5, Math.round(3 + (rnd() - 0.4) * 3)));
    // Emozione plausibile coerente col sentiment (per popolare la Emotion Radar)
    const emotion = sentiment === 'positive'
      ? pick(['joy', 'joy', 'trust', 'surprise'])
      : sentiment === 'negative'
        ? pick(['anger', 'fear', 'sadness', 'anger'])
        : pick(['trust', 'surprise', 'fear', 'joy']);
    // Un brand citato nel testo, così il Brand Health Index ha dati reali su cui filtrare.
    const brandMention = pick(['OpenAI', 'ChatGPT', 'Anthropic', 'Claude', 'Gemini', 'DeepMind', 'Meta AI', 'Llama']);
    rows.push({
      projectId: pid,
      source,
      externalId: `demo-${idc++}`,
      url: 'https://example.com/article',
      title,
      content: `${title}. ${pick(SNIPPETS)} ${brandMention} is part of the discussion.`,
      author: isNews ? pick(OUTLETS) : pick(NAMES),
      authorHandle: isNews ? undefined : pick(HANDLES),
      community: source === 'reddit' ? pick(SUBREDDITS) : isNews ? pick(OUTLETS) : source === 'youtube' ? pick(NAMES) : undefined,
      publishedAt,
      language: pick(langs),
      engagement,
      engagementScore,
      reach: views,
      sentiment,
      sentimentScore,
      emotion,
      relevance,
      relevanceReason: relevance >= 4 ? 'Directly on-topic with concrete, weighty detail.' : 'Related but fairly ordinary coverage.',
      topics,
      entities: [pick(['OpenAI', 'Anthropic', 'Google', 'Meta', 'Nvidia'])],
      analyzedAt: new Date(),
    });
  }
  await db.insert(schema.mentions).values(rows);

  // Quality ratings on the top-engagement items
  const top = [...rows].sort((a, b) => (b.engagementScore ?? 0) - (a.engagementScore ?? 0)).slice(0, 18);
  const dbTop = await db.select({ id: schema.mentions.id, ext: schema.mentions.externalId }).from(schema.mentions);
  const extToId = new Map(dbTop.map((m) => [m.ext, m.id]));
  for (const t of top) {
    const id = extToId.get(t.externalId!);
    if (!id) continue;
    await db.update(schema.mentions).set({
      quality: {
        score: 60 + Math.floor(rnd() * 38),
        relevance: 55 + Math.floor(rnd() * 44),
        virality: 40 + Math.floor(rnd() * 58),
        risk: rnd() < 0.7 ? 'low' : rnd() < 0.9 ? 'medium' : 'high',
        note: 'Well-sourced and timely; strong hook for the topic.',
      },
    }).where(eq(schema.mentions.id, id));
  }

  // ---- Trends ----
  await db.insert(schema.trends).values([
    { projectId: pid, topic: 'model release', n24: 41, baseline: 9.2, score: 4.5, explanation: 'A major model launch drove a burst of coverage and developer reactions in the last day.' },
    { projectId: pid, topic: 'ai chips', n24: 22, baseline: 6.1, score: 3.6, explanation: 'Renewed supply-constraint reports pushed accelerator discussion above its usual baseline.' },
    { projectId: pid, topic: 'ai regulation', n24: 18, baseline: 7.0, score: 2.6, explanation: 'A new consultation reignited debate about transparency requirements.' },
  ]);

  // ---- Narratives ----
  await db.insert(schema.narratives).values([
    { projectId: pid, title: 'Open models are catching up fast', description: 'A cluster of posts argues that open-weights releases now rival closed models on many tasks, framing it as a turning point for cost and control.', stance: 'positive', coordinated: 0, accounts: ['@ml_daily', '@builder_dao', '@openai_watch'], mentionCount: 24 },
    { projectId: pid, title: 'Regulation will slow innovation', description: 'A recurring thesis that proposed disclosure rules are burdensome and will push research elsewhere.', stance: 'negative', coordinated: 0, accounts: ['@reg_watch', '@vc_insider'], mentionCount: 15 },
    { projectId: pid, title: 'Safety is being sidelined for speed', description: 'Several accounts amplify near-identical claims that shipping cadence is outpacing evaluation, with unusually repetitive phrasing.', stance: 'polarizing', coordinated: 1, accounts: ['@safety_first', '@ai_researcher'], mentionCount: 11 },
  ]);

  // ---- Timeline ----
  const d = (days: number) => new Date(now - days * 86400_000).toISOString().slice(0, 10);
  await db.insert(schema.timelineEvents).values([
    { projectId: pid, eventDate: d(2), title: 'Major frontier model launched', description: 'A new flagship model was released with stronger reasoning and long-context support.', importance: 3 },
    { projectId: pid, eventDate: d(6), title: 'Regulator opens AI transparency consultation', description: 'Public consultation on disclosure of training data and model capabilities.', importance: 2 },
    { projectId: pid, eventDate: d(11), title: 'Large AI-infrastructure funding round', description: 'An accelerator-focused startup raised a sizable round amid strong demand.', importance: 2 },
    { projectId: pid, eventDate: d(18), title: 'Open-weights model tops leaderboard', description: 'A community fine-tune reached the top of a popular benchmark.', importance: 2 },
    { projectId: pid, eventDate: d(26), title: 'Enterprise adoption survey published', description: 'Report finds most enterprises now run at least one AI pilot.', importance: 1 },
  ]);

  // ---- Alerts ----
  await db.insert(schema.alerts).values([
    {
      projectId: pid, type: 'volume_spike', severity: 'high',
      message: 'Volume spike: 41 mentions in the last 24h vs an average of 9/day.',
      data: {
        explanation: 'A major model launch triggered a burst of news and developer commentary; coverage is broad and still rising.',
        topics: ['model release', 'chatbots', 'ai chips'],
        bySource: [{ source: 'reddit', n: 12 }, { source: 'gdelt', n: 10 }, { source: 'bluesky', n: 7 }],
        keyMentions: [{ source: 'gdelt', title: 'New frontier model beats prior benchmarks across reasoning tasks', url: 'https://example.com/article', sentiment: 'positive' }],
      },
    },
    {
      projectId: pid, type: 'sentiment_drop', severity: 'medium',
      message: 'Sharp sentiment drop: average -0.22 in the last 24h (baseline 0.06).',
      data: {
        explanation: 'A safety red-teaming report and pushback on training-data consent shifted the tone more negative.',
        topics: ['ai safety', 'ai ethics'],
        bySource: [{ source: 'mastodon', n: 6 }, { source: 'hackernews', n: 5 }],
        keyMentions: [{ source: 'hackernews', title: 'Red-teaming report finds jailbreaks still slip through filters', url: 'https://example.com/article', sentiment: 'negative' }],
      },
    },
  ]);

  // ---- Daily brief ----
  const brief = `## At a glance
- A major frontier model launch drove a **41-mention spike** (vs ~9/day), with broad, mostly positive coverage.
- Sentiment dipped on **AI safety** after a red-teaming report and consent pushback.
- **AI chips** discussion rose on renewed supply-constraint reports.

## What happened
The dominant story was the new flagship model, praised for reasoning and long-context handling. In parallel, a regulator opened a consultation on transparency, keeping **AI regulation** in the conversation.

## Sentiment and conversations
Overall tone is mildly positive, led by developer communities on Reddit and Bluesky. The main negative pull came from safety and ethics threads on Hacker News and Mastodon.

## Risks and opportunities
- **Risk:** a "safety is being sidelined for speed" narrative shows signs of coordinated amplification — worth monitoring.
- **Opportunity:** strong interest in open-weights models is a timely hook for content and positioning.`;
  await db.insert(schema.briefs).values({ projectId: pid, briefDate: d(0), content: brief });

  // ---- Story clustering ----
  const [story] = await db.insert(schema.stories).values({
    projectId: pid, title: 'New frontier model launch', summary: 'A flagship model release with stronger reasoning and long-context support drew broad coverage and developer reactions.',
  }).returning();
  const newsIds = await db.select({ id: schema.mentions.id, source: schema.mentions.source, title: schema.mentions.title }).from(schema.mentions);
  const linkIds = newsIds.filter((m) => (m.source === 'gdelt' || m.source === 'googlenews') && m.title?.includes('model')).slice(0, 5).map((m) => m.id);
  if (linkIds.length) await db.update(schema.mentions).set({ storyId: story.id }).where(inArray(schema.mentions.id, linkIds));

  // ---- Cached AI insights (clusters + causal) ----
  const today = new Date().toISOString().slice(0, 10);
  await db.insert(schema.meta).values({
    key: `clusters:${pid}:${today}`,
    value: [
      { family: 'innovation/technology', share: 32, sentiment: 'positive', example: 'The new model is a genuine step up on hard reasoning.' },
      { family: 'business/market', share: 22, sentiment: 'neutral', example: 'This will pressure competitors on price and capability.' },
      { family: 'politics/regulation', share: 16, sentiment: 'neutral', example: 'Disclosure rules could reshape how models ship.' },
      { family: 'safety/risks', share: 14, sentiment: 'negative', example: 'Red-teaming still finds jailbreaks slipping through.' },
      { family: 'ethics/values', share: 10, sentiment: 'negative', example: 'Artists want consent over training data.' },
      { family: 'irony/meme', share: 6, sentiment: 'neutral', example: 'Another week, another "AGI is near" thread.' },
    ],
  }).onConflictDoNothing();
  await db.insert(schema.meta).values({
    key: `causal:${pid}:${today}`,
    value: [
      { cause: 'Major frontier model launched', date: d(2), effects: ['+41 mentions in 24h (volume spike)', 'Sentiment turned more positive in developer communities'], narratives: ['Open models are catching up fast'] },
      { cause: 'Red-teaming safety report published', date: d(4), effects: ['Sentiment drop of ~0.28 on safety topics', 'Increased Hacker News discussion'], narratives: ['Safety is being sidelined for speed'] },
      { cause: 'Regulator opened transparency consultation', date: d(6), effects: ['Regulation mentions above baseline for 3 days'], narratives: ['Regulation will slow innovation'] },
    ],
  }).onConflictDoNothing();

  // ---- Source status (green dots on the Sources page) ----
  const status: Record<string, { ok: boolean; count: number; at: string; lastOkAt: string }> = {};
  const nowIso = new Date().toISOString();
  for (const s of SOURCES) status[s] = { ok: true, count: rows.filter((r) => r.source === s).length, at: nowIso, lastOkAt: nowIso };
  await db.insert(schema.meta).values({ key: 'source_status', value: status }).onConflictDoNothing();
  await db.insert(schema.meta).values({ key: 'last_ingest_at', value: nowIso }).onConflictDoNothing();

  return { linkIds, storyId: story.id };
}
