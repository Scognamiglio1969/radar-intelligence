import { getCurrentProject } from '@/lib/data';
import { crisisAnatomy } from '@/lib/insights';
import { PageHeader, EmptyState, SourceBadge, fmtDate } from '@/components/ui';
import { RiskGauge } from '@/components/insight-charts';
import { ExternalLink } from 'lucide-react';

export const metadata = { title: 'Crisis radar' };

export default async function CrisisInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { risk, level, drivers, peak } = await crisisAnatomy(project.id, 14);

  return (
    <>
      <PageHeader
        title="Crisis radar & peak anatomy"
        info="A risk gauge plus the anatomy of the biggest volume/sentiment spike in the window — what drove it and the content that weighed most. Data: your analyzed mentions. Period: last 14 days. Source: your collected mentions across all active sources."
        subtitle="One risk number, plus the autopsy of the biggest spike (last 14 days): what drove the risk up, and — on the peak day — which topics and content weighed most. Your early-warning, single-glance crisis view."
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
    </>
  );
}
