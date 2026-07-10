import { PageHeader, EmptyState } from '@/components/ui';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { getMeta } from '@/lib/db';
import { GenerateMd } from '@/components/generate-md';

export const metadata = { title: 'Cosa è cambiato' };

export default async function ChangesPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const cached = await getMeta<string>(`compare:${project.id}:${new Date().toISOString().slice(0, 10)}`);

  return (
    <>
      <PageHeader
        title="Cosa è cambiato"
        subtitle="Confronto intelligente: gli ultimi 7 giorni contro i 7 precedenti, spiegato in italiano"
      />
      {claudeAvailable() ? (
        <GenerateMd
          endpoint="/api/compare"
          responseKey="comparison"
          buttonLabel="Genera il confronto settimanale"
          busyLabel="Sto confrontando le due settimane…"
          hint="Il confronto viene calcolato una volta al giorno (~2 centesimi); le richieste successive sono gratis."
          initial={cached ?? null}
        />
      ) : (
        <EmptyState message="Serve la API key Claude per il confronto intelligente." />
      )}
    </>
  );
}
