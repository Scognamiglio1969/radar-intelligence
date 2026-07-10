import Link from 'next/link';
import { benchmarkData, getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { ShareOfVoicePie, BenchmarkTrend, ENTITY_COLORS } from '@/components/charts';

export const metadata = { title: 'Benchmark' };

export default async function BenchmarkPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const results = await benchmarkData(project.id);

  if (results.length === 0) {
    return (
      <>
        <PageHeader title="Benchmark" />
        <EmptyState message="No entities to compare. Add them in Projects (e.g. brands or sector competitors)." />
      </>
    );
  }

  const total = results.reduce((s, r) => s + r.total, 0);

  return (
    <>
      <PageHeader
        title="Benchmark"
        subtitle="Share of voice and sentiment comparison across sector entities (last 14 days)"
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Share of voice</h2>
          {total > 0
            ? <ShareOfVoicePie data={results.map((r) => ({ name: r.entity.name, value: r.total }))} />
            : <p className="py-16 text-center text-sm text-slate-500">No mentions associated with the entities.</p>}
        </section>

        <section className="panel px-5 py-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Volume trend</h2>
          <BenchmarkTrend series={results.map((r) => ({ name: r.entity.name, points: r.byDay }))} />
        </section>
      </div>

      <section className="panel mt-4 overflow-x-auto px-5 py-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-300">Detail</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2">Entity</th>
              <th className="pb-2">Keywords</th>
              <th className="pb-2 text-right">Mentions</th>
              <th className="pb-2 text-right">Share of voice</th>
              <th className="pb-2 text-right">Avg sentiment</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={r.entity.id} className="border-b border-[var(--border)]/50 last:border-0">
                <td className="py-2.5 font-medium">
                  <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: ENTITY_COLORS[i % ENTITY_COLORS.length] }} />
                  {r.entity.name}
                </td>
                <td className="py-2.5 text-xs text-slate-500">{r.entity.keywords.join(', ')}</td>
                <td className="py-2.5 text-right">{fmtNum(r.total)}</td>
                <td className="py-2.5 text-right">{total > 0 ? `${((r.total / total) * 100).toFixed(1)}%` : '—'}</td>
                <td className="py-2.5 text-right">
                  {r.avgSentiment === null ? <span className="text-slate-600">pending</span> : (
                    <span className={r.avgSentiment > 0.15 ? 'text-emerald-400' : r.avgSentiment < -0.15 ? 'text-red-400' : 'text-slate-400'}>
                      {r.avgSentiment.toFixed(2)}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-slate-600">
          Manage the compared entities in <Link href="/settings" className="text-sky-400">Projects</Link>.
        </p>
      </section>
    </>
  );
}
