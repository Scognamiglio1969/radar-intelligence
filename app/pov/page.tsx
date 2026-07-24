import Link from 'next/link';
import { AlertTriangle, ArrowRight, BookOpen, Eye, Quote, Sparkles, TrendingUp } from 'lucide-react';
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
const CROSS_STYLE: Record<string, string> = {
  ahead: 'bg-violet-500/20 text-violet-300',
  validated: 'bg-emerald-500/20 text-emerald-300',
  hype: 'bg-amber-500/20 text-amber-300',
  cooling: 'bg-slate-500/15 text-slate-400',
  unknown: 'bg-slate-700/40 text-slate-500',
};
const CROSS_HINT: Record<string, string> = {
  ahead: 'research is moving first — the market has not caught up',
  validated: 'both rising — a structural shift, not a fad',
  hype: 'loud market, thin research backing',
  cooling: 'neither side is moving',
  unknown: 'research signal unavailable — no conclusion drawn',
};
const KIND_STYLE: Record<string, string> = {
  trend: 'bg-sky-500/15 text-sky-300',
  innovation: 'bg-violet-500/15 text-violet-300',
  concept: 'bg-teal-500/15 text-teal-300',
  risk: 'bg-red-500/15 text-red-300',
  opportunity: 'bg-emerald-500/15 text-emerald-300',
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
  const { facts, research, cross, pov, reason } = await getPointOfView(project.id, 90);
  const aiOn = await claudeAvailable();
  const byId = new Map(facts.citations.map((c) => [c.id, c]));

  return (
    <>
      <PageHeader
        title="Point of View"
        info="A defensible argument about where the market is moving, built on 90 days of your data crossed with academic research. Every figure is computed from your mentions by the database (never invented by the AI), and every claim cites real posts you can open. The Market × Research crossover is what makes it a point of view rather than a report: it shows where research is moving ahead of the market, and where the market is loud without research behind it. Counter-signals are included on purpose — they are what makes the thesis credible."
        subtitle="The thesis you can take into a meeting: what is shifting over the last 90 days, the numbers that prove it, the posts that evidence it — plus what research says and what argues against it. Each block is slide-ready. Click any citation number to read the source post."
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

          {/* Blocchi pronti per slide: titolo + testo + numeri */}
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <TrendingUp className="size-4 text-emerald-400" /> The story in {pov.blocks.length} blocks
              <span className="text-[11px] font-normal text-slate-600">— each one is a slide: title, narrative, numbers</span>
            </h2>
            <div className="flex flex-col gap-3">
              {pov.blocks.map((b, i) => (
                <article key={i} className="panel px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold tabular-nums text-slate-600">{String(i + 1).padStart(2, '0')}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${KIND_STYLE[b.kind]}`}
                      title={`This block is framed as a ${b.kind}`}>
                      {b.kind}
                    </span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-medium ${CONF_STYLE[b.confidence]}`}
                      title="How much the data supports this block: high = solid volume and a consistent trend; low = thin sample">
                      {b.confidence} confidence
                    </span>
                  </div>

                  <h3 className="mt-1.5 text-base font-semibold leading-snug text-slate-100">
                    {b.title}<Cites ids={b.citations} byId={byId} />
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{b.body}</p>

                  {b.stats.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--border)] pt-3">
                      {b.stats.map((st, k) => (
                        <div key={k} className="min-w-[120px] flex-1 rounded-lg bg-white/[0.03] px-3 py-2"
                          title={`${st.value} — ${st.label}. Figure taken from the verified data below.`}>
                          <p className="text-xl font-bold tabular-nums text-sky-300">{st.value}</p>
                          <p className="text-[11px] leading-tight text-slate-500">{st.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
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

      {/* Incrocio mercato × ricerca: dove nasce il punto di vista non ovvio */}
      {cross.length > 0 && (
        <section className="panel mt-6 px-5 py-4">
          <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Sparkles className="size-4 text-violet-400" /> Market × Research
          </h2>
          <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
            What the market talks about crossed with what research is publishing. The gap between the two is where a
            non-obvious point of view lives: something the labs are already working on but the market has not priced in,
            or something loud online that no research backs.
          </p>
          <ul className="flex flex-col gap-1.5 text-xs">
            {cross.map((c) => (
              <li key={c.topic} className="flex flex-wrap items-center gap-2"
                title={`“${c.topic}”\nMarket: ${c.marketNow} mentions in 30 days${c.marketChangePct !== null ? ` (${pct(c.marketChangePct)} vs the 30 before)` : ' (new in the window)'}\nResearch: ${fmtNum(c.researchWorks)} academic works${c.researchGrowthPct !== null ? `, ${growth(c.researchGrowthPct)} over the last 2 complete years` : ' (too few to measure a trend)'}\nReading: ${CROSS_HINT[c.quadrant]}`}>
                <span className={`w-[86px] shrink-0 rounded-full px-2 py-0.5 text-center text-[10px] font-medium uppercase ${CROSS_STYLE[c.quadrant]}`}>
                  {c.quadrant}
                </span>
                <Link href={`/listening?q=${encodeURIComponent(c.topic)}`}
                  className="w-40 shrink-0 truncate text-slate-300 hover:text-sky-300">{c.topic}</Link>
                <span className="w-28 shrink-0 tabular-nums text-slate-500">
                  market {c.marketChangePct === null ? 'new' : pct(c.marketChangePct)}
                </span>
                <span className="flex-1 tabular-nums text-slate-500">
                  research {c.researchGrowthPct === null ? '—' : growth(c.researchGrowthPct)}
                  <span className="ml-1 text-slate-600">({fmtNum(c.researchWorks)} papers)</span>
                </span>
                <span className="hidden text-slate-600 sm:inline">{CROSS_HINT[c.quadrant]}</span>
              </li>
            ))}
          </ul>
        </section>
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
          {!research || research.status !== 'ok' ? (
            <p className="py-6 text-center text-sm leading-relaxed text-slate-500">
              {research?.status === 'empty'
                ? <>No academic literature matches “{research.query}”. That is normal for brands, products or very local themes — academic indexes only cover research subjects.</>
                : <>The research index is temporarily unavailable (usage limit reached or service unreachable). It is cached daily and retries on its own — nothing else on this page is affected.</>}
            </p>
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
