import { getCurrentProject } from '@/lib/data';
import { geoDistribution } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { GeoBubbleMap } from '@/components/insight-charts';

export const metadata = { title: 'Geographic map' };

export default async function GeoInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const points = await geoDistribution(project.id, 30);

  return (
    <>
      <PageHeader
        title="Languages of the conversation"
        subtitle="What language people use when they talk about your topic (last 30 days). The map shades each language over the regions where it is primarily spoken — intensity = share of the conversation, not a claim about location. A language can be used anywhere. Sentiment is shown per language below, never painted onto a country."
      />
      {points.length < 1 ? (
        <EmptyState message="Not enough language-tagged mentions yet." />
      ) : (
        <section className="panel px-4 py-5">
          <GeoBubbleMap points={points} />
          <p className="mt-3 text-xs text-slate-500">
            Shading = share of the conversation in that language. Hover a region for details. This is a <span className="text-slate-400">language</span> view mapped for reference — not a per-country measurement.
          </p>
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Languages · share &amp; sentiment</p>
            <div className="flex flex-col gap-2">
              {points.slice(0, 12).map((p) => {
                const s = p.sentiment;
                const scol = s === null ? 'text-slate-500' : s > 0.15 ? 'text-emerald-400' : s < -0.15 ? 'text-red-400' : 'text-sky-300';
                const slabel = s === null ? 'n/a' : s > 0.15 ? 'positive' : s < -0.15 ? 'negative' : 'neutral';
                return (
                  <div key={p.lang} className="flex items-center gap-2 text-sm">
                    <span className="w-40 shrink-0 truncate text-slate-300">{p.flag} {p.country}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                      <div className="h-full rounded-full bg-sky-400/70" style={{ width: `${Math.min(100, p.share)}%` }} />
                    </div>
                    <span className="w-14 shrink-0 text-right text-xs tabular-nums text-slate-400">{p.share}%</span>
                    <span className={`w-20 shrink-0 text-right text-xs ${scol}`}>{slabel}{s !== null ? ` ${s}` : ''}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
