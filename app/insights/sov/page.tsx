import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { sovOverTime } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { ShareOfVoiceStream } from '@/components/insight-charts';

export const metadata = { title: 'Share of Voice' };

export default async function SovInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { entities, days } = await sovOverTime(project.id, 30);
  const hasData = entities.length > 0 && days.some((d) => entities.some((e) => Number(d[e]) > 0));

  const COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee', '#c084fc'];
  const totals = entities.map((e, i) => ({
    name: e, color: COLORS[i % COLORS.length],
    total: days.reduce((s, d) => s + Number(d[e] ?? 0), 0),
  }));
  const grand = totals.reduce((s, t) => s + t.total, 0) || 1;
  const ranked = [...totals].sort((a, b) => b.total - a.total);
  const maxTotal = Math.max(1, ...totals.map((t) => t.total));

  return (
    <>
      <PageHeader
        title="Share of Voice over time"
        info="How each entity's presence in the conversation moves over time. Volume mode: absolute mentions per day, stacked — you see the real peaks. Share mode: each day normalized to 100% — you see who gains ground. Data: mentions matching your benchmark entities, last 30 days, across all active sources."
        subtitle="How much of the conversation each entity owns over the last 30 days. The bars up top are the 30-day totals; the chart below shows the movement day by day — switch between Volume (absolute mentions, the real peaks and dips) and Share (each day as 100%, who's gaining ground). Hover any band for that day's mentions and percentage."
      />
      {entities.length === 0 ? (
        <EmptyState message="Add benchmark entities (brands/competitors) in Settings to see share of voice." />
      ) : !hasData ? (
        <EmptyState message="No mentions matched your entities in the last 30 days." />
      ) : (
        <section className="panel px-4 py-5">
          {/* Riepilogo complessivo esplicito (30 giorni) */}
          <div className="mb-4 rounded-lg border border-[var(--border)] bg-white/[0.02] px-4 py-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Overall share of voice · last 30 days</p>
            <div className="flex flex-col gap-2">
              {ranked.map((t) => (
                <div key={t.name} className="flex items-center gap-2 text-sm">
                  <span className="w-28 shrink-0 truncate text-slate-300">{t.name}</span>
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700/40">
                    <div className="h-full rounded-full" style={{ width: `${(t.total / maxTotal) * 100}%`, backgroundColor: t.color }} />
                  </div>
                  <span className="w-16 shrink-0 text-right text-xs tabular-nums text-slate-400">
                    {Math.round((t.total / grand) * 100)}%
                  </span>
                  <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-slate-600">{t.total.toLocaleString('en-US')}</span>
                </div>
              ))}
            </div>
          </div>
          <ShareOfVoiceStream entities={entities} days={days} />
          <p className="mt-3 text-xs text-slate-500">
            Read it as: a taller stack (Volume) means more total conversation that day; a widening band (Share) means that entity is gaining ground. Empty days at the start/end are trimmed. Manage entities in{' '}
            <Link href="/settings" className="text-sky-400 hover:underline">Settings</Link>.
          </p>
        </section>
      )}
    </>
  );
}
