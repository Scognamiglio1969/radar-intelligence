import { getCurrentProject } from '@/lib/data';
import { hourlyHeatmap } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { Heatmap } from '@/components/insight-charts';

export const metadata = { title: 'Hourly heatmap' };

export default async function HeatmapPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const grid = await hourlyHeatmap(project.id, 30);
  const total = grid.flat().reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        title="Hourly & daily heatmap"
        info="When the conversation happens, by weekday × hour of day (local time); brighter = more mentions. Data: the publish time of each mention. Period: last 30 days. Source: your collected mentions across all active sources."
        subtitle="When conversations explode: intensity by day of week and hour (last 30 days). Useful to know when to monitor and when to publish."
      />
      {total === 0 ? (
        <EmptyState message="No mentions in the period yet." />
      ) : (
        <section className="panel px-4 py-5">
          <Heatmap grid={grid} />
        </section>
      )}
    </>
  );
}
