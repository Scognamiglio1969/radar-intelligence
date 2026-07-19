import { getCurrentProject } from '@/lib/data';
import { conversationGalaxy } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { ConversationGalaxy } from '@/components/conversation-galaxy';

export const metadata = { title: 'Conversation Galaxy' };

export default async function GalaxyInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const g = await conversationGalaxy(project.id, 14);

  return (
    <>
      <PageHeader
        title="Conversation Galaxy"
        info="The whole conversation as a solar system: the sun is your Health Index, planets are sources (size = volume), each planet's three moons are sized by its positive/neutral/negative split. Data: your analyzed mentions. Period: last 14 days. Source: your collected mentions across all active sources."
        subtitle="Your conversation as a real solar system (last 14 days). Each planet is a source — sized by volume — orbiting the sun, whose glow reflects your Health Index. Every planet has three moons sized 1–10 by its sentiment split: positive, neutral, negative. Drag to orbit, scroll to fly closer."
      />
      {g.stars.length < 5 ? (
        <EmptyState message="Not enough mentions yet to render the galaxy." />
      ) : (
        <section className="panel px-4 py-4">
          <ConversationGalaxy {...g} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <span className="text-slate-400">Constellations (sources):</span>
            {g.sources.slice(0, 10).map((s) => (
              <span key={s.id} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label} <span className="text-slate-600">{s.count}</span>
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
