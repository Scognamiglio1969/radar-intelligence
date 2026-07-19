import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/ui';
import { ImportWizard } from '@/components/import-wizard';

export const metadata = { title: 'Import data' };

export default async function ImportPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return <EmptyState message="Importing data is available to admins." />;

  const sp = await searchParams;
  const projectId = Number(sp.project);
  const db = await getDb();
  const [p] = projectId
    ? await db.select({ id: projects.id, name: projects.name, mode: projects.mode }).from(projects).where(eq(projects.id, projectId))
    : [];

  if (!p || p.mode !== 'upload') {
    return (
      <EmptyState message="Open an import project first. Create one from Projects → New project → Import file, then upload your files here." />
    );
  }

  return (
    <>
      <PageHeader
        title={`Import into “${p.name}”`}
        subtitle="Upload an Excel or CSV file and map its columns to Radar’s fields. Rows become mentions and get the full analysis engine — sentiment, emotions, topics, every insight and chart."
        info="Only the text column is required; date, author, source, link and engagement are optional. Re-importing the same file won't create duplicates. Source: the file you upload."
      />
      <div className="mb-4">
        <Link href="/settings" className="text-xs text-slate-500 hover:text-slate-300">← back to Projects</Link>
      </div>
      <ImportWizard project={{ id: p.id, name: p.name }} />
    </>
  );
}
