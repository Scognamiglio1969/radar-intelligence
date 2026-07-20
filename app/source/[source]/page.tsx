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

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const sentDot = (v: number) => (v > 0.15 ? 'text-emerald-400' : v < -0.15 ? 'text-red-400' : 'text-slate-400');

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
            <div title={`Mentions collected from ${meta.label} in the last 7 days: ${fmtNum(d.kpi.src7)} — that is ${(d.kpi.share * 100).toFixed(1)}% of the ${fmtNum(d.kpi.all7)} mentions of the whole project in the same window.`}>
              <KpiCard label={`Mentions 7d · ${meta.label}`} value={fmtNum(d.kpi.src7)}
                hint={`${(d.kpi.share * 100).toFixed(1)}% of the project's ${fmtNum(d.kpi.all7)}`} />
            </div>
            <div title={`Average AI sentiment of this channel's analyzed mentions in the last 7 days, on a −1 (very negative) to +1 (very positive) scale — next to the whole project's average for comparison.`}>
              <KpiCard label="Avg sentiment · channel" value={sentLabel(d.kpi.avgSentimentSrc)}
                hint={`whole project: ${sentLabel(d.kpi.avgSentimentAll)}`} />
            </div>
            <div title={`Distinct authors who posted on ${meta.label} in the last 7 days.`}>
              <KpiCard label="Active authors 7d" value={fmtNum(d.kpi.authors7)}
                hint="distinct authors on this channel" />
            </div>
            <div title={`Different topics the AI detected on this channel in the last 30 days.`}>
              <KpiCard label="Topics 30d" value={fmtNum(d.topics.length)}
                hint="topics detected on this channel" />
            </div>
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

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="Topics accelerating on this channel: mentions in the last 7 days compared with this channel's weekly average of the previous 14 days. NEW = the topic did not appear before.">
                Emerging on {meta.label} <span className="font-normal text-slate-500">(7 days)</span>
              </h2>
              {d.emerging.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-600"
                  title="Needs at least 2 mentions of a topic in the last 7 days on this channel — and topics come from the AI analysis.">
                  No accelerating topics detected yet on this channel.</p>
              ) : (
                <ul className="flex flex-col gap-1.5 text-xs">
                  {d.emerging.map((t) => (
                    <li key={t.topic} className="flex items-center gap-2">
                      <Link href={`/listening?fonte=${source}&q=${encodeURIComponent(t.topic)}`}
                        className="flex-1 truncate text-slate-300 hover:text-sky-300"
                        title={`See "${t.topic}" mentions on ${meta.label}`}>{t.topic}</Link>
                      {t.nPrev === 0 ? (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 font-semibold text-violet-300"
                          title={`"${t.topic}" appeared on ${meta.label} for the first time this week: ${t.nNow} mentions in the last 7 days, none in the previous 14.`}>
                          NEW
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-semibold text-emerald-300"
                          title={`${t.nNow} mentions in the last 7 days vs a weekly average of ${(t.nPrev / 2).toFixed(1)} in the previous 14 days → growing ${t.growth.toFixed(1)}×.`}>
                          ↑ {t.growth.toFixed(1)}×
                        </span>
                      )}
                      <span className="w-8 text-right text-slate-500" title={`${t.nNow} mentions in the last 7 days`}>{t.nNow}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title="The channel's personality, computed from the last 30 days of its mentions: when it is most active, which languages it speaks, whether few voices dominate it, and how relevant its content is to your topic.">
                Channel identity <span className="font-normal text-slate-500">(30 days)</span>
              </h2>
              <ul className="flex flex-col gap-2.5 text-xs">
                <li title={d.character.peak
                  ? `The hour with the most posts in the last 30 days (Europe/Rome): ${DOW[d.character.peak.dow]} ${d.character.peak.hour}:00–${d.character.peak.hour + 1}:00, ${d.character.peak.n} mentions. Useful to time your publishing.`
                  : 'Not enough data yet.'}>
                  <p className="text-slate-500">Most active moment</p>
                  <p className="font-semibold text-slate-200">
                    {d.character.peak ? `${DOW[d.character.peak.dow]} · ${String(d.character.peak.hour).padStart(2, '0')}:00` : '—'}
                  </p>
                </li>
                <li title="Languages of this channel's mentions in the last 30 days, most frequent first.">
                  <p className="text-slate-500">Languages</p>
                  <p className="font-semibold uppercase text-slate-200">
                    {d.character.languages.length
                      ? d.character.languages.map((l) => l.language).join(' · ')
                      : '—'}
                  </p>
                </li>
                <li title={d.character.top3Share !== null
                  ? `The 3 most active authors wrote ${Math.round(d.character.top3Share * 100)}% of the channel's posts (${d.character.authorsTotal} posts with a known author in 30 days). Above ~50% the conversation depends on a handful of voices; below, it is broadly distributed.`
                  : 'No authors recorded on this channel.'}>
                  <p className="text-slate-500">Voice concentration</p>
                  <p className="font-semibold text-slate-200">
                    {d.character.top3Share !== null
                      ? `top 3 authors = ${Math.round(d.character.top3Share * 100)}% ${d.character.top3Share > 0.5 ? '· few voices dominate' : '· distributed'}`
                      : '—'}
                  </p>
                </li>
                <li title={d.character.relevanceSrc !== null
                  ? `Average AI relevance (1–5 stars) of this channel's content vs the whole project, last 30 days. Higher = this channel talks more precisely about your topic.`
                  : 'Relevance stars appear after the AI analysis.'}>
                  <p className="text-slate-500">Relevance to your topic</p>
                  <p className="font-semibold text-slate-200">
                    {d.character.relevanceSrc !== null
                      ? <>★ {d.character.relevanceSrc.toFixed(1)} <span className="font-normal text-slate-500">vs ★ {d.character.relevanceAll?.toFixed(1) ?? '—'} project</span></>
                      : '—'}
                  </p>
                </li>
              </ul>
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-2 text-sm font-semibold text-slate-300"
                title={`Topics where ${meta.label}'s average sentiment differs most from every other source combined (last 30 days, at least 3 analyzed mentions on each side). This is where the channel sees the story differently.`}>
                Where {meta.label} disagrees <span className="font-normal text-slate-500">(30 days)</span>
              </h2>
              {d.disagreements.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-600"
                  title="Needs at least 3 AI-analyzed mentions of the same topic both on this channel and elsewhere.">
                  No significant sentiment gaps with the rest of the project.</p>
              ) : (
                <ul className="flex flex-col gap-2 text-xs">
                  {d.disagreements.map((t) => (
                    <li key={t.topic} className="flex items-center gap-2"
                      title={`"${t.topic}": on ${meta.label} the average AI sentiment is ${sentLabel(t.sSrc)} (${t.nSrc} mentions), on every other source ${sentLabel(t.sRest)} (${t.nRest} mentions). Scale −1 (very negative) to +1 (very positive).`}>
                      <Link href={`/listening?fonte=${source}&q=${encodeURIComponent(t.topic)}`}
                        className="flex-1 truncate text-slate-300 hover:text-sky-300"
                        title={`See "${t.topic}" mentions on ${meta.label}`}>{t.topic}</Link>
                      <span className={`font-semibold ${sentDot(t.sSrc)}`}
                        title={`${meta.label}: average sentiment ${sentLabel(t.sSrc)} over ${t.nSrc} mentions`}>{sentLabel(t.sSrc)}</span>
                      <span className="text-slate-600" title="compared with">vs</span>
                      <span className={`font-semibold ${sentDot(t.sRest)}`}
                        title={`All other sources: average sentiment ${sentLabel(t.sRest)} over ${t.nRest} mentions`}>{sentLabel(t.sRest)}</span>
                    </li>
                  ))}
                </ul>
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
