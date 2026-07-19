import { getCurrentProject } from '@/lib/data';
import { conversationFlow } from '@/lib/insights';
import { SOURCE_META } from '@/lib/connectors';
import { PageHeader, EmptyState } from '@/components/ui';
import { SankeyFlow } from '@/components/insight-charts';

export const metadata = { title: 'Conversation flow' };

const sourceColors = Object.fromEntries(
  Object.values(SOURCE_META).map((m) => [m.label, m.color]),
);

export default async function FlowInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { nodes, links } = await conversationFlow(project.id, 14);

  return (
    <>
      <PageHeader
        title="Conversation flow"
        info="How the conversation flows from Source → Topic → Sentiment; band width = number of mentions. Data: your analyzed mentions. Period: last 14 days. Source: your collected mentions across all active sources."
        subtitle="How the conversation flows from source to topic to sentiment (last 14 days). Read the ribbons to see, at a glance, which sources drive which topics and where the negativity concentrates."
      />
      {nodes.length < 3 || links.length === 0 ? (
        <EmptyState message="Not enough AI-analyzed mentions to build the flow." />
      ) : (
        <section className="panel px-4 py-5">
          <div className="mb-3 flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-600">
            <span>Source</span><span>Topic</span><span>Sentiment</span>
          </div>
          <SankeyFlow nodes={nodes} links={links} sourceColors={sourceColors} />
          <p className="mt-3 text-xs text-slate-500">Ribbon thickness = number of mentions. Hover a node for its total.</p>
        </section>
      )}
    </>
  );
}
