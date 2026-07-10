import { getCurrentProject } from '@/lib/data';
import { hourlyHeatmap } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { Heatmap } from '@/components/insight-charts';

export const metadata = { title: 'Heatmap oraria' };

export default async function HeatmapPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const grid = await hourlyHeatmap(project.id, 30);
  const total = grid.flat().reduce((s, n) => s + n, 0);

  return (
    <>
      <PageHeader
        title="Heatmap oraria e giornaliera"
        subtitle="Quando esplodono le conversazioni: intensità per giorno della settimana e ora (ultimi 30 giorni). Utile per sapere quando monitorare e quando pubblicare."
      />
      {total === 0 ? (
        <EmptyState message="Ancora nessuna mention nel periodo." />
      ) : (
        <section className="panel px-4 py-5">
          <Heatmap grid={grid} />
        </section>
      )}
    </>
  );
}
