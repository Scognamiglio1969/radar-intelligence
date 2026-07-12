'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip,
  ReferenceLine, Cell, Treemap,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  AreaChart, Area, Legend,
} from 'recharts';

import { WORLD, WORLD_VIEWBOX } from '@/lib/world-geo';

const SERIES_COLORS = ['#38bdf8', '#a78bfa', '#34d399', '#fbbf24', '#f87171', '#f472b6', '#22d3ee', '#c084fc'];

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

// ── 4. Rete degli influencer (force-directed) ─────────────────────────────
type NetNode = { id: string; label: string; community: string; source: string; posts: number; engagement: number };
type NetEdge = { a: string; b: string };

export function InfluencerNetwork({ nodes, edges, communities }: {
  nodes: NetNode[]; edges: NetEdge[]; communities: string[];
}) {
  const W = 1000, H = 600, cx = W / 2, cy = H / 2;
  const commColor = (c: string) => SERIES_COLORS[communities.indexOf(c) % SERIES_COLORS.length];
  const maxEng = Math.max(1, ...nodes.map((n) => n.engagement));
  const nr = (e: number) => 7 + Math.sqrt(e / maxEng) * 26;

  // Layout force-directed deterministico (init su cerchio, poi rilassamento).
  type P = { id: string; x: number; y: number; vx: number; vy: number };
  const pts = new Map<string, P>();
  nodes.forEach((n, i) => {
    const a = (i / nodes.length) * Math.PI * 2;
    pts.set(n.id, { id: n.id, x: cx + Math.cos(a) * 200, y: cy + Math.sin(a) * 200, vx: 0, vy: 0 });
  });
  const arr = [...pts.values()];
  for (let iter = 0; iter < 300; iter++) {
    // repulsione
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i], b = arr[j];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d2 = dx * dx + dy * dy || 0.01;
        const f = 5200 / d2;
        const d = Math.sqrt(d2), ux = dx / d, uy = dy / d;
        a.vx -= ux * f; a.vy -= uy * f; b.vx += ux * f; b.vy += uy * f;
      }
    }
    // attrazione lungo gli archi
    for (const e of edges) {
      const a = pts.get(e.a), b = pts.get(e.b); if (!a || !b) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      a.vx += dx * 0.01; a.vy += dy * 0.01; b.vx -= dx * 0.01; b.vy -= dy * 0.01;
    }
    // gravità al centro + integrazione con smorzamento
    for (const p of arr) {
      p.vx += (cx - p.x) * 0.005; p.vy += (cy - p.y) * 0.005;
      p.x += p.vx * 0.5; p.y += p.vy * 0.5; p.vx *= 0.82; p.vy *= 0.82;
    }
  }
  // clamp in cornice
  for (const n of nodes) {
    const p = pts.get(n.id)!; const r = nr(n.engagement);
    p.x = Math.max(r + 8, Math.min(W - r - 8, p.x));
    p.y = Math.max(r + 8, Math.min(H - r - 20, p.y));
  }

  const sorted = [...nodes].sort((a, b) => b.engagement - a.engagement);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 620 }}>
      <rect x="0" y="0" width={W} height={H} rx="14" fill="#0a0f1f" />
      {edges.map((e, i) => {
        const a = pts.get(e.a), b = pts.get(e.b); if (!a || !b) return null;
        return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#334155" strokeOpacity={0.4} strokeWidth={1} />;
      })}
      {sorted.map((n) => {
        const p = pts.get(n.id)!; const r = nr(n.engagement); const c = commColor(n.community);
        return (
          <g key={n.id}>
            <title>{`${n.label} · ${n.community} · ${n.posts} posts · engagement ${n.engagement.toLocaleString('en-US')}`}</title>
            <circle cx={p.x} cy={p.y} r={r} fill={c} fillOpacity={0.28} stroke={c} strokeWidth={1.5} />
            {r > 13 && <text x={p.x} y={p.y + r + 12} textAnchor="middle" fontSize="10" fill="#cbd5e1">{n.label}</text>}
          </g>
        );
      })}
    </svg>
  );
}

// ── 3. Flusso della conversazione (Sankey Fonte → Topic → Sentiment) ──────
type FlowNode = { key: string; label: string; layer: number; value: number; kind: string };
type FlowLink = { source: string; target: string; value: number };

export function SankeyFlow({ nodes, links, sourceColors }: {
  nodes: FlowNode[]; links: FlowLink[]; sourceColors: Record<string, string>;
}) {
  // Multi-selezione indipendente: un set di fonti e un set di sentiment.
  // Il flusso mostrato è l'INCROCIO (es. 2 fonti × solo "negative").
  const [selSrc, setSelSrc] = useState<Set<string>>(new Set());
  const [selSent, setSelSent] = useState<Set<string>>(new Set());
  const toggle = (setter: Dispatch<SetStateAction<Set<string>>>, key: string) =>
    setter((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const W = 1000, H = 580, nw = 14, gap = 14, pad = 10;
  const colX = [40, W / 2 - nw / 2, W - 40 - nw];
  const sentCol: Record<string, string> = { positive: '#34d399', neutral: '#94a3b8', negative: '#f87171' };
  const nodeColor = (n: FlowNode) =>
    n.kind === 'source' ? (sourceColors[n.label] ?? '#38bdf8')
      : n.kind === 'topic' ? '#64748b' : (sentCol[n.kind] ?? '#94a3b8');

  const layers = [0, 1, 2].map((l) => nodes.filter((n) => n.layer === l).sort((a, b) => b.value - a.value));
  const layerTotal = layers.map((ns) => ns.reduce((s, n) => s + n.value, 0));
  const maxTotal = Math.max(1, ...layerTotal);
  const scale = (H - pad * 2 - gap * (Math.max(...layers.map((l) => l.length)) - 1)) / maxTotal;

  const pos = new Map<string, { x: number; y: number; h: number }>();
  layers.forEach((ns, li) => {
    const totalH = ns.reduce((s, n) => s + n.value * scale, 0) + gap * (ns.length - 1);
    let y = (H - totalH) / 2;
    for (const n of ns) {
      const h = Math.max(2, n.value * scale);
      pos.set(n.key, { x: colX[li], y, h });
      y += h + gap;
    }
  });

  // Per ogni topic: da quali fonti riceve e verso quali sentiment va.
  const srcOfTopic = new Map<string, Set<string>>();
  const sentOfTopic = new Map<string, Set<string>>();
  for (const l of links) {
    if (l.target.startsWith('t:')) { (srcOfTopic.get(l.target) ?? srcOfTopic.set(l.target, new Set()).get(l.target)!).add(l.source); }
    else if (l.source.startsWith('t:')) { (sentOfTopic.get(l.source) ?? sentOfTopic.set(l.source, new Set()).get(l.source)!).add(l.target); }
  }
  const hasS = selSrc.size > 0, hasX = selSent.size > 0, anySel = hasS || hasX;
  const topicOnPath = (t: string): boolean => {
    const sOk = !hasS || [...(srcOfTopic.get(t) ?? [])].some((s) => selSrc.has(s));
    const xOk = !hasX || [...(sentOfTopic.get(t) ?? [])].some((x) => selSent.has(x));
    return sOk && xOk;
  };
  const isActive = (l: FlowLink): boolean => {
    if (!anySel) return true;
    if (l.target.startsWith('t:')) return topicOnPath(l.target) && (!hasS || selSrc.has(l.source));
    return topicOnPath(l.source) && (!hasX || selSent.has(l.target));
  };
  const activeNodeKeys = new Set<string>();
  for (const l of links) if (isActive(l)) { activeNodeKeys.add(l.source); activeNodeKeys.add(l.target); }
  const nodeActive = (n: FlowNode): boolean => !anySel || activeNodeKeys.has(n.key);

  const srcOff = new Map<string, number>();
  const tgtOff = new Map<string, number>();
  const ribbons = links
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((l, i) => {
      const s = pos.get(l.source), t = pos.get(l.target);
      if (!s || !t) return null;
      const th = Math.max(1, l.value * scale);
      const sy = s.y + (srcOff.get(l.source) ?? 0) + th / 2;
      const ty = t.y + (tgtOff.get(l.target) ?? 0) + th / 2;
      srcOff.set(l.source, (srcOff.get(l.source) ?? 0) + th);
      tgtOff.set(l.target, (tgtOff.get(l.target) ?? 0) + th);
      const x0 = s.x + nw, x1 = t.x, mx = (x0 + x1) / 2;
      const srcNode = nodes.find((n) => n.key === l.source)!;
      const tgtNode = nodes.find((n) => n.key === l.target)!;
      const c = tgtNode.kind !== 'topic' ? (sentCol[tgtNode.kind] ?? '#64748b') : (sourceColors[srcNode.label] ?? '#64748b');
      return (
        <path key={i} d={`M${x0},${sy} C${mx},${sy} ${mx},${ty} ${x1},${ty}`}
          fill="none" stroke={c} strokeOpacity={isActive(l) ? 0.42 : 0.04} strokeWidth={th}
          style={{ transition: 'stroke-opacity .15s' }} />
      );
    });

  const sources = layers[0], sentiments = layers[2];
  const Chip = ({ node, sel }: { node: FlowNode; sel: Set<string> }) => {
    const on = sel.has(node.key);
    const set = node.kind === 'source' ? setSelSrc : setSelSent;
    return (
      <button onClick={() => toggle(set, node.key)}
        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-sky-400 bg-sky-500/15 text-slate-100' : 'border-[var(--border)] text-slate-400 hover:text-slate-200'}`}>
        <span className="size-2.5 rounded-full" style={{ backgroundColor: nodeColor(node) }} />{node.label}
      </button>
    );
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-600">Sources:</span>
        {sources.map((n) => <Chip key={n.key} node={n} sel={selSrc} />)}
        <span className="ml-2 mr-1 text-[11px] uppercase tracking-wide text-slate-600">Sentiment:</span>
        {sentiments.map((n) => <Chip key={n.key} node={n} sel={selSent} />)}
        {anySel && (
          <button onClick={() => { setSelSrc(new Set()); setSelSent(new Set()); }}
            className="ml-1 rounded-full px-2.5 py-1 text-xs text-sky-400 hover:text-sky-300">clear ✕</button>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 600 }}>
        {ribbons}
        {nodes.map((n) => {
          const p = pos.get(n.key); if (!p) return null;
          const c = nodeColor(n);
          const rightSide = n.layer === 2;
          const midSide = n.layer === 1;
          const clickable = n.layer !== 1;
          const dim = !nodeActive(n);
          const onNode = clickable ? () => toggle(n.kind === 'source' ? setSelSrc : setSelSent, n.key) : undefined;
          return (
            <g key={n.key} opacity={dim ? 0.3 : 1} onClick={onNode}
              style={{ cursor: clickable ? 'pointer' : 'default', transition: 'opacity .15s' }}>
              <title>{`${n.label} · ${n.value}`}</title>
              <rect x={p.x} y={p.y} width={nw} height={p.h} rx={3} fill={c} />
              <text x={rightSide ? p.x - 6 : p.x + nw + 6} y={p.y + p.h / 2}
                textAnchor={rightSide ? 'end' : 'start'} dominantBaseline="middle"
                fontSize={midSide ? 12 : 13} fontWeight={n.layer === 1 ? 400 : 600}
                fill={n.layer === 1 ? '#cbd5e1' : '#e2e8f0'}>{n.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ── 1. Share of Voice nel tempo (area 100% impilata = quota reale) ────────
type SovRow = { day: string;[k: string]: number | string };

export function ShareOfVoiceStream({ entities, days }: { entities: string[]; days: SovRow[] }) {
  // Ordino le entità per volume totale (la più grande in basso, base stabile).
  const totals = new Map(entities.map((e) => [e, days.reduce((s, d) => s + Number(d[e] ?? 0), 0)]));
  const ordered = [...entities].sort((a, b) => (totals.get(b) ?? 0) - (totals.get(a) ?? 0));
  const colOf = (e: string) => SERIES_COLORS[entities.indexOf(e) % SERIES_COLORS.length];
  return (
    <ResponsiveContainer width="100%" height={440}>
      <AreaChart data={days} stackOffset="expand" margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <XAxis dataKey="day" tick={{ fill: '#7c8cab', fontSize: 11 }} tickLine={false}
          tickFormatter={(d: string) => d.slice(5)} minTickGap={28} />
        <YAxis tickFormatter={(v: number) => `${Math.round(v * 100)}%`} tick={{ fill: '#7c8cab', fontSize: 11 }} tickLine={false} width={40} />
        <Tooltip contentStyle={TOOLTIP} labelStyle={{ color: '#e2e8f0' }}
          formatter={(v, name, item) => {
            const row = item?.payload as SovRow | undefined;
            const dayTotal = row ? entities.reduce((s, e) => s + Number(row[e] ?? 0), 0) : 0;
            const n = Number(v);
            const pct = dayTotal ? Math.round((n / dayTotal) * 100) : 0;
            return [`${pct}%  ·  ${n} mentions`, String(name)];
          }} />
        <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
        {ordered.map((e) => (
          <Area key={e} type="monotone" dataKey={e} stackId="1" name={e}
            stroke={colOf(e)} fill={colOf(e)} fillOpacity={0.8} strokeWidth={0} />
        ))}
      </AreaChart>
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

export function BrandHealthGauge({ score, grade, label = 'Health Index' }: { score: number; grade: string; label?: string }) {
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
      <text x={C} y={C + 40} textAnchor="middle" fontSize="10" fill="#64748b">{label}</text>
    </svg>
  );
}

const riskColor = (v: number) => v >= 75 ? '#f87171' : v >= 50 ? '#fb923c' : v >= 25 ? '#fbbf24' : '#34d399';

export function RiskGauge({ risk, level }: { risk: number; level: string }) {
  const R = 80, C = 100, sw = 16;
  const start = 135, sweep = 270;
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const pt = (deg: number) => [C + R * Math.cos(rad(deg)), C + R * Math.sin(rad(deg))];
  const arc = (frac: number) => {
    const a0 = start, a1 = start + sweep * frac;
    const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
    const large = sweep * frac > 180 ? 1 : 0;
    return `M ${x0} ${y0} A ${R} ${R} 0 ${large} 1 ${x1} ${y1}`;
  };
  const col = riskColor(risk);
  return (
    <svg viewBox="0 0 200 190" className="w-full" style={{ maxHeight: 260 }}>
      <path d={arc(1)} fill="none" stroke="#1e2a4a" strokeWidth={sw} strokeLinecap="round" />
      <path d={arc(Math.max(0.001, risk / 100))} fill="none" stroke={col} strokeWidth={sw} strokeLinecap="round" />
      <text x={C} y={C - 4} textAnchor="middle" fontSize="46" fontWeight={800} fill="#f1f5f9">{risk}</text>
      <text x={C} y={C + 22} textAnchor="middle" fontSize="13" fill={col} fontWeight={700} letterSpacing="1">{level.toUpperCase()}</text>
      <text x={C} y={C + 40} textAnchor="middle" fontSize="10" fill="#64748b">Risk index</text>
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

type CompareItem = { name: string; score: number; total: number; isBrand: boolean };
export function CompareBars({ items }: { items: CompareItem[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((c) => (
        <div key={c.name} className="flex items-center gap-2 text-sm">
          <span className={`w-32 shrink-0 truncate ${c.isBrand ? 'font-semibold text-amber-300' : 'text-slate-300'}`}>
            {c.isBrand ? '★ ' : ''}{c.name}
          </span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-700/40">
            <div className="h-full rounded-full" style={{ width: `${c.score}%`, backgroundColor: c.isBrand ? '#fbbf24' : healthColor(c.score) }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-slate-400">{c.score}</span>
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

// ── 6. Mappa geografica (choropleth su mappa mondiale reale) ──────────────
type GeoPoint = {
  lang: string; country: string; flag: string; iso: string[];
  volume: number; sentiment: number | null; share: number;
};

export function GeoBubbleMap({ points }: { points: GeoPoint[] }) {
  const sentCol = (s: number | null) => s === null ? '#64748b' : s > 0.15 ? '#34d399' : s < -0.15 ? '#f87171' : '#60a5fa';
  const maxShare = Math.max(1, ...points.map((p) => p.share));
  const fmtShare = (s: number) => s < 0.1 ? '<0.1%' : `${s}%`;

  // Ogni paese → la lingua con più volume che lo rivendica (risolve i paesi
  // condivisi, es. Canada EN/FR, Svizzera DE/FR).
  const claim = new Map<string, GeoPoint>();
  for (const p of [...points].sort((a, b) => b.volume - a.volume)) {
    for (const iso of p.iso) if (!claim.has(iso)) claim.set(iso, p);
  }

  return (
    <svg viewBox={WORLD_VIEWBOX} className="w-full" style={{ maxHeight: 540 }}>
      <defs>
        <radialGradient id="geoGlow" cx="50%" cy="45%" r="70%">
          <stop offset="0%" stopColor="#0d1730" />
          <stop offset="100%" stopColor="#080c18" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="1000" height="500" rx="14" fill="url(#geoGlow)" />
      {WORLD.map((c) => {
        const p = claim.get(c.id);
        if (!p) {
          return <path key={c.id} d={c.d} fill="#141d33" fillOpacity={1} stroke="#0a1122" strokeWidth={0.4}>
            <title>{c.name}</title>
          </path>;
        }
        const col = sentCol(p.sentiment);
        // Opacità = radice della quota (le grandi spiccano, le piccole restano tenui ma visibili).
        const op = 0.45 + Math.sqrt(p.share / maxShare) * 0.5;
        return (
          <path key={c.id} d={c.d} fill={col} fillOpacity={op} stroke={col} strokeOpacity={0.55} strokeWidth={0.5}>
            <title>{`${c.name} · ${p.flag} ${p.country} · ${p.volume} mentions · ${fmtShare(p.share)} · sentiment ${p.sentiment ?? 'n/a'}`}</title>
          </path>
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
