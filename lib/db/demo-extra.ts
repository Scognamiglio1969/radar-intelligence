import type { DB } from './index';
import * as schema from './schema';
import type { Engagement } from './schema';
import { compilePlan, queriesMatching, validatePlan, type QueryPlan } from '@/lib/query-plan';

// ---------------------------------------------------------------------------
// Demo: i tre tipi di progetto e il piano d'ascolto, con dati di fantasia.
//
// "Aurora Mobility", i suoi competitor, le testate di fact-checking e le
// trasmissioni sono inventati: la demo pubblica e le schermate del README
// mostrano come funziona Radar senza mettere in pagina aziende o persone vere.
// Come il resto della demo, niente chiamate AI: il piano è quello che il
// costruttore di query produce per la richiesta scritta qui sotto.
// ---------------------------------------------------------------------------

export const DEMO_BRIEF =
  'Monitor the company Aurora Mobility in relation to the riders’ strike and to city bans on e-scooters, and against its competitors Volta Ride, Ruota and Metrolink.';

export const DEMO_PLAN: QueryPlan = validatePlan({
  version: 1,
  brief: DEMO_BRIEF,
  origin: 'ai',
  concepts: [
    { id: 'aurora', label: 'Aurora Mobility', role: 'subject', terms: ['Aurora Mobility', 'Aurora scooters', 'Aurora e-bikes', 'Aurora app'], note: 'Official name, the two product lines and the app people talk about.' },
    { id: 'strike', label: 'Riders’ strike', role: 'context', terms: ['riders strike', 'rider strike', 'walkout', 'picket', 'sciopero dei rider', 'sciopero', 'presidio', 'protesta'], note: 'The strike as people actually write it, in English and Italian.' },
    { id: 'bans', label: 'City bans', role: 'context', terms: ['e-scooter ban', 'scooter ban', 'city council', 'speed limit', 'divieto monopattini', 'consiglio comunale', 'limite di velocità'], note: 'Local rules that can stop the service.' },
    { id: 'volta', label: 'Volta Ride', role: 'competitor', terms: ['Volta Ride', 'Volta scooters'] },
    { id: 'ruota', label: 'Ruota', role: 'competitor', terms: ['Ruota bike', 'Ruota app', 'Ruota'], note: '“Ruota” is also the Italian word for wheel: see the exclusions.' },
    { id: 'metrolink', label: 'Metrolink', role: 'competitor', terms: ['Metrolink Mobility', 'Metrolink shuttle'] },
    { id: 'noise', label: 'Everyday meanings', role: 'noise', terms: ['aurora borealis', 'aurora boreale', 'ruota di scorta', 'ruota panoramica'], note: '“Aurora” and “Ruota” are everyday words: these phrases mark the wrong meaning.' },
  ],
  queries: [
    { id: 'aurora', name: 'Aurora Mobility', kind: 'core', all: ['aurora'], none: ['noise'] },
    { id: 'aurora-strike', name: 'Aurora × riders’ strike', kind: 'context', all: ['aurora', 'strike'], none: ['noise'] },
    { id: 'aurora-bans', name: 'Aurora × city bans', kind: 'context', all: ['aurora', 'bans'], none: ['noise'] },
    { id: 'aurora-volta', name: 'Aurora vs Volta Ride', kind: 'comparison', all: ['aurora', 'volta'], none: ['noise'] },
    { id: 'volta', name: 'Volta Ride', kind: 'competitor', all: ['volta'] },
    { id: 'ruota', name: 'Ruota', kind: 'competitor', all: ['ruota'], none: ['noise'] },
    { id: 'metrolink', name: 'Metrolink', kind: 'competitor', all: ['metrolink'] },
  ],
}).plan;

const HEADLINES: { text: string; topic: string; weight: number; sentiment: 'positive' | 'neutral' | 'negative' }[] = [
  { text: 'Aurora Mobility expands its scooter fleet to three new cities', topic: 'fleet expansion', weight: 3, sentiment: 'positive' },
  { text: 'Aurora app update adds group rides and a night mode', topic: 'product', weight: 2, sentiment: 'positive' },
  { text: 'Aurora e-bikes top a user satisfaction survey', topic: 'customer satisfaction', weight: 2, sentiment: 'positive' },
  { text: 'Aurora Mobility posts its first quarterly profit', topic: 'results', weight: 1, sentiment: 'positive' },
  { text: 'Riders strike halts Aurora Mobility deliveries in Milan', topic: 'riders strike', weight: 4, sentiment: 'negative' },
  { text: 'Sciopero dei rider: presidio davanti alla sede di Aurora Mobility', topic: 'riders strike', weight: 3, sentiment: 'negative' },
  { text: 'Aurora Mobility riders plan a new walkout over pay', topic: 'riders strike', weight: 3, sentiment: 'negative' },
  { text: 'Picket at an Aurora scooters depot draws hundreds', topic: 'riders strike', weight: 2, sentiment: 'negative' },
  { text: 'City council weighs an e-scooter ban that would hit Aurora scooters', topic: 'scooter ban', weight: 3, sentiment: 'negative' },
  { text: 'Divieto monopattini: Aurora Mobility annuncia ricorso al TAR', topic: 'scooter ban', weight: 2, sentiment: 'neutral' },
  { text: 'New speed limit rules for Aurora scooters downtown', topic: 'scooter ban', weight: 2, sentiment: 'neutral' },
  { text: 'Aurora Mobility and Volta Ride trade blows over pricing', topic: 'pricing', weight: 2, sentiment: 'neutral' },
  { text: 'Volta Ride vs Aurora scooters: which one is cheaper this summer?', topic: 'pricing', weight: 1, sentiment: 'neutral' },
  { text: 'Volta Ride launches a monthly subscription', topic: 'pricing', weight: 2, sentiment: 'positive' },
  { text: 'Volta scooters return to the streets after a safety recall', topic: 'safety', weight: 2, sentiment: 'negative' },
  { text: 'Ruota bike opens its first hub in Turin', topic: 'fleet expansion', weight: 2, sentiment: 'positive' },
  { text: 'Ruota app raises a Series B round', topic: 'funding', weight: 1, sentiment: 'positive' },
  { text: 'Metrolink Mobility partners with the regional railway', topic: 'partnerships', weight: 2, sentiment: 'positive' },
  { text: 'Metrolink shuttle tests autonomous rides in the suburbs', topic: 'safety', weight: 1, sentiment: 'neutral' },
];

const OUTLETS = ['City Wire', 'Mobility Today', 'Il Quotidiano Urbano', 'Tech Street', 'Northern Post'];
const PEOPLE = ['Ada Whitfield', 'Marco Reyes', 'Lena Novak', 'Sam Okonkwo', 'Priya Nair', 'Tomás Berg'];
const SHOWS = [
  { name: 'Urban Mobility Weekly', minutes: 42, lang: 'en' },
  { name: 'Il Monopattino', minutes: 28, lang: 'it' },
  { name: 'Last Mile Talk', minutes: 35, lang: 'en' },
];

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemoExtra(db: DB) {
  const rnd = mulberry32(20260917);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const now = Date.now();
  const compiled = compilePlan(DEMO_PLAN);

  // ---- Progetto di ascolto con il piano d'ascolto ----
  const [aurora] = await db.insert(schema.projects).values({
    name: 'Aurora Mobility', mode: 'listening', visibility: 'shared', ownerId: 1,
    keywords: ['Aurora Mobility', 'Aurora scooters', 'Aurora e-bikes', 'Aurora app', 'riders strike', 'e-scooter ban', 'Volta Ride', 'Ruota bike', 'Metrolink Mobility'],
    excludeTerms: ['aurora borealis', 'aurora boreale', 'ruota di scorta', 'ruota panoramica'],
    languages: ['en', 'it'], countries: ['IT', 'GB'],
    semanticContext: DEMO_BRIEF,
    queryPlan: DEMO_PLAN,
  }).returning();
  await db.insert(schema.benchmarkEntities).values([
    { projectId: aurora.id, name: 'Aurora Mobility', keywords: ['Aurora Mobility', 'Aurora scooters', 'Aurora e-bikes'], isOwnBrand: 1 },
    { projectId: aurora.id, name: 'Volta Ride', keywords: ['Volta Ride', 'Volta scooters'] },
    { projectId: aurora.id, name: 'Ruota', keywords: ['Ruota bike', 'Ruota app'] },
    { projectId: aurora.id, name: 'Metrolink', keywords: ['Metrolink Mobility', 'Metrolink shuttle'] },
  ]);

  const weighted = HEADLINES.flatMap((h) => Array.from({ length: h.weight }, () => h));
  const sources = ['googlenews', 'gdelt', 'newsdata', 'bluesky', 'mastodon', 'lemmy', 'reddit'] as const;
  type Row = typeof schema.mentions.$inferInsert;
  const rows: Row[] = [];
  for (let i = 0; i < 180; i++) {
    const h = pick(weighted);
    const source = pick(sources);
    const isNews = source === 'googlenews' || source === 'gdelt' || source === 'newsdata';
    // Lo sciopero è la notizia della settimana: più recente degli altri temi.
    const recent = h.topic === 'riders strike' ? rnd() < 0.8 : rnd() < 0.35;
    const ageDays = recent ? rnd() * 7 : 7 + rnd() * 23;
    const likes = isNews ? 0 : Math.floor(rnd() * 400);
    const comments = isNews ? 0 : Math.floor(rnd() * 90);
    const shares = isNews ? 0 : Math.floor(rnd() * 60);
    const engagement: Engagement = { likes, comments, shares };
    const content = `${h.text}. ${pick([
      'Local unions say the dispute is far from over.',
      'The company says service levels are back to normal in most districts.',
      'Residents are split between safety concerns and the convenience of shared scooters.',
      'Analysts expect pricing pressure to continue through the autumn.',
    ])}`;
    const sentimentScore = h.sentiment === 'positive' ? 0.4 + rnd() * 0.4 : h.sentiment === 'negative' ? -0.4 - rnd() * 0.4 : -0.1 + rnd() * 0.2;
    rows.push({
      projectId: aurora.id, source, kind: isNews ? 'article' : 'post',
      externalId: `demo-aurora-${i}`, url: 'https://example.com/aurora',
      title: h.text, content,
      author: isNews ? pick(OUTLETS) : pick(PEOPLE),
      community: isNews ? pick(OUTLETS) : undefined,
      publishedAt: new Date(now - ageDays * 86400_000),
      language: /[àèìòù]|sciopero|divieto|presidio/i.test(h.text) ? 'it' : 'en',
      country: pick(['it', 'it', 'gb']),
      engagement, engagementScore: likes + 2 * comments + 3 * shares,
      reach: isNews ? Math.floor(20000 + rnd() * 180000) : undefined,
      sentiment: h.sentiment, sentimentScore,
      relevance: h.topic === 'riders strike' ? 5 : 4,
      topics: [h.topic],
      analyzedAt: new Date(),
      queryIds: queriesMatching(compiled, `${h.text} ${content}`),
    });
  }
  // Episodi di podcast: tre trasmissioni che tornano sul tema.
  for (let i = 0; i < 14; i++) {
    const show = SHOWS[i % SHOWS.length];
    const title = pick([
      'Why the Aurora Mobility riders strike matters for every city',
      'Aurora scooters and the e-scooter ban debate',
      'Sciopero dei rider e monopattini: cosa succede con Aurora Mobility',
      'Volta Ride vs Aurora Mobility: the price war explained',
    ]);
    rows.push({
      projectId: aurora.id, source: 'podcastindex', kind: 'article',
      externalId: `demo-aurora-pod-${i}`, url: 'https://example.com/podcast',
      title, content: `${title}. This week the hosts look at shared mobility and labour.`,
      author: show.name, community: `${show.name} · ${show.minutes} min`, authorHandle: `feed:${1000 + (i % 3)}`,
      publishedAt: new Date(now - (i * 2 + 1) * 86400_000), language: show.lang,
      engagementScore: 0, analyzedAt: new Date(), sentiment: 'neutral', sentimentScore: 0,
      topics: ['riders strike'],
      queryIds: queriesMatching(compiled, title),
    });
  }
  const inserted = await db.insert(schema.mentions).values(rows)
    .returning({ id: schema.mentions.id, title: schema.mentions.title, at: schema.mentions.publishedAt });
  const idsWith = (re: RegExp) => inserted.filter((m) => re.test(m.title ?? '')).map((m) => m.id);

  // ---- Verifiche di fact-checker inventati ----
  const circ = (ids: number[], last7: number, prev7: number, terms: string[]) => ({
    total: ids.length, last7, prev7, sources: { googlenews: Math.ceil(ids.length / 2), bluesky: Math.floor(ids.length / 2) },
    sampleIds: ids.slice(0, 8), lastSeen: new Date(now - 86400_000).toISOString(), terms, at: new Date().toISOString(),
  });
  const review = (publisher: string, rating: string, daysAgo: number, language = 'en') => ({
    publisher, site: `${publisher.toLowerCase().replace(/\s+/g, '')}.example`, url: 'https://example.com/fact-check',
    title: `Fact check by ${publisher}`, reviewDate: new Date(now - daysAgo * 86400_000).toISOString(), rating, language,
  });
  await db.insert(schema.factChecks).values([
    {
      projectId: aurora.id, claimKey: 'demo-fire', claim: 'Aurora scooters caught fire in twelve cities last month',
      claimant: 'Viral social post', claimDate: new Date(now - 20 * 86400_000),
      reviews: [review('CheckDesk', 'False', 18), review('Verifica Facile', 'Falso', 16, 'it')],
      verdict: 'false', language: 'en', query: 'Aurora scooters',
      circulation: circ(idsWith(/Aurora scooters/), 11, 4, ['scooters', 'Aurora', 'caught']),
    },
    {
      projectId: aurora.id, claimKey: 'demo-ban', claim: 'The city council has already banned e-scooters everywhere',
      claimant: 'Local forum', claimDate: new Date(now - 12 * 86400_000),
      reviews: [review('Verifica Facile', 'Fuorviante', 10, 'it')],
      verdict: 'misleading', language: 'it', query: 'e-scooter ban',
      circulation: circ(idsWith(/ban|Divieto/i), 3, 6, ['e-scooter', 'council', 'banned']),
    },
    {
      projectId: aurora.id, claimKey: 'demo-pay', claim: 'Aurora Mobility cut riders’ pay by 40%',
      claimant: 'Union leaflet', claimDate: new Date(now - 9 * 86400_000),
      reviews: [review('TruthLens', 'Half true', 7), review('CheckDesk', 'False', 6)],
      verdict: 'contested', language: 'en', query: 'Aurora Mobility',
      circulation: circ(idsWith(/strike|walkout|Sciopero/i), 14, 9, ['Mobility', 'riders', 'Aurora']),
    },
    {
      projectId: aurora.id, claimKey: 'demo-recall', claim: 'Volta Ride recalled its whole scooter fleet',
      claimant: 'Industry newsletter', claimDate: new Date(now - 25 * 86400_000),
      reviews: [review('TruthLens', 'Mostly true', 22)],
      verdict: 'true', language: 'en', query: 'Volta Ride',
      circulation: circ(idsWith(/recall/i), 2, 1, ['scooter', 'recalled', 'Volta']),
    },
    {
      projectId: aurora.id, claimKey: 'demo-leave', claim: 'Aurora Mobility is leaving Italy',
      claimant: 'Anonymous account', claimDate: new Date(now - 40 * 86400_000),
      reviews: [review('Verifica Facile', 'Falso', 38, 'it')],
      verdict: 'false', language: 'it', query: 'Aurora Mobility',
      circulation: circ([], 0, 0, ['Mobility', 'leaving', 'Aurora']),
    },
  ]);

  // ---- Progetto Talkwalker (i topic arrivano dallo stub demo del connettore) ----
  await db.insert(schema.projects).values({
    name: 'Group reputation (Talkwalker)', mode: 'talkwalker', visibility: 'shared', ownerId: 1,
    talkwalkerProject: 'demo_group_2026', talkwalkerTopics: ['brand', 'leadership'],
    keywords: [], languages: [],
    semanticContext: 'Reputation of a fictional group across brand, leadership and ESG, read from the topics configured in Talkwalker.',
  });

  // ---- Progetto import ----
  await db.insert(schema.projects).values({
    name: 'Quarterly survey exports', mode: 'upload', visibility: 'shared', ownerId: 1,
    keywords: [], languages: ['en'],
  });

  return aurora.id;
}

