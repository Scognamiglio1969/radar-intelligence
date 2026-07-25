'use client';

import { useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Visualizzazioni della War Room. Vivono qui e non in tv-show.tsx per non
// gonfiare quel file: lì resta la regia delle slide, qui il disegno.
//
// Tutte animano AL MONTAGGIO: la slide viene rimontata a ogni giro (chiave
// React sull'indice), quindi l'animazione riparte ogni volta che la slide
// torna in scena, che è il punto di uno schermo da sala operativa.
// ---------------------------------------------------------------------------

/** Contatore che sale da 0 con easing quando la slide entra. */
export function CountUp({ value, duration = 1600 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n.toLocaleString('en-US')}</>;
}

/** Ritarda l'avvio di un'animazione CSS finché la slide non è in scena. */
function useMounted(delay = 220) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [delay]);
  return on;
}

// ---------------------------------------------------------------------------
// Viaggio attraverso il sistema solare
//
// Il tema monitorato è la stella; i temi di cui si parla sono i pianeti che le
// orbitano attorno, grandi quanto il loro volume. La camera avanza verso la
// stella, quindi le orbite si allargano e i pianeti sfilano ai lati: il campo
// stellare dà la sensazione del movimento. Quando un pianeta ci supera, torna
// in fondo — il viaggio non finisce mai.
// ---------------------------------------------------------------------------
const PLANET_PALETTE = ['#38bdf8', '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#facc15', '#60a5fa', '#f87171'];

export function SolarSystem({ topics, projectName }: {
  topics: { topic: string; n: number }[]; projectName: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0, h = 0, raf = 0;

    const resize = () => {
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const F = 620;              // lunghezza focale della proiezione prospettica
    const TILT = 0.34;          // schiacciamento delle orbite: le vediamo di taglio
    const Z_NEAR = 70, Z_FAR = 1600;

    const list = topics.slice(0, 8);
    const maxN = Math.max(1, ...list.map((t) => t.n));
    const planets = list.map((t, i) => ({
      topic: t.topic,
      color: PLANET_PALETTE[i % PLANET_PALETTE.length],
      orbit: 130 + i * 92,
      angle: Math.random() * Math.PI * 2,
      spin: 0.22 + Math.random() * 0.18,
      // Superficie proporzionale al volume: il raggio va con la radice.
      size: 10 + Math.sqrt(t.n / maxN) * 24,
      z: Z_NEAR + ((i + 0.5) / Math.max(1, list.length)) * (Z_FAR - Z_NEAR),
      ring: i % 3 === 1,
    }));

    const stars = Array.from({ length: 260 }, () => ({
      x: (Math.random() - 0.5) * 3000,
      y: (Math.random() - 0.5) * 3000,
      z: Z_NEAR + Math.random() * (Z_FAR - Z_NEAR),
    }));

    let last = performance.now();
    let t = 0;

    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      t += dt;
      const cx = w / 2, cy = h / 2;
      const travel = dt * 0.16;   // avanzamento della camera

      ctx.clearRect(0, 0, w, h);

      // ── Campo stellare
      for (const s of stars) {
        s.z -= travel;
        if (s.z < Z_NEAR) { s.z = Z_FAR; s.x = (Math.random() - 0.5) * 3000; s.y = (Math.random() - 0.5) * 3000; }
        const k = F / s.z;
        const px = cx + s.x * k, py = cy + s.y * k;
        if (px < -20 || px > w + 20 || py < -20 || py > h + 20) continue;
        const depth = 1 - (s.z - Z_NEAR) / (Z_FAR - Z_NEAR);
        ctx.globalAlpha = 0.15 + depth * 0.65;
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(px, py, Math.max(0.8, depth * 2), Math.max(0.8, depth * 2));
      }
      ctx.globalAlpha = 1;

      // ── La stella: il tema monitorato, al centro, come destinazione
      const pulse = 1 + Math.sin(t / 900) * 0.05;
      const sunR = Math.min(w, h) * 0.075 * pulse;
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 6);
      halo.addColorStop(0, 'rgba(56,189,248,0.42)');
      halo.addColorStop(0.35, 'rgba(56,189,248,0.10)');
      halo.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = halo;
      ctx.beginPath(); ctx.arc(cx, cy, sunR * 6, 0, Math.PI * 2); ctx.fill();

      const core = ctx.createRadialGradient(cx - sunR * 0.3, cy - sunR * 0.3, sunR * 0.1, cx, cy, sunR);
      core.addColorStop(0, '#f0f9ff');
      core.addColorStop(0.5, '#7dd3fc');
      core.addColorStop(1, '#0284c7');
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(cx, cy, sunR, 0, Math.PI * 2); ctx.fill();

      // ── Pianeti: ordinati dal più lontano, così i vicini coprono
      const drawn = planets
        .map((p) => {
          p.angle += (p.spin * dt) / 1000;
          p.z -= travel;
          if (p.z < Z_NEAR) p.z = Z_FAR;
          return p;
        })
        .slice()
        .sort((a, b) => b.z - a.z);

      for (const p of drawn) {
        const k = F / p.z;
        const rx = p.orbit * k, ry = p.orbit * TILT * k;
        const depth = 1 - (p.z - Z_NEAR) / (Z_FAR - Z_NEAR);
        // Dissolvenza a ENTRAMBI gli estremi: il pianeta emerge dal fondo e
        // svanisce mentre ci sfila accanto, invece di restare una macchia
        // enorme e sfocata a schermo prima di sparire di colpo.
        const fade = Math.max(0, Math.min(1, Math.min(depth * 5, (1 - depth) * 5)));
        if (fade <= 0.02) continue;

        // Orbita
        ctx.globalAlpha = fade * 0.16;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();

        const px = cx + Math.cos(p.angle) * rx;
        const py = cy + Math.sin(p.angle) * ry;
        // Tetto al raggio: senza, un pianeta vicino riempie mezzo schermo di
        // sfumatura e smette di leggersi come un pianeta.
        const pr = Math.min(78, Math.max(1.5, p.size * k * 0.55));
        if (px < -200 || px > w + 200 || py < -200 || py > h + 200) continue;

        // Anello, per un paio di pianeti: rompe la monotonia delle sfere
        if (p.ring && pr > 5) {
          ctx.globalAlpha = fade * 0.5;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, pr * 0.14);
          ctx.beginPath(); ctx.ellipse(px, py, pr * 1.9, pr * 0.55, -0.4, 0, Math.PI * 2); ctx.stroke();
        }

        ctx.globalAlpha = fade;
        const g = ctx.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.35, p.color);
        g.addColorStop(1, 'rgba(2,6,23,0.85)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();

        // L'etichetta solo nella fascia in cui è leggibile e utile: sotto è
        // illeggibile, sopra il pianeta è così vicino che il nome finisce
        // lontanissimo dal suo corpo e si accavalla con gli altri.
        if (pr > 7 && pr < 46) {
          ctx.globalAlpha = fade * Math.min(1, (pr - 7) / 8);
          ctx.fillStyle = '#e2e8f0';
          ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.topic, px + pr + 10, py);
        }
      }
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [topics, projectName]);

  return (
    <div className="relative size-full">
      <canvas ref={ref} className="size-full" />
      <div className="pointer-events-none absolute inset-x-0 bottom-[8%] text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-sky-500/70">at the centre</p>
        <p className="mt-1 text-2xl font-black tracking-tight text-slate-100 lg:text-4xl">{projectName}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar delle emozioni: sei assi, poligono che si apre dal centro
// ---------------------------------------------------------------------------
const EMOTION_COLOR: Record<string, string> = {
  joy: '#fbbf24', trust: '#34d399', fear: '#a78bfa',
  anger: '#f87171', sadness: '#60a5fa', surprise: '#f472b6',
};

export function EmotionRadar({ data }: { data: { emotion: string; value: number; share: number }[] }) {
  const on = useMounted();
  const C = 150, R = 108;
  const max = Math.max(1, ...data.map((d) => d.share));
  const pt = (i: number, frac: number) => {
    const a = (i / data.length) * Math.PI * 2 - Math.PI / 2;
    return [C + Math.cos(a) * R * frac, C + Math.sin(a) * R * frac] as const;
  };
  const poly = data.map((d, i) => pt(i, on ? d.share / max : 0).join(',')).join(' ');

  return (
    // Il viewBox è più alto del disegno: l'asse rivolto in basso porta sotto di
    // sé anche la percentuale, che con un riquadro di 300 finirebbe tagliata.
    <svg viewBox="0 0 300 312" className="mx-auto h-full max-h-[46vh] w-auto">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <polygon key={f} points={data.map((_, i) => pt(i, f).join(',')).join(' ')}
          fill="none" stroke="#1e3a5f" strokeWidth="1" />
      ))}
      {data.map((_, i) => {
        const [x, y] = pt(i, 1);
        return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="#1e3a5f" strokeWidth="1" />;
      })}
      <polygon points={poly} fill="rgba(56,189,248,0.20)" stroke="#38bdf8" strokeWidth="2.5"
        style={{ transition: 'all 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }} />
      {data.map((d, i) => {
        const [x, y] = pt(i, on ? d.share / max : 0);
        const [lx, ly] = pt(i, 1.24);
        return (
          <g key={d.emotion}>
            <circle cx={x} cy={y} r="5" fill={EMOTION_COLOR[d.emotion] ?? '#94a3b8'}
              style={{ transition: 'all 1.4s cubic-bezier(0.22, 1, 0.36, 1)' }} />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              fill={EMOTION_COLOR[d.emotion] ?? '#94a3b8'} fontSize="14" fontWeight="700">
              {d.emotion}
            </text>
            <text x={lx} y={ly + 15} textAnchor="middle" dominantBaseline="middle"
              fill="#64748b" fontSize="11">{d.share}%</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Health index: anello che si riempie + sparkline dei 14 giorni
// ---------------------------------------------------------------------------
export function HealthRing({ score, grade, spark }: { score: number; grade: string; spark: number[] }) {
  const on = useMounted();
  const R = 92, CIRC = 2 * Math.PI * R;
  const color = score >= 80 ? '#34d399' : score >= 65 ? '#38bdf8' : score >= 50 ? '#fbbf24' : '#f87171';

  const line = spark.length > 1
    ? spark.map((v, i) => `${(i / (spark.length - 1)) * 260},${70 - (v / 100) * 60}`).join(' ')
    : '';

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <svg viewBox="0 0 240 240" className="h-full max-h-[34vh] w-auto">
        <circle cx="120" cy="120" r={R} fill="none" stroke="#152242" strokeWidth="18" />
        <circle cx="120" cy="120" r={R} fill="none" stroke={color} strokeWidth="18" strokeLinecap="round"
          strokeDasharray={CIRC} strokeDashoffset={on ? CIRC * (1 - score / 100) : CIRC}
          transform="rotate(-90 120 120)"
          style={{ transition: 'stroke-dashoffset 1.8s cubic-bezier(0.22, 1, 0.36, 1)' }} />
        <text x="120" y="112" textAnchor="middle" fill="#f1f5f9" fontSize="58" fontWeight="900">
          <tspan>{on ? score : 0}</tspan>
        </text>
        <text x="120" y="146" textAnchor="middle" fill={color} fontSize="18" fontWeight="700">{grade}</text>
      </svg>
      {line && (
        <svg viewBox="0 0 260 80" className="w-full max-w-[340px]">
          <polyline points={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
            strokeLinejoin="round" opacity="0.9"
            style={{ strokeDasharray: 800, strokeDashoffset: on ? 0 : 800, transition: 'stroke-dashoffset 2s ease-out' }} />
        </svg>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Geografia: barre che crescono, ordinate per volume
// ---------------------------------------------------------------------------
export function GeoBars({ data }: {
  data: { country: string; flag: string; volume: number; sentiment: number | null; share: number }[];
}) {
  const on = useMounted();
  const max = Math.max(1, ...data.map((d) => d.volume));
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {data.map((d, i) => {
        const tone = d.sentiment === null ? '#64748b'
          : d.sentiment > 0.15 ? '#34d399' : d.sentiment < -0.15 ? '#f87171' : '#38bdf8';
        return (
          <div key={d.country} className="flex items-center gap-3">
            <span className="w-8 shrink-0 text-2xl leading-none">{d.flag}</span>
            <span className="w-36 shrink-0 truncate text-base font-semibold text-slate-200 lg:text-lg">{d.country}</span>
            <span className="h-6 flex-1 overflow-hidden rounded-full bg-white/5">
              <span className="block h-full rounded-full"
                style={{
                  width: on ? `${(d.volume / max) * 100}%` : '0%',
                  background: `linear-gradient(90deg, ${tone}cc, ${tone}55)`,
                  transition: `width 1.3s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.09}s`,
                }} />
            </span>
            <span className="w-20 shrink-0 text-right font-mono text-sm tabular-nums text-slate-400">{d.share}%</span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piramide degli autori: pochi che pesano molto, molti che pesano poco
// ---------------------------------------------------------------------------
const TIER_COLOR: Record<string, string> = {
  mega: '#f472b6', macro: '#a78bfa', micro: '#38bdf8', longtail: '#334e73',
};

export function AuthorPyramidChart({ tiers }: {
  tiers: { key: string; label: string; authors: number; sharePct: number }[];
}) {
  const on = useMounted();
  // La larghezza dice QUANTI sono, non quanto pesano: è ciò che rende la forma
  // una piramide vera e non un ornamento — pochi in cima, molti alla base — e
  // rende visibile lo scarto fra popolazione e reach scritto dentro la barra.
  const maxAuthors = Math.max(1, ...tiers.map((t) => t.authors));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5">
      {tiers.map((t, i) => {
        const width = 24 + (t.authors / maxAuthors) * 68;
        return (
          <div key={t.key} className="flex w-full items-center justify-center gap-4">
            <span className="w-28 shrink-0 text-right text-sm font-semibold text-slate-300">{t.label}</span>
            <span
              className="flex h-14 items-center justify-center rounded-lg text-sm font-bold text-slate-950"
              style={{
                width: on ? `${width}%` : '0%',
                backgroundColor: TIER_COLOR[t.key] ?? '#38bdf8',
                transition: `width 1.2s cubic-bezier(0.22, 1, 0.36, 1) ${i * 0.12}s`,
                opacity: 0.9,
              }}>
              {t.sharePct}% of reach
            </span>
            <span className="w-28 shrink-0 text-sm text-slate-500">
              {t.authors.toLocaleString('en-US')} {t.authors === 1 ? 'voice' : 'voices'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quando si parla: griglia giorno × ora, celle che si accendono a cascata
// ---------------------------------------------------------------------------
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function HeatGrid({ grid }: { grid: number[][] }) {
  const max = Math.max(1, ...grid.flat());
  return (
    <div className="flex h-full flex-col justify-center gap-1.5">
      <div className="flex gap-1.5 pl-12 text-[10px] text-slate-600">
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="flex-1 text-center">{h % 3 === 0 ? h : ''}</span>
        ))}
      </div>
      {grid.map((row, d) => (
        <div key={d} className="flex items-center gap-1.5">
          <span className="w-12 shrink-0 text-xs font-medium text-slate-500">{DAYS[d]}</span>
          {row.map((v, h) => (
            <span key={h} className="aspect-square flex-1 rounded-[3px]"
              style={{
                backgroundColor: v === 0 ? 'rgba(255,255,255,0.03)' : `rgba(56,189,248,${0.12 + (v / max) * 0.88})`,
                animation: `tvfade 0.5s cubic-bezier(0.22, 1, 0.36, 1) both`,
                animationDelay: `${(d * 24 + h) * 0.004}s`,
              }} />
          ))}
        </div>
      ))}
    </div>
  );
}
