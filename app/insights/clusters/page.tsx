import { getCurrentProject } from '@/lib/data';
import { getClusters } from '@/lib/insights';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState } from '@/components/ui';
import { ClusterTreemap } from '@/components/insight-charts';
import { GenerateRefresh } from '@/components/generate-refresh';

export const metadata = { title: 'Cluster conversazionali' };

const SENT_STYLE: Record<string, string> = {
  positivo: 'text-emerald-400', neutro: 'text-slate-400', negativo: 'text-red-400',
};

export default async function ClustersPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const clusters = await getClusters(project.id);

  return (
    <>
      <PageHeader
        title="Cluster conversazionali"
        subtitle="Le famiglie di discorso con cui si parla del tema: non il soggetto (i temi), ma il frame — prezzo, scandalo, ironia, qualità, politica, customer care… Dimensione = peso nella conversazione, colore = tono."
      />
      {!clusters ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12">
          <p className="text-sm text-slate-400">
            {claudeAvailable()
              ? 'Genera la mappa delle famiglie di discorso (una volta al giorno, ~2 centesimi).'
              : 'Serve la API key Claude per i cluster.'}
          </p>
          {claudeAvailable() && (
            <GenerateRefresh endpoint="/api/insights/clusters" label="Genera i cluster" busyLabel="Analizzo le conversazioni…" />
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel px-4 py-5 lg:col-span-2">
            <ClusterTreemap clusters={clusters} />
          </section>
          <section className="panel px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Dettaglio famiglie</h2>
            <div className="flex flex-col gap-3">
              {clusters.map((c) => (
                <div key={c.family}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium capitalize">{c.family}</span>
                    <span className={`text-xs ${SENT_STYLE[c.sentiment] ?? 'text-slate-400'}`}>{c.share}% · {c.sentiment}</span>
                  </div>
                  {c.example && <p className="mt-0.5 text-xs italic text-slate-500">«{c.example}»</p>}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <GenerateRefresh endpoint="/api/insights/clusters" label="Rigenera" busyLabel="Rianalizzo…" />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
