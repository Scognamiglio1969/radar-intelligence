import { PageHeader, EmptyState } from '@/components/ui';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { getMeta } from '@/lib/db';
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
      {claudeAvailable() ? (
        <GenerateMd
          endpoint="/api/compare"
          responseKey="comparison"
          buttonLabel="Generate the weekly comparison"
          busyLabel="Comparing the two weeks…"
          hint="The comparison is computed once a day (~2 cents); later requests are free."
          initial={cached ?? null}
        />
      ) : (
        <EmptyState message="You need the Claude API key for the smart comparison." />
      )}
    </>
  );
}
