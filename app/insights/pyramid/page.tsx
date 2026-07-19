import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { authorPyramid } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { AuthorPyramid } from '@/components/insight-charts';

export const metadata = { title: 'Author pyramid' };

const TIER_DOT: Record<string, string> = {
  mega: '#fbbf24', macro: '#a78bfa', micro: '#38bdf8', longtail: '#64748b',
};

export default async function PyramidInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { tiers, totalAuthors, topConcentration, topAuthors } = await authorPyramid(project.id, 14);

  return (
    <>
      <PageHeader
        title="Author influence pyramid"
        info="Authors tiered by influence (mega / macro / micro / long tail) and the share of total reach each tier holds — is the conversation carried by a few big voices or spread broadly? Data: the authors and reach of your mentions. Period: last 14 days. Source: your collected mentions across all active sources."
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

          {/* Top autori cliccabili → i loro post in Listening */}
          <div className="mt-4 border-t border-[var(--border)] pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Top voices — click an author to see their posts
            </p>
            <div className="flex flex-wrap gap-1.5">
              {topAuthors.map((a) => (
                <Link key={a.id} href={`/listening?autore=${encodeURIComponent(a.id)}`}
                  className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/[0.02] px-2.5 py-1 text-xs text-slate-300 transition hover:border-sky-500/50 hover:bg-sky-500/5 hover:text-sky-200"
                  title={`${a.posts} post${a.posts === 1 ? '' : 's'} · reach ${a.reach.toLocaleString('en-US')} — see their posts`}>
                  <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: TIER_DOT[a.tier] ?? '#64748b' }} />
                  {a.id}
                  <span className="text-slate-500">· {a.posts}</span>
                </Link>
              ))}
            </div>
            <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600">
              {tiers.map((t) => (
                <span key={t.key} className="inline-flex items-center gap-1">
                  <span className="size-1.5 rounded-full" style={{ backgroundColor: TIER_DOT[t.key] ?? '#64748b' }} />{t.label}
                </span>
              ))}
              <span className="text-slate-600">· number = posts in the last 14 days</span>
            </p>
          </div>
        </section>
      )}
    </>
  );
}
