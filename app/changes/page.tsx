import { PageHeader, EmptyState } from '@/components/ui';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { getMeta } from '@/lib/db';
import { isDemoMode } from '@/lib/session';
import { GenerateMd } from '@/components/generate-md';

export const metadata = { title: 'What changed' };

export default async function ChangesPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const cached = await getMeta<string>(`compare:${project.id}:${new Date().toISOString().slice(0, 10)}`);

  return (
    <>
      <PageHeader
        title="What changed"
        subtitle="Smart comparison: the last 7 days vs the previous 7, explained in English"
      />
      {await claudeAvailable() && !isDemoMode() ? (
        <GenerateMd
          endpoint="/api/compare"
          responseKey="comparison"
          buttonLabel="Generate the weekly comparison"
          busyLabel="Comparing the two weeks…"
          hint="The comparison is computed once a day (~2 cents); later requests are free."
          initial={cached ?? null}
        />
      ) : (
        <EmptyState message={isDemoMode()
          ? '✨ The weekly comparison is a live AI feature — self-host with your own Anthropic key to try it.'
          : 'You need the Claude API key for the smart comparison.'} />
      )}
    </>
  );
}
