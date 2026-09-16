import { sourceLabel } from '@/lib/source-label';
import { formatDelta, formatKpi, formatPct, fmtNumber, type Lang, type StandardKpis } from '@/lib/kpi-standard';
import type { Reliability, Verdict } from '@/lib/data-reliability';

// ---------------------------------------------------------------------------
// Le tabelle dei KPI standard, una volta sola per tutti i formati.
//
// PDF, Excel, Word e PowerPoint ricevono le stesse righe già formattate: un
// numero scritto "1.234,5" nel PDF e "1234.5" nella slide sarebbe il primo
// dettaglio che un lettore attento nota, e da lì smette di fidarsi degli altri.
// ---------------------------------------------------------------------------

const L = (lang: Lang, it: string, en: string) => (lang === 'it' ? it : en);

export type Grid = { headers: string[]; rows: string[][] };

export function verdictLabel(v: Verdict | undefined, lang: Lang): string {
  if (!v) return '';
  return {
    reliable: L(lang, 'affidabile', 'reliable'),
    caution: L(lang, 'con cautela', 'with caution'),
    unusable: L(lang, 'da non usare', 'do not use'),
  }[v];
}

export function overallLabel(r: Reliability, lang: Lang): string {
  return {
    suitable: L(lang, 'Dati idonei', 'Data suitable'),
    caution: L(lang, 'Dati idonei con cautele', 'Data suitable with caveats'),
    unsuitable: L(lang, 'Dati non idonei', 'Data not suitable'),
  }[r.overall];
}

export function periodLine(k: StandardKpis): string {
  const d = (x: Date) => x.toISOString().slice(0, 10);
  return L(k.lang,
    `Periodo ${d(k.current.from)} → ${d(k.current.to)}, confronto ${d(k.previous.from)} → ${d(k.previous.to)} (Europe/Rome). Reach potenziale, sentiment automatico. n.d. = dato non disponibile.`,
    `Period ${d(k.current.from)} → ${d(k.current.to)}, compared with ${d(k.previous.from)} → ${d(k.previous.to)} (Europe/Rome). Potential reach, automatic sentiment. n/a = not available.`);
}

/** KPI | Valore | Prec. | Δ | Δ% | Affidabilità | Formula e note. */
export function kpiGrid(k: StandardKpis, r: Reliability, opts: { formulas?: boolean } = {}): Grid {
  const { lang } = k;
  const verdicts = new Map(r.verdicts.map((v) => [v.id, v]));
  const headers = [
    'KPI', L(lang, 'Valore', 'Value'), L(lang, 'Periodo prec.', 'Previous'), 'Δ', 'Δ%',
    L(lang, 'Affidabilità', 'Reliability'),
  ];
  if (opts.formulas) headers.push(L(lang, 'Formula e note', 'Formula and notes'));
  const rows = k.kpis.map((x) => {
    const v = verdicts.get(x.id);
    const row = [
      x.label,
      formatKpi(x.value, x.unit, lang),
      formatKpi(x.previous, x.unit, lang),
      formatDelta(x, lang),
      formatPct(x.deltaPct, lang),
      v ? verdictLabel(v.verdict, lang) + (v.verdict !== 'reliable' ? ` — ${v.reason}` : '') : '',
    ];
    if (opts.formulas) row.push([x.formula, x.note].filter(Boolean).join(' · '));
    return row;
  });
  return { headers, rows };
}

export function channelGrid(k: StandardKpis): Grid {
  const { lang } = k;
  return {
    headers: [
      L(lang, 'Canale', 'Channel'), L(lang, 'Menzioni', 'Mentions'), L(lang, '% sul totale', '% of total'),
      L(lang, 'Reach pot.', 'Pot. reach'), 'Engagement', L(lang, 'Eng. medio', 'Avg eng.'), 'ER reach', 'NSS',
      L(lang, 'Δ% menzioni', 'Δ% mentions'),
    ],
    rows: k.channels.map((c) => [
      sourceLabel(c.source) + (c.previousMentions === 0 && !k.previousIncomplete ? L(lang, ' (nuova)', ' (new)') : ''),
      formatKpi(c.mentions, 'count', lang),
      formatKpi(c.share, 'pct', lang),
      formatKpi(c.reach, 'count', lang),
      formatKpi(c.engagement, 'count', lang),
      formatKpi(c.engPerMention, 'ratio', lang),
      formatKpi(c.erReach, 'pct', lang),
      formatKpi(c.nss, 'points', lang),
      c.previousMentions === 0 ? '—' : formatPct(c.deltaMentionsPct, lang),
    ]),
  };
}

export function competitiveGrid(k: StandardKpis): Grid {
  const { lang } = k;
  return {
    headers: [L(lang, 'Entità', 'Entity'), L(lang, 'Menzioni', 'Mentions'), 'SOV', 'Δ SOV', 'SOE', 'SPV', 'NSS'],
    rows: k.competitive.map((c) => [
      (c.isOwnBrand ? '★ ' : '') + c.name,
      formatKpi(c.mentions, 'count', lang),
      formatKpi(c.sov, 'pct', lang),
      k.previousIncomplete ? '—' : formatDelta({ delta: c.sovDeltaPoints, unit: 'pct' }, lang),
      formatKpi(c.soe, 'pct', lang),
      formatKpi(c.spv, 'pct', lang),
      formatKpi(c.nss, 'points', lang),
    ]),
  };
}

export function peaksLine(k: StandardKpis): string {
  const { lang } = k;
  if (!k.peaks.length) return '';
  const peaks = k.peaks.map((p) => `${p.day} (${fmtNumber(p.value, lang)}${p.index !== null ? `, ${formatKpi(p.index, 'index', lang)}` : ''})`).join(', ');
  const anom = k.anomalies.length
    ? L(lang, ` Oltre 2σ: ${k.anomalies.map((a) => a.day).join(', ')}.`, ` Beyond 2σ: ${k.anomalies.map((a) => a.day).join(', ')}.`)
    : L(lang, ' Nessun giorno oltre 2σ.', ' No day beyond 2σ.');
  return L(lang, `Giorni di picco: ${peaks}.`, `Peak days: ${peaks}.`) + anom;
}

/** Osservazione | Evidenza | Perché conta | Confidenza | Verifica. */
export function findingGrid(r: Reliability, lang: Lang): Grid {
  const conf = { high: L(lang, 'alta', 'high'), medium: L(lang, 'media', 'medium'), low: L(lang, 'bassa', 'low') };
  const sev = { critical: L(lang, 'CRITICO', 'CRITICAL'), caution: L(lang, 'cautela', 'caution'), info: 'info' };
  return {
    headers: [
      L(lang, 'Osservazione', 'Observation'), L(lang, 'Evidenza', 'Evidence'),
      L(lang, 'Perché conta', 'Why it matters'), L(lang, 'Confidenza', 'Confidence'), L(lang, 'Verifica', 'Check'),
    ],
    rows: r.findings.map((f) => [`[${sev[f.severity]}] ${f.observation}`, f.evidence, f.why, conf[f.confidence], f.verify]),
  };
}

/** KPI affidabili / con cautela / da non usare, come chiede la verifica L1. */
export function verdictGroups(r: Reliability, lang: Lang): { title: string; items: string[] }[] {
  const group = (v: Verdict) => r.verdicts.filter((x) => x.verdict === v)
    .map((x) => (v === 'reliable' ? x.label : `${x.label} — ${x.reason}`));
  return [
    { title: L(lang, 'KPI affidabili', 'Reliable KPIs'), items: group('reliable') },
    { title: L(lang, 'KPI da usare con cautela', 'KPIs to use with caution'), items: group('caution') },
    { title: L(lang, 'KPI da non usare', 'KPIs not to use'), items: group('unusable') },
  ].filter((g) => g.items.length);
}

export const reliabilityTitle = (lang: Lang) => L(lang, 'Affidabilità dei dati — analisi critica L1', 'Data reliability — critical analysis L1');
export const kpiTitle = (lang: Lang) => L(lang, 'KPI standard', 'Standard KPIs');
export const cannotSayTitle = (lang: Lang) => L(lang, 'Cosa non si può scrivere nel report', 'What the report cannot say');
export const channelTitle = (lang: Lang) => L(lang, 'KPI per canale', 'KPIs by channel');
export const competitiveTitle = (lang: Lang) => L(lang, 'Set competitivo (SOV, SOE, Share of Positive Voice)', 'Competitive set (SOV, SOE, Share of Positive Voice)');
