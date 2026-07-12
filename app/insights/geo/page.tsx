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
        title="Geographic map"
        subtitle="Where the conversation happens, inferred from the language of each mention (last 30 days). Bubble size = volume, color = sentiment. A language that spans many countries is placed on its main region."
      />
      {points.length < 1 ? (
        <EmptyState message="Not enough language-tagged mentions yet to build the map." />
      ) : (
        <section className="panel px-4 py-5">
          <GeoBubbleMap points={points} />
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> positive</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400/70" /> neutral</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> negative</span>
            <span className="ml-auto">Hover a bubble for volume, share and sentiment. Geography is inferred from language, not precise location.</span>
          </div>
        </section>
      )}
    </>
  );
}
