'use client';

import { useEffect, useRef } from 'react';

type Star = { si: number; s: number; e: number; age: number };
type Source = { id: string; label: string; color: string; count: number };
type Props = {
  title: string; core: number; grade: string; total: number; avgSentiment: number;
  sources: Source[]; stars: Star[];
};

// Pseudo-random deterministico da un intero (per posizioni stabili tra i frame).
function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const sentColor = (s: number): [number, number, number] =>
  s > 0.15 ? [52, 211, 153] : s < -0.15 ? [248, 113, 113] : [125, 211, 252];
const coreColor = (v: number) => v >= 80 ? '#34d399' : v >= 65 ? '#38bdf8' : v >= 50 ? '#fbbf24' : '#f87171';

export function ConversationGalaxy({ title, core, grade, total, avgSentiment, sources, stars }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const S = Math.max(1, sources.length);
    const R = 230;
    // Posizioni 3D di base (costellazioni per fonte, altezza = sentiment).
    const base = stars.map((st, i) => {
      const sector = (2 * Math.PI) / S;
      const a0 = (st.si + 0.5) * sector;
      const az = a0 + (rand(i * 3.1) - 0.5) * sector * 0.72;
      const lat = st.s * (Math.PI / 2) * 0.72;
      const radius = R * (0.58 + 0.42 * rand(i * 7.7));
      return {
        x: radius * Math.cos(lat) * Math.cos(az),
        y: radius * Math.sin(lat),
        z: radius * Math.cos(lat) * Math.sin(az),
        col: sentColor(st.s),
        size: 0.7 + st.e * 2.6,
        tw: rand(i * 5.3) * Math.PI * 2, // fase scintillio
      };
    });
    // Ancore etichette fonti (sul piano equatoriale, appena oltre il guscio).
    const labelAnchors = sources.map((src, i) => {
      const a0 = (i + 0.5) * ((2 * Math.PI) / S);
      return { x: R * 1.12 * Math.cos(a0), y: 0, z: R * 1.12 * Math.sin(a0), src };
    });

    let W = 0, H = 0, cx = 0, cy = 0, dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = rect.width; H = rect.height; cx = W / 2; cy = H / 2;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const tilt = 0.42, camZ = 560, FOV = 620;
    let rotY = 0.6, vel = 0.0022, dragging = false, lastX = 0, idle = 0;
    const AUTO = 0.0022;

    const onDown = (e: PointerEvent) => { dragging = true; lastX = e.clientX; idle = 0; canvas.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => { if (!dragging) return; const dx = e.clientX - lastX; lastX = e.clientX; vel = dx * 0.0009; rotY += dx * 0.006; };
    const onUp = () => { dragging = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const cosX = Math.cos(tilt), sinX = Math.sin(tilt);
    type P = { sx: number; sy: number; z: number; r: number; a: number; col: [number, number, number]; tw: number };

    let raf = 0, t0 = performance.now();
    const project = (x: number, y: number, z: number, cY: number, sY: number) => {
      const x1 = x * cY + z * sY;
      const z1 = -x * sY + z * cY;
      const y2 = y * cosX - z1 * sinX;
      const z2 = y * sinX + z1 * cosX;
      const persp = FOV / (camZ - z2);
      return { sx: cx + x1 * persp, sy: cy - y2 * persp, z: z2, persp };
    };

    const frame = (now: number) => {
      const dt = Math.min(50, now - t0); t0 = now;
      if (!dragging) { idle += dt; if (idle > 400) vel += (AUTO - vel) * 0.02; }
      if (!reduce) rotY += vel * (dt / 16.7);
      const cY = Math.cos(rotY), sY = Math.sin(rotY);

      ctx.clearRect(0, 0, W, H);
      // vignette
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.62);
      bg.addColorStop(0, 'rgba(20,32,58,0.55)'); bg.addColorStop(1, 'rgba(8,12,24,0)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // punti proiettati + depth sort
      const pts: P[] = new Array(base.length);
      for (let i = 0; i < base.length; i++) {
        const b = base[i];
        const pr = project(b.x, b.y, b.z, cY, sY);
        const depth = (pr.z + R) / (2 * R);
        pts[i] = { sx: pr.sx, sy: pr.sy, z: pr.z, r: b.size * pr.persp, a: 0.2 + depth * 0.8, col: b.col, tw: b.tw };
      }
      pts.sort((p, q) => p.z - q.z);

      // nucleo (dietro i punti frontali): proietto l'origine
      const c0 = project(0, 0, 0, cY, sY);
      const coreR = 46 * c0.persp;
      const cg = ctx.createRadialGradient(c0.sx, c0.sy, 0, c0.sx, c0.sy, coreR * 2.4);
      const cc = coreColor(core);
      cg.addColorStop(0, cc + 'cc'); cg.addColorStop(0.4, cc + '33'); cg.addColorStop(1, 'transparent');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(c0.sx, c0.sy, coreR * 2.4, 0, Math.PI * 2); ctx.fill();

      // stelle
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pts) {
        const tw = reduce ? 1 : 0.75 + 0.25 * Math.sin(now * 0.004 + p.tw);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${p.a * tw})`;
        ctx.arc(p.sx, p.sy, Math.max(0.5, p.r), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // nucleo: cerchio pieno + numero health
      ctx.beginPath(); ctx.arc(c0.sx, c0.sy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1120'; ctx.fill();
      ctx.strokeStyle = cc; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#f1f5f9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(coreR * 0.8)}px system-ui, sans-serif`;
      ctx.fillText(String(core), c0.sx, c0.sy - coreR * 0.08);
      ctx.font = `600 ${Math.round(coreR * 0.26)}px system-ui, sans-serif`;
      ctx.fillStyle = cc; ctx.fillText(grade.toUpperCase(), c0.sx, c0.sy + coreR * 0.5);

      // etichette fonti (ruotano con le costellazioni)
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const la of labelAnchors) {
        const pr = project(la.x, la.y, la.z, cY, sY);
        const front = (pr.z + R) / (2 * R);
        const a = 0.25 + front * 0.75;
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = la.src.color + Math.round(a * 255).toString(16).padStart(2, '0');
        ctx.beginPath(); ctx.arc(pr.sx - ctx.measureText(la.src.label).width / 2 - 8, pr.sy, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(203,213,225,${a})`;
        ctx.fillText(la.src.label, pr.sx, pr.sy);
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

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[#080c18]" style={{ height: 560 }}>
      <canvas ref={canvasRef} className="size-full cursor-grab active:cursor-grabbing touch-none" />
      {/* KPI overlay */}
      <div className="pointer-events-none absolute left-4 top-4 text-sm">
        <p className="text-xs uppercase tracking-widest text-slate-500">Conversation galaxy</p>
        <p className="mt-0.5 text-lg font-semibold text-slate-100">{title}</p>
        <div className="mt-2 flex gap-4 text-xs text-slate-400">
          <span><span className="text-slate-200">{total.toLocaleString('en-US')}</span> mentions</span>
          <span>sentiment <span className={avgSentiment > 0.15 ? 'text-emerald-400' : avgSentiment < -0.15 ? 'text-red-400' : 'text-sky-300'}>{avgSentiment > 0 ? '+' : ''}{avgSentiment}</span></span>
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-3 right-4 flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-400" /> positive</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-sky-300" /> neutral</span>
        <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-red-400" /> negative</span>
      </div>
      <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-slate-600">Drag to rotate · star size = engagement · height = sentiment · core = health</p>
    </div>
  );
}
