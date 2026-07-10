'use client';

import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid,
} from 'recharts';
import { SOURCE_META } from '@/lib/connectors';

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

export const ENTITY_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee'];

export function ShareOfVoicePie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={3}>
          {data.map((d, i) => (
            <Cell key={d.name} fill={ENTITY_COLORS[i % ENTITY_COLORS.length]} stroke="none" />
          ))}
        </Pie>
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Legend formatter={(v) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{v}</span>} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function BenchmarkTrend({ series }: {
  series: { name: string; points: { day: string; n: number }[] }[];
}) {
  const days = [...new Set(series.flatMap((s) => s.points.map((p) => p.day)))].sort();
  const rows = days.map((day) => {
    const row: Record<string, string | number> = {
      day: new Date(day).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
    };
    for (const s of series) row[s.name] = s.points.find((p) => p.day === day)?.n ?? 0;
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
        {series.map((s, i) => (
          <Line key={s.name} dataKey={s.name} stroke={ENTITY_COLORS[i % ENTITY_COLORS.length]}
            strokeWidth={2} dot={false} />
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
