import Link from 'next/link';
import { getCurrentProject, getProjects } from '@/lib/data';
import { getLocale } from '@/lib/i18n';
import { claudeAvailable } from '@/lib/claude';
import { projectPlan, queryStats } from '@/lib/query-builder';
import { PageHeader, EmptyState } from '@/components/ui';
import { QueryStudio } from '@/components/query-studio';

// ---------------------------------------------------------------------------
// Query: che cosa Radar ascolta, separato da come è fatto il progetto.
// ---------------------------------------------------------------------------

export const metadata = { title: 'Query' };
// Costruire un piano chiama il modello; provarlo interroga Google News.
export const maxDuration = 120;

export default async function QueryPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const L = (it: string, en: string) => (lang === 'it' ? it : en);

  // Un progetto appena creato arriva qui con il suo id: il selettore in alto
  // potrebbe indicarne ancora un altro.
  const wanted = Number(sp.project);
  const project = wanted
    ? (await getProjects()).find((p) => p.id === wanted) ?? await getCurrentProject()
    : await getCurrentProject();
  if (!project) return <EmptyState message={L('Nessun progetto selezionato.', 'No project selected.')} />;

  const header = (
    <PageHeader
      title="Query"
      subtitle={L(
        `Che cosa ascolta “${project.name}”: scrivilo a parole, Radar costruisce e prova le query.`,
        `What “${project.name}” listens to: write it in words, Radar builds and tests the queries.`,
      )}
      info={L(
        'Le query sono fatte di mattoncini: il soggetto, i contesti a cui legarlo, i competitor e il rumore da escludere, ognuno con i suoi termini. Ogni query è una combinazione di mattoncini: correggi un termine una volta e cambia ovunque. Prima di salvare, la prova sul campo cerca ogni termine e ogni query nelle notizie dell’ultima settimana. Dopo il salvataggio ogni menzione porta l’etichetta delle query che l’hanno trovata.',
        'Queries are made of building blocks: the subject, the contexts to relate it to, the competitors and the noise to exclude, each with its own terms. Each query combines blocks: fix a term once and it changes everywhere. Before saving, the field test looks up every term and query in the last week of news. After saving, each mention is tagged with the queries that found it.',
      )}
    />
  );

  if (project.mode === 'upload') {
    return (
      <>
        {header}
        <EmptyState message={L('Questo progetto importa file: non ha query da costruire.', 'This project imports files: it has no queries to build.')} />
      </>
    );
  }
  const lens = project.mode === 'talkwalker';

  const [current, stats, ai] = await Promise.all([
    projectPlan(project.id), queryStats(project.id), claudeAvailable(),
  ]);

  return (
    <>
      {header}
      {lens && (
        <p className="mb-4 rounded-lg border border-teal-500/30 bg-teal-500/[0.05] px-4 py-2 text-xs text-teal-100">
          {L('Progetto Talkwalker: qui le query sono una lente. La raccolta resta quella dei topic scelti in Talkwalker e non si spende nessun credito in più; il piano serve a etichettare i documenti arrivati (soggetto, contesti, competitor) e a filtrarli in Ascolto. Ogni query si può copiare in sintassi booleana e incollare in Talkwalker.',
            'Talkwalker project: here queries are a lens. Collection stays with the topics chosen in Talkwalker and no extra credit is spent; the plan tags the incoming documents (subject, contexts, competitors) so you can filter them in Listening. Each query can be copied as boolean syntax and pasted into Talkwalker.')}
        </p>
      )}
      {sp.new && (
        <p className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/[0.05] px-4 py-2 text-xs text-sky-200">
          {L('Progetto creato. Ora dì a Radar che cosa ascoltare: finché non salvi un piano, il progetto non raccoglie niente.',
            'Project created. Now tell Radar what to listen to: until you save a plan, the project collects nothing.')}
          {' '}<Link href={`/settings?p=${project.id}`} className="underline">{L('Impostazioni del progetto', 'Project settings')}</Link>
        </p>
      )}
      <QueryStudio
        key={project.id}
        projectId={project.id}
        initialPlan={current?.plan ?? null}
        saved={current?.saved ?? false}
        stats={stats}
        aiAvailable={ai}
        lang={lang}
        initialBrief={project.semanticContext ?? ''}
      />
    </>
  );
}
