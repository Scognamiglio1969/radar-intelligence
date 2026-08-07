'use client';

import { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, Cell,
} from 'recharts';
import { entityColor, OVERFLOW_COLOR } from '@/lib/entity-colors';

// ---------------------------------------------------------------------------
// I grafici sulle misure.
//
// Regole a cui si attengono tutti, senza eccezioni:
//  - UN SOLO asse dei valori. Due misure di scala diversa vanno in due grafici,
//    mai su due assi verticali nello stesso: è la lettura più ingannevole che
//    esista, perché il rapporto fra le due curve lo decide chi sceglie le scale.
//  - Il colore segue l'ENTITÀ, non la posizione in classifica: filtrare una
//    serie non deve ricolorare le altre.
//  - Oltre otto serie non si inventano tinte: le eccedenti diventano "Altro".
//  - La legenda c'è sempre da due serie in su: l'identità non è mai solo colore.
// ---------------------------------------------------------------------------

const TOOLTIP = {
  backgroundColor: '#16203c', border: '1px solid #1e2a4a',
  borderRadius: 8, fontSize: 12, color: '#e2e8f0',
};
const GRID = '#1e2a4a';
const AXIS = '#7c8cab';
const MAX_SERIES = 8;

export type Series = { name: string; points: { date: string; value: number }[] };
export type Ranked = { name: string; value: number };

const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}k`;
  if (a > 0 && a < 1) return n.toFixed(2);
  return String(Math.round(n));
};
const month = (d: string) => new Date(d).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' });

/** Le serie in eccesso non prendono un colore nuovo: diventano "Altro". */
function fold(series: Series[]): { kept: Series[]; folded: number } {
  if (series.length <= MAX_SERIES) return { kept: series, folded: 0 };
  const kept = series.slice(0, MAX_SERIES - 1);
  const rest = series.slice(MAX_SERIES - 1);
  const byDate = new Map<string, number>();
  for (const s of rest) for (const p of s.points) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value);
  kept.push({
    name: 'Altro',
    points: [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, value]) => ({ date, value })),
  });
  return { kept, folded: rest.length };
}

/**
 * Andamento nel tempo, una linea per serie.
 *
 * Le serie con ordini di grandezza molto diversi si possono INDICIZZARE a 100
 * sul primo valore: è il modo corretto di confrontare la crescita di un canale
 * da mezzo milione di follower con uno da dodicimila, senza il secondo asse.
 */
export function TrendChart({ series, title, hint }: {
  series: Series[]; title: string; hint?: string;
}) {
  const [indexed, setIndexed] = useState(false);
  const { kept, folded } = useMemo(() => fold(series), [series]);

  const spread = useMemo(() => {
    const maxes = kept.map((s) => Math.max(...s.points.map((p) => p.value), 0)).filter((v) => v > 0);
    if (maxes.length < 2) return 1;
    return Math.max(...maxes) / Math.min(...maxes);
  }, [kept]);

  const data = useMemo(() => {
    const dates = [...new Set(kept.flatMap((s) => s.points.map((p) => p.date)))].sort();
    const base = new Map(kept.map((s) => [s.name, s.points.find((p) => p.value > 0)?.value ?? 1]));
    return dates.map((date) => {
      const row: Record<string, string | number | null> = { date };
      for (const s of kept) {
        const v = s.points.find((p) => p.date === date)?.value ?? null;
        row[s.name] = v === null ? null : indexed ? Math.round((v / (base.get(s.name) || 1)) * 100) : v;
      }
      return row;
    });
  }, [kept, indexed]);

  if (!kept.length) return <Empty title={title} />;

  return (
    <section className="panel px-5 py-4">
      <Head title={title} hint={hint} folded={folded}
        action={spread >= 8 ? (
          <button onClick={() => setIndexed((v) => !v)}
            title="Confronta la crescita invece dei valori assoluti: tutte le serie partono da 100"
            className={`rounded-lg border px-2 py-1 text-[11px] ${indexed
              ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
              : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
            {indexed ? 'valori assoluti' : 'indicizza a 100'}
          </button>
        ) : undefined} />
      {spread >= 8 && !indexed && (
        <p className="mb-2 text-[11px] text-amber-300/80">
          Le serie differiscono di {Math.round(spread)} volte: le più piccole risultano schiacciate.
          Indicizzando a 100 si confrontano le crescite.
        </p>
      )}
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="date" tickFormatter={month} stroke={AXIS} fontSize={11} tickLine={false} />
          <YAxis tickFormatter={fmt} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={52} />
          <Tooltip contentStyle={TOOLTIP} labelFormatter={(d) => new Date(String(d)).toLocaleDateString('it-IT')}
            formatter={(v) => [indexed ? String(v) : Number(v).toLocaleString('it-IT'), '']} />
          {kept.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: AXIS }} />}
          {kept.map((s, i) => (
            <Line key={s.name} type="monotone" dataKey={s.name} connectNulls
              stroke={s.name === 'Altro' ? OVERFLOW_COLOR : entityColor(i)}
              strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </section>
  );
}

/** Classifica: barre orizzontali, la lettura più diretta per un confronto. */
export function RankChart({ rows, title, hint, unit }: {
  rows: Ranked[]; title: string; hint?: string; unit?: string;
}) {
  if (!rows.length) return <Empty title={title} />;
  const data = rows.slice(0, 12);
  return (
    <section className="panel px-5 py-4">
      <Head title={title} hint={hint} />
      <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30)}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" tickFormatter={fmt} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={150} stroke={AXIS} fontSize={11}
            tickLine={false} axisLine={false} interval={0} />
          <Tooltip contentStyle={TOOLTIP} cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            formatter={(v) => [`${Number(v).toLocaleString('it-IT')}${unit ? ` ${unit}` : ''}`, '']} />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
            {data.map((r, i) => <Cell key={r.name} fill={entityColor(i)} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </section>
  );
}

/**
 * Composizione: quanto pesa ciascuna voce sul totale.
 *
 * Barre e non torta: confrontare angoli è più difficile che confrontare
 * lunghezze, e con più di quattro fette diventa indovinare. La percentuale è
 * scritta accanto, così il "quanto sul totale" resta esplicito.
 */
export function MixChart({ rows, title, hint }: { rows: Ranked[]; title: string; hint?: string }) {
  if (!rows.length) return <Empty title={title} />;
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  const data = rows.slice(0, 12);
  return (
    <section className="panel px-5 py-4">
      <Head title={title} hint={hint} />
      <ul className="flex flex-col gap-2">
        {data.map((r, i) => (
          <li key={r.name} className="flex items-center gap-3">
            <span className="w-32 shrink-0 truncate text-xs text-slate-300" title={r.name}>{r.name}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
              <span className="block h-full rounded-full"
                style={{ width: `${Math.max(1, (r.value / total) * 100)}%`, backgroundColor: entityColor(i) }} />
            </span>
            <span className="w-20 shrink-0 text-right text-xs tabular-nums text-slate-400">{fmt(r.value)}</span>
            <span className="w-12 shrink-0 text-right text-xs tabular-nums text-slate-600">
              {((r.value / total) * 100).toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Performance di un campo editoriale: quanti contenuti e quanto rendono. */
export function CustomPerformance({ rows, field }: {
  rows: { name: string; posts: number; engagement: number; avgEngagement: number }[];
  field: string;
}) {
  if (!rows.length) return <Empty title={field} />;
  return (
    <section className="panel px-5 py-4">
      <Head title={field}
        hint="Quanti contenuti per ciascuna voce e quanto rende in media: il volume da solo non dice se ha funzionato." />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="pb-1.5 pr-3">Voce</th>
              <th className="pb-1.5 pr-3 text-right">Contenuti</th>
              <th className="pb-1.5 pr-3 text-right">Engagement totale</th>
              <th className="pb-1.5">Engagement medio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const max = Math.max(...rows.map((x) => x.avgEngagement), 1);
              return (
                <tr key={r.name} className="border-t border-[var(--border)]/40">
                  <td className="py-1.5 pr-3 font-medium text-slate-300">{r.name}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-400">{r.posts}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-400">{fmt(r.engagement)}</td>
                  <td className="py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-28 overflow-hidden rounded-full bg-white/[0.04]">
                        <span className="block h-full rounded-full"
                          style={{ width: `${(r.avgEngagement / max) * 100}%`, backgroundColor: entityColor(i) }} />
                      </span>
                      <span className="tabular-nums text-slate-400">{fmt(r.avgEngagement)}</span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Head({ title, hint, folded, action }: {
  title: string; hint?: string; folded?: number; action?: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        {folded ? (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">
            {folded} serie minori raccolte in &ldquo;Altro&rdquo;
          </span>
        ) : null}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
}

function Empty({ title }: { title: string }) {
  return (
    <section className="panel px-5 py-6">
      <h3 className="text-sm font-semibold text-slate-300">{title}</h3>
      <p className="mt-1 text-xs text-slate-600">Nessun dato per questa vista nel progetto corrente.</p>
    </section>
  );
}
