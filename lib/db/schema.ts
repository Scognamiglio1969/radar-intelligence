import {
  pgTable, serial, text, integer, real, jsonb, timestamp, date,
} from 'drizzle-orm/pg-core';

export type Engagement = {
  likes?: number; comments?: number; shares?: number; views?: number;
};

export type Quality = {
  score: number; relevance: number; virality: number;
  risk: 'low' | 'medium' | 'high'; note?: string;
};

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('member'), // 'admin' | 'member'
  // AI attiva per i progetti di questo utente (admin sempre true).
  // I membri restano "dormienti" finché l'admin non li accende (serve budget).
  aiEnabled: integer('ai_enabled').notNull().default(0),
  mustChangePassword: integer('must_change_password').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  // 'listening' = raccolta automatica da fonti web; 'upload' = ingestion di file
  // (Excel/CSV) caricati dall'utente, nessuno scraping.
  mode: text('mode').notNull().default('listening'),
  // Proprietario del progetto (chi lo ha creato); null = legacy/condiviso a tutti
  ownerId: integer('owner_id'),
  // 'private' = solo il proprietario e l'admin; 'shared' = tutto il team lo vede
  visibility: text('visibility').notNull().default('private'),
  // Query booleana: keywords = OR (almeno uno), allTerms = AND (tutti),
  // excludeTerms = NOT (nessuno)
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  allTerms: jsonb('all_terms').$type<string[]>().notNull().default([]),
  excludeTerms: jsonb('exclude_terms').$type<string[]>().notNull().default([]),
  languages: jsonb('languages').$type<string[]>().notNull().default([]),
  // Codici paese ISO (es. IT, US): filtra le fonti news per area geografica
  countries: jsonb('countries').$type<string[]>().notNull().default([]),
  // Canali Telegram pubblici da sorvegliare (username senza @)
  telegramChannels: jsonb('telegram_channels').$type<string[]>().notNull().default([]),
  // Feed RSS/Atom personalizzati da seguire (URL)
  rssFeeds: jsonb('rss_feeds').$type<string[]>().notNull().default([]),
  // Tono di voce del brand, usato dal Content Studio
  brandVoice: text('brand_voice'),
  // Area semantica: descrizione del tema in linguaggio naturale; genera i
  // termini di ricerca via AI e guida il giudizio di rilevanza (stelle)
  semanticContext: text('semantic_context'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const benchmarkEntities = pgTable('benchmark_entities', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  name: text('name').notNull(),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  // 1 = questa entità è "il tuo brand" (il soggetto dell'analisi), non un competitor.
  isOwnBrand: integer('is_own_brand').notNull().default(0),
});

export const mentions = pgTable('mentions', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  source: text('source').notNull(),
  externalId: text('external_id').notNull(),
  url: text('url'),
  title: text('title'),
  content: text('content').notNull().default(''),
  author: text('author'),
  authorHandle: text('author_handle'),
  community: text('community'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull().defaultNow(),
  language: text('language'),
  engagement: jsonb('engagement').$type<Engagement>(),
  engagementScore: real('engagement_score').notNull().default(0),
  reach: integer('reach'),
  sentiment: text('sentiment'),
  sentimentScore: real('sentiment_score'),
  // Emozione dominante (Plutchik-lite): joy/trust/fear/anger/sadness/surprise
  emotion: text('emotion'),
  // Rilevanza AI rispetto al tema del progetto: 1-5 stelle + motivazione breve
  relevance: integer('relevance'),
  relevanceReason: text('relevance_reason'),
  // Traduzioni cache: { it: { title, content }, en: {...} } — mai ritradotte
  translations: jsonb('translations').$type<Record<string, { title?: string; content: string }>>(),
  topics: jsonb('topics').$type<string[]>(),
  entities: jsonb('entities').$type<string[]>(),
  quality: jsonb('quality').$type<Quality>(),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }),
  storyId: integer('story_id'),
});

export const stories = pgTable('stories', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable('alerts', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  type: text('type').notNull(),
  severity: text('severity').notNull().default('media'),
  message: text('message').notNull(),
  data: jsonb('data').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const briefs = pgTable('briefs', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  briefDate: date('brief_date').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const apiUsage = pgTable('api_usage', {
  id: serial('id').primaryKey(),
  ts: timestamp('ts', { withTimezone: true }).notNull().defaultNow(),
  model: text('model').notNull(),
  purpose: text('purpose').notNull(),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costUsd: real('cost_usd').notNull().default(0),
});

export const meta = pgTable('meta', {
  key: text('key').primaryKey(),
  value: jsonb('value').$type<unknown>(),
});

// Trend emergenti: temi la cui velocità di crescita è anomala
export const trends = pgTable('trends', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  topic: text('topic').notNull(),
  n24: integer('n24').notNull(),
  baseline: real('baseline').notNull(),
  score: real('score').notNull(),
  explanation: text('explanation'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Narrazioni rilevate (cluster di messaggi che spingono la stessa tesi)
export const narratives = pgTable('narratives', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  stance: text('stance'),
  coordinated: integer('coordinated').notNull().default(0),
  accounts: jsonb('accounts').$type<string[]>().notNull().default([]),
  // Id delle mention che compongono la narrazione (per aprirne i post in Listening).
  mentionIds: jsonb('mention_ids').$type<number[]>().notNull().default([]),
  mentionCount: integer('mention_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Profili AI degli autori influenti + bozza di contatto
export const influencerProfiles = pgTable('influencer_profiles', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  author: text('author').notNull(),
  source: text('source').notNull(),
  profileMd: text('profile_md').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Idee di contenuto generate dal Content Studio
export const contentIdeas = pgTable('content_ideas', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  contentMd: text('content_md').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Link di condivisione read-only con scadenza
export const shareLinks = pgTable('share_links', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  token: text('token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Timeline: eventi salienti del settore, estratti giorno per giorno dall'AI
export const timelineEvents = pgTable('timeline_events', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').notNull(),
  eventDate: date('event_date').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  importance: integer('importance').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
