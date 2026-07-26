import { getCurrentProject } from '@/lib/data';
import { crisisAnatomy } from '@/lib/insights';
import { conversationForecast } from '@/lib/forecast';
import { PageHeader, EmptyState, SourceBadge, fmtDate } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { RiskGauge, ConversationForecastChart } from '@/components/insight-charts';
import { ExternalLink, TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Crisis radar' };

const CONF_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-300',
  medium: 'bg-amber-500/15 text-amber-300',
  low: 'bg-slate-500/15 text-slate-400',
};
const CONF_HINT: Record<string, string> = {
  high: 'enough history and a clear enough pace to trust the line',
  medium: 'the pace is there, but noisy — read the band, not the line',
  low: 'too little data for the trend to mean much — shown for context only',
};

export default async function CrisisInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No project configured.')} />;
  const { risk, level, drivers, peak } = await crisisAnatomy(project.id, 14);
  const forecast = await conversationForecast(project.id, 30, 7);

  return (
    <>
      <PageHeader
        title={t('ins.crisis.title', 'Crisis radar & peak anatomy')}
        info="A risk gauge, the anatomy of the biggest volume/sentiment spike in the window, and a statistical projection of where volume and negativity are heading if the recent pace continues. Data: your analyzed mentions. Period: risk and peak over the last 14 days, projection over the last 30. Source: your collected mentions across all active sources. No AI involved — everything here is arithmetic on your own data."
        subtitle="One risk number, the autopsy of the biggest spike, and where the trend leads if nothing changes — with an early warning if negativity is climbing fast enough to matter."
      />
      {!peak ? (
        <EmptyState message="Not enough data in the last 14 days to assess risk." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <section className="panel flex flex-col items-center justify-center px-5 py-6">
            <RiskGauge risk={risk} level={level} />
            <div className="mt-4 w-full max-w-xs">
              {drivers.map((d) => (
                <div key={d.label} className="mb-2 flex items-center gap-2 text-sm">
                  <span className="w-40 shrink-0 text-slate-400">{d.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                    <div className="h-full rounded-full bg-orange-400/70" style={{ width: `${Math.min(100, d.value * 2)}%` }} />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs text-slate-500">+{d.value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="panel px-5 py-5">
            <h2 className="text-sm font-semibold text-slate-300">Peak anatomy</h2>
            <p className="mb-3 mt-1 text-xs text-slate-500">
              Biggest day: <span className="text-slate-300">{fmtDate(peak.day)}</span> ·{' '}
              <span className="text-slate-300">{peak.volume} mentions</span> ·{' '}
              <span className={peak.negShare > 30 ? 'text-red-400' : 'text-slate-400'}>{peak.negShare}% negative</span> ·{' '}
              avg sentiment <span className="text-slate-300">{peak.sentiment}</span>
            </p>

            {peak.topics.length > 0 && (
              <div className="mb-4">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">What drove it — topics</p>
                <div className="flex flex-wrap gap-1.5">
                  {peak.topics.map((t) => (
                    <span key={t.topic} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-300">{t.topic} · {t.n}</span>
                  ))}
                </div>
              </div>
            )}

            {peak.content.length > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">Content that weighed most</p>
                <div className="flex flex-col gap-1.5">
                  {peak.content.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <SourceBadge source={m.source} />
                      {m.sentiment === 'negative' && <span className="shrink-0 text-red-400">●</span>}
                      {m.url ? (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="flex min-w-0 items-center gap-1 truncate text-slate-300 hover:text-sky-300">
                          <span className="truncate">{m.title}</span>
                          <ExternalLink className="size-3 shrink-0 text-slate-600" />
                        </a>
                      ) : <span className="truncate text-slate-300">{m.title}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {forecast.history.some((h) => h.volume > 0) && (
        <section className="panel mt-4 px-5 py-5">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-300">
              {t('ins.crisis.forecast.title', 'Where this is heading')}
            </h2>
            <span className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
              forecast.volumeTrend === 'rising' ? 'bg-sky-500/15 text-sky-300'
                : forecast.volumeTrend === 'falling' ? 'bg-orange-500/15 text-orange-300'
                  : 'bg-slate-500/15 text-slate-400'
            }`}>
              {forecast.volumeTrend === 'rising' ? <TrendingUp className="size-3" />
                : forecast.volumeTrend === 'falling' ? <TrendingDown className="size-3" />
                  : <Minus className="size-3" />}
              {forecast.volumeTrend === 'flat'
                ? 'steady pace'
                : `${forecast.volumePctPerWeek > 0 ? '+' : ''}${forecast.volumePctPerWeek}%/week`}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${CONF_STYLE[forecast.confidence]}`}
              title={CONF_HINT[forecast.confidence]}>
              {forecast.confidence} confidence
            </span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-slate-500">
            {t('ins.crisis.forecast.subtitle',
              'The recent daily pace, extended forward — not a prediction of events, just the trend if nothing changes. The shaded band is how much the last 30 days actually varied, so a projection outside it would be a real surprise.')}
          </p>

          {forecast.negShareWarning && (
            <div className="tv-shine mb-3 flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="size-4 shrink-0 text-amber-400" />
              <p className="text-sm text-amber-200">
                {t('ins.crisis.forecast.warning', 'Negative share has been climbing steadily.')}{' '}
                At this pace it would cross <span className="font-semibold">{forecast.negShareWarning.thresholdPct}%</span> around{' '}
                <span className="font-semibold">{fmtDate(forecast.negShareWarning.etaDay)}</span> — worth watching before it gets there.
              </p>
            </div>
          )}

          <ConversationForecastChart history={forecast.history} projected={forecast.projected} />
        </section>
      )}
    </>
  );
}
