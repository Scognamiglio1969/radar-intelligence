import Link from 'next/link';
import { AlertTriangle, CheckCircle2, CircleSlash, Info, ShieldAlert } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getLocale } from '@/lib/i18n';
import { PageHeader, EmptyState } from '@/components/ui';
import { sourceLabel } from '@/lib/source-label';
import {
  fmtNumber, formatDelta, formatKpi, formatPct, standardKpis, type Kpi, type Lang,
} from '@/lib/kpi-standard';
import { assessReliability, type Finding, type Verdict } from '@/lib/data-reliability';

// ---------------------------------------------------------------------------
// KPI standard e affidabilità.
//
// Due domande nella stessa pagina, perché vanno fatte insieme: quanto vale
// ciascun indicatore, e se quel valore si può portare in riunione. Un KPI
// senza il suo giudizio di affidabilità è esattamente il numero che finisce
// in una slide e che nessuno sa più difendere.
// ---------------------------------------------------------------------------

export const metadata = { title: 'KPI' };

const PERIODS = [7, 15, 30, 90] as const;

const L = (lang: Lang, it: string, en: string) => (lang === 'it' ? it : en);

export default async function KpiPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const lang: Lang = locale === 'it' ? 'it' : 'en';
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={L(lang, 'Nessun progetto selezionato.', 'No project selected.')} />;

  const days = PERIODS.includes(Number(sp.days) as (typeof PERIODS)[number]) ? Number(sp.days) : 30;
  const k = await standardKpis(project.id, days, lang);
  const r = await assessReliability(project.id, k);
  const verdictOf = new Map(r.verdicts.map((v) => [v.id, v]));

  const date = (d: Date) => d.toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Rome',
  });

  return (
    <>
      <PageHeader
        title={L(lang, 'KPI e affidabilità', 'KPIs & reliability')}
        subtitle={L(lang,
          'Gli indicatori standard del social listening, con la formula, e il giudizio su quanto reggono.',
          'Standard social listening indicators, with their formulas, and a judgement on how solid they are.')}
        info={L(lang,
          'Tutti i numeri sono calcolati dal database, nessuno dal modello. Un dato che manca è scritto n.d. con il motivo; la reach è sempre potenziale e il sentiment sempre automatico. L’affidabilità (analisi critica di livello 1) mette in discussione i KPI: oscillazione normale, peso dei contenuti estremi, fonti nuove, campioni piccoli.',
          'Every number is computed by the database, none by the model. Missing data is written n/a with the reason; reach is always potential and sentiment always automatic. Reliability (level-1 critical analysis) challenges the KPIs: normal fluctuation, weight of extreme items, new sources, small samples.')}
      />

      {/* Periodo */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-slate-500">{L(lang, 'Periodo', 'Period')}</span>
        {PERIODS.map((p) => (
          <Link key={p} href={`/kpi?days=${p}`}
            className={`rounded-full border px-3 py-1 ${p === days
              ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
              : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
            {L(lang, `${p} giorni`, `${p} days`)}
          </Link>
        ))}
        <span className="text-slate-600">
          {date(k.current.from)} → {date(k.current.to)} · {L(lang, 'confronto', 'vs')} {date(k.previous.from)} → {date(k.previous.to)} · Europe/Rome
        </span>
      </div>

      <OverallBanner lang={lang} overall={r.overall} reason={r.overallReason} />

      {/* KPI globali */}
      <section className="panel mb-4 overflow-x-auto px-0 py-0">
        <h2 className="px-5 pt-4 text-sm font-semibold text-slate-200">{L(lang, 'KPI del periodo', 'Period KPIs')}</h2>
        <table className="mt-3 w-full min-w-[46rem] text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-2 font-semibold">KPI</th>
              <th className="px-3 py-2 text-right font-semibold">{L(lang, 'Valore', 'Value')}</th>
              <th className="px-3 py-2 text-right font-semibold">{L(lang, 'Periodo prec.', 'Previous')}</th>
              <th className="px-3 py-2 text-right font-semibold">Δ</th>
              <th className="px-3 py-2 text-right font-semibold">Δ%</th>
              <th className="px-3 py-2 font-semibold">{L(lang, 'Affidabilità', 'Reliability')}</th>
            </tr>
          </thead>
          <tbody>
            {k.kpis.map((x) => (
              <KpiRow key={x.id} k={x} lang={lang} verdict={verdictOf.get(x.id)?.verdict} reason={verdictOf.get(x.id)?.reason} />
            ))}
          </tbody>
        </table>
        {k.notes.length > 0 && (
          <ul className="border-t border-[var(--border)] px-5 py-3 text-[11px] text-amber-200/90">
            {k.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
      </section>

      {/* Cosa non si può dire */}
      {r.cannotSay.length > 0 && (
        <section className="panel mb-4 border-amber-500/30 bg-amber-500/[0.04] px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <CircleSlash className="size-4" />
            {L(lang, 'Cosa non si può scrivere nel report', 'What the report cannot say')}
          </h2>
          <ul className="flex flex-col gap-1.5 text-xs text-slate-300">
            {r.cannotSay.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </section>
      )}

      {/* Rilievi */}
      {r.findings.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">
            {L(lang, 'Analisi critica — livello 1', 'Critical analysis — level 1')}
            <span className="ml-2 text-[11px] font-normal text-slate-500">
              {L(lang, 'i numeri reggono? Osservazione, evidenza, perché conta, confidenza, verifica.',
                'do the numbers hold? Observation, evidence, why it matters, confidence, check.')}
            </span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {r.findings.map((f) => <FindingCard key={f.id} f={f} lang={lang} />)}
          </div>
        </section>
      )}

      {/* Per canale */}
      {k.channels.length > 0 && (
        <section className="panel mb-4 overflow-x-auto px-0 py-0">
          <h2 className="px-5 pt-4 text-sm font-semibold text-slate-200">{L(lang, 'KPI per canale', 'KPIs by channel')}</h2>
          <table className="mt-3 w-full min-w-[46rem] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2 font-semibold">{L(lang, 'Canale', 'Channel')}</th>
                <th className="px-3 py-2 text-right font-semibold">{L(lang, 'Menzioni', 'Mentions')}</th>
                <th className="px-3 py-2 text-right font-semibold">{L(lang, '% sul totale', '% of total')}</th>
                <th className="px-3 py-2 text-right font-semibold">{L(lang, 'Reach pot.', 'Pot. reach')}</th>
                <th className="px-3 py-2 text-right font-semibold">Engagement</th>
                <th className="px-3 py-2 text-right font-semibold">{L(lang, 'Eng. medio', 'Avg eng.')}</th>
                <th className="px-3 py-2 text-right font-semibold">ER reach</th>
                <th className="px-3 py-2 text-right font-semibold">NSS</th>
                <th className="px-3 py-2 text-right font-semibold">Δ% {L(lang, 'menzioni', 'mentions')}</th>
              </tr>
            </thead>
            <tbody>
              {k.channels.map((c) => (
                <tr key={c.source} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="px-5 py-1.5 text-slate-300">
                    {sourceLabel(c.source)}
                    {c.previousMentions === 0 && !k.previousIncomplete && (
                      <span className="ml-1.5 rounded bg-amber-500/15 px-1 py-0.5 text-[9px] text-amber-300">{L(lang, 'nuova', 'new')}</span>
                    )}
                    {c.smallSample && <span className="ml-1.5 text-[9px] text-slate-600">{L(lang, 'campione limitato', 'small sample')}</span>}
                  </td>
                  <Num v={formatKpi(c.mentions, 'count', lang)} />
                  <Num v={formatKpi(c.share, 'pct', lang)} />
                  <Num v={formatKpi(c.reach, 'count', lang)} />
                  <Num v={formatKpi(c.engagement, 'count', lang)} />
                  <Num v={formatKpi(c.engPerMention, 'ratio', lang)} />
                  <Num v={formatKpi(c.erReach, 'pct', lang)} />
                  <Num v={formatKpi(c.nss, 'points', lang)} />
                  <Num v={c.previousMentions === 0 ? '—' : formatPct(c.deltaMentionsPct, lang)} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {/* Picchi */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{L(lang, 'Giorni di picco', 'Peak days')}</h2>
          {k.peaks.length === 0 ? (
            <p className="text-xs text-slate-500">{L(lang, 'Nessuna menzione nel periodo.', 'No mentions in the period.')}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {k.peaks.map((p) => (
                <li key={p.day} className="flex justify-between gap-3">
                  <span className="text-slate-300">{p.day}</span>
                  <span className="tabular-nums text-slate-400">
                    {fmtNumber(p.value, lang)} {L(lang, 'menzioni', 'mentions')}
                    {p.index !== null && <> · {L(lang, 'indice', 'index')} {formatKpi(p.index, 'index', lang)}</>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-slate-500">
            {k.anomalies.length
              ? L(lang,
                `Oltre 2σ dalla media del periodo: ${k.anomalies.map((a) => `${a.day} (z = ${fmtNumber(a.z, lang, 1)})`).join(', ')}.`,
                `Beyond 2σ of the period mean: ${k.anomalies.map((a) => `${a.day} (z = ${fmtNumber(a.z, lang, 1)})`).join(', ')}.`)
              : L(lang, 'Nessun giorno oltre 2σ dalla media del periodo.', 'No day beyond 2σ of the period mean.')}
          </p>
        </section>

        {/* Autori */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-200">{L(lang, 'Autori più attivi', 'Most active authors')}</h2>
          {k.topAuthors.length === 0 ? (
            <p className="text-xs text-slate-500">{L(lang, 'Le fonti del periodo non riportano l’autore.', 'The period’s sources carry no author.')}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-xs">
              {k.topAuthors.map((a) => (
                <li key={a.author} className="flex justify-between gap-3">
                  <Link href={`/listening?autore=${encodeURIComponent(a.author)}`} className="truncate text-slate-300 hover:text-sky-300">{a.author}</Link>
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {fmtNumber(a.n, lang)} · {formatKpi(k.raw.cur.n ? (a.n / k.raw.cur.n) * 100 : null, 'pct', lang)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Competitivo */}
      {k.competitive.length > 0 && (
        <section className="panel mb-4 overflow-x-auto px-0 py-0">
          <h2 className="px-5 pt-4 text-sm font-semibold text-slate-200">{L(lang, 'Set competitivo', 'Competitive set')}</h2>
          <p className="px-5 text-[11px] text-slate-500">
            SOV = {L(lang, 'menzioni dell’entità / menzioni del set', 'entity mentions / set mentions')} · SOE = {L(lang, 'engagement dell’entità / engagement del set', 'entity engagement / set engagement')} · SPV = {L(lang, 'positive dell’entità / positive del set', 'entity positives / set positives')}
          </p>
          <table className="mt-3 w-full min-w-[40rem] text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-2 font-semibold">{L(lang, 'Entità', 'Entity')}</th>
                <th className="px-3 py-2 text-right font-semibold">{L(lang, 'Menzioni', 'Mentions')}</th>
                <th className="px-3 py-2 text-right font-semibold">SOV</th>
                <th className="px-3 py-2 text-right font-semibold">Δ SOV</th>
                <th className="px-3 py-2 text-right font-semibold">SOE</th>
                <th className="px-3 py-2 text-right font-semibold">SPV</th>
                <th className="px-3 py-2 text-right font-semibold">NSS</th>
              </tr>
            </thead>
            <tbody>
              {k.competitive.map((c) => (
                <tr key={c.name} className="border-b border-[var(--border)]/60 last:border-0">
                  <td className="px-5 py-1.5 text-slate-300">{c.isOwnBrand && '★ '}{c.name}</td>
                  <Num v={formatKpi(c.mentions, 'count', lang)} />
                  <Num v={formatKpi(c.sov, 'pct', lang)} />
                  <Num v={k.previousIncomplete ? '—' : formatDelta({ delta: c.sovDeltaPoints, unit: 'pct' }, lang)} />
                  <Num v={formatKpi(c.soe, 'pct', lang)} />
                  <Num v={formatKpi(c.spv, 'pct', lang)} />
                  <Num v={formatKpi(c.nss, 'points', lang)} />
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}

function Num({ v }: { v: string }) {
  return <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{v}</td>;
}

const VERDICT_STYLE: Record<Verdict, { cls: string; it: string; en: string }> = {
  reliable: { cls: 'bg-emerald-500/15 text-emerald-300', it: 'affidabile', en: 'reliable' },
  caution: { cls: 'bg-amber-500/15 text-amber-300', it: 'con cautela', en: 'with caution' },
  unusable: { cls: 'bg-red-500/15 text-red-300', it: 'da non usare', en: 'do not use' },
};

function KpiRow({ k, lang, verdict, reason }: { k: Kpi; lang: Lang; verdict?: Verdict; reason?: string }) {
  const sub = k.id === 'likes' || k.id === 'comments' || k.id === 'shares';
  return (
    <tr className="border-b border-[var(--border)]/60 align-top last:border-0">
      <td className={`py-1.5 pr-3 ${sub ? 'pl-9 text-slate-500' : 'pl-5 text-slate-300'}`}>
        <span title={k.formula}>{k.label}</span>
        {!sub && (k.formula || k.note) && (
          <span className="block text-[10px] leading-snug text-slate-600">
            {k.formula}{k.formula && k.note ? ' · ' : ''}{k.note && <span className={k.value === null ? 'text-slate-500' : 'text-amber-300/80'}>{k.note}</span>}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-right font-medium tabular-nums text-slate-100">{formatKpi(k.value, k.unit, lang)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-slate-400">{formatKpi(k.previous, k.unit, lang)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{formatDelta(k, lang)}</td>
      <td className="px-3 py-1.5 text-right tabular-nums text-slate-300">{formatPct(k.deltaPct, lang)}</td>
      <td className="px-3 py-1.5">
        {verdict && !sub && (
          <span title={reason} className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${VERDICT_STYLE[verdict].cls}`}>
            {VERDICT_STYLE[verdict][lang]}
          </span>
        )}
        {verdict && verdict !== 'reliable' && reason && !sub && (
          <span className="mt-0.5 block text-[10px] leading-snug text-slate-500">{reason}</span>
        )}
      </td>
    </tr>
  );
}

function OverallBanner({ lang, overall, reason }: { lang: Lang; overall: 'suitable' | 'caution' | 'unsuitable'; reason: string }) {
  const style = {
    suitable: { cls: 'border-emerald-500/30 bg-emerald-500/[0.05] text-emerald-200', Icon: CheckCircle2, it: 'Dati idonei', en: 'Data suitable' },
    caution: { cls: 'border-amber-500/30 bg-amber-500/[0.05] text-amber-200', Icon: AlertTriangle, it: 'Dati idonei con cautele', en: 'Data suitable with caveats' },
    unsuitable: { cls: 'border-red-500/30 bg-red-500/[0.05] text-red-200', Icon: ShieldAlert, it: 'Dati non idonei', en: 'Data not suitable' },
  }[overall];
  return (
    <div className={`mb-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-sm ${style.cls}`}>
      <style.Icon className="size-4 shrink-0" />
      <span className="font-semibold">{style[lang]}</span>
      <span className="text-xs opacity-80">— {reason}</span>
    </div>
  );
}

const CONFIDENCE = {
  high: { it: 'alta', en: 'high' }, medium: { it: 'media', en: 'medium' }, low: { it: 'bassa', en: 'low' },
};

function FindingCard({ f, lang }: { f: Finding; lang: Lang }) {
  const tone = f.severity === 'critical'
    ? 'border-red-500/30 bg-red-500/[0.04]'
    : f.severity === 'caution' ? 'border-amber-500/25 bg-amber-500/[0.03]' : 'border-[var(--border)]';
  const Icon = f.severity === 'info' ? Info : f.severity === 'critical' ? ShieldAlert : AlertTriangle;
  const iconCls = f.severity === 'critical' ? 'text-red-300' : f.severity === 'caution' ? 'text-amber-300' : 'text-slate-500';
  return (
    <article className={`rounded-xl border px-4 py-3 text-xs ${tone}`}>
      <p className="mb-1.5 flex items-start gap-1.5 text-sm text-slate-200">
        <Icon className={`mt-0.5 size-3.5 shrink-0 ${iconCls}`} />
        {f.observation}
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 pl-5">
        <dt className="text-slate-600">{L(lang, 'Evidenza', 'Evidence')}</dt><dd className="text-slate-300">{f.evidence}</dd>
        <dt className="text-slate-600">{L(lang, 'Perché conta', 'Why it matters')}</dt><dd className="text-slate-400">{f.why}</dd>
        <dt className="text-slate-600">{L(lang, 'Confidenza', 'Confidence')}</dt><dd className="text-slate-400">{CONFIDENCE[f.confidence][lang]}</dd>
        <dt className="text-slate-600">{L(lang, 'Verifica', 'Check')}</dt><dd className="text-sky-200/80">{f.verify}</dd>
      </dl>
    </article>
  );
}
