'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, RefreshCw } from 'lucide-react';

type Summary = { inserted?: number; analyzed?: number }[];

export function RefreshButton() {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const router = useRouter();

  const phase = progress < 35 ? 'Querying sources…'
    : progress < 75 ? 'AI analysis running…'
    : 'Almost done…';

  async function refresh() {
    setBusy(true);
    setProgress(2);
    // Progresso simulato asintotico: la pipeline dura 30-90s e non emette
    // stati intermedi, ma l'utente deve vedere che sta lavorando
    timerRef.current = setInterval(() => {
      setProgress((p) => Math.min(93, p + (93 - p) * 0.03));
    }, 400);
    try {
      const res = await fetch('/api/refresh', { method: 'POST' });
      const data = await res.json() as { skipped?: boolean; summary?: Summary };
      setProgress(100);
      if (data.skipped) {
        setToast('An update was already running: try again in a minute.');
      } else {
        const inserted = (data.summary ?? []).reduce((s, r) => s + (r.inserted ?? 0), 0);
        const analyzed = (data.summary ?? []).reduce((s, r) => s + (r.analyzed ?? 0), 0);
        setToast(`Update complete: ${inserted} new mentions, ${analyzed} analyzed by AI.`);
      }
      router.refresh();
    } catch {
      setToast('Update failed, please retry.');
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => { setBusy(false); setProgress(0); }, 700);
      setTimeout(() => setToast(null), 6000);
    }
  }

  return (
    <>
      <button
        onClick={refresh}
        disabled={busy}
        className="flex items-center justify-center gap-2 rounded-lg bg-sky-500/90 px-3 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
      >
        <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />
        {busy ? `${Math.round(progress)}%` : 'Refresh now'}
      </button>

      {/* Barra di avanzamento globale in cima allo schermo */}
      {busy && (
        <div className="fixed inset-x-0 top-0 z-[70]">
          <div className="h-1 overflow-hidden bg-sky-950">
            <div
              className="h-full bg-gradient-to-r from-sky-500 via-cyan-300 to-sky-400 transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mx-auto mt-3 flex w-fit items-center gap-2.5 rounded-full border border-sky-500/30 bg-[#0c1226]/95 px-4 py-2 text-xs text-slate-200 shadow-xl backdrop-blur">
            <RefreshCw className="size-3.5 animate-spin text-sky-400" />
            <span>{phase}</span>
            <span className="font-mono tabular-nums text-sky-300">{Math.round(progress)}%</span>
          </div>
        </div>
      )}

      {/* Toast di esito */}
      {toast && !busy && (
        <div className="fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-500/30 bg-[#0c1226]/95 px-4 py-2.5 text-xs text-slate-200 shadow-xl backdrop-blur">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          {toast}
        </div>
      )}
    </>
  );
}
