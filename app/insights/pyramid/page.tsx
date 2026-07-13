import { getCurrentProject } from '@/lib/data';
import { authorPyramid } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { AuthorPyramid } from '@/components/insight-charts';

export const metadata = { title: 'Author pyramid' };

export default async function PyramidInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { tiers, totalAuthors, topConcentration } = await authorPyramid(project.id, 14);

  return (
    <>
      <PageHeader
        title="Author influence pyramid"
        subtitle="How concentrated your conversation is (last 14 days): authors ranked into influence tiers, with the share of total reach each tier holds. A top-heavy pyramid means you depend on a few big voices; a broad base means resilience."
      />
      {tiers.length === 0 ? (
        <EmptyState message="Not enough authors with engagement yet to build the pyramid." />
      ) : (
        <section className="panel px-4 py-5">
          <p className="mb-3 text-sm text-slate-400">
            <span className="text-slate-200">{totalAuthors.toLocaleString('en-US')}</span> authors ·{' '}
            the top tier holds <span className={topConcentration >= 50 ? 'font-semibold text-amber-300' : 'font-semibold text-emerald-300'}>{topConcentration}%</span> of all reach
            {topConcentration >= 50 ? ' — highly concentrated, fragile to a few accounts.' : ' — reach is fairly distributed.'}
          </p>
          <AuthorPyramid tiers={tiers} />
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
            {tiers.map((t) => (
              <span key={t.key}>
                <span className="text-slate-300">{t.label}:</span> {t.examples.join(', ') || '—'}
              </span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
