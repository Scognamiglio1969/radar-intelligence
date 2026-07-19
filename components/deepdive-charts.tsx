'use client';

import {
  Area, Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';

// Grafici del deep-dive per fonte: confrontano il canale con il totale del
// progetto sugli STESSI dati (il canale è sempre un sottoinsieme del totale).

type VolRow = { day: string; total: number; src: number };

export function SourceVolumeCompare({ data, color, label }: {
  data: VolRow[]; color: string; label: string;
}) {
  if (!data.length) return <p className="py-8 text-center text-sm text-slate-600">No data in the last 14 days.</p>;
  const rows = data.map((r) => ({ ...r, dayShort: r.day.slice(5).split('-').reverse().join('/') }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
        <XAxis dataKey="dayShort" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip
          cursor={{ stroke: '#94a3b8', strokeDasharray: '4 4' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as VolRow & { dayShort: string };
            const pct = p.total > 0 ? Math.round((p.src / p.total) * 100) : 0;
            return (
              <div className="rounded-lg border border-white/10 bg-slate-900/95 px-3 py-2 text-xs shadow-xl">
                <p className="font-semibold text-slate-200">{p.dayShort}</p>
                <p style={{ color }}>{label}: {p.src} mentions</p>
                <p className="text-slate-400">whole project: {p.total} mentions</p>
                <p className="mt-0.5 text-slate-500">{label} share of the day: {pct}%</p>
              </div>
            );
          }}
        />
        <Area type="monotone" dataKey="total" name="whole project" fill="rgba(148,163,184,0.12)"
          stroke="rgba(148,163,184,0.45)" strokeWidth={1.5} />
        <Bar dataKey="src" name={label} fill={color} radius={[3, 3, 0, 0]} maxBarSize={22} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

const SENT_COLORS = { positive: '#34d399', neutral: '#64748b', negative: '#f87171' } as const;

export function SentimentCompareBars({ src, all, label }: {
  src: { positive: number; neutral: number; negative: number };
  all: { positive: number; neutral: number; negative: number };
  label: string;
}) {
  const rows = [
    { name: label, d: src },
    { name: 'whole project', d: all },
  ];
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => {
        const tot = r.d.positive + r.d.neutral + r.d.negative;
        return (
          <div key={r.name}>
            <p className="mb-1 flex items-baseline justify-between text-xs">
              <span className="font-medium text-slate-300">{r.name}</span>
              <span className="text-slate-600">{tot} analyzed mentions</span>
            </p>
            {tot === 0 ? (
              <div className="h-4 rounded bg-white/5" />
            ) : (
              <div className="flex h-4 overflow-hidden rounded" title={
                `positive ${Math.round((r.d.positive / tot) * 100)}% · neutral ${Math.round((r.d.neutral / tot) * 100)}% · negative ${Math.round((r.d.negative / tot) * 100)}%`
              }>
                {(['positive', 'neutral', 'negative'] as const).map((s) => (
                  r.d[s] > 0 && (
                    <div key={s} style={{ width: `${(r.d[s] / tot) * 100}%`, background: SENT_COLORS[s] }}
                      title={`${s}: ${r.d[s]} (${Math.round((r.d[s] / tot) * 100)}%)`} />
                  )
                ))}
              </div>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-slate-600">
        <span className="text-emerald-400">■</span> positive ·{' '}
        <span className="text-slate-400">■</span> neutral ·{' '}
        <span className="text-red-400">■</span> negative — share of the mentions analyzed by the AI in the last 7 days.
      </p>
    </div>
  );
}
