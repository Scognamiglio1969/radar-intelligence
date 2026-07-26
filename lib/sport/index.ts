import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { sportSources, sportMatches, stockPrices, mentions } from '@/lib/db/schema';
import { fetchTeamMatches, footballDataEnabled } from './football-data';
import { fetchDailyCloses, alphaVantageEnabled } from './alphavantage';

const TZ = 'Europe/Rome';
const todayKey = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });

/**
 * Aggiorna calendario/risultati di ogni fonte, e — al massimo una volta al
 * giorno per TICKER — il prezzo di borsa. Il tetto giornaliero non è per
 * pigrizia: la quota gratuita di Alpha Vantage è 25 richieste al GIORNO,
 * condivisa da tutti i progetti che usano quella chiave.
 */
export async function ingestSport(projectId: number): Promise<{ tried: number; matches: number; prices: number }> {
  const db = await getDb();
  const sources = await db.select().from(sportSources).where(eq(sportSources.projectId, projectId));
  let matchCount = 0;
  let priceCount = 0;

  for (const src of sources) {
    try {
      const raw = await fetchTeamMatches(src.teamId);
      if (raw.length) {
        const rows = raw.map((m) => ({ projectId, sourceId: src.id, ...m }));
        for (let i = 0; i < rows.length; i += 100) {
          await db.insert(sportMatches).values(rows.slice(i, i + 100))
            .onConflictDoUpdate({
              target: [sportMatches.sourceId, sportMatches.externalId],
              set: {
                homeScore: sql`excluded.home_score`, awayScore: sql`excluded.away_score`,
                status: sql`excluded.status`, utcDate: sql`excluded.utc_date`, fetchedAt: new Date(),
              },
            });
        }
        matchCount += rows.length;
      }
    } catch (e) {
      console.error(`[sport] partite fallite per la fonte #${src.id} (team ${src.teamId}):`, e);
    }

    if (src.ticker) {
      const [already] = await db.select({ id: stockPrices.id }).from(stockPrices)
        .where(and(eq(stockPrices.ticker, src.ticker), eq(stockPrices.date, todayKey())));
      if (!already) {
        try {
          const closes = await fetchDailyCloses(src.ticker);
          if (closes.length) {
            const rows = closes.map((c) => ({ ticker: src.ticker!, date: c.date, close: c.close, changePct: c.changePct }));
            for (let i = 0; i < rows.length; i += 100) {
              await db.insert(stockPrices).values(rows.slice(i, i + 100)).onConflictDoNothing();
            }
            priceCount += rows.length;
          }
        } catch (e) {
          console.error(`[sport] prezzo fallito per il ticker ${src.ticker}:`, e);
        }
      }
    }
    await db.update(sportSources).set({ lastFetchedAt: new Date() }).where(eq(sportSources.id, src.id));
  }
  return { tried: sources.length, matches: matchCount, prices: priceCount };
}

export type SportSourceRow = {
  id: number; competition: string; teamId: string; teamName: string;
  ticker: string | null; lastFetchedAt: Date | null; totalMatches: number;
};
export type UpcomingMatch = {
  id: number; competition: string; homeTeam: string; awayTeam: string; utcDate: Date; teamName: string;
};
export type MatchAnalysis = {
  id: number; utcDate: Date; competition: string; teamName: string;
  opponent: string; isHome: boolean; homeScore: number; awayScore: number;
  result: 'W' | 'D' | 'L';
  sentimentBefore: number | null; sentimentAfter: number | null; sentimentShift: number | null;
  volumeAfter: number;
  stockBefore: number | null; stockAfter: number | null; stockShiftPct: number | null;
};
export type SportStats = {
  footballDataEnabled: boolean; alphaVantageEnabled: boolean;
  sources: SportSourceRow[];
  upcoming: UpcomingMatch[];
  recent: MatchAnalysis[];
  aggregate: { result: 'W' | 'D' | 'L'; n: number; avgSentimentShift: number | null; avgStockShiftPct: number | null }[];
};

/** Media del sentiment delle mention del progetto in una finestra [from, to). SQL puro. */
async function avgSentiment(projectId: number, from: Date, to: Date): Promise<{ avg: number | null; n: number }> {
  const db = await getDb();
  const [r] = await db.select({
    avg: sql<number | null>`avg(${mentions.sentimentScore})`, n: sql<number>`count(*)`,
  }).from(mentions).where(and(
    eq(mentions.projectId, projectId), gte(mentions.publishedAt, from), lt(mentions.publishedAt, to),
  ));
  return { avg: r?.avg === null || r?.avg === undefined ? null : Number(r.avg), n: Number(r?.n ?? 0) };
}

/** Chiusura più vicina a una data, nella direzione richiesta ("prima" o "dopo"). */
function nearestClose(closes: { date: string; close: number }[], dateKey: string, dir: 'before' | 'after'): number | null {
  const sorted = [...closes].sort((a, b) => a.date.localeCompare(b.date));
  if (dir === 'before') {
    const c = [...sorted].reverse().find((x) => x.date < dateKey);
    return c?.close ?? null;
  }
  const c = sorted.find((x) => x.date > dateKey);
  return c?.close ?? null;
}

export async function sportStats(projectId: number, days = 120): Promise<SportStats> {
  const db = await getDb();
  const since = new Date(Date.now() - days * 86400_000);

  const sourceRows = await db.select({
    id: sportSources.id, competition: sportSources.competition, teamId: sportSources.teamId,
    teamName: sportSources.teamName, ticker: sportSources.ticker, lastFetchedAt: sportSources.lastFetchedAt,
    totalMatches: sql<number>`count(${sportMatches.id})`,
  }).from(sportSources)
    .leftJoin(sportMatches, eq(sportMatches.sourceId, sportSources.id))
    .where(eq(sportSources.projectId, projectId))
    .groupBy(sportSources.id);
  const sources: SportSourceRow[] = sourceRows.map((s) => ({ ...s, totalMatches: Number(s.totalMatches) }));

  const upcomingRows = await db.select({
    id: sportMatches.id, competition: sportMatches.competition, homeTeam: sportMatches.homeTeam,
    awayTeam: sportMatches.awayTeam, utcDate: sportMatches.utcDate, teamName: sportSources.teamName,
  }).from(sportMatches)
    .innerJoin(sportSources, eq(sportSources.id, sportMatches.sourceId))
    .where(and(eq(sportMatches.projectId, projectId), eq(sportMatches.status, 'SCHEDULED')))
    .orderBy(sportMatches.utcDate)
    .limit(5);

  const finishedRows = await db.select({
    id: sportMatches.id, utcDate: sportMatches.utcDate, competition: sportMatches.competition,
    homeTeam: sportMatches.homeTeam, awayTeam: sportMatches.awayTeam,
    homeScore: sportMatches.homeScore, awayScore: sportMatches.awayScore,
    teamName: sportSources.teamName, ticker: sportSources.ticker,
  }).from(sportMatches)
    .innerJoin(sportSources, eq(sportSources.id, sportMatches.sourceId))
    .where(and(
      eq(sportMatches.projectId, projectId), eq(sportMatches.status, 'FINISHED'),
      gte(sportMatches.utcDate, since),
    ))
    .orderBy(desc(sportMatches.utcDate))
    .limit(20);

  // Storico prezzi per ticker: una sola query per ticker distinto, non per partita.
  const tickers = [...new Set(finishedRows.map((r) => r.ticker).filter((t): t is string => Boolean(t)))];
  const closesByTicker = new Map<string, { date: string; close: number }[]>();
  for (const t of tickers) {
    const rows = await db.select({ date: stockPrices.date, close: stockPrices.close })
      .from(stockPrices).where(eq(stockPrices.ticker, t));
    closesByTicker.set(t, rows.map((r) => ({ date: String(r.date), close: r.close })));
  }

  const recent: MatchAnalysis[] = [];
  for (const m of finishedRows) {
    if (m.homeScore === null || m.awayScore === null) continue;
    const isHome = m.homeTeam === m.teamName;
    const own = isHome ? m.homeScore : m.awayScore;
    const opp = isHome ? m.awayScore : m.homeScore;
    const result: MatchAnalysis['result'] = own > opp ? 'W' : own < opp ? 'L' : 'D';

    const matchDate = new Date(m.utcDate);
    const [before, after] = await Promise.all([
      avgSentiment(projectId, new Date(matchDate.getTime() - 7 * 86400_000), matchDate),
      avgSentiment(projectId, matchDate, new Date(matchDate.getTime() + 2 * 86400_000)),
    ]);
    const sentimentShift = before.avg !== null && after.avg !== null ? Math.round((after.avg - before.avg) * 100) / 100 : null;

    let stockBefore: number | null = null, stockAfter: number | null = null, stockShiftPct: number | null = null;
    if (m.ticker) {
      const dateKey = matchDate.toLocaleDateString('en-CA', { timeZone: TZ });
      const closes = closesByTicker.get(m.ticker) ?? [];
      stockBefore = nearestClose(closes, dateKey, 'before');
      stockAfter = nearestClose(closes, dateKey, 'after');
      if (stockBefore !== null && stockAfter !== null && stockBefore > 0) {
        stockShiftPct = Math.round(((stockAfter - stockBefore) / stockBefore) * 10000) / 100;
      }
    }

    recent.push({
      id: m.id, utcDate: matchDate, competition: m.competition, teamName: m.teamName,
      opponent: isHome ? m.awayTeam : m.homeTeam, isHome, homeScore: m.homeScore, awayScore: m.awayScore,
      result, sentimentBefore: before.avg, sentimentAfter: after.avg, sentimentShift, volumeAfter: after.n,
      stockBefore, stockAfter, stockShiftPct,
    });
  }

  const aggregate = (['W', 'D', 'L'] as const).map((result) => {
    const rows = recent.filter((r) => r.result === result);
    const sentiments = rows.map((r) => r.sentimentShift).filter((v): v is number => v !== null);
    const stocks = rows.map((r) => r.stockShiftPct).filter((v): v is number => v !== null);
    return {
      result, n: rows.length,
      avgSentimentShift: sentiments.length ? Math.round((sentiments.reduce((a, b) => a + b, 0) / sentiments.length) * 100) / 100 : null,
      avgStockShiftPct: stocks.length ? Math.round((stocks.reduce((a, b) => a + b, 0) / stocks.length) * 100) / 100 : null,
    };
  }).filter((a) => a.n > 0);

  return {
    footballDataEnabled: footballDataEnabled(), alphaVantageEnabled: alphaVantageEnabled(),
    sources, upcoming: upcomingRows, recent, aggregate,
  };
}
