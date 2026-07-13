'use client';

import { useEffect, useRef, useState } from 'react';

type Star = { si: number; s: number; e: number; age: number };
type Source = { id: string; label: string; color: string; count: number };
type Props = {
  title: string; core: number; grade: string; total: number; avgSentiment: number;
  sources: Source[]; stars: Star[];
};

// Pseudo-random deterministico (posizioni stabili tra i frame).
function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const bucketOf = (s: number): 'positive' | 'neutral' | 'negative' =>
  s > 0.15 ? 'positive' : s < -0.15 ? 'negative' : 'neutral';
const coreColor = (v: number) => v >= 80 ? '#7ef7c2' : v >= 65 ? '#ffd98a' : v >= 50 ? '#ffb45e' : '#ff7a6b';

// Colori "naturali" dei satelliti di sentiment (toni minerali, non neon).
const MOON: Record<string, { base: string; lit: string }> = {
  positive: { base: '#2f9e6e', lit: '#a9f0cd' },
  neutral: { base: '#5b7ba6', lit: '#cfe2ff' },
  negative: { base: '#b0473f', lit: '#ffb3a3' },
};

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
const mix = (a: [number, number, number], b: [number, number, number], t: number): string =>
  `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;

export function ConversationGalaxy({ title, core, grade, total, avgSentiment, sources, stars }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selSrc, setSelSrc] = useState<Set<number>>(new Set());
  const [selSent, setSelSent] = useState<Set<string>>(new Set());
  const selSrcRef = useRef(selSrc); selSrcRef.current = selSrc;
  const selSentRef = useRef(selSent); selSentRef.current = selSent;
  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, k: T) =>
    set((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const N = Math.max(1, sources.length);

    // Split di sentiment per fonte → dimensione dei 3 satelliti (scala 1..10).
    const split = sources.map((_, i) => {
      let pos = 0, neu = 0, neg = 0;
      for (const st of stars) {
        if (st.si !== i) continue;
        const b = bucketOf(st.s);
        if (b === 'positive') pos++; else if (b === 'negative') neg++; else neu++;
      }
      const tot = Math.max(1, pos + neu + neg);
      const ten = (v: number) => v === 0 ? 0 : Math.max(1, Math.round((v / tot) * 10));
      return { pos: ten(pos), neu: ten(neu), neg: ten(neg), nPos: pos, nNeu: neu, nNeg: neg, tot };
    });

    const maxCount = Math.max(1, ...sources.map((s) => s.count));

    // Pianeti su orbite annidate attorno al sole.
    const planets = sources.map((src, i) => ({
      i,
      theta: rand(i * 13.7) * Math.PI * 2,
      dist: 150 + (N === 1 ? 130 : (i / (N - 1)) * 210),
      spd: 0.000055 * (1 + (N - i) * 0.16),
      r: 11 + Math.sqrt(src.count / maxCount) * 15,
      rgb: hexToRgb(src.color),
    }));
    // 3 satelliti per pianeta: positive / neutral / negative.
    type Moon = { si: number; bucket: 'positive' | 'neutral' | 'negative'; ten: number; orbR: number; phase: number; spd: number; incl: number };
    const moons: Moon[] = [];
    planets.forEach((p, i) => {
      const sp = split[i];
      const defs: ['positive' | 'neutral' | 'negative', number][] = [
        ['positive', sp.pos], ['neutral', sp.neu], ['negative', sp.neg],
      ];
      defs.forEach(([bucket, ten], k) => {
        if (ten <= 0) return;
        moons.push({
          si: i, bucket, ten,
          orbR: p.r + 14 + k * 11,
          phase: rand(i * 31 + k * 7) * Math.PI * 2,
          spd: 0.00075 - k * 0.00018,
          incl: (rand(i * 17 + k * 3) - 0.5) * 0.9,
        });
      });
    });

    // Starfield + nebulose (normalizzati, ricalcolati al resize).
    const bgStars = Array.from({ length: 240 }, (_, i) => ({
      nx: rand(i * 3.3), ny: rand(i * 8.9),
      r: 0.3 + rand(i * 5.1) * 1.1,
      tw: rand(i * 2.7) * Math.PI * 2,
      spdTw: 0.001 + rand(i * 6.3) * 0.003,
    }));

    let W = 0, H = 0, cx = 0, cy = 0, dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rect.width; H = rect.height; cx = W / 2; cy = H / 2;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(canvas);

    const tilt = 0.46, camZ = 660, FOV = 720;
    const cosX = Math.cos(tilt), sinX = Math.sin(tilt);
    let rotY = 0.4, vel = 0.0012, dragging = false, lastX = 0, idle = 0;
    const AUTO = 0.0012;
    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; idle = 0; canvas.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.0008; rotY += dx * 0.006; };
    const onUp = () => { dragging = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const project = (x: number, y: number, z: number, cY: number, sY: number) => {
      const x1 = x * cY + z * sY, z1 = -x * sY + z * cY;
      const y2 = y * cosX - z1 * sinX, z2 = y * sinX + z1 * cosX;
      const persp = FOV / (camZ - z2);
      return { sx: cx + x1 * persp, sy: cy - y2 * persp, z: z2, persp };
    };

    // Sfera "fotografica": luce dal sole (al centro dello schermo, c0),
    // gradiente spostato verso il lato illuminato, terminatore morbido,
    // lato notte quasi nero, sottile rim light.
    const drawSphere = (
      sx: number, sy: number, r: number,
      rgb: [number, number, number], litRgb: [number, number, number],
      sunX: number, sunY: number, alpha: number,
    ) => {
      const dx = sunX - sx, dy = sunY - sy;
      const d = Math.hypot(dx, dy) || 1;
      const lx = sx + (dx / d) * r * 0.5, ly = sy + (dy / d) * r * 0.5;
      const g = ctx.createRadialGradient(lx, ly, r * 0.08, sx, sy, r * 1.02);
      g.addColorStop(0, mix(litRgb, [255, 255, 255], 0.35));
      g.addColorStop(0.28, mix(rgb, litRgb, 0.55));
      g.addColorStop(0.62, mix(rgb, [8, 10, 18], 0.35));
      g.addColorStop(1, 'rgb(5,7,13)');
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fillStyle = g; ctx.fill();
      // rim light sul bordo illuminato
      ctx.save();
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.clip();
      const rim = ctx.createRadialGradient(lx, ly, r * 0.7, lx, ly, r * 1.5);
      rim.addColorStop(0, 'rgba(255,255,255,0.12)'); rim.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rim; ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      ctx.restore();
      ctx.globalAlpha = 1;
    };

    let raf = 0, t0 = performance.now(), clock = 0;
    const frame = (now: number) => {
      const dt = Math.min(50, now - t0); t0 = now;
      if (!reduce) clock += dt;
      if (!dragging) { idle += dt; if (idle > 400) vel += (AUTO - vel) * 0.02; }
      if (!reduce) rotY += vel * (dt / 16.7);
      const cY = Math.cos(rotY), sY = Math.sin(rotY);
      const selS = selSrcRef.current, selX = selSentRef.current;
      const planetOn = (i: number) => selS.size === 0 || selS.has(i);
      const moonOn = (m: Moon) => planetOn(m.si) && (selX.size === 0 || selX.has(m.bucket));

      // ── Cielo: nero profondo + nebulose + stelline che brillano ──
      ctx.fillStyle = '#020308';
      ctx.fillRect(0, 0, W, H);
      const neb1 = ctx.createRadialGradient(W * 0.78, H * 0.22, 0, W * 0.78, H * 0.22, W * 0.5);
      neb1.addColorStop(0, 'rgba(38,52,110,0.16)'); neb1.addColorStop(1, 'transparent');
      ctx.fillStyle = neb1; ctx.fillRect(0, 0, W, H);
      const neb2 = ctx.createRadialGradient(W * 0.15, H * 0.8, 0, W * 0.15, H * 0.8, W * 0.45);
      neb2.addColorStop(0, 'rgba(74,38,110,0.12)'); neb2.addColorStop(1, 'transparent');
      ctx.fillStyle = neb2; ctx.fillRect(0, 0, W, H);
      for (const b of bgStars) {
        const tw = reduce ? 0.7 : 0.45 + 0.55 * Math.abs(Math.sin(clock * b.spdTw + b.tw));
        ctx.beginPath();
        ctx.fillStyle = `rgba(235,240,255,${0.25 + tw * 0.55})`;
        ctx.arc(b.nx * W, b.ny * H, b.r * tw, 0, Math.PI * 2); ctx.fill();
      }

      // posizione del sole a schermo
      const c0 = project(0, 0, 0, cY, sY);
      const sunR = 34 * c0.persp;
      const cc = coreColor(core);
      const ccRgb = hexToRgb(cc);

      // orbite: appena percettibili
      ctx.strokeStyle = 'rgba(255,255,255,0.045)'; ctx.lineWidth = 1;
      for (const p of planets) {
        ctx.beginPath();
        for (let k = 0; k <= 60; k++) {
          const a = (k / 60) * Math.PI * 2;
          const pr = project(p.dist * Math.cos(a), 0, p.dist * Math.sin(a), cY, sY);
          k === 0 ? ctx.moveTo(pr.sx, pr.sy) : ctx.lineTo(pr.sx, pr.sy);
        }
        ctx.stroke();
      }

      // ── Corpi celesti con depth sort (sole, pianeti, lune) ──
      type Body = { z: number; draw: () => void };
      const bodies: Body[] = [];

      // Sole fotografico: nucleo bianco-caldo, fotosfera, corona lunga, flare.
      bodies.push({
        z: c0.z, draw: () => {
          const halo = ctx.createRadialGradient(c0.sx, c0.sy, 0, c0.sx, c0.sy, sunR * 7);
          halo.addColorStop(0, `rgba(${ccRgb[0]},${ccRgb[1]},${ccRgb[2]},0.5)`);
          halo.addColorStop(0.25, `rgba(${ccRgb[0]},${ccRgb[1]},${ccRgb[2]},0.13)`);
          halo.addColorStop(1, 'transparent');
          ctx.fillStyle = halo;
          ctx.beginPath(); ctx.arc(c0.sx, c0.sy, sunR * 7, 0, Math.PI * 2); ctx.fill();
          // flare orizzontale (lente)
          const flare = ctx.createLinearGradient(c0.sx - sunR * 6, c0.sy, c0.sx + sunR * 6, c0.sy);
          flare.addColorStop(0, 'transparent');
          flare.addColorStop(0.5, `rgba(255,250,235,${reduce ? 0.14 : 0.1 + 0.05 * Math.sin(clock * 0.0012)})`);
          flare.addColorStop(1, 'transparent');
          ctx.fillStyle = flare;
          ctx.fillRect(c0.sx - sunR * 6, c0.sy - 1.2, sunR * 12, 2.4);
          // fotosfera
          const ph = ctx.createRadialGradient(c0.sx - sunR * 0.2, c0.sy - sunR * 0.2, 0, c0.sx, c0.sy, sunR);
          ph.addColorStop(0, '#ffffff');
          ph.addColorStop(0.45, '#fff6dc');
          ph.addColorStop(0.85, cc);
          ph.addColorStop(1, mix(ccRgb, [40, 20, 5], 0.35));
          ctx.beginPath(); ctx.arc(c0.sx, c0.sy, sunR, 0, Math.PI * 2);
          ctx.fillStyle = ph; ctx.fill();
        },
      });

      // Pianeti + etichette
      const planetScreen: { sx: number; sy: number; r: number; z: number }[] = [];
      for (const p of planets) {
        const ang = p.theta + p.spd * clock;
        const wx = p.dist * Math.cos(ang), wz = p.dist * Math.sin(ang);
        const pr = project(wx, 0, wz, cY, sY);
        const r = p.r * pr.persp;
        planetScreen[p.i] = { sx: pr.sx, sy: pr.sy, r, z: pr.z };
        const on = planetOn(p.i);
        const lit: [number, number, number] = [
          Math.round(p.rgb[0] + (255 - p.rgb[0]) * 0.55),
          Math.round(p.rgb[1] + (255 - p.rgb[1]) * 0.55),
          Math.round(p.rgb[2] + (255 - p.rgb[2]) * 0.55),
        ];
        bodies.push({
          z: pr.z, draw: () => {
            drawSphere(pr.sx, pr.sy, r, p.rgb, lit, c0.sx, c0.sy, on ? 1 : 0.16);
          },
        });
      }

      // Lune di sentiment (orbitano il proprio pianeta, con inclinazione)
      for (const m of moons) {
        const p = planets[m.si];
        const ang = p.theta + p.spd * clock;
        const px = p.dist * Math.cos(ang), pz = p.dist * Math.sin(ang);
        const la = m.phase + m.spd * clock;
        const mx = px + m.orbR * Math.cos(la);
        const my = Math.sin(la) * m.orbR * Math.sin(m.incl);
        const mz = pz + m.orbR * Math.sin(la) * Math.cos(m.incl);
        const pr = project(mx, my, mz, cY, sY);
        const r = (2 + m.ten * 1.15) * pr.persp;
        const col = MOON[m.bucket];
        const on = moonOn(m);
        if (!on) continue;
        bodies.push({
          z: pr.z, draw: () => {
            drawSphere(pr.sx, pr.sy, r, hexToRgb(col.base), hexToRgb(col.lit), c0.sx, c0.sy, planetOn(m.si) ? 1 : 0.16);
          },
        });
      }

      bodies.sort((a, b) => a.z - b.z);
      for (const b of bodies) b.draw();

      // etichette (sopra tutto, discrete)
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = '500 11px system-ui, sans-serif';
      for (const p of planets) {
        const ps = planetScreen[p.i]; if (!ps) continue;
        const on = planetOn(p.i);
        ctx.fillStyle = `rgba(210,220,240,${on ? 0.75 : 0.2})`;
        ctx.fillText(sources[p.i].label, ps.sx, ps.sy + ps.r + 6);
      }

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [stars, sources, core, grade]);

  const sentiments: { key: string; label: string; color: string }[] = [
    { key: 'positive', label: 'positive', color: '#2f9e6e' },
    { key: 'neutral', label: 'neutral', color: '#5b7ba6' },
    { key: 'negative', label: 'negative', color: '#b0473f' },
  ];
  const anySel = selSrc.size > 0 || selSent.size > 0;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] uppercase tracking-wide text-slate-600">Sources:</span>
        {sources.map((s, i) => {
          const on = selSrc.has(i);
          return (
            <button key={s.id} onClick={() => toggle(setSelSrc, i)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-sky-400 bg-sky-500/15 text-slate-100' : 'border-[var(--border)] text-slate-400 hover:text-slate-200'}`}>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
            </button>
          );
        })}
        <span className="ml-2 mr-1 text-[11px] uppercase tracking-wide text-slate-600">Sentiment:</span>
        {sentiments.map((s) => {
          const on = selSent.has(s.key);
          return (
            <button key={s.key} onClick={() => toggle(setSelSent, s.key)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${on ? 'border-sky-400 bg-sky-500/15 text-slate-100' : 'border-[var(--border)] text-slate-400 hover:text-slate-200'}`}>
              <span className="size-2.5 rounded-full" style={{ backgroundColor: s.color }} />{s.label}
            </button>
          );
        })}
        {anySel && (
          <button onClick={() => { setSelSrc(new Set()); setSelSent(new Set()); }}
            className="ml-1 rounded-full px-2.5 py-1 text-xs text-sky-400 hover:text-sky-300">clear ✕</button>
        )}
      </div>

      <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-black" style={{ height: 580 }}>
        <canvas ref={canvasRef} className="size-full cursor-grab touch-none active:cursor-grabbing" />
        <div className="pointer-events-none absolute left-4 top-4 text-sm">
          <p className="text-xs uppercase tracking-widest text-slate-500">Conversation galaxy</p>
          <p className="mt-0.5 text-lg font-semibold text-slate-100">{title}</p>
          <div className="mt-2 flex gap-4 text-xs text-slate-400">
            <span>health <span className="font-semibold text-slate-100">{core}</span> · {grade}</span>
            <span><span className="text-slate-200">{total.toLocaleString('en-US')}</span> mentions</span>
            <span>sentiment <span className={avgSentiment > 0.15 ? 'text-emerald-400' : avgSentiment < -0.15 ? 'text-red-400' : 'text-sky-300'}>{avgSentiment > 0 ? '+' : ''}{avgSentiment}</span></span>
          </div>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-slate-600">
          The sun is your Health Index · planets are sources (size = volume) · each planet has 3 moons sized 1–10 by its sentiment split · drag to rotate
        </p>
      </div>
    </div>
  );
}
