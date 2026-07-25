import Link from 'next/link';
import { MessageSquareQuote, Target } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { messagePullThrough } from '@/lib/messages';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { sourceLabel } from '@/lib/export-data';
import { saveKeyMessages } from './actions';
import { SubmitButton } from '@/components/submit-button';

export const metadata = { title: 'Message pull-through' };

const sent = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
const sentColor = (v: number | null) =>
  v === null ? 'text-slate-500' : v > 0.15 ? 'text-emerald-400' : v < -0.15 ? 'text-red-400' : 'text-slate-400';

export default async function MessagesPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const messages = project.keyMessages ?? [];
  const data = await messagePullThrough(project.id, messages, 30);
  const aiOn = await claudeAvailable();
  const maxWeek = Math.max(1, ...data.messages.flatMap((m) => m.weekly.map((w) => w.n)));

  return (
    <>
      <PageHeader
        title={t('page.messages.title', 'Message pull-through')}
        info="Whether the messages YOU want to land are actually being picked up. You write your key messages; each one is expanded once into the words journalists and users would really use, and from then on the matching is pure database work — every count is verifiable and costs nothing to refresh. Period: last 30 days."
        subtitle="Volume tells you how much they talk about you. This tells you whether they say what you wanted said — which of your key messages get picked up, by which sources, with what tone."
      />

      {messages.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="panel px-4 py-3" title="Share of your coverage that carries at least one of your key messages">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Pull-through rate</p>
            <p className="mt-1 text-2xl font-bold text-sky-300">{data.pullThroughPct}%</p>
            <p className="text-xs text-slate-500">of coverage carries a message</p>
          </div>
          <div className="panel px-4 py-3" title="Pieces of coverage carrying at least one key message (messages overlap, so this is not the sum)">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Carrying coverage</p>
            <p className="mt-1 text-2xl font-bold">{fmtNum(data.covered)}</p>
            <p className="text-xs text-slate-500">of {fmtNum(data.totalCoverage)} total</p>
          </div>
          <div className="panel px-4 py-3" title="How many key messages you are tracking">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Messages tracked</p>
            <p className="mt-1 text-2xl font-bold">{messages.length}</p>
            <p className="text-xs text-slate-500">last {data.days} days</p>
          </div>
          <div className="panel px-4 py-3" title="The message with the widest pick-up in the period">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Best performer</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-200">{data.messages[0]?.text ?? '—'}</p>
            <p className="text-xs text-slate-500">{data.messages[0] ? `${fmtNum(data.messages[0].mentions)} pick-ups` : ''}</p>
          </div>
        </div>
      )}

      {messages.length === 0 ? (
        <div className="panel px-6 py-8">
          <div className="mx-auto max-w-xl text-center">
            <Target className="mx-auto mb-2 size-6 text-sky-400" />
            <h2 className="text-sm font-semibold text-slate-200">Write the messages you want to land</h2>
            <p className="mt-1 text-sm text-slate-400">
              One per line — the way you would say them. Radar then measures how much of your coverage actually carries them.
              {aiOn ? ' Each message is expanded once into the phrasings the press would really use.' : ' Without an AI key the matching uses the words of the message itself.'}
            </p>
          </div>
          <form action={saveKeyMessages} className="mx-auto mt-4 flex max-w-xl flex-col gap-2">
            <textarea name="messages" rows={5} required
              placeholder={'Our platform cuts reporting time in half\nWe are the only open-source alternative\nPrivacy stays with the customer'}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-sky-500/60" />
            <SubmitButton pendingLabel="Expanding messages…"
              className="self-center rounded-lg bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
              Start measuring
            </SubmitButton>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data.messages.map((m) => (
            <article key={m.id} className="panel px-5 py-4">
              <div className="flex flex-wrap items-start gap-2">
                <MessageSquareQuote className="mt-0.5 size-4 shrink-0 text-sky-400" />
                <h2 className="flex-1 text-sm font-semibold leading-snug text-slate-100">{m.text}</h2>
                <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-300"
                  title={`${m.mentions} pieces of coverage carry this message: ${m.sharePct}% of all coverage in the period`}>
                  {fmtNum(m.mentions)} pick-ups · {m.sharePct}%
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                <span className={sentColor(m.sentiment)} title="Average sentiment of the coverage carrying this message">
                  tone {sent(m.sentiment)}
                </span>
                {m.sources.length > 0 && (
                  <span className="text-slate-500" title="Sources that picked the message up, by volume">
                    {m.sources.map((s) => `${sourceLabel(s.source)} (${s.n})`).join(' · ')}
                  </span>
                )}
              </div>

              {m.weekly.length > 1 && (
                <div className="mt-3 flex items-end gap-1" title="Weekly pick-up of this message">
                  {m.weekly.map((w) => (
                    <span key={w.week} className="flex-1" title={`Week of ${w.week}: ${w.n} pick-ups`}>
                      <span className="block rounded-t bg-sky-500/60"
                        style={{ height: `${Math.max(3, (w.n / maxWeek) * 40)}px` }} />
                    </span>
                  ))}
                </div>
              )}

              {m.examples.length > 0 && (
                <div className="mt-3 border-t border-[var(--border)] pt-2">
                  <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-600">Where it landed</p>
                  <ul className="flex flex-col gap-0.5 text-xs">
                    {m.examples.map((e) => (
                      <li key={e.id}>
                        <Link href={`/listening?ids=${e.id}`} className="text-slate-400 hover:text-sky-300"
                          title="Open this piece of coverage">
                          {e.title}
                        </Link>
                        <span className="ml-1 text-slate-600">{sourceLabel(e.source)} · {e.date}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {m.mentions === 0 && (
                <p className="mt-2 text-xs text-amber-400/80">
                  Not picked up yet in this period — the message may be too abstract to be quoted, or simply not landing.
                </p>
              )}

              <p className="mt-2 text-[10px] text-slate-600" title="The phrasings used to detect this message in coverage">
                matching on: {m.terms.join(' · ')}
              </p>
            </article>
          ))}

          <details className="panel px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">Edit key messages</summary>
            <form action={saveKeyMessages} className="mt-3 flex flex-col gap-2">
              <textarea name="messages" rows={6} defaultValue={messages.map((m) => m.text).join('\n')}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-sky-500/60" />
              <p className="text-[11px] text-slate-500">One per line. Existing messages keep their phrasings; new ones are expanded on save.</p>
              <SubmitButton pendingLabel="Saving…"
                className="self-start rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
                Save messages
              </SubmitButton>
            </form>
          </details>
        </div>
      )}
    </>
  );
}
