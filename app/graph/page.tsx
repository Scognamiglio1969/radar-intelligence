import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { studioCharts } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { StudioGraph } from '@/components/studio-graph';

export const metadata = { title: 'Studio Graph' };
export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Studio Graph: il grafico che non era previsto.
//
// Tutto il resto di Radar risponde a domande decise da noi. Qui la domanda la
// fa l'utente, scegliendo i tre assi fra i campi che il suo progetto contiene
// davvero — quelli del listening e quelli arrivati dai fogli di calcolo, nello
// stesso elenco, perché a chi guarda non importa da dove viene un numero.
// ---------------------------------------------------------------------------

export default async function GraphPage({ searchParams }: {
  searchParams: Promise<{ chart?: string; preset?: string }>;
}) {
  const project = await getCurrentProject();
  if (!project) {
    return (
      <div className="space-y-4">
        <PageHeader title="Studio Graph" subtitle="Costruisci il grafico che ti serve" />
        <EmptyState message="Scegli un progetto dalla barra laterale per vedere i suoi campi." />
      </div>
    );
  }
  if (!isAdmin(await getCurrentUser())) {
    return (
      <div className="space-y-4">
        <PageHeader title="Studio Graph" subtitle="Costruisci il grafico che ti serve" />
        <EmptyState message="Studio Graph è riservato agli amministratori. I grafici salvati restano poi visibili a tutti dentro il report personalizzato." />
      </div>
    );
  }

  // ?chart=<id> apre un grafico preciso: è il modo in cui ci si arriva
  // dall'hub degli insight, dove ogni scheda è un grafico salvato.
  const sp = await searchParams;
  const wanted = Number(sp.chart);
  const db = await getDb();
  const rows = await db.select().from(studioCharts)
    .where(eq(studioCharts.projectId, project.id))
    .orderBy(desc(studioCharts.updatedAt));
  const saved = wanted ? rows.filter((r) => r.id === wanted) : rows.slice(0, 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio Graph"
        subtitle="Scegli i tre assi, la forma e il colore. I campi sono quelli del tuo progetto."
      />
      <StudioGraph preset={sp.preset === 'map' ? 'map' : undefined} initial={saved[0]
        ? { id: saved[0].id, title: saved[0].title, spec: saved[0].spec as never }
        : undefined} />
    </div>
  );
}
