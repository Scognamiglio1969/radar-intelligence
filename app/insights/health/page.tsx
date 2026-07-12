import { getCurrentProject } from '@/lib/data';
import { brandHealth } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { BrandHealthGauge, HealthBars, Sparkline } from '@/components/insight-charts';

export const metadata = { title: 'Brand Health Index' };

export default async function HealthInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const h = await brandHealth(project.id, 14);

  return (
    <>
      <PageHeader
        title="Brand Health Index"
        subtitle="One executive number, 0–100, combining sentiment, positive share, momentum and resonance (last 14 days). The single-glance answer to “how are we doing?”, with the sub-metrics behind it."
      />
      {h.total === 0 ? (
        <EmptyState message="Not enough mentions in the last 14 days to compute the index." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
          <section className="panel flex flex-col items-center justify-center px-5 py-6">
            <BrandHealthGauge score={h.score} grade={h.grade} />
            <p className="mt-2 text-xs text-slate-500">{h.total.toLocaleString('en-US')} mentions analyzed</p>
          </section>
          <section className="panel px-5 py-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">What drives the score</h2>
            <HealthBars components={h.components} />
            <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-300">14-day sentiment trend</h2>
            <Sparkline values={h.spark} />
            <p className="mt-3 text-[11px] leading-relaxed text-slate-600">
              Weighted composite: Sentiment 35%, Positive share 25%, Momentum 20%, Resonance 20%.
              Momentum compares the last 7 days to the previous 7; Resonance is the share of mentions that got any engagement.
            </p>
          </section>
        </div>
      )}
    </>
  );
}
