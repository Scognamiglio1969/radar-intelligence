'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Milestone, Sparkles, Star, Zap } from 'lucide-react';

type Ev = { id: number; date: string; title: string; description: string | null; importance: number };

const IMPORTANCE = {
  3: { icon: Star, ring: 'border-amber-400 text-amber-400', glow: 'shadow-[0_0_24px_rgba(251,191,36,0.35)]', label: 'turning point' },
  2: { icon: Zap, ring: 'border-sky-400 text-sky-400', glow: 'shadow-[0_0_16px_rgba(56,189,248,0.25)]', label: 'notable' },
  1: { icon: Milestone, ring: 'border-slate-500 text-slate-400', glow: '', label: '' },
} as const;

function monthLabel(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function TimelineView({ events, canGenerate }: { events: Ev[]; canGenerate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      await fetch('/api/timeline', { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (events.length === 0) {
    return (
      <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
        <p className="text-sm text-slate-400">
          The timeline builds itself: every morning the AI extracts the salient events from the day’s news.
        </p>
        {canGenerate && (
          <button onClick={generate} disabled={busy}
            className="flex items-center gap-2 rounded-lg bg-sky-500/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Extract today’s events
          </button>
        )}
      </div>
    );
  }

  let lastMonth = '';

  return (
    <div className="relative">
      {canGenerate && (
        <div className="mb-5 flex justify-end">
          <button onClick={generate} disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/5 disabled:opacity-60">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-sky-400" />}
            Update with today’s events
          </button>
        </div>
      )}

      {/* linea centrale */}
      <div aria-hidden className="absolute inset-y-0 left-5 w-px bg-gradient-to-b from-sky-500/60 via-[var(--border)] to-transparent sm:left-1/2" />

      <div className="flex flex-col gap-6">
        {events.map((e, i) => {
          const level = IMPORTANCE[(e.importance as 2 | 1 | 3) in IMPORTANCE ? (e.importance as 1 | 2 | 3) : 1];
          const Icon = level.icon;
          const month = monthLabel(e.date);
          const showMonth = month !== lastMonth;
          lastMonth = month;
          const left = i % 2 === 0;

          return (
            <div key={e.id} className="tl-item">
              {showMonth && (
                <p className="relative z-10 mb-4 pl-12 text-xs font-bold uppercase tracking-[0.2em] text-slate-500 sm:pl-0 sm:text-center">
                  {month}
                </p>
              )}
              <div className={`relative flex items-start gap-4 sm:w-1/2 ${left ? 'sm:pr-10' : 'sm:ml-auto sm:pl-10'}`}>
                {/* nodo sulla linea */}
                <span className={`absolute left-5 z-10 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border-2 bg-[#0a0f1f] ${level.ring} ${level.glow} ${left ? 'sm:left-full' : 'sm:left-0'}`}>
                  <Icon className="size-4" />
                </span>
                <article className={`panel ml-12 flex-1 px-5 py-4 sm:ml-0 ${e.importance === 3 ? 'border-amber-500/40' : e.importance === 2 ? 'border-sky-500/30' : ''}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <time className="text-xs font-semibold text-sky-300">
                      {new Date(e.date).toLocaleDateString('en-US', { day: 'numeric', month: 'long' })}
                    </time>
                    {e.importance === 3 && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
                        turning point
                      </span>
                    )}
                  </div>
                  <h3 className="mt-1 text-sm font-bold leading-snug">{e.title}</h3>
                  {e.description && (
                    <p className="mt-1 text-sm leading-relaxed text-slate-400">{e.description}</p>
                  )}
                </article>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
