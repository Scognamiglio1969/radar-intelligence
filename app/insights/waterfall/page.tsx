import { getCurrentProject } from '@/lib/data';
import { sentimentWaterfall } from '@/lib/insights';
import { PageHeader, EmptyState, SentimentBadge } from '@/components/ui';
import { SentimentWaterfall } from '@/components/insight-charts';
import { ExternalLink } from 'lucide-react';

export const metadata = { title: 'Sentiment Waterfall' };

export default async function WaterfallPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { steps, swings } = await sentimentWaterfall(project.id, 14);

  return (
    <>
      <PageHeader
        title="Sentiment Waterfall"
        info="Shows how sentiment moved day by day: each bar is that day's net (positive − negative posts), the line is the running balance. Data: the sentiment tag of each mention. Period: last 14 days. Source: your collected mentions across all active sources."
        subtitle="How sentiment moved day by day: the green/red bars are each day's net contribution, the blue line the cumulative balance. Below, the content that weighed most on the turning-point days."
      />
      {steps.length < 2 ? (
        <EmptyState message="More days of data with analyzed sentiment are needed." />
      ) : (
        <>
          <section className="panel px-4 py-5">
            <SentimentWaterfall steps={steps} />
            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-[var(--border)] pt-3 text-xs text-slate-500">
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-emerald-400/80" /> green bar = that day had more positive than negative posts</span>
              <span className="flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm bg-red-400/80" /> red bar = more negative than positive</span>
              <span className="flex items-center gap-1.5"><span className="inline-block h-0.5 w-4 rounded bg-sky-400" /> blue line = running balance since the start of the window</span>
              <span className="ml-auto text-slate-600">Hover any day for the exact numbers.</span>
            </div>
          </section>
          {swings.length > 0 && (
            <section className="panel mt-4 px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">What moved the sentiment</h2>
              <div className="flex flex-col gap-2.5">
                {swings.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 text-xs text-slate-500">{new Date(s.day).toLocaleDateString('en-US')}</span>
                    <SentimentBadge sentiment={s.sentiment} />
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-1 text-slate-300 hover:text-sky-300">
                        <span className="truncate">{s.title}</span>
                        <ExternalLink className="size-3 shrink-0 text-slate-600" />
                      </a>
                    ) : <span className="truncate text-slate-300">{s.title}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
