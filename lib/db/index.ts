import { sql } from 'drizzle-orm';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import * as schema from './schema';

// Un solo tipo per entrambi i driver: l'API di query drizzle è identica,
// cambia solo il trasporto (Neon HTTP in produzione, PGlite in locale).
export type DB = PgliteDatabase<typeof schema>;

const g = globalThis as unknown as { __socialRadarDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  if (!g.__socialRadarDb) {
    g.__socialRadarDb = init().catch((e) => {
      // Non lasciare in cache una promise fallita: il prossimo tentativo riparte da zero.
      g.__socialRadarDb = undefined;
      throw e;
    });
  }
  return g.__socialRadarDb;
}

async function init(): Promise<DB> {
  let db: DB;
  if (process.env.DATABASE_URL) {
    const { neon } = await import('@neondatabase/serverless');
    const { drizzle } = await import('drizzle-orm/neon-http');
    db = drizzle(neon(process.env.DATABASE_URL), { schema }) as unknown as DB;
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const { mkdirSync } = await import('node:fs');
    const dir = process.env.PGLITE_DIR ?? '.data/pglite';
    mkdirSync(dir, { recursive: true });
    const client = new PGlite(dir);
    db = drizzle(client, { schema }) as unknown as DB;
  }
  await ensureSchema(db);
  if (process.env.DEMO_MODE === '1') {
    const { seedDemo } = await import('./demo-seed');
    await seedDemo(db);
  } else {
    await seed(db);
    await seedUsers(db);
  }
  return db;
}

const DDL = [
  `CREATE TABLE IF NOT EXISTS projects (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    keywords JSONB NOT NULL DEFAULT '[]',
    languages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS benchmark_entities (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    keywords JSONB NOT NULL DEFAULT '[]'
  )`,
  `CREATE TABLE IF NOT EXISTS mentions (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    url TEXT,
    title TEXT,
    content TEXT NOT NULL DEFAULT '',
    author TEXT,
    author_handle TEXT,
    community TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    language TEXT,
    engagement JSONB,
    engagement_score REAL NOT NULL DEFAULT 0,
    reach INTEGER,
    sentiment TEXT,
    sentiment_score REAL,
    topics JSONB,
    entities JSONB,
    quality JSONB,
    analyzed_at TIMESTAMPTZ,
    story_id INTEGER,
    UNIQUE (project_id, source, external_id)
  )`,
  // Migrazioni additive per database esistenti
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS all_terms JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS exclude_terms JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS countries JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS telegram_channels JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS brand_voice TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS semantic_context TEXT`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS rss_feeds JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS relevance INTEGER`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS relevance_reason TEXT`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS translations JSONB`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS emotion TEXT`,
  `ALTER TABLE benchmark_entities ADD COLUMN IF NOT EXISTS is_own_brand INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    ai_enabled INTEGER NOT NULL DEFAULT 0,
    must_change_password INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id INTEGER`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private'`,
  `CREATE TABLE IF NOT EXISTS trends (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    topic TEXT NOT NULL,
    n24 INTEGER NOT NULL,
    baseline REAL NOT NULL,
    score REAL NOT NULL,
    explanation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS narratives (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    stance TEXT,
    coordinated INTEGER NOT NULL DEFAULT 0,
    accounts JSONB NOT NULL DEFAULT '[]',
    mention_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS influencer_profiles (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author TEXT NOT NULL,
    source TEXT NOT NULL,
    profile_md TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS content_ideas (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    content_md TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS share_links (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS timeline_events (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    importance INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS mentions_proj_pub ON mentions (project_id, published_at DESC)`,
  `CREATE INDEX IF NOT EXISTS mentions_pending ON mentions (project_id) WHERE analyzed_at IS NULL`,
  `CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    summary TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'media',
    message TEXT NOT NULL,
    data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS briefs (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    brief_date DATE NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, brief_date)
  )`,
  `CREATE TABLE IF NOT EXISTS api_usage (
    id SERIAL PRIMARY KEY,
    ts TIMESTAMPTZ NOT NULL DEFAULT now(),
    model TEXT NOT NULL,
    purpose TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value JSONB
  )`,
];

async function ensureSchema(db: DB) {
  for (const stmt of DDL) {
    await db.execute(sql.raw(stmt));
  }
}

// Demo project on first run: the user edits it from Settings.
async function seed(db: DB) {
  const existing = await db.select({ id: schema.projects.id }).from(schema.projects).limit(1);
  if (existing.length > 0) return;
  const [proj] = await db.insert(schema.projects).values({
    name: 'Artificial Intelligence',
    keywords: ['artificial intelligence', 'generative AI'],
    languages: ['en'],
  }).returning();
  await db.insert(schema.benchmarkEntities).values([
    { projectId: proj.id, name: 'OpenAI', keywords: ['OpenAI', 'ChatGPT', 'GPT-5'] },
    { projectId: proj.id, name: 'Anthropic', keywords: ['Anthropic', 'Claude'] },
    { projectId: proj.id, name: 'Google', keywords: ['Gemini', 'Google DeepMind', 'DeepMind'] },
    { projectId: proj.id, name: 'Meta', keywords: ['Meta AI', 'Llama'] },
  ]);
}

// Amministratore iniziale, creato al primo avvio se il database è vuoto.
// Configuralo con le variabili d'ambiente ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME.
// Se non le imposti, viene creato un admin di default con password nota: in quel
// caso l'app OBBLIGA a cambiarla al primo accesso. Nuovi membri si aggiungono
// dalla UI (Impostazioni → Team), non serve toccare il codice.
function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@example.com').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'changeme';
  const name = process.env.ADMIN_NAME || 'Admin';
  // Password di default (nessuna ADMIN_PASSWORD impostata) => forza il cambio.
  const mustChange = process.env.ADMIN_PASSWORD ? 0 : 1;
  return { name, email, password, mustChange };
}

async function seedUsers(db: DB) {
  const existing = await db.select({ id: schema.users.id }).from(schema.users).limit(1);
  if (existing.length > 0) return;

  const { hashPassword } = await import('@/lib/password');
  const a = seedAdmin();
  const [admin] = await db.insert(schema.users).values({
    name: a.name, email: a.email, role: 'admin',
    aiEnabled: 1, mustChangePassword: a.mustChange,
    passwordHash: hashPassword(a.password),
  }).returning();

  // I progetti già esistenti (creati prima del multi-utente) vanno all'admin
  if (admin) {
    await db.execute(sql`UPDATE projects SET owner_id = ${admin.id} WHERE owner_id IS NULL`);
  }
}

export async function getMeta<T>(key: string): Promise<T | null> {
  const db = await getDb();
  const rows = await db.select().from(schema.meta).where(sql`${schema.meta.key} = ${key}`);
  return rows.length ? (rows[0].value as T) : null;
}

export async function setMeta(key: string, value: unknown) {
  const db = await getDb();
  await db.insert(schema.meta).values({ key, value })
    .onConflictDoUpdate({ target: schema.meta.key, set: { value } });
}
