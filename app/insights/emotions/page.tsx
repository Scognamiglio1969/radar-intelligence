import { getCurrentProject } from '@/lib/data';
import { emotionDistribution } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { EmotionRadar } from '@/components/insight-charts';

export const metadata = { title: 'Emotion radar' };

const LABEL: Record<string, string> = {
  joy: 'Joy', trust: 'Trust', fear: 'Fear', anger: 'Anger', sadness: 'Sadness', surprise: 'Surprise',
};

export default async function EmotionsInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const data = await emotionDistribution(project.id, 30);
  const top = [...data].sort((a, b) => b.value - a.value)[0];

  return (
    <>
      <PageHeader
        title="Emotion radar"
        subtitle="Beyond positive/negative: the emotional fingerprint of the conversation (last 30 days). It separates a crisis driven by fear from one driven by anger — very different responses. Emotions are AI-tagged on newly analyzed mentions."
      />
      {data.length === 0 ? (
        <EmptyState message="No emotion-tagged mentions yet. Tagging runs automatically as new mentions are analyzed." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <section className="panel px-4 py-5">
            <EmotionRadar data={data} />
          </section>
          <section className="panel px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Breakdown</h2>
            {top && (
              <p className="mb-3 text-xs text-slate-500">
                Dominant emotion: <span className="text-violet-300">{LABEL[top.emotion] ?? top.emotion}</span> ({top.share}%).
              </p>
            )}
            <div className="flex flex-col gap-2.5">
              {[...data].sort((a, b) => b.value - a.value).map((d) => (
                <div key={d.emotion} className="flex items-center gap-2 text-sm">
                  <span className="w-20 shrink-0 text-slate-300">{LABEL[d.emotion] ?? d.emotion}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                    <div className="h-full rounded-full bg-violet-400/70" style={{ width: `${d.share}%` }} />
                  </div>
                  <span className="w-14 shrink-0 text-right text-xs text-slate-500">{d.share}%</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
