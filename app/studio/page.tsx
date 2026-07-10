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
  if (!project) return <EmptyState message="No project configured." />;

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
        subtitle="From a concept to content ready for every channel: generate the multi-format kit, explore alternative hooks and refine each draft by voice."
      />
      {!project.brandVoice && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
          Tip: set the “brand tone of voice” in{' '}
          <Link href="/settings" className="underline">Projects</Link> for tailored drafts.
        </p>
      )}
      {claudeAvailable() ? (
        <ContentStudio suggestions={suggestions} />
      ) : (
        <EmptyState message="You need the Claude API key for Content Studio." />
      )}
    </>
  );
}
