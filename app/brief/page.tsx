import { marked } from 'marked';
import { briefList, getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { claudeAvailable } from '@/lib/claude';
import { CopyButton } from '@/components/copy-button';

export const metadata = { title: 'Brief' };

export default async function BriefPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const rows = await briefList(project.id);

  return (
    <>
      <PageHeader
        title="Daily Brief"
        subtitle="Briefing esecutivo generato ogni mattina da Claude sui dati delle ultime 24 ore"
      />
      {rows.length === 0 ? (
        <EmptyState message={claudeAvailable()
          ? 'Il primo brief sarà generato dal prossimo cron giornaliero.'
          : 'Serve la API key Claude (ANTHROPIC_API_KEY) per generare i brief.'} />
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((b) => (
            <article key={b.id} className="panel px-6 py-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-sky-400">
                  {new Date(b.briefDate).toLocaleDateString('it-IT', { dateStyle: 'full' })}
                </p>
                <CopyButton text={b.content} />
              </div>
              <div
                className="brief-md text-sm text-slate-300"
                dangerouslySetInnerHTML={{ __html: marked.parse(b.content) as string }}
              />
            </article>
          ))}
        </div>
      )}
    </>
  );
}
