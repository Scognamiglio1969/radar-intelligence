import { getCurrentProject } from '@/lib/data';
import { semanticConstellation } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { SemanticConstellation } from '@/components/insight-charts';

export const metadata = { title: 'Semantic constellation' };

export default async function ConstellationInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { nodes, edges } = await semanticConstellation(project.id, 14);

  return (
    <>
      <PageHeader
        title="Semantic constellation"
        subtitle="The language of the conversation as a map of stars: each term sized by frequency, colored by sentiment, and linked to the terms it co-occurs with (last 14 days). Clusters of connected stars reveal the recurring framings."
      />
      {nodes.length < 3 ? (
        <EmptyState message="More AI-analyzed topics are needed to build the constellation." />
      ) : (
        <section className="panel px-4 py-5">
          <SemanticConstellation nodes={nodes} edges={edges} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> positive</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400/70" /> neutral</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> negative</span>
            <span className="ml-auto">Star size = frequency · line thickness = how often two terms appear together.</span>
          </div>
        </section>
      )}
    </>
  );
}
