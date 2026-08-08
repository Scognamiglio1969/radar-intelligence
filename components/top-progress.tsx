'use client';

import { RefreshCw } from 'lucide-react';

/**
 * La barra di avanzamento in cima allo schermo.
 *
 * Un'operazione che dura minuti senza dare segno di vita sembra bloccata, e
 * l'utente ricarica la pagina — interrompendola davvero. Questa è la stessa
 * barra dell'aggiornamento dati, estratta perché ogni attesa lunga dell'app la
 * usi: due attese identiche non devono avere due linguaggi diversi.
 */
export function TopProgress({ progress, phase }: { progress: number; phase: string }) {
  return (
    <div className="fixed inset-x-0 top-0 z-[70]">
      <div className="h-1 overflow-hidden bg-sky-950">
        <div
          className="h-full bg-gradient-to-r from-sky-500 via-cyan-300 to-sky-400 transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="mx-auto mt-3 flex w-fit max-w-[92vw] items-center gap-2.5 rounded-full border border-sky-500/30 bg-[#0c1226]/95 px-4 py-2 text-xs text-slate-200 shadow-xl backdrop-blur">
        <RefreshCw className="size-3.5 shrink-0 animate-spin text-sky-400" />
        <span className="truncate">{phase}</span>
        <span className="font-mono tabular-nums text-sky-300">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}

/**
 * Avanzamento asintotico per un'attesa di durata ignota.
 *
 * Non si può mostrare una percentuale vera quando il server non emette stati
 * intermedi. Si mostra allora un avanzamento che rallenta avvicinandosi al
 * traguardo e non lo raggiunge mai da solo: comunica "sto lavorando" senza
 * promettere un tempo che non conosciamo.
 */
export function creepingProgress(set: (fn: (p: number) => number) => void, ceiling = 93) {
  return setInterval(() => set((p) => Math.min(ceiling, p + (ceiling - p) * 0.03)), 400);
}
