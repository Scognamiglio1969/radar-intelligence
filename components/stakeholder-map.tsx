'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SOURCE_META } from '@/lib/connectors';

type Node = {
  name: string;
  value: number;
  sentiment: number | null;
  kind: 'entità' | 'voce';
  source?: string;
  posts?: number;
};

function sentimentColor(s: number | null): string {
  if (s === null) return '#64748b';
  if (s > 0.3) return '#34d399';
  if (s > 0.1) return '#6ee7b7';
  if (s < -0.3) return '#f87171';
  if (s < -0.1) return '#fca5a5';
  return '#94a3b8';
}

/**
 * Nuvola di bolle a spirale aurea: i nodi più pesanti stanno al centro,
 * gli altri si dispongono a spirale verso l'esterno. Nessuna dipendenza.
 */
function layout(nodes: Node[], width: number, height: number) {
  const sorted = [...nodes].sort((a, b) => b.value - a.value);
  const max = Math.max(1, sorted[0]?.value ?? 1);
  const cx = width / 2;
  const cy = height / 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const placed: { x: number; y: number; r: number; node: Node }[] = [];

  // Arrotondare a 1 decimale evita mismatch di hydration
  // (server e client serializzano i float in modo diverso)
  const round = (n: number) => Math.round(n * 10) / 10;

  sorted.forEach((node, i) => {
    const r = round(14 + Math.sqrt(node.value / max) * 52);
    // Posizione candidata sulla spirale; si allontana finché non collide
    let dist = i === 0 ? 0 : 40 + Math.sqrt(i) * 46;
    const angle = i * golden;
    for (let attempt = 0; attempt < 220; attempt++) {
      const x = round(cx + Math.cos(angle) * dist * 1.35);
      const y = round(cy + Math.sin(angle) * dist * 0.82);
      const collides = placed.some((p) => {
        const dx = p.x - x, dy = p.y - y;
        return Math.hypot(dx, dy) < p.r + r + 6;
      });
      if (!collides && x - r > 8 && x + r < width - 8 && y - r > 8 && y + r < height - 8) {
        placed.push({ x, y, r, node });
        return;
      }
      dist += 7;
    }
  });
  return placed;
}

function Cloud({ nodes, height = 460 }: { nodes: Node[]; height?: number }) {
  const width = 900;
  const router = useRouter();
  const [hover, setHover] = useState<string | null>(null);
  const placed = useMemo(() => layout(nodes, width, height), [nodes, height]);

  // Click sulla bolla → Ascolto filtrato su quell'attore (prove alla mano)
  const openInListening = (node: Node) => {
    router.push(node.kind === 'voce'
      ? `/listening?autore=${encodeURIComponent(node.name)}`
      : `/listening?q=${encodeURIComponent(node.name)}`);
  };

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img">
      {/* anelli radar decorativi */}
      {[0.22, 0.4, 0.58].map((f) => (
        <ellipse key={f} cx={width / 2} cy={height / 2} rx={width * f} ry={height * f}
          fill="none" stroke="#1e2a4a" strokeDasharray="3 6" strokeWidth="1" />
      ))}
      {placed.map(({ x, y, r, node }) => {
        const active = hover === node.name;
        const color = sentimentColor(node.sentiment);
        return (
          <g key={`${node.kind}:${node.name}`}
            onMouseEnter={() => setHover(node.name)}
            onMouseLeave={() => setHover(null)}
            onClick={() => openInListening(node)}
            style={{ cursor: 'pointer' }}>
            <circle cx={x} cy={y} r={r}
              fill={color} fillOpacity={active ? 0.35 : 0.16}
              stroke={color} strokeOpacity={active ? 1 : 0.55}
              strokeWidth={active ? 2 : 1.25}
              style={{ transition: 'all 0.2s' }} />
            <text x={x} y={r > 26 ? y : y - r - 6} textAnchor="middle"
              fill={active ? '#f1f5f9' : '#cbd5e1'}
              fontSize={Math.round(Math.max(10, Math.min(16, r / 2.6)))}
              fontWeight={r > 40 ? 700 : 500}
              dominantBaseline={r > 26 ? 'middle' : 'auto'}>
              {node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name}
            </text>
            {active && (
              <text x={x} y={r > 26 ? y + 16 : y - r + 10} textAnchor="middle" fill="#7c8cab" fontSize="10">
                {node.kind === 'voce'
                  ? `${node.posts} posts · ${SOURCE_META[node.source ?? '']?.label ?? node.source} · eng ${node.value.toLocaleString('en-US')}`
                  : `${node.value} mentions`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function StakeholderMap({ entities, authors }: { entities: Node[]; authors: Node[] }) {
  const [tab, setTab] = useState<'entità' | 'voci'>('entità');
  const nodes = tab === 'entità' ? entities : authors;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setTab('entità')}
          className={`rounded-full px-4 py-1.5 text-sm transition ${tab === 'entità' ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}>
          Who is discussed ({entities.length})
        </button>
        <button onClick={() => setTab('voci')}
          className={`rounded-full px-4 py-1.5 text-sm transition ${tab === 'voci' ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-slate-400 hover:text-slate-200'}`}>
          Who is talking ({authors.length})
        </button>
        <span className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> positive</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400/70" /> neutral</span>
          <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> negative</span>
        </span>
      </div>
      <div className="panel overflow-hidden px-2 py-2">
        {nodes.length ? <Cloud nodes={nodes} /> : (
          <p className="py-20 text-center text-sm text-slate-500">No actors in this view.</p>
        )}
      </div>
      <p className="text-[11px] text-slate-600">
        “Who is discussed”: people, companies and products cited in the content (extracted by AI).
        “Who is talking”: the accounts with the most engagement. Hover for details, <span className="text-sky-400">click a bubble to see its mentions</span>.
      </p>
    </div>
  );
}
