import Link from 'next/link';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/ui';
import { ImportWorkspace } from '@/components/import-workspace';

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
        subtitle="A distillery for listening exports: drop in as many Excel or CSV files as you like, Radar reads what each column actually contains and turns them into mentions the whole analysis engine understands."
        info="Files are kept as raw material, not consumed: their rows stay in store untouched, and mentions are DERIVED from the current mapping. Change any field assignment and re-import — no re-upload, and the original is never altered. Each mention remembers which file it came from, so a single file can be reworked or removed without touching the rest of the project. Sentiment already present in the file is imported as-is and skips the AI pass."
      />
      <div className="mb-4">
        <Link href="/settings" className="text-xs text-slate-500 hover:text-slate-300">← back to Projects</Link>
      </div>
      <ImportWorkspace project={{ id: p.id, name: p.name }} />
    </>
  );
}
