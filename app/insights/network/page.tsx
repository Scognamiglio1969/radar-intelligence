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
        info="The most active authors as a graph. Dot size = engagement, fill color = the topic they focus on most, and the outer ring = their average sentiment (green positive, red negative). Links connect people who focus on the same topic — the clusters are your topic tribes. Click any author to read their posts. Period: last 14 days, across all active sources."
        subtitle="The people driving the conversation (last 14 days). Each dot is an author, sized by engagement, filled by the topic they focus on and ringed by their average sentiment. Links connect people around the same topic — the clusters are the tribes forming around each subject. Click anyone (dot or list) to open their posts."
      />
      {nodes.length < 3 ? (
        <EmptyState message="Not enough authors yet to build the network." />
      ) : (
        <section className="panel px-4 py-5">
          <InfluencerNetwork nodes={nodes} edges={edges} communities={communities} />
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[var(--border)] pt-3 text-xs text-slate-500">
            <span className="text-slate-600">Topic clusters:</span>
            {communities.slice(0, 8).map((c, i) => (
              <span key={c} className="flex items-center gap-1" title={`Authors focused on “${c}”`}>
                <span className="size-2.5 rounded-full" style={{ backgroundColor: ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee', '#c084fc'][i % 8] }} />
                {c}
              </span>
            ))}
            <span className="ml-auto">Fill = topic · ring = sentiment · size = engagement</span>
          </div>
        </section>
      )}
    </>
  );
}
