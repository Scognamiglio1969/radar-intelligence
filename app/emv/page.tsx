import Link from 'next/link';
import { AlertTriangle, Euro } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { emvReport, EMV_ASSUMPTIONS } from '@/lib/emv';
import { PageHeader, EmptyState, fmtNum } from '@/components/ui';
import { sourceLabel } from '@/lib/export-data';

export const metadata = { title: 'Earned Media Value' };

const eur = (n: number) => `€${n.toLocaleString('en-US')}`;

export default async function EmvPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const r = await emvReport(project.id, 30);
  const maxSource = Math.max(1, ...r.bySource.map((s) => s.emv));
  const maxDay = Math.max(1, ...r.daily.map((d) => d.emv));
  const estimatedShare = r.items ? Math.round(((r.items - r.withRealReach) / r.items) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Earned Media Value"
        info="An estimate of what your earned coverage would have cost to buy. It is deliberately conservative and fully transparent: real reach is used when a source provides it, otherwise impressions are estimated per source type; negative coverage is valued at zero and reported separately as exposure; and there is no arbitrary 'PR multiplier'. Every figure can be recomputed by hand from the assumptions shown at the bottom. Period: last 30 days."
        subtitle="The question management always asks: what is this coverage worth? Here is a defensible answer — with every assumption on the table, because an EMV without its assumptions is just a number to argue about."
      />

      {r.items === 0 ? (
        <EmptyState message="No coverage in the last 30 days yet." />
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="panel border-emerald-500/30 px-4 py-3"
              title="Estimated cost of buying the equivalent attention, over the last 30 days">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Earned media value</p>
              <p className="mt-1 text-2xl font-bold text-emerald-300">{eur(r.emv)}</p>
              <p className="text-xs text-slate-500">last {r.days} days</p>
            </div>
            <div className="panel px-4 py-3" title="Total estimated impressions across all coverage in the period">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Impressions</p>
              <p className="mt-1 text-2xl font-bold">{fmtNum(r.impressions)}</p>
              <p className="text-xs text-slate-500">{fmtNum(r.items)} pieces of coverage</p>
            </div>
            <div className="panel px-4 py-3"
              title="Negative coverage is valued at zero: it is exposure, not value. Shown here so it is never hidden inside the total.">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Negative exposure</p>
              <p className="mt-1 text-2xl font-bold text-red-300">{fmtNum(r.negativeImpressions)}</p>
              <p className="text-xs text-slate-500">{fmtNum(r.negativeItems)} pieces · valued at €0</p>
            </div>
            <div className="panel px-4 py-3"
              title="Share of coverage where impressions had to be estimated because the source does not publish real reach">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Estimated reach</p>
              <p className="mt-1 text-2xl font-bold">{estimatedShare}%</p>
              <p className="text-xs text-slate-500">{fmtNum(r.withRealReach)} had real reach</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">Where the value comes from</h2>
              <p className="mb-3 text-[11px] text-slate-500">By source, over the period.</p>
              <ul className="flex flex-col gap-1.5 text-xs">
                {r.bySource.slice(0, 10).map((s) => (
                  <li key={s.source} className="flex items-center gap-2"
                    title={`${sourceLabel(s.source)}: ${eur(s.emv)} from ${fmtNum(s.items)} pieces and ${fmtNum(s.impressions)} estimated impressions`}>
                    <Link href={`/source/${s.source}`} className="w-32 shrink-0 truncate text-slate-300 hover:text-sky-300">
                      {sourceLabel(s.source)}
                    </Link>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                      <span className="block h-full rounded-full bg-emerald-400/70"
                        style={{ width: `${Math.round((s.emv / maxSource) * 100)}%` }} />
                    </span>
                    <span className="w-20 shrink-0 text-right tabular-nums text-slate-400">{eur(s.emv)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel px-5 py-4">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">Value earned day by day</h2>
              <p className="mb-3 text-[11px] text-slate-500">Spikes mark the days that paid off.</p>
              <div className="flex h-32 items-end gap-0.5">
                {r.daily.map((d) => (
                  <span key={d.day} className="flex-1" title={`${d.day}: ${eur(d.emv)}`}>
                    <span className="block rounded-t bg-emerald-500/60"
                      style={{ height: `${Math.max(2, (d.emv / maxDay) * 120)}px` }} />
                  </span>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-600">
                {r.daily[0]?.day} → {r.daily[r.daily.length - 1]?.day}
              </p>
            </section>
          </div>

          <section className="panel mt-4 px-5 py-4">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">Top earning coverage</h2>
            <p className="mb-3 text-[11px] text-slate-500">The pieces that generated most of the value — click to open.</p>
            <ul className="flex flex-col gap-1 text-xs">
              {r.top.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-right font-semibold tabular-nums text-emerald-300">{eur(t.emv)}</span>
                  <Link href={`/listening?ids=${t.id}`} className="min-w-0 flex-1 truncate text-slate-300 hover:text-sky-300"
                    title={`${t.title}\n${sourceLabel(t.source)} · ${t.date} · ${fmtNum(t.impressions)} estimated impressions${t.sentiment ? ` · ${t.sentiment}` : ''}`}>
                    {t.title}
                  </Link>
                  <span className="shrink-0 text-slate-600">{sourceLabel(t.source)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Le assunzioni: senza queste, un EMV è solo un numero su cui litigare. */}
          <section className="panel mt-4 border-amber-500/25 px-5 py-4">
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300">
              <AlertTriangle className="size-4" /> How this is calculated — and why you should read it
            </h2>
            <p className="mb-3 text-xs leading-relaxed text-slate-400">
              EMV is an <strong className="text-slate-300">estimate</strong>, not an accounting figure. Anyone selling it as a precise
              number is bluffing. These are the rules used here, so you can defend — or challenge — every euro:
            </p>
            <ul className="flex flex-col gap-1.5 text-xs text-slate-400">
              <li><Euro className="mr-1 inline size-3 text-emerald-400" />
                <strong className="text-slate-300">Formula:</strong> impressions ÷ 1,000 × CPM × sentiment factor, summed over every piece.
              </li>
              <li>• <strong className="text-slate-300">Impressions:</strong> the real reach when the source publishes it
                ({fmtNum(r.withRealReach)} pieces here); otherwise {fmtNum(EMV_ASSUMPTIONS.newsBaseImpressions)} per news article,
                or engagement × {EMV_ASSUMPTIONS.socialEngagementMultiplier} for social posts.
              </li>
              <li>• <strong className="text-slate-300">CPM:</strong> €{EMV_ASSUMPTIONS.cpmNews} for news, €{EMV_ASSUMPTIONS.cpmSocial} for social — conservative market rates.
              </li>
              <li>• <strong className="text-slate-300">Sentiment:</strong> positive ×{EMV_ASSUMPTIONS.factorPositive},
                neutral ×{EMV_ASSUMPTIONS.factorNeutral}, negative ×{EMV_ASSUMPTIONS.factorNegative} — negative coverage
                produces no value, so it is excluded from the total and reported as exposure instead.
              </li>
              <li>• <strong className="text-slate-300">No PR multiplier:</strong> the classic AVE ×3 “editorial credibility” bonus is not applied. It has no evidence behind it.</li>
            </ul>
          </section>
        </>
      )}
    </>
  );
}
