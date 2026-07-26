import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { getDb, getMeta, setMeta } from '@/lib/db';
import { mentions, projects } from '@/lib/db/schema';
import { ingestProject } from '@/lib/ingest';
import { enrichArticles } from '@/lib/article-enrich';
import { ingestReviews } from '@/lib/reviews';
import { ingestSport } from '@/lib/sport';
import { ingestSearchInterest } from '@/lib/search-interest';
import { ingestWikiEdits } from '@/lib/wikipedia';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import {
  analyzePendingMentions, clusterNewsStories, generateDailyBrief, scoreTopContent,
} from '@/lib/claude';
import { detectAlerts } from '@/lib/alerts';
import { computeTrends, explainTrends } from '@/lib/trends';
import { detectNarratives } from '@/lib/narratives';
import { notifyAlerts, notifyDailyDigest } from '@/lib/notify';
import { extractTimelineEvents } from '@/lib/timeline';
import { refreshPointOfViewIfStale } from '@/lib/pov';
import { alerts as alertsTable, users as usersTable } from '@/lib/db/schema';
import { getTrends } from '@/lib/trends';

/** L'AI è attiva per il proprietario del progetto? (admin/legacy sempre sì; membri solo se abilitati) */
async function ownerAiEnabled(db: Awaited<ReturnType<typeof getDb>>, ownerId: number | null): Promise<boolean> {
  if (ownerId == null) return true; // progetti legacy senza proprietario
  const [owner] = await db.select({ role: usersTable.role, ai: usersTable.aiEnabled })
    .from(usersTable).where(eq(usersTable.id, ownerId));
  return Boolean(owner && (owner.role === 'admin' || owner.ai === 1));
}

const LOCK_KEY = 'pipeline_lock';
const LOCK_TTL_MS = 5 * 60_000;

/**
 * Pipeline completa: ingestion → analisi Claude → alert.
 * - full=true: aggiunge storie, content ratings, narrazioni, timeline e daily brief
 *   (usato sia dal cron sia dal "Refresh now" manuale, così l'aggiornamento è completo).
 * - digest=true: invia il digest Telegram del mattino (solo cron; il refresh manuale NON
 *   deve spammare notifiche a ogni click).
 */
export async function runPipeline(opts: { full?: boolean; digest?: boolean } = {}) {
  const db = await getDb();

  const lock = await getMeta<string>(LOCK_KEY);
  if (lock && Date.now() - new Date(lock).getTime() < LOCK_TTL_MS) {
    return { skipped: true, reason: 'pipeline already running' };
  }
  await setMeta(LOCK_KEY, new Date().toISOString());

  try {
    // Va fatto qui, non solo dentro ingestProject: i progetti "upload" saltano
    // ingestProject, e senza questo le credenziali (football-data, Google
    // Places, ecc.) resterebbero invisibili a cfg() per l'intera esecuzione.
    await hydrateConnectorCredentials();
    const allProjects = await db.select().from(projects);
    const summary: Record<string, unknown>[] = [];

    for (const project of allProjects) {
      // I progetti "upload" non fanno scraping: le mention arrivano dai file
      // caricati dall'utente. La pipeline salta l'ingestion ma esegue comunque
      // l'analisi AI sulle mention ancora da taggare.
      const ingest = project.mode === 'upload'
        ? { inserted: 0 }
        : await (async () => {
            console.log(`[pipeline] ingestion per "${project.name}"…`);
            const r = await ingestProject(project);
            console.log(`[pipeline] ingestion completata: ${r.inserted} nuove mention`);
            return r;
          })();
      // Testo degli articoli PRIMA dell'analisi: se il pezzo è disponibile,
      // sentiment e temi si giudicano sul contenuto vero e non sul titolo.
      // Non costa nulla in AI — sono solo pagine web.
      const articles = project.mode === 'upload'
        ? { tried: 0, extracted: 0 }
        : await enrichArticles(project.id);
      if (articles.tried) {
        console.log(`[pipeline] articoli: ${articles.extracted}/${articles.tried} testi estratti`);
      }

      // Recensioni: sezione autonoma, indipendente dalla modalità del progetto
      // (anche un progetto "upload" può seguire un'app o un locale) e senza
      // costo AI — il voto è già il sentimento.
      const revs = await ingestReviews(project.id).catch((e) => {
        console.error(`[pipeline] recensioni fallite per "${project.name}":`, e);
        return { tried: 0, fetched: 0 };
      });
      if (revs.tried) console.log(`[pipeline] recensioni: ${revs.fetched} lette da ${revs.tried} fonti`);

      // Sport: altra sezione autonoma, stesso principio — risultati e prezzo
      // di borsa sono fatti con una data fissa, non menzioni da interpretare.
      const sport = await ingestSport(project.id).catch((e) => {
        console.error(`[pipeline] sport fallito per "${project.name}":`, e);
        return { tried: 0, matches: 0, prices: 0 };
      });
      if (sport.tried) console.log(`[pipeline] sport: ${sport.matches} partite, ${sport.prices} quotazioni`);

      // Interesse di ricerca: arricchisce il Benchmark, non è mai critico —
      // un endpoint non documentato che fallisce non deve fermare il resto.
      const interest = await ingestSearchInterest(project.id).catch((e) => {
        console.error(`[pipeline] interesse di ricerca fallito per "${project.name}":`, e);
        return { tried: 0, points: 0 };
      });
      if (interest.tried) console.log(`[pipeline] interesse di ricerca: ${interest.points} punti`);

      // Wikipedia: nessuna chiave, nessun costo — controllato ad ogni ciclo.
      const wiki = await ingestWikiEdits(project.id).catch((e) => {
        console.error(`[pipeline] wikipedia fallito per "${project.name}":`, e);
        return { tried: 0, edits: 0 };
      });
      if (wiki.tried) console.log(`[pipeline] wikipedia: ${wiki.edits} revisioni`);

      // Se il proprietario è "dormiente" (membro senza AI), si raccolgono i dati
      // ma si saltano tutte le analisi Claude (nessun costo API).
      const aiOn = await ownerAiEnabled(db, project.ownerId);
      const theme = [project.name, project.semanticContext, `termini: ${project.keywords.join(', ')}`]
        .filter(Boolean).join(' — ');
      const analysis = aiOn
        ? await analyzePendingMentions(project.id, theme)
        : { analyzed: 0, pending: 0 };
      console.log(`[pipeline] analisi: ${analysis.analyzed} analizzate, ${analysis.pending} in attesa${aiOn ? '' : ' (AI dormiente)'}`);
      const newAlerts = await detectAlerts(project.id, { aiContext: aiOn });
      const trendCount = await computeTrends(project.id);
      const row: Record<string, unknown> = {
        project: project.name, aiOn, inserted: ingest.inserted,
        analyzed: analysis.analyzed, alerts: newAlerts, trends: trendCount,
      };

      // Notifica push solo per gli alert appena creati (mai più di un messaggio a giro)
      if (newAlerts > 0) {
        const fresh = await db.select({
          message: alertsTable.message, severity: alertsTable.severity, data: alertsTable.data,
        })
          .from(alertsTable)
          .where(eq(alertsTable.projectId, project.id))
          .orderBy(desc(alertsTable.createdAt))
          .limit(newAlerts);
        await notifyAlerts(project.name, fresh.map((f) => ({
          severity: f.severity,
          // La spiegazione AI viaggia anche nella notifica push
          message: (f.data as { explanation?: string } | null)?.explanation
            ? `${f.message}\n${(f.data as { explanation?: string }).explanation}`
            : f.message,
        })));
      }

      if (opts.full && aiOn) {
        row.timeline = await extractTimelineEvents(project.id);
        row.trendsExplained = await explainTrends(project.id);
        row.narratives = await detectNarratives(project.id);
        row.stories = await clusterNewsStories(project.id);
        row.rated = await scoreTopContent(project.id, project.name);
        const briefData = await collectBriefData(project.id);
        row.brief = await generateDailyBrief(project.id, project.name, briefData);
        // Point of View: vista a 90 giorni, quindi si rinfresca al massimo una
        // volta a settimana. Senza questo esisterebbe solo se qualcuno clicca.
        row.pov = await refreshPointOfViewIfStale(project.id);

        // Digest silenzioso del mattino: una riga di numeri + link al brief.
        // Solo dal cron (opts.digest): il refresh manuale non deve notificare a ogni click.
        if (row.brief && opts.digest) {
          const h24 = new Date(Date.now() - 24 * 3600_000);
          const [agg] = await db.select({
            n: sql<number>`count(*)`,
            avg: sql<number | null>`avg(${mentions.sentimentScore})`,
          }).from(mentions)
            .where(and(eq(mentions.projectId, project.id), gte(mentions.publishedAt, h24)));
          const avg = agg.avg === null ? null : Number(agg.avg);
          const topTrend = (await getTrends(project.id))[0]?.topic;
          await notifyDailyDigest(project.name, {
            mentions24h: Number(agg.n),
            sentiment: avg === null ? 'analyzing' : avg > 0.15 ? 'positive' : avg < -0.15 ? 'negative' : 'neutral',
            topTrend,
          });
        }
      }
      summary.push(row);
    }

    // Retention: 90 giorni (free tier Neon)
    await db.execute(sql`DELETE FROM mentions WHERE published_at < now() - interval '90 days'`);

    return { skipped: false, summary };
  } finally {
    await setMeta(LOCK_KEY, null);
  }
}

/** Dati aggregati delle ultime 24h da passare a Claude per il daily brief. */
/** Dati delle ultime 24h per il brief. Esportata: la usa anche la generazione
 *  su richiesta quando il ciclo notturno non ha prodotto il brief di oggi. */
export type BriefData = {
  /** Finestra effettivamente usata, da dichiarare nel brief. */
  window: '24 hours' | '7 days' | '30 days';
  /** Mention nella finestra. Se 0, non c'è niente da raccontare. */
  total: number;
  volumePerFonte: { source: string; n: number }[];
  sentiment: { sentiment: string | null; n: number }[];
  temiPrincipali: Record<string, unknown>[];
  contenutiTop: { fonte: string; dove: string | null; sentiment: string | null; testo: string }[];
};

/** Scaletta di finestre: si allarga solo se la precedente è troppo magra. */
const BRIEF_WINDOWS: { label: BriefData['window']; hours: number }[] = [
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
];
/** Sotto questa soglia una giornata non regge un brief: si allarga la finestra. */
const THIN_DAY = 5;

async function briefWindow(projectId: number, hours: number) {
  const db = await getDb();
  const since = new Date(Date.now() - hours * 3600_000);
  const where = and(eq(mentions.projectId, projectId), gte(mentions.publishedAt, since));

  const bySource = await db.select({
    source: mentions.source, n: sql<number>`count(*)`,
  }).from(mentions).where(where).groupBy(mentions.source);

  const total = bySource.reduce((s, r) => s + Number(r.n), 0);
  if (total === 0) return { total, bySource, bySentiment: [], topics: [], top: [] };

  const bySentiment = await db.select({
    sentiment: mentions.sentiment, n: sql<number>`count(*)`,
  }).from(mentions).where(where).groupBy(mentions.sentiment);

  const topTopics = await db.execute(sql`
    SELECT t AS topic, count(*) AS n
    FROM mentions, jsonb_array_elements_text(topics) AS t
    WHERE project_id = ${projectId} AND published_at >= ${since.toISOString()}::timestamptz
    GROUP BY t ORDER BY n DESC LIMIT 10
  `);

  const top = await db.select({
    source: mentions.source, title: mentions.title, content: mentions.content,
    sentiment: mentions.sentiment, engagementScore: mentions.engagementScore,
    community: mentions.community,
  }).from(mentions).where(where).orderBy(desc(mentions.engagementScore)).limit(15);

  return { total, bySource, bySentiment, topics: topTopics.rows, top };
}

/**
 * Dati per il brief. La finestra si allarga da sola quando le 24 ore sono magre.
 *
 * Perché: su un tema B2B di nicchia il volume giornaliero è legittimamente
 * vicino a zero, e le fonti gratuite ordinano per pertinenza, non per data —
 * quindi in 24 ore spesso non cade nulla anche quando la settimana è ricca.
 * Con la sola finestra a 24 ore il brief usciva "vuoto" pur essendoci centinaia
 * di articoli. Meglio un brief settimanale dichiarato che uno quotidiano finto.
 */
export async function collectBriefData(projectId: number): Promise<BriefData> {
  let picked = BRIEF_WINDOWS[0];
  let data = await briefWindow(projectId, picked.hours);

  // Si prende la PRIMA finestra abbastanza ricca; se nessuna lo è, la più ricca
  // fra quelle provate. Attenzione: non ci si può fermare al primo passo che
  // non aggiunge nulla — una settimana vuota non implica un mese vuoto, ed è
  // proprio il caso dei progetti alimentati a ondate (o da file caricati).
  for (const w of BRIEF_WINDOWS.slice(1)) {
    if (data.total >= THIN_DAY) break;
    const wider = await briefWindow(projectId, w.hours);
    if (wider.total > data.total) {
      picked = w;
      data = wider;
    }
  }

  return {
    window: picked.label,
    total: data.total,
    volumePerFonte: data.bySource.map((r) => ({ source: r.source, n: Number(r.n) })),
    sentiment: data.bySentiment.map((r) => ({ sentiment: r.sentiment, n: Number(r.n) })),
    temiPrincipali: data.topics as Record<string, unknown>[],
    contenutiTop: data.top.map((m) => ({
      fonte: m.source, dove: m.community, sentiment: m.sentiment,
      testo: `${m.title ?? ''} ${m.content}`.slice(0, 250).trim(),
    })),
  };
}
