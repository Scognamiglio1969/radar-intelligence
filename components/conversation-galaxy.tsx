'use client';

import { useEffect, useRef, useState } from 'react';

type Star = { si: number; s: number; e: number; age: number };
type Source = { id: string; label: string; color: string; count: number };
type Props = {
  title: string; core: number; grade: string; total: number; avgSentiment: number;
  sources: Source[]; stars: Star[];
};

function rand(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const bucketOf = (s: number): 'positive' | 'neutral' | 'negative' =>
  s > 0.15 ? 'positive' : s < -0.15 ? 'negative' : 'neutral';
const sentColor = (b: string): [number, number, number] =>
  b === 'positive' ? [52, 211, 153] : b === 'negative' ? [248, 113, 113] : [125, 211, 252];
const coreColor = (v: number) => v >= 80 ? '#34d399' : v >= 65 ? '#38bdf8' : v >= 50 ? '#fbbf24' : '#f87171';
const hexA = (hex: string, a: number) => hex + Math.round(Math.max(0, Math.min(1, a)) * 255).toString(16).padStart(2, '0');

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
    const Hs = 78;                 // ampiezza verticale del sentiment (netta)
    // Orbite delle fonti attorno al sole: anelli concentrici.
    const hub = sources.map((_, i) => ({
      theta: (i / N) * Math.PI * 2,
      dist: 130 + (N === 1 ? 120 : (i / (N - 1)) * 200), // 130..330 annidati
      spd: 0.00007 * (1 + (N - i) * 0.12),               // interni più veloci
    }));
    // Stelle: orbita locale attorno alla propria fonte + altezza = sentiment.
    const st = stars.map((s, i) => ({
      si: s.si,
      bucket: bucketOf(s.s),
      col: sentColor(bucketOf(s.s)),
      rl: 26 + rand(i * 2.3) * 26,          // raggio orbita locale
      phase: rand(i * 9.1) * Math.PI * 2,   // fase iniziale
      lspd: 0.00018 + rand(i * 4.7) * 0.0003,
      y: s.s * Hs,                          // altezza per sentiment (×2 vs prima)
      size: 1.7 + s.e * 4.2,                // stelle più grandi
      tw: rand(i * 5.3) * Math.PI * 2,
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

    const tilt = 0.5, camZ = 640, FOV = 700;
    const cosX = Math.cos(tilt), sinX = Math.sin(tilt);
    let rotY = 0.5, vel = 0.0016, dragging = false, lastX = 0, idle = 0;
    const AUTO = 0.0016;
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
    // Disegna un anello (cerchio nel piano x-z) proiettato.
    const drawRing = (ox: number, oz: number, rad: number, cY: number, sY: number, stroke: string, w: number) => {
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const p = project(ox + rad * Math.cos(a), 0, oz + rad * Math.sin(a), cY, sY);
        k === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy);
      }
      ctx.strokeStyle = stroke; ctx.lineWidth = w; ctx.stroke();
    };

    let raf = 0, t0 = performance.now(), clock = 0;
    const frame = (now: number) => {
      const dt = Math.min(50, now - t0); t0 = now;
      if (!reduce) clock += dt;
      if (!dragging) { idle += dt; if (idle > 400) vel += (AUTO - vel) * 0.02; }
      if (!reduce) rotY += vel * (dt / 16.7);
      const cY = Math.cos(rotY), sY = Math.sin(rotY);
      const selS = selSrcRef.current, selX = selSentRef.current;
      const srcOn = (i: number) => selS.size === 0 || selS.has(i);
      const starOn = (si: number, b: string) => (selS.size === 0 || selS.has(si)) && (selX.size === 0 || selX.has(b));

      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.6);
      bg.addColorStop(0, 'rgba(20,32,58,0.5)'); bg.addColorStop(1, 'rgba(8,12,24,0)');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // posizioni correnti degli hub (fonti che orbitano il sole)
      const hp = hub.map((h, i) => {
        const ang = h.theta + h.spd * clock;
        return { x: h.dist * Math.cos(ang), z: h.dist * Math.sin(ang), dist: h.dist, i };
      });

      // anelli orbitali delle fonti attorno al sole
      for (let i = 0; i < hub.length; i++) {
        drawRing(0, 0, hub[i].dist, cY, sY, hexA(sources[i].color, srcOn(i) ? 0.16 : 0.05), 1);
      }
      // anelli locali attorno a ciascuna fonte
      for (const h of hp) {
        drawRing(h.x, h.z, 40, cY, sY, hexA(sources[h.i].color, srcOn(h.i) ? 0.22 : 0.05), 1);
      }

      // glow del sole (dietro)
      const c0 = project(0, 0, 0, cY, sY);
      const coreR = 44 * c0.persp, cc = coreColor(core);
      const cg = ctx.createRadialGradient(c0.sx, c0.sy, 0, c0.sx, c0.sy, coreR * 2.6);
      cg.addColorStop(0, cc + 'cc'); cg.addColorStop(0.4, cc + '33'); cg.addColorStop(1, 'transparent');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(c0.sx, c0.sy, coreR * 2.6, 0, Math.PI * 2); ctx.fill();

      // stelle (orbitano la loro fonte), depth-sorted
      type P = { sx: number; sy: number; z: number; r: number; a: number; col: [number, number, number]; tw: number };
      const pts: P[] = [];
      for (let i = 0; i < st.length; i++) {
        const s = st[i]; if (!starOn(s.si, s.bucket)) continue;
        const h = hp[s.si]; if (!h) continue;
        const la = s.phase + s.lspd * clock;
        const wx = h.x + s.rl * Math.cos(la), wz = h.z + s.rl * Math.sin(la), wy = s.y;
        const pr = project(wx, wy, wz, cY, sY);
        const depth = (pr.z + 380) / 760;
        pts.push({ sx: pr.sx, sy: pr.sy, z: pr.z, r: s.size * pr.persp, a: 0.3 + depth * 0.7, col: s.col, tw: s.tw });
      }
      pts.sort((p, q) => p.z - q.z);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of pts) {
        const tw = reduce ? 1 : 0.78 + 0.22 * Math.sin(clock * 0.004 + p.tw);
        ctx.beginPath();
        ctx.fillStyle = `rgba(${p.col[0]},${p.col[1]},${p.col[2]},${p.a * tw})`;
        ctx.arc(p.sx, p.sy, Math.max(0.6, p.r), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';

      // hub delle fonti + etichette (davanti alle stelle di fondo)
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const h of hp) {
        const pr = project(h.x, 0, h.z, cY, sY);
        const front = (pr.z + 380) / 760;
        const on = srcOn(h.i);
        const a = (on ? 0.5 : 0.18) + front * 0.5;
        ctx.beginPath(); ctx.fillStyle = hexA(sources[h.i].color, a);
        ctx.arc(pr.sx, pr.sy, 4.5 * pr.persp, 0, Math.PI * 2); ctx.fill();
        ctx.font = '600 12px system-ui, sans-serif';
        ctx.fillStyle = `rgba(203,213,225,${a})`;
        ctx.fillText(sources[h.i].label, pr.sx + 8, pr.sy);
      }

      // sole: disco + health
      ctx.beginPath(); ctx.arc(c0.sx, c0.sy, coreR, 0, Math.PI * 2);
      ctx.fillStyle = '#0b1120'; ctx.fill(); ctx.strokeStyle = cc; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#f1f5f9'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(coreR * 0.82)}px system-ui, sans-serif`;
      ctx.fillText(String(core), c0.sx, c0.sy - coreR * 0.08);
      ctx.font = `600 ${Math.round(coreR * 0.26)}px system-ui, sans-serif`;
      ctx.fillStyle = cc; ctx.fillText(grade.toUpperCase(), c0.sx, c0.sy + coreR * 0.52);

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
    { key: 'positive', label: 'positive', color: '#34d399' },
    { key: 'neutral', label: 'neutral', color: '#7dd3fc' },
    { key: 'negative', label: 'negative', color: '#f87171' },
  ];
  const anySel = selSrc.size > 0 || selSent.size > 0;

  return (
    <div>
      {/* Filtri: fonti × sentiment (multi-selezione, incrocio) */}
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

      <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[#080c18]" style={{ height: 560 }}>
        <canvas ref={canvasRef} className="size-full cursor-grab touch-none active:cursor-grabbing" />
        <div className="pointer-events-none absolute left-4 top-4 text-sm">
          <p className="text-xs uppercase tracking-widest text-slate-500">Conversation galaxy</p>
          <p className="mt-0.5 text-lg font-semibold text-slate-100">{title}</p>
          <div className="mt-2 flex gap-4 text-xs text-slate-400">
            <span><span className="text-slate-200">{total.toLocaleString('en-US')}</span> mentions</span>
            <span>sentiment <span className={avgSentiment > 0.15 ? 'text-emerald-400' : avgSentiment < -0.15 ? 'text-red-400' : 'text-sky-300'}>{avgSentiment > 0 ? '+' : ''}{avgSentiment}</span></span>
          </div>
        </div>
        <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-slate-600">Drag to rotate · sources orbit the sun, mentions orbit their source · height = sentiment · size = engagement</p>
      </div>
    </div>
  );
}
