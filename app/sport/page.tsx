import { Trash2, Trophy, TrendingUp, Calendar } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { sportStats } from '@/lib/sport';
import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { PageHeader, fmtDate, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ConnectorKeys } from '@/components/connector-keys';
import { GenerateRefresh } from '@/components/generate-refresh';
import { ResultBadge, ShiftBar } from '@/components/sport-charts';
import { TeamSearch } from '@/components/team-search';
import { addSportSourceAction, removeSportSourceAction } from './actions';

export const metadata = { title: 'Sport' };

const COMPETITIONS = [
  { code: 'SA', label: 'Serie A' }, { code: 'PL', label: 'Premier League' },
  { code: 'CL', label: 'Champions League' }, { code: 'BL1', label: 'Bundesliga' },
  { code: 'PD', label: 'La Liga' }, { code: 'FL1', label: 'Ligue 1' },
];
const COMPETITION_LABEL: Record<string, string> = Object.fromEntries(COMPETITIONS.map((c) => [c.code, c.label]));

export default async function SportPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return null;

  await hydrateConnectorCredentials();
  const [stats, currentUser, credStatuses] = await Promise.all([
    sportStats(project.id), getCurrentUser(), getConnectorCredStatuses(),
  ]);
  const canEditKeys = isAdmin(currentUser);
  const hasData = stats.sources.some((s) => s.totalMatches > 0);

  return (
    <>
      <PageHeader
        title={t('page.sport.title', 'Sport')}
        info="A self-contained section, like Reviews: a match result is a fact with a fixed date, not a mention with a sentiment. The point is crossing it with what Radar already measures — does fan sentiment actually move after a win or a loss? — and, for publicly listed clubs, whether the share price moves too. No AI, no invented numbers: sentiment comes from your own analyzed mentions, prices from Alpha Vantage, results from football-data.org."
        subtitle="Does winning actually move the needle? Match results crossed with fan sentiment and, for listed clubs, the share price — not just a scoreboard."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GenerateRefresh endpoint="/api/sport/refresh" label={t('page.sport.refresh', 'Check for updates')} busyLabel={t('page.sport.checking', 'Checking…')} />
      </div>

      {/* ── Fonti configurate ─────────────────────────────────────────── */}
      {/* Chiuso di default quando c'è già almeno una squadra: una volta
          configurato, la pagina si apre sulle analisi, non sul form. */}
      <details className="panel mb-4 px-5 py-5" open={stats.sources.length === 0}>
        <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-300 [&::-webkit-details-marker]:hidden">
          {t('page.sport.teams', 'Teams followed')}
          {stats.sources.length > 0 && <span className="text-xs font-normal text-slate-600">({stats.sources.length}, click to edit)</span>}
        </summary>

        {stats.sources.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {stats.sources.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                <Trophy className="size-4 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-200">{s.teamName}</p>
                  <p className="truncate text-[11px] text-slate-600">
                    {COMPETITION_LABEL[s.competition] ?? s.competition}{s.ticker ? ` · ${s.ticker}` : ''}
                  </p>
                </div>
                <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                  {s.totalMatches > 0 && <span>{fmtNum(s.totalMatches)} matches on record</span>}
                  <span className="hidden sm:inline">{s.lastFetchedAt ? `checked ${fmtDate(s.lastFetchedAt)}` : 'not checked yet'}</span>
                </span>
                <form action={removeSportSourceAction}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" aria-label={`Remove ${s.teamName}`} className="text-slate-600 transition hover:text-red-400">
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        <form action={addSportSourceAction} className="grid gap-2 rounded-lg border border-[var(--border)] px-4 py-3 sm:grid-cols-2">
          <p className="text-xs font-semibold text-slate-300 sm:col-span-2">
            <Trophy className="mr-1 inline size-3.5" /> Add a team
            <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">free key · football-data.org</span>
          </p>
          <TeamSearch competitions={COMPETITIONS} />
          <input name="ticker" placeholder="Stock ticker, if listed (e.g. JUVE.MI) — optional"
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50" />
          <button type="submit" className="self-start rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 sm:col-span-2">
            Add team
          </button>
          <p className="text-[11px] text-slate-600 sm:col-span-2">
            Search picks up the team&rsquo;s exact name automatically — no more typing it by hand.
          </p>
        </form>

        {/* Fuori dal <form> di sopra: i tag <form> non possono annidarsi,
            e ConnectorKeys ne renderizza uno proprio per salvare la chiave. */}
        {canEditKeys && credStatuses['football-data'] && (
          <div className="mt-3 rounded-lg border border-[var(--border)] px-4 py-3">
            <ConnectorKeys connectorId="football-data" fields={credStatuses['football-data'].fields} />
          </div>
        )}

        {canEditKeys && credStatuses.alphavantage && (
          <div className="mt-3 rounded-lg border border-[var(--border)] px-4 py-3">
            <p className="mb-1 text-xs font-semibold text-slate-300">
              <TrendingUp className="mr-1 inline size-3.5" /> Stock price (optional, only for listed clubs)
              <span className="ml-1.5 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-medium text-sky-300">free key · Alpha Vantage</span>
            </p>
            <p className="mb-2 text-[11px] text-slate-600">
              Add a ticker above (e.g. JUVE.MI for Juventus, MANU for Manchester United, BVB.DE for Borussia Dortmund) to unlock the share-price crossover. Free quota is tight (25 requests/day), checked at most once a day.
            </p>
            <ConnectorKeys connectorId="alphavantage" fields={credStatuses.alphavantage.fields} />
          </div>
        )}
      </details>

      {stats.sources.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <Trophy className="size-6 text-slate-600" />
          <p className="max-w-md text-sm text-slate-400">Add a team above to start — fixtures, results and, for listed clubs, the share-price crossover.</p>
        </div>
      ) : !hasData ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-sm text-slate-400">Team added — press “Check for updates” above to fetch its fixtures.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {stats.upcoming.length > 0 && (
            <section className="panel px-5 py-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
                <Calendar className="size-4 text-sky-400" /> {t('page.sport.upcoming', 'Next matches')}
              </h2>
              <div className="flex flex-col gap-1.5 text-sm">
                {stats.upcoming.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-2.5">
                    <span className="text-slate-200">{m.homeTeam} — {m.awayTeam}</span>
                    <span className="ml-auto text-xs text-slate-500">{COMPETITION_LABEL[m.competition] ?? m.competition} · {fmtDate(m.utcDate)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {stats.aggregate.length > 0 && (
            <section className="panel px-5 py-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.sport.aggregate', 'Does winning move the needle?')}</h2>
              <p className="mb-3 text-[11px] text-slate-600">
                Average shift in fan sentiment (48h after the match vs the week before) and share price (next trading day vs the one before), grouped by result.
              </p>
              <div className="flex flex-col gap-2.5">
                {stats.aggregate.map((a) => (
                  <div key={a.result} className="flex flex-wrap items-center gap-4 rounded-lg bg-white/[0.03] px-4 py-3">
                    <ResultBadge result={a.result} />
                    <span className="w-20 shrink-0 text-xs text-slate-500">{a.n} match{a.n === 1 ? '' : 'es'}</span>
                    <div className="flex items-center gap-2">
                      <span className="w-20 shrink-0 text-[11px] text-slate-500">sentiment</span>
                      <ShiftBar value={a.avgSentimentShift} max={1} />
                    </div>
                    {a.avgStockShiftPct !== null && (
                      <div className="flex items-center gap-2">
                        <span className="w-14 shrink-0 text-[11px] text-slate-500">stock</span>
                        <ShiftBar value={a.avgStockShiftPct} max={5} suffix="%" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel px-5 py-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('page.sport.recent', 'Recent matches')}</h2>
            <div className="flex flex-col gap-2">
              {stats.recent.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-4 rounded-lg bg-white/[0.03] px-4 py-3 text-sm">
                  <ResultBadge result={m.result} />
                  <div className="min-w-0">
                    <p className="truncate text-slate-200">
                      {m.isHome ? m.teamName : m.opponent} {m.homeScore}–{m.awayScore} {m.isHome ? m.opponent : m.teamName}
                    </p>
                    <p className="text-[11px] text-slate-600">{COMPETITION_LABEL[m.competition] ?? m.competition} · {fmtDate(m.utcDate)}</p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-slate-500">sentiment</span>
                    <ShiftBar value={m.sentimentShift} max={1} />
                  </div>
                  {m.stockShiftPct !== null && (
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500">stock</span>
                      <ShiftBar value={m.stockShiftPct} max={5} suffix="%" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
