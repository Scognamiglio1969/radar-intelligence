import { getCurrentProject } from '@/lib/data';
import { getRecentAlerts, type AlertContext } from '@/lib/alerts';
import { PageHeader, EmptyState, SourceBadge, fmtDate } from '@/components/ui';
import { PlaybookButton } from '@/components/playbook-button';
import { claudeAvailable } from '@/lib/claude';
import { SOURCE_META } from '@/lib/connectors';
import { TrendingUp, TrendingDown, Bell, ExternalLink, Lightbulb } from 'lucide-react';

const TYPE_META: Record<string, { label: string; icon: typeof Bell }> = {
  picco_volume: { label: 'Picco di volume', icon: TrendingUp },
  crollo_sentiment: { label: 'Crollo di sentiment', icon: TrendingDown },
};

export const metadata = { title: 'Alert' };

export default async function AlertsPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const rows = await getRecentAlerts(project.id);

  return (
    <>
      <PageHeader
        title="Alert"
        subtitle="A ogni aggiornamento Radar controlla se volume o tono delle conversazioni escono dalla norma della settimana. Quando scatta un alert, qui trovi cosa lo ha causato: la spiegazione, i temi, le fonti e le news chiave."
      />
      {rows.length === 0 ? (
        <EmptyState message="Nessun alert. Il controllo avviene a ogni aggiornamento dei dati." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((a) => {
            const meta = TYPE_META[a.type] ?? { label: a.type, icon: Bell };
            const Icon = meta.icon;
            const high = a.severity === 'alta';
            const d = (a.data ?? {}) as AlertContext;
            return (
              <article key={a.id} className={`panel px-5 py-4 ${high ? 'border-red-500/40' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 rounded-lg p-2 ${high ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">
                      {meta.label}
                      <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${high ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400'}`}>
                        severità {a.severity}
                      </span>
                      <span className="ml-2 text-xs font-normal text-slate-600">{fmtDate(a.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-slate-300">{a.message}</p>

                    {/* Perché è scattato: spiegazione AI */}
                    {d.explanation && (
                      <p className="mt-3 flex items-start gap-2 rounded-lg border border-sky-500/20 bg-sky-500/5 px-3.5 py-2.5 text-sm leading-relaxed text-slate-200">
                        <Lightbulb className="mt-0.5 size-4 shrink-0 text-sky-400" />
                        <span>{d.explanation}</span>
                      </p>
                    )}

                    {/* Temi e fonti coinvolte */}
                    {(d.topics?.length || d.bySource?.length) ? (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
                        {d.topics && d.topics.length > 0 && (
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="text-slate-600">Temi:</span>
                            {d.topics.map((t) => (
                              <span key={t} className="rounded-full bg-sky-500/10 px-2 py-0.5 text-sky-300">{t}</span>
                            ))}
                          </span>
                        )}
                        {d.bySource && d.bySource.length > 0 && (
                          <span className="text-slate-500">
                            <span className="text-slate-600">Fonti: </span>
                            {d.bySource.map((s) => `${SOURCE_META[s.source]?.label ?? s.source} ${s.n}`).join(' · ')}
                          </span>
                        )}
                      </div>
                    ) : null}

                    {/* Le news/contenuti che hanno pesato di più */}
                    {d.keyMentions && d.keyMentions.length > 0 && (
                      <div className="mt-2.5 flex flex-col gap-1.5">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Contenuti chiave</p>
                        {d.keyMentions.map((m, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <SourceBadge source={m.source} />
                            {m.sentiment === 'negativo' && <span className="shrink-0 text-red-400">●</span>}
                            {m.url ? (
                              <a href={m.url} target="_blank" rel="noopener noreferrer"
                                className="flex min-w-0 items-center gap-1 truncate text-slate-300 hover:text-sky-300">
                                <span className="truncate">{m.title}</span>
                                <ExternalLink className="size-3 shrink-0 text-slate-600" />
                              </a>
                            ) : <span className="truncate text-slate-300">{m.title}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {claudeAvailable() && (
                      <PlaybookButton
                        alertId={a.id}
                        existing={typeof (a.data as Record<string, unknown> | null)?.playbook === 'string'
                          ? String((a.data as Record<string, unknown>).playbook)
                          : null}
                      />
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
