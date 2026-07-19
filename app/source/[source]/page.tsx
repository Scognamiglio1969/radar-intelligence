import Link from 'next/link';
import { Info } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { sourceDeepDive } from '@/lib/deepdive';
import { SOURCE_META } from '@/lib/connectors';
import { PageHeader, KpiCard, MentionCard, EmptyState, fmtNum } from '@/components/ui';
import { SourceVolumeCompare, SentimentCompareBars } from '@/components/deepdive-charts';

// Deep-dive per fonte: lente su un singolo canale, sempre confrontato col
// totale del progetto (stessi dati, quindi coerenza numerica garantita).

export const metadata = { title: 'Source deep-dive' };

const sentLabel = (v: number | null) =>
  v === null ? '—' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

export default async function SourceDeepDivePage({ params }: {
  params: Promise<{ source: string }>;
}) {
  const { source } = await params;
  const meta = SOURCE_META[source];
  if (!meta) return <EmptyState message="Unknown source." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;

  const d = await sourceDeepDive(project.id, source);

  return (
    <>
      <PageHeader
        title={`Deep-dive: ${meta.label}`}
        subtitle={`How the conversation on ${meta.label} compares with the whole project — same data, filtered by channel`}
        info={
          <>
            <p className="mb-1 font-semibold">What is this?</p>
            <p>A focused view of a single channel. Every number here is a subset of the
            project totals: the same mentions, filtered by source and compared with the
            whole, so figures always add up.</p>
          </>
        }
      />

      {meta.note && (
        <div className="mb-4 flex max-w-3xl items-start gap-2 rounded-lg border border-sky-500/25 bg-sky-500/5 px-4 py-3 text-xs leading-relaxed text-slate-300">
          <Info className="mt-0.5 size-4 shrink-0 text-sky-400" />
          <p><span className="font-semibold text-sky-300">How this data is collected:</span> {meta.note}</p>
        </div>
      )}

      {d.kpi.src7 === 0 && d.latest.length === 0 ? (
        <EmptyState message={`No mentions from ${meta.label} yet. If the source is enabled in Settings → Sources, data will appear after the next refresh.`} />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label={`Mentions 7d · ${meta.label}`} value={fmtNum(d.kpi.src7)}
              hint={`${(d.kpi.share * 100).toFixed(1)}% of the project's ${fmtNum(d.kpi.all7)}`} />
            <KpiCard label="Avg sentiment · channel" value={sentLabel(d.kpi.avgSentimentSrc)}
              hint={`whole project: ${sentLabel(d.kpi.avgSentimentAll)}`} />
            <KpiCard label="Active authors 7d" value={fmtNum(d.kpi.authors7)}
              hint="distinct authors on this channel" />
            <KpiCard label="Topics 30d" value={fmtNum(d.topics.length)}
              hint="topics detected on this channel" />
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="Bars: this channel's daily mentions. Grey area: the whole project. Hover a day for the channel's share.">
                Volume: channel vs whole project (14 days)
              </h2>
              <SourceVolumeCompare data={d.volume} color={meta.color} label={meta.label} />
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-300"
                title="Sentiment split of this channel's analyzed mentions vs the whole project, last 7 days.">
                Sentiment: channel vs whole project (7 days)
              </h2>
              <SentimentCompareBars src={d.sentimentSrc} all={d.sentimentAll} label={meta.label} />
            </section>
          </div>

          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="Topics found on this channel in the last 30 days. The bar shows how much of each topic's total conversation happens on this channel.">
                Channel topics (30 days)
              </h2>
              {d.topics.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-600">No topics analyzed yet on this channel.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-xs">
                  {d.topics.map((t) => {
                    const pct = t.nAll > 0 ? Math.round((t.nSrc / t.nAll) * 100) : 0;
                    return (
                      <li key={t.topic} className="flex items-center gap-2">
                        <Link href={`/listening?fonte=${source}&q=${encodeURIComponent(t.topic)}`}
                          className="w-44 shrink-0 truncate text-slate-300 hover:text-sky-300" title={`See "${t.topic}" mentions on ${meta.label}`}>
                          {t.topic}
                        </Link>
                        <div className="h-2.5 flex-1 overflow-hidden rounded bg-white/5"
                          title={`${t.nSrc} of the ${t.nAll} project mentions on this topic are on ${meta.label} (${pct}%)`}>
                          <div className="h-full rounded" style={{ width: `${pct}%`, background: meta.color }} />
                        </div>
                        <span className="w-20 shrink-0 text-right text-slate-500">{t.nSrc}/{t.nAll} · {pct}%</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="The authors posting most on this channel in the last 30 days. Click one to see their posts.">
                Top authors on {meta.label} (30 days)
              </h2>
              {d.authors.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-600">No authors recorded on this channel.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {d.authors.map((a) => (
                    <Link key={a.author}
                      href={`/listening?fonte=${source}&autore=${encodeURIComponent(a.author)}`}
                      className="rounded bg-white/5 px-2 py-1 text-slate-300 transition hover:bg-sky-500/15 hover:text-sky-300"
                      title={`${a.n} posts on ${meta.label}${a.avgSent !== null ? ` · avg sentiment ${sentLabel(a.avgSent)}` : ''}`}>
                      {a.author} <span className="text-slate-500">×{a.n}</span>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel px-5 py-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-slate-300">Latest from {meta.label}</h2>
              <Link href={`/listening?fonte=${source}`} className="text-xs text-sky-400 hover:text-sky-300">
                all {meta.label} mentions →
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {d.latest.length
                ? d.latest.map((m) => <MentionCard key={m.id} m={m} />)
                : <EmptyState message="No mentions yet." />}
            </div>
          </section>
        </>
      )}
    </>
  );
}
