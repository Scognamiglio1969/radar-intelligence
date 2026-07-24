import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, Eye, Quote, TrendingUp } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getPointOfView, type Citation } from '@/lib/pov';
import { claudeAvailable } from '@/lib/claude';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { GenerateRefresh } from '@/components/generate-refresh';
import { sourceLabel } from '@/lib/export-data';

export const metadata = { title: 'Point of View' };

const CONF_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-300',
  medium: 'bg-amber-500/15 text-amber-300',
  low: 'bg-slate-500/15 text-slate-400',
};
const STATUS_STYLE: Record<string, string> = {
  emerging: 'text-violet-300', rising: 'text-emerald-400',
  declining: 'text-red-400', stable: 'text-slate-500',
};

const pct = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v}%`);
const sent = (v: number | null) => (v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}`);
/** Oltre il +500% la percentuale diventa illeggibile: mostro il moltiplicatore. */
const growth = (v: number | null) => (v === null ? '—' : v >= 500 ? `×${Math.round(v / 100 + 1)}` : pct(v));

/** Note a piè di pagina cliccabili: portano ai post reali che sostengono la frase. */
function Cites({ ids, byId }: { ids: number[]; byId: Map<number, Citation> }) {
  if (ids.length === 0) return null;
  return (
    <span className="ml-1 inline-flex gap-1 align-super">
      {ids.map((id) => {
        const c = byId.get(id);
        if (!c) return null;
        return (
          <Link key={id} href={`/listening?ids=${id}`}
            title={`${c.title}\n${sourceLabel(c.source)} · ${c.date}${c.sentiment ? ` · ${c.sentiment}` : ''}\nClick to open this post`}
            className="rounded bg-sky-500/15 px-1 text-[10px] font-semibold text-sky-300 transition hover:bg-sky-500/30">
            {id}
          </Link>
        );
      })}
    </span>
  );
}

export default async function PovPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { facts, research, pov, reason } = await getPointOfView(project.id, 90);
  const aiOn = await claudeAvailable();
  const byId = new Map(facts.citations.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title="Point of View"
        info="A defensible argument about where the market is moving, built on 90 days of your data. Every figure is computed from your mentions by the database (never invented by the AI), and every claim cites real posts you can open. Counter-signals are included on purpose: they are what makes the thesis credible."
        subtitle="The thesis you can take into a meeting: what is shifting over the last 90 days, the numbers that prove it, the posts that evidence it — plus what argues against it. Click any citation number to read the source post."
      />

      {/* Numeri verificati: presenti SEMPRE, anche senza AI. */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="panel px-4 py-3" title="Mentions collected in the last 30 days, compared with the 30 days before">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Volume · last 30d</p>
          <p className="mt-1 text-2xl font-bold">{fmtNum(facts.totalNow)}</p>
          <p className="text-xs text-slate-500">{pct(facts.volumeChangePct)} vs previous 30d</p>
        </div>
        <div className="panel px-4 py-3" title="Average sentiment of the last 30 days vs the 30 days before (−1 to +1)">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Sentiment · last 30d</p>
          <p className="mt-1 text-2xl font-bold">{sent(facts.sentNow)}</p>
          <p className="text-xs text-slate-500">was {sent(facts.sentPrev)}</p>
        </div>
        <div className="panel px-4 py-3" title="Total mentions analysed in the 90-day window of this point of view">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Evidence base</p>
          <p className="mt-1 text-2xl font-bold">{fmtNum(facts.total)}</p>
          <p className="text-xs text-slate-500">mentions · {facts.days} days</p>
        </div>
        <div className="panel px-4 py-3" title={research
          ? `Academic works matching “${research.query}” in the OpenAlex open index.${research.last3 !== null && research.prev3 !== null
            ? ` Growth: ${fmtNum(research.last3)} works in the last 3 complete years vs ${fmtNum(research.prev3)} in the 3 before.` : ''}`
          : 'Academic evidence unavailable'}>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Research</p>
          <p className="mt-1 text-2xl font-bold">{research ? fmtNum(research.total) : '—'}</p>
          <p className="text-xs text-slate-500">
            {research ? `papers${research.growthPct !== null ? ` · ${growth(research.growthPct)} in 3y` : ''}` : 'no data'}
          </p>
        </div>
      </div>

      {!pov ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12">
          <p className="max-w-lg text-center text-sm text-slate-400">
            {reason === 'thin_data'
              ? 'Not enough data yet: a point of view needs at least ~15 mentions in the window. The verified figures above are already live.'
              : reason === 'no_ai'
                ? 'The argument needs an AI key (or the spend cap was reached). The verified figures above stay available.'
                : aiOn
                  ? 'Build the argument from the last 90 days: what is shifting, with the numbers and the posts that prove it (about 3 cents, once a day).'
                  : 'The argument needs an AI key. The verified figures above stay available.'}
          </p>
          {aiOn && reason !== 'thin_data' && (
            <GenerateRefresh endpoint="/api/pov" label="Build the point of view" busyLabel="Analysing 90 days…" />
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Tesi */}
          <section className="panel border-sky-500/30 px-6 py-5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-sky-400">The thesis</p>
            <h2 className="text-lg font-semibold leading-snug text-slate-100">{pov.headline}</h2>
          </section>

          {/* Spostamenti */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <TrendingUp className="size-4 text-emerald-400" /> What is shifting
            </h2>
            <div className="flex flex-col gap-3">
              {pov.shifts.map((s, i) => (
                <article key={i} className="panel px-5 py-4">
                  <div className="flex flex-wrap items-start gap-2">
                    <h3 className="flex-1 text-sm font-semibold leading-snug text-slate-100">
                      {s.claim}<Cites ids={s.citations} byId={byId} />
                    </h3>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CONF_STYLE[s.confidence]}`}
                      title="How much the data supports this claim: high = solid volume and a consistent trend; low = thin sample">
                      {s.confidence} confidence
                    </span>
                  </div>
                  {s.magnitude && (
                    <p className="mt-1.5 font-mono text-xs text-sky-300" title="The verified figures behind this claim, computed from your data">
                      {s.magnitude}
                    </p>
                  )}
                  {s.why && <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{s.why}</p>}
                </article>
              ))}
            </div>
          </section>

          {/* Contro-segnali */}
          {pov.counterSignals.length > 0 && (
            <section className="panel border-amber-500/30 px-5 py-4">
              <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
                <AlertTriangle className="size-4" /> Counter-signals
              </h2>
              <p className="mb-2 text-[11px] text-slate-500">What argues against the thesis — read these before you commit to it.</p>
              <ul className="flex flex-col gap-2">
                {pov.counterSignals.map((c, i) => (
                  <li key={i} className="text-sm leading-relaxed text-slate-300">
                    <span className="mr-1.5 text-amber-400">▸</span>{c.point}<Cites ids={c.citations} byId={byId} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {pov.implications.length > 0 && (
              <section className="panel px-5 py-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <ArrowRight className="size-4 text-sky-400" /> So what
                </h2>
                <ul className="flex flex-col gap-2">
                  {pov.implications.map((t, i) => (
                    <li key={i} className="text-sm leading-relaxed text-slate-300">
                      <span className="mr-1.5 text-sky-400">→</span>{t}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {pov.watch.length > 0 && (
              <section className="panel px-5 py-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Eye className="size-4 text-violet-400" /> What to watch
                </h2>
                <ul className="flex flex-col gap-2">
                  {pov.watch.map((t, i) => (
                    <li key={i} className="text-sm leading-relaxed text-slate-300">
                      <span className="mr-1.5 text-violet-400">◦</span>{t}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <div className="flex items-center gap-3">
            <GenerateRefresh endpoint="/api/pov" label="Rebuild the argument" busyLabel="Re-analysing…" />
            <span className="text-xs text-slate-600">
              Generated {new Date(pov.generatedAt).toLocaleString('en-US')} · cached for the day
            </span>
          </div>
        </div>
      )}

      {/* Evidenza: i numeri che l'AI ha potuto usare, verificabili uno per uno */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section className="panel px-5 py-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Quote className="size-4 text-slate-500" /> The evidence behind it
          </h2>
          <p className="mb-3 text-[11px] text-slate-500">
            Topic by topic: last 30 days vs the 30 before. These are the figures the argument had to use — computed by the database, not by the AI.
          </p>
          <ul className="flex flex-col gap-1.5 text-xs">
            {facts.topics.slice(0, 10).map((t) => (
              <li key={t.topic} className="flex items-center gap-2"
                title={`“${t.topic}”: ${t.nNow} mentions in the last 30 days vs ${t.nPrev} in the 30 before${t.changePct !== null ? ` (${pct(t.changePct)})` : ''}. Sentiment ${sent(t.sNow)} vs ${sent(t.sPrev)}.`}>
                <Link href={`/listening?q=${encodeURIComponent(t.topic)}`}
                  className="w-40 shrink-0 truncate text-slate-300 hover:text-sky-300">{t.topic}</Link>
                <span className={`w-16 shrink-0 text-right tabular-nums ${STATUS_STYLE[t.status]}`}>
                  {t.changePct === null ? 'new' : pct(t.changePct)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-slate-500">{t.nPrev} → {t.nNow}</span>
                <span className="flex-1 text-right tabular-nums text-slate-600">{sent(t.sPrev)} → {sent(t.sNow)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel px-5 py-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <BookOpen className="size-4 text-violet-400" /> Academic evidence
          </h2>
          {!research ? (
            <p className="py-6 text-center text-sm text-slate-600">Research index unavailable right now.</p>
          ) : (
            <>
              <p className="mb-3 text-[11px] text-slate-500">
                Who researches this topic, from the open OpenAlex index ({fmtNum(research.total)} works matching “{research.query}”
                {research.growthPct !== null && research.last3 !== null && research.prev3 !== null
                  ? `, ${growth(research.growthPct)} in 3 years — ${fmtNum(research.last3)} works in the last 3 complete years vs ${fmtNum(research.prev3)} in the 3 before`
                  : ''}). Independent of the social conversation — use it to corroborate or challenge it.
              </p>
              {research.topInstitutions.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {research.topInstitutions.slice(0, 6).map((inst) => (
                    <span key={inst.name} className="rounded bg-white/5 px-2 py-0.5 text-[11px] text-slate-300"
                      title={`${inst.name}: ${fmtNum(inst.works)} published works on this topic`}>
                      {inst.name} <span className="text-slate-500">{fmtNum(inst.works)}</span>
                    </span>
                  ))}
                </div>
              )}
              <ul className="flex flex-col gap-1.5 text-xs">
                {research.topWorks.slice(0, 5).map((w) => (
                  <li key={w.url}>
                    <a href={w.url} target="_blank" rel="noopener noreferrer"
                      className="text-slate-300 transition hover:text-violet-300"
                      title={`${w.institution ?? 'unknown institution'} · ${w.citations} citations${w.openAccess ? ' · open access' : ''}`}>
                      {w.title}
                    </a>
                    <span className="ml-1 text-slate-600">{w.year} · {fmtNum(w.citations)} cit.</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
