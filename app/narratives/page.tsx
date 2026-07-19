import Link from 'next/link';
import { AlertTriangle, GitBranch } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getNarratives } from '@/lib/narratives';
import { PageHeader, EmptyState, fmtDate } from '@/components/ui';

const STANCE_STYLE: Record<string, string> = {
  positive: 'bg-emerald-500/15 text-emerald-400',
  negative: 'bg-red-500/15 text-red-400',
  neutral: 'bg-slate-500/15 text-slate-400',
  polarizing: 'bg-amber-500/15 text-amber-400',
};

export const metadata = { title: 'Narratives' };

/** Link ai post di una narrazione: id esatti se disponibili, altrimenti gli account coinvolti. */
function coordHref(n: { mentionIds: number[]; accounts: string[] }): string | null {
  if (n.mentionIds.length > 0) return `/listening?ids=${n.mentionIds.join(',')}`;
  if (n.accounts.length > 0) return `/listening?autori=${n.accounts.map(encodeURIComponent).join('|')}`;
  return null;
}

export default async function NarrativesPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const rows = await getNarratives(project.id);

  return (
    <>
      <PageHeader
        title="Narratives"
        subtitle="Who is pushing what: clusters of messages supporting the same thesis, flagging coordinated patterns"
      />
      {rows.length === 0 ? (
        <EmptyState message="No narratives detected. The analysis runs with the daily cycle (needs at least 8 social posts in the last 48 hours)." />
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((n) => (
            <article key={n.id} className={`panel px-5 py-4 ${n.coordinated ? 'border-amber-500/40' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <GitBranch className="size-4 text-sky-400" />
                <h2 className="text-sm font-bold">{n.title}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STANCE_STYLE[n.stance ?? 'neutral']}`}>
                  {n.stance}
                </span>
                {n.coordinated === 1 && (
                  coordHref(n) ? (
                    <Link href={coordHref(n)!}
                      className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400 transition hover:bg-amber-500/25"
                      title="See the coordinated posts">
                      <AlertTriangle className="size-3" /> possible coordination →
                    </Link>
                  ) : (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                      <AlertTriangle className="size-3" /> possible coordination
                    </span>
                  )
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {coordHref(n) ? (
                    <Link href={coordHref(n)!} className="text-sky-400 hover:text-sky-300" title="See this narrative's posts">{n.mentionCount} post</Link>
                  ) : `${n.mentionCount} post`}
                  {' · '}{fmtDate(n.createdAt)}
                </span>
              </div>
              {n.description && <p className="mt-2 text-sm leading-relaxed text-slate-300">{n.description}</p>}
              {n.accounts.length > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  Most active accounts:{' '}
                  {n.accounts.map((a) => (
                    <Link key={a} href={`/listening?autore=${encodeURIComponent(a)}`}
                      className="mr-1.5 inline-block rounded bg-white/5 px-1.5 py-0.5 text-slate-400 transition hover:bg-sky-500/15 hover:text-sky-300"
                      title={`See ${a}'s posts`}>{a}</Link>
                  ))}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
