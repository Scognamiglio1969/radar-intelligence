import { getCurrentProject } from '@/lib/data';
import { momentumQuadrant } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { MomentumQuadrant } from '@/components/insight-charts';

export const metadata = { title: 'Momentum quadrant' };

export default async function MomentumInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const points = await momentumQuadrant(project.id, 14);

  return (
    <>
      <PageHeader
        title="Momentum quadrant"
        info="Shows each topic by how big it is (volume) and how fast it's moving (acceleration). Data: the topic tags and publish dates of your mentions; the last 14 days are split into two halves to measure acceleration. Source: your collected mentions across all active sources."
        subtitle="A strategic 2×2 of topics by volume (how big) and acceleration (how fast it is moving), last 14 days. Rising stars are big and still growing; Emerging are small but surging; Steady are big but flat; Declining are fading."
      />
      {points.length < 3 ? (
        <EmptyState message="More AI-analyzed topics are needed to build the quadrant." />
      ) : (
        <section className="panel px-4 py-5">
          <MomentumQuadrant points={points} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> Rising stars</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-sky-400/70" /> Emerging</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-violet-400/70" /> Steady</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> Declining</span>
            <span className="ml-auto">Bubble size = volume · hover to read a label · use the Zoom buttons when a corner is crowded.</span>
          </div>
        </section>
      )}
    </>
  );
}
