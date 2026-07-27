import Link from 'next/link';
import { benchmarkData, getCurrentProject } from '@/lib/data';
import { searchInterestData } from '@/lib/search-interest';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ShareOfVoicePie, BenchmarkTrend, SearchInterestTrend } from '@/components/charts';
import { entityColor, OVERFLOW_COLOR } from '@/lib/entity-colors';

export const metadata = { title: 'Benchmark' };

export default async function BenchmarkPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No project configured.')} />;
  const [results, searchInterest] = await Promise.all([
    benchmarkData(project.id), searchInterestData(project.id),
  ]);
  const hasSearchInterest = searchInterest.some((s) => s.points.length > 0);

  if (results.length === 0) {
    return (
      <>
        <PageHeader title={t('page.benchmark.title', 'Benchmark')} />
        <EmptyState message={t('bench.noEntities', 'No entities to compare. Add them in Projects (e.g. brands or sector competitors).')} />
      </>
    );
  }

  const total = results.reduce((s, r) => s + r.total, 0);

  // La palette si assegna alle sole entità che compaiono davvero nei grafici.
  // Assegnandola su TUTTE le entità configurate, un progetto con dodici
  // concorrenti mandava dall'ottava in poi nel grigio di riserva: bastava che
  // tre di quelle avessero dati per ritrovarsi tre serie dello stesso grigio.
  // L'ordine resta quello di creazione (stabile), non la classifica: se cambia
  // il ranking, chi resta non cambia colore.
  const colorById = new Map(
    results.filter((r) => r.total > 0).map((r, i) => [r.entity.id, entityColor(i)]),
  );
  const colorOf = (id: number) => colorById.get(id) ?? OVERFLOW_COLOR;

  return (
    <>
      <PageHeader
        title="Benchmark"
        subtitle={t('page.benchmark.subtitle', 'Share of voice and sentiment comparison across sector entities (last 14 days)')}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Share of voice</h2>
          {/* Il colore segue l'ENTITÀ (la sua posizione stabile in elenco),
              non il suo rango: se cambia la classifica, chi resta non cambia colore. */}
          <ShareOfVoicePie data={results.map((r) => ({ name: r.entity.name, value: r.total, color: colorOf(r.entity.id) }))} />
        </section>

        <section className="panel px-5 py-4 lg:col-span-2">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Volume trend</h2>
          <BenchmarkTrend series={results.map((r) => ({ name: r.entity.name, points: r.byDay, color: colorOf(r.entity.id) }))} />
        </section>
      </div>

      {hasSearchInterest && (
        <section className="panel mt-4 px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.benchmark.searchInterest', 'Share of search')}</h2>
          <p className="mb-3 text-[11px] text-slate-600">
            How often people search for each entity on Google, scaled against each other (100 = the peak across all of them). Via Google Trends&rsquo; internal API — unofficial, best-effort, checked at most once a day.
          </p>
          <SearchInterestTrend series={searchInterest.filter((s) => s.points.length > 0)} />
        </section>
      )}

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
                  <span className="mr-2 inline-block size-2 rounded-full" style={{ backgroundColor: colorOf(r.entity.id) }} />
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
