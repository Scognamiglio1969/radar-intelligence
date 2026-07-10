import { getCurrentProject } from '@/lib/data';
import { sentimentWaterfall } from '@/lib/insights';
import { PageHeader, EmptyState, SentimentBadge } from '@/components/ui';
import { SentimentWaterfall } from '@/components/insight-charts';
import { ExternalLink } from 'lucide-react';

export const metadata = { title: 'Sentiment Waterfall' };

export default async function WaterfallPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const { steps, swings } = await sentimentWaterfall(project.id, 14);

  return (
    <>
      <PageHeader
        title="Sentiment Waterfall"
        subtitle="Come si è mosso il sentiment giorno per giorno: le barre verdi/rosse sono il contributo netto di ogni giorno, la linea azzurra il saldo cumulato. Sotto, i contenuti che hanno pesato di più nei giorni di svolta."
      />
      {steps.length < 2 ? (
        <EmptyState message="Servono più giorni di dati con sentiment analizzato." />
      ) : (
        <>
          <section className="panel px-4 py-5">
            <SentimentWaterfall steps={steps} />
          </section>
          {swings.length > 0 && (
            <section className="panel mt-4 px-5 py-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">Cosa ha mosso il sentiment</h2>
              <div className="flex flex-col gap-2.5">
                {swings.map((s, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="shrink-0 text-xs text-slate-500">{new Date(s.day).toLocaleDateString('it-IT')}</span>
                    <SentimentBadge sentiment={s.sentiment} />
                    {s.url ? (
                      <a href={s.url} target="_blank" rel="noopener noreferrer"
                        className="flex min-w-0 items-center gap-1 text-slate-300 hover:text-sky-300">
                        <span className="truncate">{s.title}</span>
                        <ExternalLink className="size-3 shrink-0 text-slate-600" />
                      </a>
                    ) : <span className="truncate text-slate-300">{s.title}</span>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
