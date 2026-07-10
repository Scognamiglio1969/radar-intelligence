import { contentData, getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState, SourceBadge, fmtDate } from '@/components/ui';
import { ExternalLink } from 'lucide-react';

const RISK_STYLE: Record<string, string> = {
  basso: 'text-emerald-400', medio: 'text-amber-400', alto: 'text-red-400',
};

export const metadata = { title: 'Contenuti' };

export default async function ContentPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const rows = await contentData(project.id);

  return (
    <>
      <PageHeader
        title="Social Content Ratings"
        subtitle="Contenuti con più engagement (7 giorni): percentile per piattaforma + valutazione AI"
      />

      {rows.length === 0 ? (
        <EmptyState message="Nessun contenuto con engagement negli ultimi 7 giorni." />
      ) : (
        <section className="panel overflow-x-auto px-5 py-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-3">Contenuto</th>
                <th className="pb-2 pr-3">Fonte</th>
                <th className="pb-2 pr-3 text-right">Engagement</th>
                <th className="pb-2 pr-3 text-right">Percentile</th>
                <th className="pb-2 pr-3 text-right">AI score</th>
                <th className="pb-2 pr-3 text-right">Viralità</th>
                <th className="pb-2 text-right">Rischio</th>
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
                  <td className="py-2.5 pr-3 text-right">{Math.round(m.engagementScore).toLocaleString('it-IT')}</td>
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
            La valutazione AI (score, viralità, rischio) viene assegnata ogni giorno ai 30 contenuti col maggior engagement.
          </p>
        </section>
      )}
    </>
  );
}
