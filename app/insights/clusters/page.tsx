import { getCurrentProject } from '@/lib/data';
import { getClusters } from '@/lib/insights';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState } from '@/components/ui';
import { ClusterTreemap } from '@/components/insight-charts';
import { GenerateRefresh } from '@/components/generate-refresh';

export const metadata = { title: 'Conversation clusters' };

const SENT_STYLE: Record<string, string> = {
  positive: 'text-emerald-400', neutral: 'text-slate-400', negative: 'text-red-400',
};

export default async function ClustersPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const clusters = await getClusters(project.id);
  const aiOn = await claudeAvailable();

  return (
    <>
      <PageHeader
        title="Conversation clusters"
        subtitle="The families of discourse used to talk about the topic: not the subject (the topics), but the frame — price, scandal, irony, quality, politics, customer care… Size = weight in the conversation, color = tone."
      />
      {!clusters ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12">
          <p className="text-sm text-slate-400">
            {aiOn
              ? 'Generate the map of discourse families (once a day, ~2 cents).'
              : 'You need the Claude API key for clusters.'}
          </p>
          {aiOn && (
            <GenerateRefresh endpoint="/api/insights/clusters" label="Generate clusters" busyLabel="Analyzing conversations…" />
          )}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel px-4 py-5 lg:col-span-2">
            <ClusterTreemap clusters={clusters} />
          </section>
          <section className="panel px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Family detail</h2>
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
              <GenerateRefresh endpoint="/api/insights/clusters" label="Regenerate" busyLabel="Re-analyzing…" />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
