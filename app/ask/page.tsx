import { PageHeader, EmptyState } from '@/components/ui';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { AskChat } from '@/components/ask-chat';

export const metadata = { title: 'Chiedi ai dati' };

export default async function AskPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;

  return (
    <>
      <PageHeader
        title="Chiedi ai dati"
        subtitle={`Fai domande in linguaggio naturale sui dati di «${project.name}»: l'analista AI risponde con numeri e prove`}
      />
      {claudeAvailable()
        ? <AskChat suggestions={[
            'Qual è stato il tema più discusso negli ultimi 3 giorni?',
            'Il sentiment sta migliorando o peggiorando? Perché?',
            'Cosa si dice in inglese di diverso rispetto all’italiano?',
            'Quali fonti stanno crescendo di più questa settimana?',
          ]} />
        : <EmptyState message="Serve la API key Claude per usare l'analista." />}
    </>
  );
}
