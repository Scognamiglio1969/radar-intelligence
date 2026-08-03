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
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'listening'`,
  `ALTER TABLE projects ADD COLUMN IF NOT EXISTS key_messages JSONB NOT NULL DEFAULT '[]'`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS relevance INTEGER`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS relevance_reason TEXT`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS translations JSONB`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS emotion TEXT`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'post'`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS article_text TEXT`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS article_at TIMESTAMPTZ`,
  // Le mention già in archivio sono nate senza "kind": si assegna dalla fonte,
  // una volta sola (le successive nascono già classificate dall'ingest).
  `UPDATE mentions SET kind = 'article'
     WHERE kind = 'post' AND source IN ('googlenews','gdelt','newsapi','rss','upload')`,
  // Coda di estrazione: gli articoli senza testo ancora da tentare.
  `CREATE INDEX IF NOT EXISTS mentions_article_todo ON mentions (project_id)
     WHERE kind = 'article' AND article_at IS NULL`,
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
  `ALTER TABLE narratives ADD COLUMN IF NOT EXISTS mention_ids JSONB NOT NULL DEFAULT '[]'`,
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
  `CREATE TABLE IF NOT EXISTS review_sources (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    identifier TEXT NOT NULL,
    label TEXT NOT NULL,
    country TEXT,
    last_fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES review_sources(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    rating INTEGER NOT NULL,
    title TEXT,
    content TEXT NOT NULL DEFAULT '',
    author TEXT,
    url TEXT,
    published_at TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, external_id)
  )`,
  `CREATE INDEX IF NOT EXISTS reviews_proj_pub ON reviews (project_id, published_at DESC)`,
  `CREATE TABLE IF NOT EXISTS sport_sources (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    competition TEXT NOT NULL,
    team_id TEXT NOT NULL,
    team_name TEXT NOT NULL,
    ticker TEXT,
    last_fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS sport_matches (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    source_id INTEGER NOT NULL REFERENCES sport_sources(id) ON DELETE CASCADE,
    external_id TEXT NOT NULL,
    competition TEXT NOT NULL,
    home_team TEXT NOT NULL,
    away_team TEXT NOT NULL,
    home_score INTEGER,
    away_score INTEGER,
    status TEXT NOT NULL,
    utc_date TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (source_id, external_id)
  )`,
  `CREATE INDEX IF NOT EXISTS sport_matches_proj_date ON sport_matches (project_id, utc_date DESC)`,
  `CREATE TABLE IF NOT EXISTS stock_prices (
    id SERIAL PRIMARY KEY,
    ticker TEXT NOT NULL,
    date DATE NOT NULL,
    close REAL NOT NULL,
    change_pct REAL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ticker, date)
  )`,
  `CREATE TABLE IF NOT EXISTS search_interest (
    id SERIAL PRIMARY KEY,
    entity_id INTEGER NOT NULL REFERENCES benchmark_entities(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    value INTEGER NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (entity_id, date)
  )`,
  `CREATE TABLE IF NOT EXISTS wiki_pages (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    last_fetched_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS wiki_edits (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
    rev_id INTEGER NOT NULL,
    "user" TEXT NOT NULL,
    is_anon INTEGER NOT NULL DEFAULT 0,
    is_minor INTEGER NOT NULL DEFAULT 0,
    comment TEXT NOT NULL DEFAULT '',
    size INTEGER NOT NULL,
    size_diff INTEGER,
    tags JSONB NOT NULL DEFAULT '[]',
    "timestamp" TIMESTAMPTZ NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (page_id, rev_id)
  )`,
  `CREATE INDEX IF NOT EXISTS wiki_edits_page_ts ON wiki_edits (page_id, "timestamp" DESC)`,
  `CREATE TABLE IF NOT EXISTS import_files (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    row_count INTEGER NOT NULL DEFAULT 0,
    columns JSONB NOT NULL DEFAULT '[]',
    profiles JSONB NOT NULL DEFAULT '[]',
    proposal JSONB,
    mapping JSONB NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'uploaded',
    report JSONB,
    raw_purged INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    imported_at TIMESTAMPTZ
  )`,
  `CREATE TABLE IF NOT EXISTS import_rows (
    id SERIAL PRIMARY KEY,
    file_id INTEGER NOT NULL REFERENCES import_files(id) ON DELETE CASCADE,
    row_index INTEGER NOT NULL,
    data JSONB NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS import_rows_file ON import_rows (file_id, row_index)`,
  `ALTER TABLE import_files ADD COLUMN IF NOT EXISTS used_ai INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE mentions ADD COLUMN IF NOT EXISTS import_file_id INTEGER`,
  `CREATE INDEX IF NOT EXISTS mentions_import_file ON mentions (import_file_id)`,
  `CREATE TABLE IF NOT EXISTS custom_reports (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    days INTEGER NOT NULL DEFAULT 30,
    pages JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS custom_reports_project ON custom_reports (project_id)`,
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
