'use client';

import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ReferenceLine, Cell, Treemap,
} from 'recharts';

const TOOLTIP = { backgroundColor: '#16203c', border: '1px solid #1e2a4a', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };
const sentColor = (s: number) => s > 0.15 ? '#34d399' : s < -0.15 ? '#f87171' : '#94a3b8';

// ── 2. Mappa Temi × Sentiment ────────────────────────────────────────────
type TopicPoint = { topic: string; volume: number; sentiment: number; growth: number };

export function TopicSentimentBubble({ data }: { data: TopicPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={460}>
      <ScatterChart margin={{ top: 20, right: 30, bottom: 30, left: 10 }}>
        <XAxis type="number" dataKey="sentiment" name="Sentiment" domain={[-1, 1]}
          tick={{ fill: '#7c8cab', fontSize: 11 }} tickLine={false}
          label={{ value: '← negativo    Sentiment    positivo →', position: 'bottom', fill: '#64748b', fontSize: 11 }} />
        <YAxis type="number" dataKey="growth" name="Peso relativo" unit="%"
          domain={['dataMin', 'dataMax']}
          tick={{ fill: '#7c8cab', fontSize: 11 }} tickLine={false}
          label={{ value: '← in calo    peso relativo    in crescita →', angle: -90, position: 'insideLeft', fill: '#64748b', fontSize: 11 }} />
        <ZAxis type="number" dataKey="volume" range={[120, 2200]} name="Volume" />
        <ReferenceLine x={0} stroke="#334155" strokeDasharray="4 4" />
        <ReferenceLine y={0} stroke="#334155" strokeDasharray="4 4" />
        <Tooltip contentStyle={TOOLTIP} cursor={{ strokeDasharray: '3 3' }}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as TopicPoint | undefined;
            if (!p) return null;
            return (
              <div style={TOOLTIP} className="px-3 py-2">
                <p className="font-semibold text-slate-100">{p.topic}</p>
                <p>volume {p.volume} · sentiment {p.sentiment.toFixed(2)} · crescita {p.growth}%</p>
              </div>
            );
          }} />
        <Scatter data={data} shape="circle">
          {data.map((d) => <Cell key={d.topic} fill={sentColor(d.sentiment)} fillOpacity={0.55} stroke={sentColor(d.sentiment)} />)}
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

// ── 3. Heatmap giorno × ora ───────────────────────────────────────────────
const DAYS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
// grid è indicizzato con dow Postgres (0=Dom); riordino Lun→Dom
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  const color = (n: number) => {
    if (n === 0) return 'rgba(148,163,184,0.06)';
    const t = n / max;
    // scala blu → viola → arancio per i picchi
    if (t > 0.66) return `rgba(251,146,60,${0.5 + t * 0.5})`;
    if (t > 0.33) return `rgba(167,139,250,${0.4 + t * 0.5})`;
    return `rgba(56,189,248,${0.25 + t * 0.6})`;
  };
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="mb-1 flex pl-10">
          {Array.from({ length: 24 }, (_, h) => (
            <div key={h} className="flex-1 text-center text-[9px] text-slate-600">{h % 3 === 0 ? `${h}` : ''}</div>
          ))}
        </div>
        {ORDER.map((dow, i) => (
          <div key={dow} className="flex items-center">
            <div className="w-10 text-xs text-slate-500">{DAYS[i]}</div>
            <div className="flex flex-1 gap-px">
              {grid[dow].map((n, h) => (
                <div key={h} className="group relative h-6 flex-1 rounded-sm" style={{ backgroundColor: color(n) }}
                  title={`${DAYS[i]} ${h}:00 — ${n} mention`} />
              ))}
            </div>
          </div>
        ))}
        <p className="mt-2 pl-10 text-[10px] text-slate-600">Ora locale (Italia). Colore = intensità delle conversazioni.</p>
      </div>
    </div>
  );
}

// ── 1. Sentiment Waterfall ────────────────────────────────────────────────
type WFStep = { day: string; delta: number; cumulative: number; base: number; up: boolean };

export function SentimentWaterfall({ steps }: { steps: WFStep[] }) {
  const vals = steps.flatMap((s) => [s.base, s.base + Math.abs(s.delta), s.cumulative]);
  const min = Math.min(0, ...vals);
  const max = Math.max(0, ...vals);
  const range = Math.max(1, max - min);
  const H = 300;
  const y = (v: number) => H - ((v - min) / range) * H;
  const bw = 100 / steps.length;
  return (
    <svg viewBox={`0 0 1000 ${H + 30}`} className="w-full" preserveAspectRatio="none" style={{ maxHeight: 340 }}>
      {/* linea zero */}
      <line x1="0" y1={y(0)} x2="1000" y2={y(0)} stroke="#334155" strokeDasharray="4 4" />
      {steps.map((s, i) => {
        const x = (i * bw + bw * 0.15) * 10;
        const w = bw * 0.7 * 10;
        const top = y(s.base + Math.abs(s.delta));
        const h = Math.max(2, ((Math.abs(s.delta)) / range) * H);
        return (
          <g key={s.day}>
            <rect x={x} y={top} width={w} height={h} rx={2} fill={s.up ? '#34d399' : '#f87171'} fillOpacity={0.85} />
            {i % Math.ceil(steps.length / 10) === 0 && (
              <text x={x + w / 2} y={H + 16} textAnchor="middle" fontSize="9" fill="#64748b">{s.day.slice(5)}</text>
            )}
          </g>
        );
      })}
      {/* linea del cumulato */}
      <polyline
        points={steps.map((s, i) => `${(i * bw + bw / 2) * 10},${y(s.cumulative)}`).join(' ')}
        fill="none" stroke="#38bdf8" strokeWidth="2" />
    </svg>
  );
}

// ── 4. Cluster conversazionali (treemap) ──────────────────────────────────
type Cluster = { family: string; share: number; sentiment: string; example: string };
const cSent: Record<string, string> = { positivo: '#059669', neutro: '#475569', negativo: '#b91c1c' };

export function ClusterTreemap({ clusters }: { clusters: Cluster[] }) {
  const data = clusters.map((c) => ({ name: c.family, size: Math.max(1, c.share), sentiment: c.sentiment }));
  return (
    <ResponsiveContainer width="100%" height={360}>
      <Treemap data={data} dataKey="size" stroke="#0a0f1f" aspectRatio={4 / 3}
        content={<TreemapCell />} />
    </ResponsiveContainer>
  );
}

function TreemapCell(props: {
  x?: number; y?: number; width?: number; height?: number; name?: string; sentiment?: string; size?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', sentiment = 'neutro', size = 0 } = props;
  if (width < 2 || height < 2) return null;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={cSent[sentiment] ?? '#475569'} fillOpacity={0.85} stroke="#0a0f1f" strokeWidth={2} />
      {width > 70 && height > 34 && (
        <>
          <text x={x + 8} y={y + 20} fill="#f1f5f9" fontSize={13} fontWeight={700}>{name}</text>
          <text x={x + 8} y={y + 38} fill="#e2e8f0" fontSize={11}>{size}%</text>
        </>
      )}
    </g>
  );
}
