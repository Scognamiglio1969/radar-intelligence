import { eq } from 'drizzle-orm';
import { getDb, setMeta, getMeta } from '@/lib/db';
import { mentions, projects, benchmarkEntities } from '@/lib/db/schema';
import { CONNECTORS, kindOf } from '@/lib/connectors';
import { setTelegramChannels } from '@/lib/connectors/telegram';
import { setRssFeeds } from '@/lib/connectors/rss';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import type { RawMention, ListeningQuery } from '@/lib/connectors/types';

export type SourceStatus = Record<string, {
  ok: boolean; count: number; error?: string; at: string;
  /** Ultima raccolta riuscita: distingue un singhiozzo momentaneo da una fonte ferma */
  lastOkAt?: string;
}>;

function rawEngagementScore(m: RawMention): number {
  const e = m.engagement;
  if (!e) return 0;
  return (e.likes ?? 0) + 2 * (e.comments ?? 0) + 3 * (e.shares ?? 0) + (e.views ?? 0) / 200;
}

// Le entità di Benchmark (i concorrenti) NON avevano una ricerca propria: il
// Benchmark filtrava solo le mention già raccolte dalla query del progetto,
// quindi un concorrente compariva a zero mention a meno che le sue notizie
// non citassero PER CASO anche uno dei termini di tema del progetto — un
// progetto che cerca "healthcare platform, provider portal" non troverà mai
// nulla su "Howden" a meno che un articolo non nomini entrambe le cose.
//
// La correzione ovvia — accodare le keyword di ogni entità ai termini OR del
// progetto — non funziona da sola: verificato che OGNI connettore taglia la
// lista dei termini per chiamata (2 per GitHub/YouTube, fino a 6 per GDELT/
// NewsAPI), quindi con più di pochissimi termini extra non arriverebbero mai
// alla vera chiamata API, tagliati via prima ancora di partire — lo stesso
// limite morde anche la query del PROGETTO stesso, non solo i concorrenti:
// un tema descritto con 15 termini OR ne userebbe sempre e solo i primi 2-6,
// sempre gli stessi, ciclo dopo ciclo.
//
// La soluzione: più CHIAMATE invece di più termini per chiamata. Per le
// fonti generaliste gratuite e a quota comoda (notizie e social pubblici) i
// termini si spezzano in blocchi della dimensione che quella fonte accetta,
// e si lancia una chiamata per blocco — così TUTTI i termini vengono
// interrogati nello stesso ciclo, non solo i primi. Questo vale sia per la
// query del progetto sia, aggiuntiva, per quella di ogni entità di
// benchmark con le sue keyword (che è la vera correzione del Benchmark: un
// concorrente ora ha una ricerca propria, non solo il filtro su ciò che il
// progetto ha già raccolto).
//
// Sulle fonti a quota stretta (GitHub 10/min, Stack Exchange, arXiv, SEC
// EDGAR, YouTube) o a pagamento (X, Instagram, Facebook, TikTok, NewsAPI,
// LinkedIn) NON si moltiplicano le chiamate: lì si resta a una chiamata sola
// con i primi termini, ruotati ad ogni ciclo (stesso principio, più lento ma
// senza rischiare di esaurire una quota o una spesa a pagamento in un colpo
// solo). Il filtro AND del progetto non si applica alle ricerche di
// un'entità (un vincolo pensato per il tema del progetto non ha senso per un
// concorrente), il filtro NOT sì (tiene fuori il rumore anche dalle notizie
// di un concorrente).
const CONNECTOR_TERM_CAP: Partial<Record<string, number>> = {
  gdelt: 6, reddit: 5, bluesky: 4, mastodon: 4, newsapi: 6,
  arxiv: 3, github: 2, 'sec-edgar': 3, stackexchange: 3, x: 5, tiktok: 5, youtube: 2,
};
// Fonti su cui è sicuro spezzare in più chiamate per coprire tutti i
// termini nello stesso ciclo: gratuite, senza quota stretta.
const BATCH_FULLY: Set<string> = new Set(['googlenews', 'gdelt', 'reddit', 'bluesky', 'mastodon']);

function chunk<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  if (!Number.isFinite(size) || size >= arr.length) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Sulle fonti a quota stretta, invece di spezzare (rischioso), si ruota la
// finestra di termini usata ad ogni ingest (offset salvato in meta) così,
// nell'arco di alcuni cicli, tutti i termini passano almeno una volta.
const ROTATION_STEP = 4;
async function rotateTerms(terms: string[], key: string): Promise<string[]> {
  if (terms.length < 2) return terms;
  const offset = (await getMeta<number>(key)) ?? 0;
  const pos = offset % terms.length;
  await setMeta(key, offset + ROTATION_STEP);
  return [...terms.slice(pos), ...terms.slice(0, pos)];
}

type Job = { connectorId: string; fetch: () => Promise<RawMention[]>; scope: 'project' | 'entity' };

export async function ingestProject(project: typeof projects.$inferSelect) {
  const db = await getDb();
  const q: ListeningQuery = {
    anyTerms: project.keywords,
    allTerms: project.allTerms ?? [],
    excludeTerms: project.excludeTerms ?? [],
    languages: project.languages,
    countries: project.countries ?? [],
  };
  const status: SourceStatus = (await getMeta<SourceStatus>('source_status')) ?? {};
  let inserted = 0;

  const lc = (s: string) => s.toLowerCase();
  // Filtro booleano centralizzato: AND e NOT valgono per tutte le fonti, anche
  // quelle la cui API non supporta gli operatori. `scope` decide se il
  // vincolo AND del progetto si applica: non ha senso per una ricerca fatta
  // sulle keyword di un concorrente, non del tema del progetto.
  const matchesBoolean = (m: RawMention, scope: Job['scope']) => {
    const text = lc(`${m.title ?? ''} ${m.content}`);
    if (scope === 'project' && q.allTerms.length && !q.allTerms.every((t) => text.includes(lc(t)))) return false;
    if (q.excludeTerms.some((t) => text.includes(lc(t)))) return false;
    return true;
  };

  setTelegramChannels(project.telegramChannels ?? []);
  setRssFeeds(project.rssFeeds ?? []);
  // Carica le chiavi API inserite dall'utente prima di decidere quali fonti sono attive.
  await hydrateConnectorCredentials();
  const enabled = CONNECTORS.filter((c) => c.enabled());

  const entities = await db.select().from(benchmarkEntities).where(eq(benchmarkEntities.projectId, project.id));

  const jobs: Job[] = [];
  for (const c of enabled) {
    if (BATCH_FULLY.has(c.id)) {
      // Copertura piena nello stesso ciclo: un blocco di termini per chiamata.
      for (const batch of chunk(q.anyTerms, CONNECTOR_TERM_CAP[c.id] ?? Infinity)) {
        jobs.push({ connectorId: c.id, scope: 'project', fetch: () => c.fetchMentions({ ...q, anyTerms: batch }) });
      }
    } else {
      // Quota stretta o a pagamento: una chiamata sola, finestra ruotata ad ogni ciclo.
      const rotated = await rotateTerms(q.anyTerms, `ingest_rotation_project_${project.id}_${c.id}`);
      jobs.push({ connectorId: c.id, scope: 'project', fetch: () => c.fetchMentions({ ...q, anyTerms: rotated }) });
    }
  }
  for (const entity of entities) {
    if (entity.keywords.length === 0) continue;
    for (const c of enabled) {
      if (!BATCH_FULLY.has(c.id)) continue; // niente ricerca-concorrente sulle fonti a quota stretta o a pagamento
      for (const batch of chunk(entity.keywords, CONNECTOR_TERM_CAP[c.id] ?? Infinity)) {
        const entityQuery: ListeningQuery = { ...q, anyTerms: batch, allTerms: [] };
        jobs.push({ connectorId: c.id, scope: 'entity', fetch: () => c.fetchMentions(entityQuery) });
      }
    }
  }

  const results = await Promise.allSettled(
    jobs.map(async (job) => {
      const list = await job.fetch();
      return { ...job, mentions: list };
    }),
  );

  // Più job possono condividere lo stesso connectorId (una volta per il
  // progetto, una volta per ogni concorrente): si aggregano in un'unica riga
  // di stato per fonte — "ok" se almeno un tentativo è andato a buon fine,
  // il conteggio è la somma di tutti.
  const agg = new Map<string, { ok: boolean; count: number; error?: string }>();
  for (let i = 0; i < results.length; i++) {
    const job = jobs[i];
    const r = results[i];
    const prevAgg = agg.get(job.connectorId) ?? { ok: false, count: 0 };
    if (r.status === 'rejected') {
      agg.set(job.connectorId, { ...prevAgg, error: String(r.reason?.message ?? r.reason) });
      continue;
    }
    const now = Date.now();
    const rows = r.value.mentions
      .filter((m) => matchesBoolean(m, job.scope))
      // Scarta date invalide o future (feed a volte sballati) e più vecchie di 90 giorni
      .filter((m) => !Number.isNaN(m.publishedAt.getTime())
        && m.publishedAt.getTime() < now + 3600_000
        && m.publishedAt.getTime() > now - 90 * 86400_000)
      .map((m) => ({
        projectId: project.id,
        source: m.source,
        kind: kindOf(m.source),
        externalId: m.externalId.slice(0, 500),
        url: m.url,
        title: m.title,
        content: m.content,
        author: m.author,
        authorHandle: m.authorHandle,
        community: m.community,
        publishedAt: m.publishedAt,
        language: m.language,
        engagement: m.engagement,
        engagementScore: rawEngagementScore(m),
        reach: m.reach,
      }));
    let count = 0;
    // Inserimento a blocchi con dedup sull'indice UNIQUE (project, source, external_id) —
    // dedup naturale anche fra la ricerca del progetto e quella di un concorrente,
    // se lo stesso articolo viene trovato da entrambe.
    for (let j = 0; j < rows.length; j += 100) {
      const chunk = rows.slice(j, j + 100);
      if (chunk.length === 0) continue;
      const res = await db.insert(mentions).values(chunk).onConflictDoNothing().returning({ id: mentions.id });
      count += res.length;
    }
    inserted += count;
    agg.set(job.connectorId, { ok: true, count: prevAgg.count + count });
  }

  const nowIso = new Date().toISOString();
  for (const [connectorId, a] of agg) {
    const prev = status[connectorId];
    status[connectorId] = {
      ok: a.ok, count: a.count, error: a.ok ? undefined : a.error,
      at: nowIso, lastOkAt: a.ok ? nowIso : prev?.lastOkAt,
    };
  }

  await setMeta('source_status', status);
  await setMeta('last_ingest_at', new Date().toISOString());
  return { inserted, status };
}
