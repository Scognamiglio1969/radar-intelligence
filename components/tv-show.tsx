'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flame, GitBranch, Bell, X, AlertTriangle } from 'lucide-react';
import { VolumeChart, SentimentPie } from './charts';
import { ParticleField } from './particle-field';
import { SOURCE_META } from '@/lib/connectors';
import { APP_BYLINE } from './brand';

const SLIDE_MS = 18000;

type Props = {
  projectName: string;
  kpi: { total7: number; avgSentiment: number | null; sources: number };
  volumeByDay: { day: string; source: string; n: number }[];
  sentimentDist: { sentiment: string; n: number }[];
  topTopics: { topic: string; n: number }[];
  trends: { topic: string; score: number; n24: number; explanation: string | null }[];
  narratives: { title: string; stance: string | null; coordinated: boolean; count: number }[];
  alerts: { message: string; severity: string }[];
  latest: { source: string; title: string | null; content: string; community: string | null; sentiment: string | null }[];
};

// ---------------------------------------------------------------------------
// Contatore animato: parte da 0 e sale con easing quando la slide entra
// ---------------------------------------------------------------------------
function CountUp({ value, duration = 1600 }: { value: number; duration?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{n.toLocaleString('en-US')}</>;
}

// ---------------------------------------------------------------------------
// Gauge del sentiment: semicerchio con lancetta animata
// ---------------------------------------------------------------------------
function SentimentGauge({ score }: { score: number | null }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMounted(true), 250); return () => clearTimeout(t); }, []);
  const s = score ?? 0;
  const angle = mounted ? s * 80 : -80; // -1..1 → -80°..80°
  const color = s > 0.15 ? '#34d399' : s < -0.15 ? '#f87171' : '#94a3b8';
  const label = score === null ? 'analyzing' : s > 0.15 ? 'positive' : s < -0.15 ? 'negative' : 'neutral';

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 118" className="w-full max-w-[260px]">
        <defs>
          <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#f87171" />
            <stop offset="50%" stopColor="#94a3b8" />
            <stop offset="100%" stopColor="#34d399" />
          </linearGradient>
        </defs>
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="#1e2a4a" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="url(#gaugeGrad)" strokeWidth="14"
          strokeLinecap="round" opacity="0.85" />
        {[-80, -40, 0, 40, 80].map((a) => (
          <line key={a} x1="100" y1="30" x2="100" y2="38" stroke="#475569" strokeWidth="2"
            transform={`rotate(${a} 100 100)`} />
        ))}
        {/* lancetta */}
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: '100px 100px', transition: 'transform 1.8s cubic-bezier(0.34, 1.3, 0.5, 1)' }}>
          <line x1="100" y1="100" x2="100" y2="34" stroke={color} strokeWidth="4" strokeLinecap="round" />
          <circle cx="100" cy="100" r="8" fill={color} />
        </g>
      </svg>
      <p className="-mt-2 text-3xl font-black lg:text-4xl" style={{ color }}>{label}</p>
      {score !== null && <p className="text-sm text-slate-500">score {s.toFixed(2)}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schermo radar: anelli, spazzata rotante e blip pulsanti per i trend
// ---------------------------------------------------------------------------
function RadarScreen({ trends }: { trends: Props['trends'] }) {
  const C = 250;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const maxScore = Math.max(1, ...trends.map((t) => t.score));
  const blips = trends.slice(0, 6).map((t, i) => {
    // Più forte il trend, più vicino al centro
    const dist = 55 + (1 - t.score / maxScore) * 140;
    const a = i * golden + 0.9;
    return {
      ...t,
      x: Math.round((C + Math.cos(a) * dist) * 10) / 10,
      y: Math.round((C + Math.sin(a) * dist * 0.92) * 10) / 10,
    };
  });

  return (
    <svg viewBox="0 0 500 500" className="mx-auto h-full max-h-[62vh] w-auto">
      <defs>
        <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="radarBg">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r="240" fill="url(#radarBg)" />
      {[70, 130, 190, 240].map((r) => (
        <circle key={r} cx={C} cy={C} r={r} fill="none" stroke="#1e3a5f" strokeWidth="1.5" />
      ))}
      <line x1={C} y1="10" x2={C} y2="490" stroke="#1e3a5f" strokeWidth="1" />
      <line x1="10" y1={C} x2="490" y2={C} stroke="#1e3a5f" strokeWidth="1" />

      {/* spazzata rotante */}
      <g>
        <path d={`M ${C} ${C} L ${C + 240} ${C} A 240 240 0 0 0 ${C + 240 * Math.cos(-0.7)} ${C + 240 * Math.sin(-0.7)} Z`}
          fill="url(#sweepGrad)">
        </path>
        <animateTransform attributeName="transform" type="rotate"
          from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="5.5s" repeatCount="indefinite" />
      </g>

      {/* blip dei trend */}
      {blips.map((b, i) => (
        <g key={b.topic}>
          <circle className="tv-blip" cx={b.x} cy={b.y} r="5" fill="none" stroke="#fb923c" strokeWidth="2"
            style={{ animationDelay: `${i * 0.35}s` }} />
          <circle cx={b.x} cy={b.y} r="5" fill="#fb923c" />
          <text x={b.x} y={b.y - 14} textAnchor="middle" fill="#fdba74" fontSize="15" fontWeight="700">
            {b.topic}
          </text>
          <text x={b.x} y={b.y + 24} textAnchor="middle" fill="#7c8cab" fontSize="11">
            ×{b.score.toFixed(0)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// War Room
// ---------------------------------------------------------------------------
export function TvShow(props: Props) {
  const router = useRouter();
  const [slide, setSlide] = useState(0);
  const [clock, setClock] = useState('');
  const slides = buildSlides(props);
  const next = useCallback(() => setSlide((s) => (s + 1) % slides.length), [slides.length]);

  useEffect(() => {
    const t = setInterval(next, SLIDE_MS);
    return () => clearInterval(t);
  }, [next, slide]);

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const r = setInterval(() => router.refresh(), 5 * 60_000);
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push('/'); };
    window.addEventListener('keydown', esc);
    return () => { clearInterval(r); window.removeEventListener('keydown', esc); };
  }, [router]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#04070f]">
      {/* Sfondi animati */}
      <ParticleField />
      <div aria-hidden className="tv-floor" />
      <div aria-hidden className="tv-aurora pointer-events-none absolute -left-[15vmax] top-[10vmax] size-[55vmax] rounded-full opacity-[0.10]"
        style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 60%)' }} />
      <div aria-hidden className="pointer-events-none absolute -right-[30vmax] -top-[30vmax] size-[80vmax] opacity-[0.08]"
        style={{
          background: 'conic-gradient(from 0deg, transparent 0deg, #38bdf8 25deg, transparent 60deg)',
          borderRadius: '50%',
          animation: 'radarsweep 14s linear infinite',
        }} />

      {/* Header */}
      <header className="relative z-10 flex items-center gap-4 px-8 pt-6 lg:px-14">
        <span className="flex items-center gap-2 rounded-full border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-bold tracking-widest text-red-400">
          <span className="size-2 animate-pulse rounded-full bg-red-500" /> LIVE
        </span>
        <div className="leading-none">
          <p className="text-lg font-bold tracking-tight lg:text-xl">{props.projectName}</p>
          <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">Radar · {APP_BYLINE} · War Room</p>
        </div>
        <div className="ml-auto flex items-center gap-5">
          <span className="font-mono text-xl tabular-nums text-slate-300 lg:text-2xl">{clock}</span>
          <button onClick={() => router.push('/')} aria-label="Exit"
            className="rounded-full border border-[var(--border)] p-2 text-slate-500 transition hover:text-slate-200">
            <X className="size-4" />
          </button>
        </div>
      </header>

      {/* Slide corrente */}
      <div key={slide} className="tv-slide relative z-10 flex min-h-0 flex-1 flex-col px-8 py-5 lg:px-14 lg:py-6">
        {slides[slide]}
      </div>

      {/* Striscia temi a scorrimento continuo */}
      {props.topTopics.length > 2 && (
        <div className="relative z-10 overflow-hidden border-t border-[var(--border)]/60 py-2">
          <div className="tv-ticker-x flex w-max gap-8 whitespace-nowrap">
            {[...props.topTopics, ...props.topTopics].map((t, i) => (
              <span key={i} className="text-sm text-slate-500">
                <span className="mr-1.5 text-sky-500">◆</span>
                <span className="text-slate-300">{t.topic}</span> {t.n}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Footer: indicatori + avanzamento */}
      <footer className="relative z-10 px-8 pb-5 lg:px-14">
        <div className="mb-2.5 flex items-center justify-center gap-2">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setSlide(i)} aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${i === slide ? 'w-8 bg-sky-400' : 'w-3 bg-white/15 hover:bg-white/30'}`} />
          ))}
        </div>
        <div className="h-0.5 overflow-hidden rounded bg-white/5">
          <div key={slide} className="h-full bg-sky-500/70"
            style={{ animation: `tvprogress ${SLIDE_MS}ms linear both` }} />
        </div>
      </footer>
    </div>
  );
}

function SlideTitle({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <h2 className="mb-5 flex items-center gap-3 text-xl font-bold tracking-tight text-slate-200 lg:text-3xl">
      {icon}{children}
    </h2>
  );
}

const card = 'tv-shine rounded-2xl border border-sky-500/20 bg-gradient-to-b from-[#0d1530]/90 to-[#0a0f22]/90 backdrop-blur';

function buildSlides(p: Props): React.ReactNode[] {
  const slides: React.ReactNode[] = [];
  const mentions24h = p.volumeByDay
    .filter((r) => r.day >= new Date(Date.now() - 86400_000).toISOString().slice(0, 10))
    .reduce((s, r) => s + r.n, 0);

  // ── 1. Quadro generale: contatori animati + gauge
  slides.push(
    <div className="flex flex-1 flex-col justify-center">
      <div className="tv-3d grid gap-6 lg:grid-cols-3">
        <div className={`tv-float ${card} px-8 py-9`}>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Mentions · 7 days</p>
          <p className="mt-4 bg-gradient-to-r from-sky-300 to-cyan-200 bg-clip-text text-6xl font-black tracking-tight text-transparent lg:text-8xl">
            <CountUp value={p.kpi.total7} />
          </p>
          <p className="mt-3 text-sm text-slate-500">
            di cui <span className="font-bold text-sky-300"><CountUp value={mentions24h} duration={2000} /></span> nelle ultime 24 ore
          </p>
        </div>
        <div className={`tv-float ${card} flex flex-col items-center justify-center px-8 py-9`}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Sentiment</p>
          <SentimentGauge score={p.kpi.avgSentiment} />
        </div>
        <div className={`tv-float ${card} px-8 py-9`}>
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">Active sources</p>
          <p className="mt-4 bg-gradient-to-r from-violet-300 to-fuchsia-300 bg-clip-text text-6xl font-black text-transparent lg:text-8xl">
            <CountUp value={p.kpi.sources} duration={2200} />
          </p>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {Object.entries(SOURCE_META).slice(0, 7).map(([id, m]) => (
              <span key={id} className="size-2.5 rounded-full" style={{ backgroundColor: m.color, opacity: 0.7 }} />
            ))}
          </div>
        </div>
      </div>
    </div>,
  );

  // ── 2. Schermo radar coi trend
  if (p.trends.length > 0) {
    slides.push(
      <div className="flex min-h-0 flex-1 flex-col">
        <SlideTitle icon={<Flame className="size-7 text-orange-400" />}>Radar — emerging trends</SlideTitle>
        <div className="grid min-h-0 flex-1 items-center gap-8 lg:grid-cols-5">
          <div className="hidden min-h-0 lg:col-span-3 lg:block"><RadarScreen trends={p.trends} /></div>
          <div className="tv-3d flex flex-col gap-4 lg:col-span-2">
            {p.trends.slice(0, 5).map((t) => (
              <div key={t.topic} className={`${card} px-5 py-4`}>
                <div className="flex items-baseline gap-3">
                  <span className="text-3xl font-black text-orange-400">×{t.score.toFixed(0)}</span>
                  <span className="text-lg font-bold">{t.topic}</span>
                  <span className="ml-auto text-xs text-slate-500">{t.n24}/24h</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded bg-white/5">
                  <div className="h-full rounded bg-gradient-to-r from-orange-500 to-amber-300"
                    style={{ width: `${Math.min(100, (t.score / Math.max(...p.trends.map((x) => x.score))) * 100)}%`, transition: 'width 1.5s ease-out' }} />
                </div>
                {t.explanation && <p className="mt-2 line-clamp-2 text-xs leading-snug text-slate-400">{t.explanation}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>,
    );
  }

  // ── 3. Grafici (le barre si animano a ogni ingresso della slide)
  if (p.volumeByDay.length > 0) {
    slides.push(
      <div className="flex min-h-0 flex-1 flex-col">
        <SlideTitle>Volume and sentiment</SlideTitle>
        <div className="tv-3d grid min-h-0 flex-1 gap-6 lg:grid-cols-3">
          <div className={`${card} flex min-h-0 flex-col px-6 py-5 lg:col-span-2`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Mentions by source · 14 days</p>
            <div className="min-h-0 flex-1"><VolumeChart data={p.volumeByDay} /></div>
          </div>
          <div className={`${card} flex min-h-0 flex-col px-6 py-5`}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Sentiment · 7 days</p>
            <div className="min-h-0 flex-1">
              {p.sentimentDist.length > 0 && <SentimentPie data={p.sentimentDist} />}
            </div>
          </div>
        </div>
      </div>,
    );
  }

  // ── 4. Narrazioni e alert
  if (p.narratives.length > 0 || p.alerts.length > 0) {
    slides.push(
      <div className="flex flex-1 flex-col">
        <SlideTitle icon={<GitBranch className="size-7 text-sky-400" />}>Narratives and signals</SlideTitle>
        <div className="tv-3d flex flex-1 flex-col justify-center gap-4">
          {p.alerts.slice(0, 2).map((a, i) => (
            <div key={`a${i}`} className="tv-shine flex items-center gap-4 rounded-2xl border border-red-500/40 bg-red-500/10 px-6 py-4">
              <span className="relative flex size-10 shrink-0 items-center justify-center">
                <span className="absolute inset-0 animate-ping rounded-full bg-red-500/30" />
                <Bell className="relative size-5 text-red-400" />
              </span>
              <span className="text-lg lg:text-xl">{a.message}</span>
            </div>
          ))}
          {p.narratives.map((n) => (
            <div key={n.title} className={`${card} flex flex-wrap items-center gap-3 px-6 py-4`}
              style={{ borderLeftWidth: 3, borderLeftColor: n.coordinated ? '#f59e0b' : '#38bdf8' }}>
              <span className="text-lg font-bold lg:text-xl">{n.title}</span>
              {n.stance && <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">{n.stance}</span>}
              {n.coordinated && (
                <span className="flex animate-pulse items-center gap-1 rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-400">
                  <AlertTriangle className="size-3.5" /> COORDINATA
                </span>
              )}
              <span className="ml-auto font-mono text-sm text-slate-500">{n.count} post</span>
            </div>
          ))}
        </div>
      </div>,
    );
  }

  // ── 5. Feed a scorrimento continuo
  if (p.latest.length > 1) {
    const feed = [...p.latest, ...p.latest];
    slides.push(
      <div className="flex min-h-0 flex-1 flex-col">
        <SlideTitle>Latest voices</SlideTitle>
        <div className="relative min-h-0 flex-1 overflow-hidden"
          style={{ maskImage: 'linear-gradient(to bottom, transparent, black 8%, black 88%, transparent)' }}>
          <div className="tv-ticker-y flex flex-col gap-4">
            {feed.map((m, i) => {
              const meta = SOURCE_META[m.source];
              return (
                <div key={i} className={`${card} px-6 py-4`}>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-medium"
                      style={{ backgroundColor: `${meta?.color ?? '#64748b'}22`, color: meta?.color ?? '#94a3b8' }}>
                      {meta?.label ?? m.source}
                    </span>
                    {m.community && <span className="text-xs text-slate-600">{m.community}</span>}
                    {m.sentiment && (
                      <span className={`ml-auto text-xs ${m.sentiment === 'positive' ? 'text-emerald-400' : m.sentiment === 'negative' ? 'text-red-400' : 'text-slate-500'}`}>
                        ● {m.sentiment}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-base leading-snug text-slate-300 lg:text-lg">
                    {m.title ?? m.content}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>,
    );
  }

  return slides;
}
