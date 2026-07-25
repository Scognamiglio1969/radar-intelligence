import { getCurrentProject } from '@/lib/data';
import { getTimeline } from '@/lib/timeline';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { TimelineView } from '@/components/timeline-view';

export const metadata = { title: 'Timeline' };

export default async function TimelinePage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No project configured.')} />;
  const events = await getTimeline(project.id);

  return (
    <>
      <PageHeader
        title={t('page.timeline.title', 'Timeline')}
        subtitle={t('page.timeline.subtitle', 'The historical memory of your monitoring: salient events, extracted daily by AI. It grows on its own over time.')}
      />
      <TimelineView
        events={events.map((e) => ({
          id: e.id,
          date: e.eventDate,
          title: e.title,
          description: e.description,
          importance: e.importance,
        }))}
        canGenerate={await claudeAvailable()}
      />
    </>
  );
}
