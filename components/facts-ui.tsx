import Link from 'next/link';
import type { Lang } from '@/lib/kpi-standard';
import { fmtNumber } from '@/lib/kpi-standard';
import type { Signal, Verdict } from '@/lib/factcheck';
import type { Gap } from '@/lib/trials';

// ---------------------------------------------------------------------------
// I pezzi comuni delle pagine "Fatti e verifiche".
//
// Componenti senza stato, renderizzati sul server: queste pagine leggono
// dati già calcolati e non hanno niente da fare nel browser.
// ---------------------------------------------------------------------------

export const L = (lang: Lang, it: string, en: string) => (lang === 'it' ? it : en);

const VERDICT: Record<Verdict, { it: string; en: string; cls: string }> = {
  false: { it: 'Falso', en: 'False', cls: 'bg-red-500/15 text-red-300 border-red-500/30' },
  misleading: { it: 'Fuorviante', en: 'Misleading', cls: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  mixed: { it: 'In parte vero', en: 'Partly true', cls: 'bg-amber-500/15 text-amber-200 border-amber-500/30' },
  true: { it: 'Vero', en: 'True', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  unverifiable: { it: 'Non verificabile', en: 'Unverifiable', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/30' },
  contested: { it: 'Verdetti discordi', en: 'Conflicting verdicts', cls: 'bg-violet-500/15 text-violet-300 border-violet-500/30' },
  other: { it: 'Altro verdetto', en: 'Other rating', cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20' },
};

export function VerdictBadge({ verdict, lang }: { verdict: string; lang: Lang }) {
  const v = VERDICT[verdict as Verdict] ?? VERDICT.other;
  return <span className={`inline-block shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold ${v.cls}`}>{v[lang]}</span>;
}

export const verdictLabel = (verdict: string, lang: Lang) => (VERDICT[verdict as Verdict] ?? VERDICT.other)[lang];

const SIGNAL: Record<Signal, { it: string; en: string; cls: string }> = {
  'debunked-growing': { it: 'Smentita, e circola sempre di più', en: 'Debunked, and spreading more', cls: 'text-red-300' },
  'debunked-circulating': { it: 'Smentita, ma circola ancora', en: 'Debunked, still circulating', cls: 'text-orange-300' },
  'debunked-quiet': { it: 'Smentita, non circola più', en: 'Debunked, no longer circulating', cls: 'text-slate-500' },
  contested: { it: 'I fact-checker non sono d’accordo', en: 'Fact-checkers disagree', cls: 'text-violet-300' },
  confirmed: { it: 'Confermata', en: 'Confirmed', cls: 'text-emerald-300' },
  open: { it: 'Senza un verdetto netto', en: 'No clear verdict', cls: 'text-slate-400' },
};

export function SignalText({ signal, lang }: { signal: Signal; lang: Lang }) {
  const s = SIGNAL[signal];
  return <span className={`text-[11px] font-medium ${s.cls}`}>{s[lang]}</span>;
}

const GAP: Record<Gap, { it: string; en: string; cls: string }> = {
  hype: { it: 'Notizie più avanti dell’evidenza', en: 'News ahead of the evidence', cls: 'bg-orange-500/15 text-orange-300' },
  untold: { it: 'Evidenza che nessuno racconta', en: 'Evidence nobody covers', cls: 'bg-sky-500/15 text-sky-300' },
  aligned: { it: 'Allineati', en: 'Aligned', cls: 'bg-emerald-500/10 text-emerald-300' },
  quiet: { it: 'Silenzio', en: 'Quiet', cls: 'bg-slate-500/10 text-slate-500' },
};

export function GapBadge({ gap, lang }: { gap: Gap; lang: Lang }) {
  const g = GAP[gap];
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${g.cls}`}>{g[lang]}</span>;
}

export function Tile({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'danger' | 'warn' | 'ok';
}) {
  const color = tone === 'danger' ? 'text-red-300' : tone === 'warn' ? 'text-amber-200' : tone === 'ok' ? 'text-emerald-300' : 'text-slate-100';
  return (
    <div className="panel px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p>}
    </div>
  );
}

/** Barre orizzontali essenziali: etichetta, barra, numero. */
export function Bars({ items, lang, color = 'bg-sky-500/60' }: {
  items: { label: string; value: number; color?: string }[]; lang: Lang; color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.label} className="grid grid-cols-[minmax(6rem,11rem)_1fr_auto] items-center gap-2 text-xs">
          <span className="truncate text-slate-300" title={i.label}>{i.label}</span>
          <span className="h-2 rounded-full bg-white/5">
            <span className={`block h-2 rounded-full ${i.color ?? color}`} style={{ width: `${Math.max(2, (i.value / max) * 100)}%` }} />
          </span>
          <span className="tabular-nums text-slate-400">{fmtNumber(i.value, lang)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Link ad Ascolto con esattamente le menzioni che provano un'affermazione. */
export function MentionsLink({ ids, count, lang }: { ids: number[]; count: number; lang: Lang }) {
  if (!ids.length) return null;
  return (
    <Link href={`/listening?ids=${ids.join(',')}`} className="text-[11px] text-sky-300 hover:underline">
      {L(lang, `vedi ${count > ids.length ? `le ${ids.length} più viste su ${fmtNumber(count, lang)}` : `le ${ids.length} menzioni`}`,
        `see ${count > ids.length ? `the top ${ids.length} of ${fmtNumber(count, lang)}` : `the ${ids.length} mentions`}`)} →
    </Link>
  );
}

export function Section({ title, hint, children, className = '' }: {
  title: string; hint?: string; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`panel px-5 py-4 ${className}`}>
      <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      {hint && <p className="mb-3 mt-0.5 text-[11px] leading-snug text-slate-500">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}
