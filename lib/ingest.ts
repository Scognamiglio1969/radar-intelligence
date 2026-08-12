import { eq } from 'drizzle-orm';
import { getDb, setMeta, getMeta } from '@/lib/db';
import { backfillCountries, countryFromDomain, countryFromUrl, toCountryCode } from '@/lib/country-codes';
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
// Sottoinsieme usato per la ricerca-concorrente: GDELT escluso apposta.
// Verificato dal vivo che fallisce sempre con 429 su una richiesta ogni
// entità (una quota giornaliera già stretta, saturata subito da una dozzina
// di ricerche) — ogni tentativo fallito comunque aspetta il timeout (15s)
// prima di arrendersi, e su un progetto con molte entità questo da solo
// spingeva il tempo totale oltre il limite della funzione serverless (300s).
// Resta pieno per la query del progetto (BATCH_FULLY), solo qui si toglie.
const ENTITY_SEARCH_CONNECTORS: Set<string> = new Set(['googlenews', 'reddit', 'bluesky', 'mastodon']);

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

type Job = { connectorId: string; fetch: () => Promise<RawMention[]>; scope: 'project' | 'entity'; label?: string };

// Con una ricerca per concorrente, un progetto con una dozzina di entità
// manda facilmente 40-70 richieste alla stessa manciata di fonti generaliste.
// Verificato dal vivo: interrogate UNA ALLA VOLTA, tutte e 12 le entità di un
// progetto reale restituivano risultati concreti (49-496 ciascuna). Ma in
// produzione, sparate tutte insieme con Promise.allSettled, solo 3 su 12
// portavano dati — la stessa manciata di fonti gratuite riceveva decine di
// richieste nello stesso istante e la maggior parte veniva respinta (GDELT
// falliva già da sola con 429; le altre reggono bene una alla volta ma non a
// raffica). La correzione non è tornare a farle in sequenza (troppo lento con
// molte entità) ma limitare quante richieste PER LA STESSA FONTE partono
// insieme — fonti diverse restano comunque parallele fra loro.
const CONCURRENCY_PER_CONNECTOR = 2;
// Non basta limitare QUANTE partono insieme se poi si susseguono senza
// pausa: un limite tipico "N richieste al minuto" si esaurisce comunque in
// pochi secondi a raffica continua. Verificato dal vivo un pattern a finestra
// — le entità dal 5° al 9° posto fallivano sistematicamente mentre le prime
// 4 e le ultime 3 andavano a buon fine, coerente con una quota che si
// esaurisce a metà lista e si libera di nuovo prima della fine. Una piccola
// pausa fra un round e il successivo mantiene il RITMO delle richieste sotto
// la soglia, non solo il numero in volo in un dato istante.
const ROUND_DELAY_MS = 400;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function runJobs(jobs: Job[]): Promise<{ job: Job; mentions: RawMention[]; error?: unknown }[]> {
  const byConnector = new Map<string, Job[]>();
  for (const j of jobs) {
    if (!byConnector.has(j.connectorId)) byConnector.set(j.connectorId, []);
    byConnector.get(j.connectorId)!.push(j);
  }
  const perConnector = await Promise.all(
    [...byConnector.values()].map(async (group) => {
      const out: { job: Job; mentions: RawMention[]; error?: unknown }[] = [];
      for (let i = 0; i < group.length; i += CONCURRENCY_PER_CONNECTOR) {
        if (i > 0) await sleep(ROUND_DELAY_MS);
        const batch = group.slice(i, i + CONCURRENCY_PER_CONNECTOR);
        const settled = await Promise.allSettled(batch.map((j) => j.fetch()));
        settled.forEach((s, k) => {
          const job = batch[k];
          // Log per singola chiamata: quanti risultati GREZZI ha restituito
          // quella fonte per quella ricerca, prima di ogni filtro e della
          // deduplica. Senza questo, "5 nuove mention" in coda alla pipeline
          // non distingue "la fonte non ha restituito nulla" da "erano tutte
          // già in archivio" — due cause opposte con rimedi opposti.
          const label = `${job.connectorId}/${job.scope}${job.label ? ` "${job.label}"` : ''}`;
          if (s.status === 'fulfilled') console.log(`[ingest] ${label}: ${s.value.length} grezze`);
          else console.error(`[ingest] ${label}: ERRORE ${String((s.reason as Error)?.message ?? s.reason).slice(0, 120)}`);
          out.push(s.status === 'fulfilled'
            ? { job, mentions: s.value }
            : { job, mentions: [], error: s.reason });
        });
      }
      return out;
    }),
  );
  return perConnector.flat();
}

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
      if (!ENTITY_SEARCH_CONNECTORS.has(c.id)) continue; // niente ricerca-concorrente su GDELT, quota stretta o a pagamento
      for (const batch of chunk(entity.keywords, CONNECTOR_TERM_CAP[c.id] ?? Infinity)) {
        const entityQuery: ListeningQuery = { ...q, anyTerms: batch, allTerms: [] };
        jobs.push({ connectorId: c.id, scope: 'entity', label: entity.name, fetch: () => c.fetchMentions(entityQuery) });
      }
    }
  }

  const results = await runJobs(jobs);

  // Più job possono condividere lo stesso connectorId (una volta per il
  // progetto, una volta per ogni concorrente): si aggregano in un'unica riga
  // di stato per fonte — "ok" se almeno un tentativo è andato a buon fine,
  // il conteggio è la somma di tutti.
  const agg = new Map<string, { ok: boolean; count: number; error?: string }>();
  for (const r of results) {
    const job = r.job;
    const prevAgg = agg.get(job.connectorId) ?? { ok: false, count: 0 };
    if (r.error !== undefined) {
      const err = r.error as { message?: string } | undefined;
      agg.set(job.connectorId, { ...prevAgg, error: String(err?.message ?? r.error) });
      continue;
    }
    const now = Date.now();
    const afterBoolean = r.mentions.filter((m) => matchesBoolean(m, job.scope));
    const afterDate = afterBoolean
      // Scarta date invalide o future (feed a volte sballati) e più vecchie di 90 giorni
      .filter((m) => !Number.isNaN(m.publishedAt.getTime())
        && m.publishedAt.getTime() < now + 3600_000
        && m.publishedAt.getTime() > now - 90 * 86400_000);
    // Conteggio per FASE: distingue "scartate dai termini da escludere" da
    // "scartate perché troppo vecchie" da "già in archivio" — tre cause con
    // tre rimedi diversi, che il solo totale finale confonde fra loro.
    if (r.mentions.length !== afterDate.length) {
      const lbl = `${job.connectorId}/${job.scope}${job.label ? ` "${job.label}"` : ''}`;
      console.log(`[ingest] ${lbl}: ${r.mentions.length} grezze → ${afterBoolean.length} dopo NOT → ${afterDate.length} dopo data`);
    }
    const rows = afterDate
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
        // Il paese: quello dichiarato dalla fonte se c'è, altrimenti quello
        // che dice il dominio nazionale dell'indirizzo. Se non lo dice
        // nessuno resta vuoto: la lingua non è il paese.
        country: toCountryCode(m.country) ?? countryFromUrl(m.url) ?? countryFromDomain(m.author),
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
    if (rows.length > 0 && count !== rows.length) {
      const lbl = `${job.connectorId}/${job.scope}${job.label ? ` "${job.label}"` : ''}`;
      console.log(`[ingest] ${lbl}: ${rows.length} valide → ${count} inserite (${rows.length - count} già in archivio)`);
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
  // Le mention raccolte prima che il paese esistesse hanno ancora il loro
  // indirizzo: ogni giro ne recupera un blocco, finché non ne restano.
  try {
    const recuperate = await backfillCountries(project.id);
    if (recuperate) console.log(`[ingest] paese dedotto dal dominio per ${recuperate} mention già in archivio`);
  } catch (e) {
    console.warn('[ingest] recupero dei paesi non riuscito:', (e as Error).message);
  }

  return { inserted, status };
}
