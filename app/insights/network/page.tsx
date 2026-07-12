import { getCurrentProject } from '@/lib/data';
import { influencerNetwork } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { InfluencerNetwork } from '@/components/insight-charts';

export const metadata = { title: 'Influencer network' };

export default async function NetworkInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { nodes, edges, communities } = await influencerNetwork(project.id, 14);

  return (
    <>
      <PageHeader
        title="Influencer network"
        subtitle="The people driving the conversation, grouped by community (last 14 days). Each dot is an author, sized by engagement and colored by the community they post in; links connect people active in the same community — the clusters are your audience tribes."
      />
      {nodes.length < 3 ? (
        <EmptyState message="Not enough authors with a community yet to build the network." />
      ) : (
        <section className="panel px-4 py-5">
          <InfluencerNetwork nodes={nodes} edges={edges} communities={communities} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {communities.slice(0, 8).map((c, i) => (
              <span key={c} className="flex items-center gap-1">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee', '#c084fc'][i % 8] }} />
                {c}
              </span>
            ))}
            <span className="ml-auto">Dot size = engagement. Hover for posts and engagement.</span>
          </div>
        </section>
      )}
    </>
  );
}
