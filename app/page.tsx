import Link from 'next/link';
import { marked } from 'marked';
import { Flame } from 'lucide-react';
import { dashboardData, getCurrentProject } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { PageHeader, KpiCard, MentionCard, EmptyState, fmtCompact, fmtNum } from '@/components/ui';
import { VolumeChart, SentimentPie } from '@/components/charts';

export default async function DashboardPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato. Vai in Gestione progetti per crearne uno." />;
  const [data, trends] = await Promise.all([dashboardData(project.id), getTrends(project.id)]);

  const sentimentLabel = data.kpi.avgSentiment === null
    ? '—'
    : data.kpi.avgSentiment > 0.15 ? 'positivo' : data.kpi.avgSentiment < -0.15 ? 'negativo' : 'neutro';

  return (
    <>
      <PageHeader
        title={project.name}
        subtitle={`Monitoraggio su: ${project.keywords.join(', ')}`}
      />

      {trends.length > 0 && (
        <section className="panel mb-5 border-orange-500/30 px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-orange-300">
            <Flame className="size-4" /> Radar — trend emergenti nelle ultime 24 ore
          </h2>
          <div className="flex flex-col gap-2">
            {trends.map((t) => (
              <div key={t.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="rounded-full bg-orange-500/15 px-2.5 py-0.5 text-xs font-bold text-orange-300">
                  ×{t.score.toFixed(1)}
                </span>
                <span className="font-semibold">{t.topic}</span>
                <span className="text-xs text-slate-500">
                  {t.n24} mention in 24h (norma {t.baseline.toFixed(1)}/giorno)
                </span>
                {t.explanation && <span className="w-full text-xs text-slate-400 sm:w-auto">— {t.explanation}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label="Mention (7 giorni)" value={fmtCompact(data.kpi.total7)}
          exact={`${fmtNum(data.kpi.total7)} mention`} />
        <KpiCard
          label="Sentiment medio"
          value={sentimentLabel}
          hint={data.kpi.avgSentiment !== null ? `score ${data.kpi.avgSentiment.toFixed(2)}` : 'in attesa di analisi'}
        />
        <KpiCard label="Fonti attive" value={String(data.kpi.sources)} />
        <KpiCard label="Temi rilevati" value={String(data.topTopics.length)} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="panel px-5 py-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Volume per fonte (14 giorni)</h2>
          {data.volumeByDay.length
            ? <VolumeChart data={data.volumeByDay.map((r) => ({ ...r, n: Number(r.n) }))} />
            : <p className="py-16 text-center text-sm text-slate-500">Nessun dato: premi «Aggiorna ora»</p>}
        </section>
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Sentiment (7 giorni)</h2>
          {data.sentimentDist.length
            ? <SentimentPie data={data.sentimentDist} />
            : <p className="py-16 text-center text-sm text-slate-500">In attesa di analisi AI</p>}
        </section>
      </div>

      {data.topTopics.length > 0 && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Temi emergenti</h2>
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
            <h2 className="text-sm font-semibold text-slate-300">Ultime mention</h2>
            <Link href="/listening" className="text-xs text-sky-400 hover:text-sky-300">vedi tutte →</Link>
          </div>
          <div className="flex flex-col gap-2">
            {data.latest.length
              ? data.latest.map((m) => <MentionCard key={m.id} m={m} />)
              : <EmptyState message="Ancora nessuna mention raccolta." />}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-300">Ultimo brief</h2>
            <Link href="/brief" className="text-xs text-sky-400 hover:text-sky-300">archivio →</Link>
          </div>
          {data.latestBrief ? (
            <div className="panel px-5 py-4">
              <p className="mb-2 text-xs text-slate-500">
                {new Date(data.latestBrief.briefDate).toLocaleDateString('it-IT', { dateStyle: 'full' })}
              </p>
              <div
                className="brief-md text-sm text-slate-300"
                dangerouslySetInnerHTML={{ __html: marked.parse(data.latestBrief.content) as string }}
              />
            </div>
          ) : (
            <EmptyState message="Il primo brief giornaliero sarà generato dal cron mattutino (serve la API key Claude)." />
          )}
        </section>
      </div>
    </>
  );
}
