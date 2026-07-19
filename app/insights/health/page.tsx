import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { brandHealthReport } from '@/lib/insights';
import { PageHeader, EmptyState, InfoTip } from '@/components/ui';
import { BrandHealthGauge, HealthBars, CompareBars, Sparkline } from '@/components/insight-charts';

export const metadata = { title: 'Health Index' };

export default async function HealthInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { theme, brand, compare } = await brandHealthReport(project.id, 14);

  if (theme.total === 0) {
    return (
      <>
        <PageHeader title="Health Index" subtitle="How the conversation is doing, as one 0–100 score."
          info="One 0–100 composite of the conversation's health, blending sentiment, positive share, momentum and resonance. Data: your analyzed mentions. Period: last 14 days. Source: your collected mentions across all active sources." />
        <EmptyState message="Not enough mentions in the last 14 days to compute the index." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={brand ? 'Brand Health Index' : 'Market Health Index'}
        subtitle={brand
          ? `How your brand “${brand.name}” is doing versus the market and the competitors (last 14 days). One 0–100 score combining sentiment, positive share, momentum and resonance.`
          : 'How the whole conversation on your topic is doing (last 14 days): the health of the market/theme as one 0–100 score. Mark a benchmark entity as “your brand” in Settings to unlock brand-vs-market comparison.'}
      />

      {/* ── Market/Theme health (sempre) ── */}
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-slate-300">Market health <span className="text-slate-600">· the whole theme</span></h2>
        <InfoTip title="Market health">
          The health of the <b>entire conversation</b> on your topic — every mention, all brands. It tells you how the market/sector is doing at the communication level, independent of any single brand.
        </InfoTip>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
        <section className="panel flex flex-col items-center justify-center px-5 py-6">
          <BrandHealthGauge score={theme.score} grade={theme.grade} label="Market Health" />
          <p className="mt-2 text-xs text-slate-500">{theme.total.toLocaleString('en-US')} mentions analyzed</p>
        </section>
        <section className="panel px-5 py-5">
          <div className="mb-3 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-300">What drives the score</h2>
            <InfoTip title="Composite">
              Weighted mix: Sentiment 35%, Positive share 25%, Momentum 20%, Resonance 20%.
              Momentum compares the last 7 days to the previous 7; Resonance is the share of mentions that got any engagement.
            </InfoTip>
          </div>
          <HealthBars components={theme.components} />
          <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-300">14-day sentiment trend</h2>
          <Sparkline values={theme.spark} />
        </section>
      </div>

      {/* ── Brand health + confronto (solo se un brand è definito) ── */}
      {brand ? (
        <>
          <div className="mb-2 mt-8 flex items-center gap-2">
            <h2 className="text-sm font-semibold text-amber-300">Brand health · {brand.name}</h2>
            <InfoTip title="Brand health">
              The same 0–100 index, but computed only on mentions that cite <b>{brand.name}</b>. Compare it with Market health above: a brand well above the market is outperforming the sector conversation; below means it is lagging.
            </InfoTip>
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.3fr]">
            <section className="panel flex flex-col items-center justify-center px-5 py-6">
              <BrandHealthGauge score={brand.health.score} grade={brand.health.grade} label={brand.name} />
              <p className="mt-2 text-xs text-slate-500">
                {brand.health.total.toLocaleString('en-US')} brand mentions ·{' '}
                <span className={brand.health.score >= theme.score ? 'text-emerald-400' : 'text-red-400'}>
                  {brand.health.score >= theme.score ? '+' : ''}{brand.health.score - theme.score} vs market
                </span>
              </p>
            </section>
            <section className="panel px-5 py-5">
              <HealthBars components={brand.health.components} />
              <h2 className="mb-2 mt-6 text-sm font-semibold text-slate-300">14-day sentiment trend</h2>
              <Sparkline values={brand.health.spark} />
            </section>
          </div>

          {compare.length > 1 && (
            <section className="panel mt-4 px-5 py-5">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-300">Health ranking · your brand vs competitors</h2>
                <InfoTip title="Competitive ranking">
                  Each benchmark entity scored with the same index, ranked. Your brand is highlighted in amber — see at a glance whether you lead or trail the field.
                </InfoTip>
              </div>
              <CompareBars items={compare} />
            </section>
          )}
        </>
      ) : (
        <p className="mt-6 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-200/90">
          Want to see how <b>your brand</b> is doing versus the market and competitors? Go to{' '}
          <Link href="/settings" className="underline hover:text-amber-100">Settings</Link>, add your brand and competitors as benchmark
          entities, and mark one with the ★ as “your brand”. The Brand Health Index and the competitive ranking will appear here.
        </p>
      )}
    </>
  );
}
