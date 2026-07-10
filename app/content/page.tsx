import { contentData, getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState, SourceBadge, fmtDate } from '@/components/ui';
import { ExternalLink } from 'lucide-react';

const RISK_STYLE: Record<string, string> = {
  low: 'text-emerald-400', medium: 'text-amber-400', high: 'text-red-400',
};

export const metadata = { title: 'Content' };

export default async function ContentPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const rows = await contentData(project.id);

  return (
    <>
      <PageHeader
        title="Social Content Ratings"
        subtitle="Highest-engagement content (7 days): per-platform percentile + AI rating"
      />

      {rows.length === 0 ? (
        <EmptyState message="No content with engagement in the last 7 days." />
      ) : (
        <section className="panel overflow-x-auto px-5 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3">Content</th>
                <th className="pb-2 pr-3">Source</th>
                <th className="pb-2 pr-3 text-right">Engagement</th>
                <th className="pb-2 pr-3 text-right">Percentile</th>
                <th className="pb-2 pr-3 text-right">AI score</th>
                <th className="pb-2 pr-3 text-right">Virality</th>
                <th className="pb-2 text-right">Risk</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => (
                <tr key={m.id} className="border-b border-[var(--border)]/50 align-top last:border-0">
                  <td className="max-w-md py-2.5 pr-3">
                    <p className="line-clamp-2 leading-snug">
                      {m.url ? (
                        <a href={m.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky-300">
                          {m.title || m.content} <ExternalLink className="inline size-3 text-slate-600" />
                        </a>
                      ) : (m.title || m.content)}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {m.authorHandle ?? m.author} · {fmtDate(m.publishedAt)}
                      {m.quality?.note && <span className="text-slate-500"> — {m.quality.note}</span>}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3"><SourceBadge source={m.source} /></td>
                  <td className="py-2.5 pr-3 text-right">{Math.round(m.engagementScore).toLocaleString('en-US')}</td>
                  <td className="py-2.5 pr-3 text-right">
                    <span className={m.percentile >= 80 ? 'font-semibold text-sky-300' : ''}>{m.percentile}°</span>
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    {m.quality ? <span className="font-semibold">{m.quality.score}</span> : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="py-2.5 pr-3 text-right">{m.quality ? m.quality.virality : <span className="text-slate-600">—</span>}</td>
                  <td className="py-2.5 text-right">
                    {m.quality ? <span className={RISK_STYLE[m.quality.risk]}>{m.quality.risk}</span> : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-600">
            The AI rating (score, virality, risk) is assigned daily to the 30 highest-engagement items.
          </p>
        </section>
      )}
    </>
  );
}
