import { Trash2, FileClock, AlertTriangle, UserX, Undo2 } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { wikiStats, isRevert } from '@/lib/wikipedia';
import { PageHeader, fmtDate } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { GenerateRefresh } from '@/components/generate-refresh';
import { WikiPageSearch } from '@/components/wiki-page-search';
import { addWikiPageAction, removeWikiPageAction } from './actions';

export const metadata = { title: 'Wikipedia' };

export default async function WikipediaPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return null;

  const stats = await wikiStats(project.id);
  const hasData = stats.pages.some((p) => p.totalEdits > 0);
  const elevated = stats.activity.filter((a) => a.elevated);

  return (
    <>
      <PageHeader
        title={t('page.wikipedia.title', 'Wikipedia')}
        info="A self-contained section, like Reviews and Sport: who edits a public Wikipedia page, and when, is a structural fact — not a mention to interpret. Edit wars, sudden anonymous activity or content being scrubbed often show up here before they show up anywhere else. Official MediaWiki API, no key, no AI."
        subtitle="Who is editing this page, and does it look like an edit war? An early-warning signal Talkwalker doesn't have."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GenerateRefresh endpoint="/api/wikipedia/refresh" label={t('page.wikipedia.refresh', 'Check for updates')} busyLabel={t('page.wikipedia.checking', 'Checking…')} />
      </div>

      <details className="panel mb-4 px-5 py-5" open={stats.pages.length === 0}>
        <summary className="mb-3 flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-slate-300 [&::-webkit-details-marker]:hidden">
          {t('page.wikipedia.pages', 'Pages followed')}
          {stats.pages.length > 0 && <span className="text-xs font-normal text-slate-600">({stats.pages.length}, click to edit)</span>}
        </summary>

        {stats.pages.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {stats.pages.map((p) => {
              const act = stats.activity.find((a) => a.page === p.title);
              return (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-3">
                  <FileClock className="size-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-200">{p.title}</p>
                    <p className="truncate text-[11px] text-slate-600">
                      {p.totalEdits > 0 ? `${p.totalEdits} edits on record` : 'not checked yet'}
                    </p>
                  </div>
                  {act?.elevated && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                      <AlertTriangle className="size-3" /> elevated activity
                    </span>
                  )}
                  <span className="ml-auto text-xs text-slate-500">
                    {p.lastFetchedAt ? `checked ${fmtDate(p.lastFetchedAt)}` : ''}
                  </span>
                  <form action={removeWikiPageAction}>
                    <input type="hidden" name="id" value={p.id} />
                    <button type="submit" aria-label={`Remove ${p.title}`} className="text-slate-600 transition hover:text-red-400">
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}

        <form action={addWikiPageAction} className="grid gap-2 rounded-lg border border-[var(--border)] px-4 py-3 sm:grid-cols-2">
          <p className="text-xs font-semibold text-slate-300 sm:col-span-2">
            <FileClock className="mr-1 inline size-3.5" /> Follow a page
            <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">free · no key</span>
          </p>
          <WikiPageSearch />
          <button type="submit" className="self-start rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 sm:col-span-2">
            Follow page
          </button>
        </form>
      </details>

      {stats.pages.length === 0 ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <FileClock className="size-6 text-slate-600" />
          <p className="max-w-md text-sm text-slate-400">Follow a Wikipedia page above to start — who edits it, how often, and whether it looks like a fight.</p>
        </div>
      ) : !hasData ? (
        <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
          <p className="text-sm text-slate-400">Page added — press “Check for updates” above to fetch its recent history.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {elevated.length > 0 && (
            <section className="panel border-amber-500/30 px-5 py-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle className="size-4" /> {t('page.wikipedia.elevated', 'Elevated edit activity')}
              </h2>
              <div className="flex flex-col gap-1 text-sm text-slate-300">
                {elevated.map((a) => (
                  <p key={a.page}>
                    <strong>{a.page}</strong>: {a.last7} edits in the last 7 days, vs a baseline of {a.baselineWeekly}/week.
                  </p>
                ))}
              </div>
            </section>
          )}

          <section className="panel px-5 py-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('page.wikipedia.recent', 'Recent edits')}</h2>
            <p className="mb-3 text-[11px] text-slate-600">
              Reverted/undone edits and anonymous or temporary accounts are flagged — the two patterns that show up in a real edit war.
            </p>
            <div className="flex flex-col gap-1.5">
              {stats.recent.map((e) => {
                const revert = isRevert(e);
                return (
                  <div key={e.revId} className="flex flex-wrap items-center gap-3 rounded-lg bg-white/[0.03] px-4 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-slate-200">
                        {revert && <Undo2 className="size-3.5 shrink-0 text-red-400" />}
                        {e.isAnon && <UserX className="size-3.5 shrink-0 text-amber-400" />}
                        <span className={e.isAnon ? 'text-amber-300' : ''}>{e.user}</span>
                        {stats.pages.length > 1 && <span className="text-slate-600">· {e.pageTitle}</span>}
                      </p>
                      <p className="truncate text-[11px] text-slate-600">{e.comment || <em className="text-slate-700">no edit summary</em>}</p>
                    </div>
                    {e.sizeDiff !== null && (
                      <span className={`shrink-0 text-xs tabular-nums ${e.sizeDiff > 0 ? 'text-emerald-400' : e.sizeDiff < 0 ? 'text-red-400' : 'text-slate-500'}`}>
                        {e.sizeDiff > 0 ? '+' : ''}{e.sizeDiff}B
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-slate-500">{fmtDate(e.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
