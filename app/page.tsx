import Link from 'next/link';
import { marked } from 'marked';
import { Flame, UploadCloud } from 'lucide-react';
import { dashboardData, getCurrentProject } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { PageHeader, KpiCard, MentionCard, EmptyState, fmtCompact, fmtNum } from '@/components/ui';
import { VolumeChart, SentimentPie } from '@/components/charts';

export default async function DashboardPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured. Go to Projects to create one." />;
  const [data, trends] = await Promise.all([dashboardData(project.id), getTrends(project.id)]);

  const sentimentLabel = data.kpi.avgSentiment === null
    ? '—'
    : data.kpi.avgSentiment > 0.15 ? 'positive' : data.kpi.avgSentiment < -0.15 ? 'negative' : 'neutral';

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={project.mode === 'upload'
          ? 'Imported data — analyzed with the full Radar engine'
          : `Monitoring: ${project.keywords.join(', ')}`}
      />

      {project.mode === 'upload' && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] px-4 py-3">
          <span className="flex items-center gap-1.5 text-sm font-medium text-sky-200"><UploadCloud className="size-4" /> Import project</span>
          <span className="text-xs text-slate-400">— add more rows anytime from an Excel/CSV file.</span>
          <Link href={`/import?project=${project.id}`}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-sky-400">
            <UploadCloud className="size-3.5" /> Import a file
          </Link>
        </div>
      )}

      {trends.length > 0 && (
        <section className="panel mb-5 border-orange-500/30 px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-300">
            <Flame className="size-4" /> Radar — emerging trends in the last 24 hours
          </h2>
          <div className="flex flex-col gap-2">
            {trends.map((t) => (
              <div key={t.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-bold text-orange-300">
                  ×{t.score.toFixed(1)}
                </span>
                <span className="font-semibold">{t.topic}</span>
                <span className="text-xs text-slate-500">
                  {t.n24} mentions in 24h (norm {t.baseline.toFixed(1)}/day)
                </span>
                {t.explanation && <span className="w-full text-xs text-slate-400 sm:w-auto">— {t.explanation}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Mentions (7 days)" value={fmtCompact(data.kpi.total7)}
          exact={`${fmtNum(data.kpi.total7)} mentions`} />
        <KpiCard
          label="Average sentiment"
          value={sentimentLabel}
          hint={data.kpi.avgSentiment !== null ? `score ${data.kpi.avgSentiment.toFixed(2)}` : 'awaiting analysis'}
        />
        <KpiCard label="Active sources" value={String(data.kpi.sources)} />
        <KpiCard label="Topics detected" value={String(data.topTopics.length)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="panel px-5 py-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Volume by source (14 days)</h2>
          {data.volumeByDay.length
            ? <VolumeChart data={data.volumeByDay.map((r) => ({ ...r, n: Number(r.n) }))} />
            : <p className="py-16 text-center text-sm text-slate-500">No data: press “Refresh now”</p>}
        </section>
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Sentiment (7 days)</h2>
          {data.sentimentDist.length
            ? <SentimentPie data={data.sentimentDist} />
            : <p className="py-16 text-center text-sm text-slate-500">Awaiting AI analysis</p>}
        </section>
      </div>

      {data.topTopics.length > 0 && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Emerging topics</h2>
          <div className="flex flex-wrap gap-2">
            {data.topTopics.map((t) => (
              <span key={t.topic} className="rounded-full bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
                {t.topic} <span className="text-sky-500/70">{fmtNum(Number(t.n))}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Latest mentions</h2>
            <Link href="/listening" className="text-xs text-sky-400 hover:text-sky-300">see all →</Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.latest.length
              ? data.latest.map((m) => <MentionCard key={m.id} m={m} />)
              : <EmptyState message="No mentions collected yet." />}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Latest brief</h2>
            <Link href="/brief" className="text-xs text-sky-400 hover:text-sky-300">archive →</Link>
          </div>
          {data.latestBrief ? (
            <div className="panel px-5 py-4">
              <p className="mb-2 text-xs text-slate-500">
                {new Date(data.latestBrief.briefDate).toLocaleDateString('en-US', { dateStyle: 'full' })}
              </p>
              <div
                className="brief-md text-sm text-slate-300"
                dangerouslySetInnerHTML={{ __html: marked.parse(data.latestBrief.content) as string }}
              />
            </div>
          ) : (
            <EmptyState message="The first daily brief will be generated by the morning cron (requires the Claude API key)." />
          )}
        </section>
      </div>
    </>
  );
}
