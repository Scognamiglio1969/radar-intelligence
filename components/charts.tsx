'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { SOURCE_META } from '@/lib/connectors';
import { ENTITY_COLORS, OVERFLOW_COLOR, entityColor } from '@/lib/entity-colors';

export { ENTITY_COLORS, OVERFLOW_COLOR, entityColor };

const TICK = { fill: '#7c8cab', fontSize: 11 };
const TOOLTIP_STYLE = {
  backgroundColor: '#16203c', border: '1px solid #1e2a4a',
  borderRadius: 8, fontSize: 12, color: '#e2e8f0',
};

export function VolumeChart({ data }: { data: { day: string; source: string; n: number }[] }) {
  const days = [...new Set(data.map((d) => d.day))].sort();
  const sources = [...new Set(data.map((d) => d.source))];
  const rows = days.map((day) => {
    const row: Record<string, string | number> = {
      day: new Date(day).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
    };
    for (const s of sources) {
      row[s] = data.find((d) => d.day === day && d.source === s)?.n ?? 0;
    }
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2a4a" vertical={false} />
        <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={36} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: '#ffffff08' }} />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{SOURCE_META[v]?.label ?? v}</span>} />
        {sources.map((s) => (
          <Bar key={s} dataKey={s} stackId="a" fill={SOURCE_META[s]?.color ?? '#64748b'} radius={[2, 2, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#34d399', neutral: '#94a3b8', negative: '#f87171', 'analyzing': '#475569',
};

export function SentimentPie({ data }: { data: { sentiment: string; n: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} dataKey="n" nameKey="sentiment" innerRadius={55} outerRadius={85} paddingAngle={3}>
          {data.map((d) => (
            <Cell key={d.sentiment} fill={SENTIMENT_COLORS[d.sentiment] ?? '#64748b'} stroke="none" />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

const MAX_SLICES = 7; // 7 + "Other" = 8 tinte, il massimo distinguibile

export function ShareOfVoicePie({ data }: { data: { name: string; value: number; color?: string }[] }) {
  // Un'entità a zero non ha una fetta da mostrare ma occupava comunque una
  // riga di legenda: con 12 entità quasi tutte a zero la legenda cresceva
  // fino a coprire la ciambella.
  const present = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  if (present.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-500">No mentions associated with the entities yet.</p>;
  }

  const head = present.slice(0, MAX_SLICES);
  const tail = present.slice(MAX_SLICES);
  const slices = tail.length > 0
    ? [...head, { name: `Other (${tail.length})`, value: tail.reduce((s, d) => s + d.value, 0), color: OVERFLOW_COLOR }]
    : head;
  const total = slices.reduce((s, d) => s + d.value, 0);

  return (
    <div className="flex flex-col gap-3">
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie data={slices} dataKey="value" nameKey="name" innerRadius={52} outerRadius={86} paddingAngle={2}>
            {slices.map((d, i) => (
              // stroke del colore della superficie = il distacco di 2px fra fette
              <Cell key={d.name} fill={d.color ?? entityColor(i)} stroke="#10172e" strokeWidth={2} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => {
              const num = Number(v) || 0;
              return [`${num} · ${((num / total) * 100).toFixed(1)}%`, String(n)];
            }} />
        </PieChart>
      </ResponsiveContainer>
      {/* Legenda in HTML sotto il grafico invece che dentro l'area del
          grafico: quella di recharts rubava spazio alla ciambella e con molte
          voci ci finiva sopra. */}
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
        {slices.map((d, i) => (
          <li key={d.name} className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <span className="size-2 shrink-0 rounded-full" style={{ background: d.color ?? entityColor(i) }} />
            {d.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BenchmarkTrend({ series }: {
  series: { name: string; points: { day: string; n: number }[]; color?: string }[];
}) {
  // Come per la ciambella: chi non ha mai una mention non merita una linea
  // piatta a zero e una voce di legenda, e oltre 8 serie le tinte finirebbero.
  const active = series
    .map((s) => ({ ...s, total: s.points.reduce((t, p) => t + p.n, 0) }))
    .filter((s) => s.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, ENTITY_COLORS.length);
  if (active.length === 0) {
    return <p className="py-16 text-center text-sm text-slate-500">No volume to compare yet.</p>;
  }

  const days = [...new Set(active.flatMap((s) => s.points.map((p) => p.day)))].sort();
  const rows = days.map((day) => {
    const row: Record<string, string | number> = {
      day: new Date(day).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
    };
    for (const s of active) row[s.name] = s.points.find((p) => p.day === day)?.n ?? 0;
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2a4a" vertical={false} />
        <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} width={36} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
        {active.map((s, i) => (
          <Line key={s.name} dataKey={s.name} stroke={s.color ?? entityColor(i)}
            strokeWidth={2} dot={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * Interesse di ricerca (Google Trends) per entità di benchmark: già scalato
 * fra le entità (0-100, dove 100 è il picco fra tutte insieme), quindi le
 * linee si leggono come vera quota di ricerca l'una rispetto all'altra —
 * non serie indipendenti come in BenchmarkTrend.
 */
export function SearchInterestTrend({ series }: {
  series: { name: string; points: { date: string; value: number }[] }[];
}) {
  const days = [...new Set(series.flatMap((s) => s.points.map((p) => p.date)))].sort();
  const rows = days.map((day) => {
    const row: Record<string, string | number> = {
      day: new Date(day).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
    };
    for (const s of series) {
      const v = s.points.find((p) => p.date === day)?.value;
      if (v !== undefined) row[s.name] = v;
    }
    return row;
  });
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={rows}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e2a4a" vertical={false} />
        <XAxis dataKey="day" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={TICK} axisLine={false} tickLine={false} width={30} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
        {series.map((s, i) => (
          <Line key={s.name} dataKey={s.name} stroke={entityColor(i)}
            strokeWidth={2} dot={false} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Barre orizzontali semplici (senza recharts) per classifiche. */
export function HBars({ items, color = '#38bdf8' }: {
  items: { label: string; value: number; extra?: string }[]; color?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.label} className="text-xs">
          <div className="mb-0.5 flex justify-between text-slate-300">
            <span className="truncate pr-2">{it.label}</span>
            <span className="shrink-0 text-slate-500">{it.value.toLocaleString('it-IT')}{it.extra ? ` · ${it.extra}` : ''}</span>
          </div>
          <div className="h-1.5 rounded bg-white/5">
            <div className="h-1.5 rounded" style={{ width: `${(it.value / max) * 100}%`, backgroundColor: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}
