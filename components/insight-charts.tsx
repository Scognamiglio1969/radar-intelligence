'use client';

import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ReferenceLine, Cell, Treemap,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
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
          label={{ value: '← negative    Sentiment    positive →', position: 'bottom', fill: '#64748b', fontSize: 11 }} />
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
        <p className="mt-2 pl-10 text-[10px] text-slate-600">Local time. Color = intensity of conversations.</p>
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
const cSent: Record<string, string> = { positive: '#059669', neutral: '#475569', negative: '#b91c1c' };

export function ClusterTreemap({ clusters }: { clusters: Cluster[] }) {
  const data = clusters.map((c) => ({ name: c.family, size: Math.max(1, c.share), sentiment: c.sentiment }));
  return (
    <ResponsiveContainer width="100%" height={360}>
      <Treemap data={data} dataKey="size" stroke="#0a0f1f" aspectRatio={4 / 3}
        content={<TreemapCell />} />
    </ResponsiveContainer>
  );
}

// ── 8. Costellazione semantica (frequenza + co-occorrenza + sentiment) ────
type CNode = { term: string; freq: number; sentiment: number };
type CEdge = { a: string; b: string; weight: number };

export function SemanticConstellation({ nodes, edges }: { nodes: CNode[]; edges: CEdge[] }) {
  const W = 1000, H = 620, cx = W / 2, cy = H / 2;
  const maxFreq = Math.max(1, ...nodes.map((n) => n.freq));
  const col = (s: number) => s > 0.15 ? '#34d399' : s < -0.15 ? '#f87171' : '#94a3b8';
  const nr = (f: number) => 8 + Math.sqrt(f / maxFreq) * 34;
  // Layout deterministico: spirale ad angolo aureo, i termini più forti al centro.
  const golden = Math.PI * (3 - Math.sqrt(5));
  const pos = new Map<string, { x: number; y: number }>();
  const maxR = Math.min(W, H) / 2 - 70;
  nodes.forEach((n, i) => {
    const t = nodes.length <= 1 ? 0 : i / (nodes.length - 1);
    const rad = Math.sqrt(t) * maxR;
    const ang = i * golden;
    pos.set(n.term, { x: cx + rad * Math.cos(ang), y: cy + rad * Math.sin(ang) });
  });
  const maxW = Math.max(1, ...edges.map((e) => e.weight));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 620 }}>
      <rect x="0" y="0" width={W} height={H} rx="14" fill="#0a0f1f" />
      {/* archi di co-occorrenza */}
      {edges.map((e, i) => {
        const a = pos.get(e.a), b = pos.get(e.b);
        if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
          stroke="#38bdf8" strokeOpacity={0.1 + (e.weight / maxW) * 0.35} strokeWidth={0.5 + (e.weight / maxW) * 3} />;
      })}
      {/* stelle */}
      {nodes.map((n) => {
        const p = pos.get(n.term)!; const r = nr(n.freq); const c = col(n.sentiment);
        return (
          <g key={n.term}>
            <title>{`${n.term} · ${n.freq} mentions · sentiment ${n.sentiment}`}</title>
            <circle cx={p.x} cy={p.y} r={r} fill={c} fillOpacity={0.2} stroke={c} strokeWidth={1.5} />
            <text x={p.x} y={p.y + r + 12} textAnchor="middle" fontSize={Math.max(10, Math.min(15, r * 0.6))}
              fill="#e2e8f0" fontWeight={n.freq > maxFreq * 0.5 ? 700 : 400}>{n.term}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 7. Momentum Quadrant (volume × accelerazione) ─────────────────────────
type QuadrantPoint = { topic: string; volume: number; acceleration: number; sentiment: number; quadrant: string };
const QUAD_COLOR: Record<string, string> = {
  'Rising stars': '#34d399', 'Emerging': '#38bdf8', 'Steady': '#a78bfa', 'Declining': '#f87171',
};

export function MomentumQuadrant({ points }: { points: QuadrantPoint[] }) {
  const W = 1000, H = 560, m = { t: 30, r: 30, b: 40, l: 50 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const maxVol = Math.max(1, ...points.map((p) => p.volume));
  const vols = points.map((p) => p.volume).sort((a, b) => a - b);
  const medianVol = vols[Math.floor(vols.length / 2)] ?? 0;
  const aMin = -100, aMax = Math.max(100, ...points.map((p) => p.acceleration));
  const px = (v: number) => m.l + (v / maxVol) * iw;
  const py = (a: number) => m.t + (1 - (a - aMin) / (aMax - aMin)) * ih;
  const r = (v: number) => 6 + Math.sqrt(v / maxVol) * 22;
  const xMid = px(medianVol), yZero = py(0);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 560 }}>
      {/* sfondi quadranti */}
      <rect x={xMid} y={m.t} width={m.l + iw - xMid} height={yZero - m.t} fill="#34d39908" />
      <rect x={m.l} y={m.t} width={xMid - m.l} height={yZero - m.t} fill="#38bdf808" />
      <rect x={xMid} y={yZero} width={m.l + iw - xMid} height={m.t + ih - yZero} fill="#a78bfa08" />
      <rect x={m.l} y={yZero} width={xMid - m.l} height={m.t + ih - yZero} fill="#f8717108" />
      {/* linee divisorie */}
      <line x1={m.l} y1={yZero} x2={m.l + iw} y2={yZero} stroke="#334155" strokeDasharray="5 5" />
      <line x1={xMid} y1={m.t} x2={xMid} y2={m.t + ih} stroke="#334155" strokeDasharray="5 5" />
      {/* etichette quadranti agli angoli */}
      <text x={m.l + iw - 8} y={m.t + 20} textAnchor="end" fontSize="15" fontWeight={800} fill="#34d39970">RISING STARS</text>
      <text x={m.l + 8} y={m.t + 20} textAnchor="start" fontSize="15" fontWeight={800} fill="#38bdf870">EMERGING</text>
      <text x={m.l + iw - 8} y={m.t + ih - 10} textAnchor="end" fontSize="15" fontWeight={800} fill="#a78bfa70">STEADY</text>
      <text x={m.l + 8} y={m.t + ih - 10} textAnchor="start" fontSize="15" fontWeight={800} fill="#f8717170">DECLINING</text>
      {/* assi */}
      <text x={m.l + iw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">Volume →</text>
      <text x={14} y={m.t + ih / 2} textAnchor="middle" fontSize="11" fill="#64748b" transform={`rotate(-90 14 ${m.t + ih / 2})`}>← declining   Acceleration   accelerating →</text>
      {/* punti */}
      {points.map((p) => {
        const cx = px(p.volume), cy = py(p.acceleration), c = QUAD_COLOR[p.quadrant] ?? '#94a3b8';
        return (
          <g key={p.topic}>
            <title>{`${p.topic} · ${p.volume} mentions · accel ${p.acceleration}% · ${p.quadrant}`}</title>
            <circle cx={cx} cy={cy} r={r(p.volume)} fill={c} fillOpacity={0.22} stroke={c} strokeWidth={1.5} />
            <text x={cx} y={cy - r(p.volume) - 4} textAnchor="middle" fontSize="11" fill="#cbd5e1">{p.topic}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── 5. Brand Health Index (gauge + sotto-metriche + sparkline) ────────────
type HealthComponent = { key: string; label: string; value: number; weight: number };
const healthColor = (v: number) => v >= 80 ? '#34d399' : v >= 65 ? '#38bdf8' : v >= 50 ? '#fbbf24' : '#f87171';

export function BrandHealthGauge({ score, grade }: { score: number; grade: string }) {
  const R = 80, C = 100, sw = 16;
  const start = 135, sweep = 270; // arco 270°
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (deg: number) => [C + R * Math.cos(rad(deg)), C + R * Math.sin(rad(deg))];
  const arc = (frac: number) => {
    const a0 = start, a1 = start + sweep * frac;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const large = sweep * frac > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };
  const col = healthColor(score);
  return (
    <svg viewBox="0 0 200 190" className="w-full" style={{ maxHeight: 260 }}>
      <path d={arc(1)} fill="none" stroke="#1e2a4a" strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(Math.max(0.001, score / 100))} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
      <text x={C} y={C - 4} textAnchor="middle" fontSize="46" fontWeight={800} fill="#f1f5f9">{score}</text>
      <text x={C} y={C + 22} textAnchor="middle" fontSize="13" fill={col} fontWeight={700} letterSpacing="1">{grade.toUpperCase()}</text>
      <text x={C} y={C + 40} textAnchor="middle" fontSize="10" fill="#64748b">Brand Health Index</text>
    </svg>
  );
}

export function HealthBars({ components }: { components: HealthComponent[] }) {
  return (
    <div className="flex flex-col gap-3">
      {components.map((c) => (
        <div key={c.key} className="flex items-center gap-2 text-sm">
          <span className="w-28 shrink-0 text-slate-300">{c.label}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700/40">
            <div className="h-full rounded-full" style={{ width: `${c.value}%`, backgroundColor: healthColor(c.value) }} />
          </div>
          <span className="w-10 shrink-0 text-right text-xs tabular-nums text-slate-400">{c.value}</span>
          <span className="w-12 shrink-0 text-right text-[10px] text-slate-600">{Math.round(c.weight * 100)}% wt</span>
        </div>
      ))}
    </div>
  );
}

export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const W = 300, H = 56, pad = 4;
  const min = Math.min(...values), max = Math.max(...values);
  const range = Math.max(1, max - min);
  const x = (i: number) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const y = (v: number) => H - pad - ((v - min) / range) * (H - pad * 2);
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  const last = values[values.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 60 }}>
      <polyline points={pts} fill="none" stroke={healthColor(last)} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last)} r="3" fill={healthColor(last)} />
    </svg>
  );
}

// ── 2b. Emotion Radar ─────────────────────────────────────────────────────
type EmotionSlice = { emotion: string; value: number; share: number };
const EMOTION_LABEL: Record<string, string> = {
  joy: 'Joy', trust: 'Trust', fear: 'Fear', anger: 'Anger', sadness: 'Sadness', surprise: 'Surprise',
};

export function EmotionRadar({ data }: { data: EmotionSlice[] }) {
  const rows = data.map((d) => ({ ...d, label: EMOTION_LABEL[d.emotion] ?? d.emotion }));
  return (
    <ResponsiveContainer width="100%" height={420}>
      <RadarChart data={rows} outerRadius="72%">
        <PolarGrid stroke="#1e2a4a" />
        <PolarAngleAxis dataKey="label" tick={{ fill: '#cbd5e1', fontSize: 13 }} />
        <PolarRadiusAxis angle={90} tick={{ fill: '#64748b', fontSize: 10 }} stroke="#1e2a4a" />
        <Tooltip contentStyle={TOOLTIP}
          content={({ payload }) => {
            const p = payload?.[0]?.payload as (EmotionSlice & { label: string }) | undefined;
            if (!p) return null;
            return (
              <div style={TOOLTIP} className="px-3 py-2">
                <p className="font-semibold text-slate-100">{p.label}</p>
                <p>{p.value} mentions · {p.share}%</p>
              </div>
            );
          }} />
        <Radar dataKey="share" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.4} strokeWidth={2} isAnimationActive={false} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ── 6. Mappa geografica (proportional-symbol, equirettangolare) ───────────
type GeoPoint = {
  lang: string; country: string; flag: string;
  lon: number; lat: number; volume: number; sentiment: number | null; share: number;
};

export function GeoBubbleMap({ points }: { points: GeoPoint[] }) {
  const W = 1000, H = 500;
  const px = (lon: number) => ((lon + 180) / 360) * W;
  const py = (lat: number) => ((90 - lat) / 180) * H;
  const maxVol = Math.max(1, ...points.map((p) => p.volume));
  const r = (v: number) => 8 + Math.sqrt(v / maxVol) * 32;
  const col = (s: number | null) => s === null ? '#64748b' : s > 0.15 ? '#34d399' : s < -0.15 ? '#f87171' : '#94a3b8';
  // Etichette dei continenti come riferimento leggero (nessun path pesante).
  const continents = [
    ['NORTH AMERICA', -100, 45], ['SOUTH AMERICA', -60, -15], ['EUROPE', 15, 54],
    ['AFRICA', 20, 3], ['ASIA', 90, 48], ['OCEANIA', 134, -25],
  ] as const;
  const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const parallels = [60, 30, 0, -30, -60];
  const sorted = [...points].sort((a, b) => b.volume - a.volume);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 520 }}>
      <defs>
        <radialGradient id="geoGlow" cx="50%" cy="42%" r="65%">
          <stop offset="0%" stopColor="#0f2036" />
          <stop offset="100%" stopColor="#0a0f1f" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width={W} height={H} rx="14" fill="url(#geoGlow)" stroke="#1e2a4a" />
      {/* graticola */}
      {meridians.map((m) => <line key={`m${m}`} x1={px(m)} y1="0" x2={px(m)} y2={H} stroke="#1b2740" strokeWidth="1" />)}
      {parallels.map((p) => <line key={`p${p}`} x1="0" y1={py(p)} x2={W} y2={py(p)} stroke="#1b2740" strokeWidth="1" />)}
      {continents.map(([name, lon, lat]) => (
        <text key={name} x={px(lon as number)} y={py(lat as number)} textAnchor="middle"
          fontSize="12" fill="#33415580" fontWeight={700} letterSpacing="2">{name}</text>
      ))}
      {/* bolle */}
      {sorted.map((p) => {
        const cx = px(p.lon), cy = py(p.lat), rad = r(p.volume), c = col(p.sentiment);
        return (
          <g key={p.lang}>
            <title>{`${p.country} · ${p.volume} mentions · ${p.share}% · sentiment ${p.sentiment ?? 'n/a'}`}</title>
            <circle cx={cx} cy={cy} r={rad} fill={c} fillOpacity={0.18} stroke={c} strokeOpacity={0.9} strokeWidth={1.5} />
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize={Math.min(26, rad)} >{p.flag}</text>
            {rad > 20 && (
              <text x={cx} y={cy + rad + 13} textAnchor="middle" fontSize="11" fill="#cbd5e1" fontWeight={600}>
                {p.country} · {p.share}%
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function TreemapCell(props: {
  x?: number; y?: number; width?: number; height?: number; name?: string; sentiment?: string; size?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = '', sentiment = 'neutral', size = 0 } = props;
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
