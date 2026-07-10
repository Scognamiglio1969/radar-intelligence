import { getCurrentProject } from '@/lib/data';
import { getTimeline } from '@/lib/timeline';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState } from '@/components/ui';
import { TimelineView } from '@/components/timeline-view';

export const metadata = { title: 'Timeline' };

export default async function TimelinePage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const events = await getTimeline(project.id);

  return (
    <>
      <PageHeader
        title="Timeline del settore"
        subtitle="La memoria storica del monitoraggio: gli eventi salienti, estratti ogni giorno dall'AI. Cresce da sola nel tempo."
      />
      <TimelineView
        events={events.map((e) => ({
          id: e.id,
          date: e.eventDate,
          title: e.title,
          description: e.description,
          importance: e.importance,
        }))}
        canGenerate={claudeAvailable()}
      />
    </>
  );
}
