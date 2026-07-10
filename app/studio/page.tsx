import Link from 'next/link';
import { PageHeader, EmptyState } from '@/components/ui';
import { getCurrentProject } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { dashboardData } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { ContentStudio } from '@/components/content-studio';

export const metadata = { title: 'Content Studio' };

export default async function StudioPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;

  const [trends, dashboard] = await Promise.all([getTrends(project.id), dashboardData(project.id)]);
  // Spunti: prima i trend emergenti, poi i temi principali
  const suggestions = [
    ...trends.slice(0, 4).map((t) => t.topic),
    ...dashboard.topTopics.slice(0, 6).map((t) => t.topic),
  ].filter((v, i, a) => a.indexOf(v) === i).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Content Studio"
        subtitle="Da un concetto a contenuti pronti per ogni canale: genera il kit multi-formato, esplora hook alternativi e rifinisci ogni bozza a voce."
      />
      {!project.brandVoice && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
          Suggerimento: imposta il «tono di voce del brand» in{' '}
          <Link href="/settings" className="underline">Gestione progetti</Link> per bozze su misura.
        </p>
      )}
      {claudeAvailable() ? (
        <ContentStudio suggestions={suggestions} />
      ) : (
        <EmptyState message="Serve la API key Claude per il Content Studio." />
      )}
    </>
  );
}
