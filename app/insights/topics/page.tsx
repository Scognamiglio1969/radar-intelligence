import { getCurrentProject } from '@/lib/data';
import { topicSentimentMap } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { TopicSentimentBubble } from '@/components/insight-charts';

export const metadata = { title: 'Temi × Sentiment' };

export default async function TopicsInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const data = await topicSentimentMap(project.id, 14);

  return (
    <>
      <PageHeader
        title="Mappa Temi × Sentiment"
        subtitle="Ogni bolla è un tema: orizzontale = sentiment, verticale = quanto sta guadagnando o perdendo peso nella conversazione, dimensione = volume. In alto i temi che stanno prendendo importanza, in basso quelli in calo."
      />
      {data.length < 3 ? (
        <EmptyState message="Servono più temi analizzati dall'AI per costruire la mappa." />
      ) : (
        <section className="panel px-4 py-5">
          <TopicSentimentBubble data={data} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> positivo</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400/70" /> neutro</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> negativo</span>
            <span className="ml-auto">Peso relativo: quota di conversazione nella seconda metà vs prima metà del periodo analizzato.</span>
          </div>
        </section>
      )}
    </>
  );
}
