'use client';

import { Archive, LineChart, Brain, ShieldCheck, Rocket, Check, Minus } from 'lucide-react';
import type { Stage, StageId } from '@/lib/import-stages';

// ---------------------------------------------------------------------------
// La catena delle consegne, in cima alla pagina.
//
// Serve a rispondere a una domanda sola, prima di ogni altra: A CHI TOCCA
// ADESSO. Chi ha già finito è spento e porta il suo esito in una riga; chi
// deve ancora lavorare è appena accennato. Solo il passaggio corrente è acceso.
//
// I nomi dei ruoli non sono un vezzo: dicono perché una cosa viene prima di
// un'altra. Un file sconclusionato lo capisce il data scientist, ma solo dopo
// che qualcuno ha letto le colonne — e vederlo scritto rende ovvio un ordine
// che prima si doveva indovinare.
// ---------------------------------------------------------------------------

const ICON: Record<StageId, typeof Archive> = {
  archivio: Archive,
  colonne: LineChart,
  scienza: Brain,
  qualita: ShieldCheck,
  analisi: Rocket,
};

export function ImportStepper({ list }: { list: Stage[] }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5">
      {list.map((s, i) => {
        const Icon = ICON[s.id];
        const current = s.state === 'current';
        const done = s.state === 'done';
        const skipped = s.state === 'skipped';

        return (
          <li key={s.id} className={`flex min-w-0 flex-1 basis-[9rem] flex-col gap-0.5 rounded-xl border px-3 py-2 transition ${
            current
              ? 'border-sky-500/50 bg-sky-500/[0.08]'
              : done
                ? 'border-[var(--border)] bg-white/[0.02]'
                : 'border-[var(--border)] border-dashed'
          }`}>
            <span className="flex items-center gap-1.5">
              <span className={`flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                done ? 'bg-emerald-500/20 text-emerald-300'
                  : current ? 'bg-sky-500 text-slate-950'
                    : 'bg-white/5 text-slate-600'
              }`}>
                {done ? <Check className="size-2.5" /> : skipped ? <Minus className="size-2.5" /> : i + 1}
              </span>
              <Icon className={`size-3.5 shrink-0 ${current ? 'text-sky-300' : done ? 'text-slate-500' : 'text-slate-700'}`} />
              <span className={`truncate text-[11px] font-medium ${
                current ? 'text-sky-200' : done ? 'text-slate-400' : 'text-slate-600'
              }`}>
                {s.role}
              </span>
            </span>
            <span className={`text-[10px] leading-snug ${current ? 'text-slate-400' : 'text-slate-600'}`}>
              {done && s.outcome ? s.outcome : skipped ? 'a disposizione, se serve' : s.does}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
