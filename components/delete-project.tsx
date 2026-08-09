'use client';

import { useActionState, useState } from 'react';
import { Trash2, Loader2, ShieldAlert } from 'lucide-react';
import { deleteProject, type ActionResult } from '@/app/settings/actions';

// ---------------------------------------------------------------------------
// Cancellare un progetto.
//
// È l'unica azione dell'app che non si può annullare: se ne vanno le mention,
// le misure, i file caricati, i report e i grafici costruiti a mano. Per questo
// non basta un clic — che si dà anche per distrazione — ma serve la password
// dell'account, come per azzerare il contatore di spesa.
//
// Il pulsante non cancella: apre la richiesta. È un passaggio in più, ed è
// esattamente il punto.
// ---------------------------------------------------------------------------

const INIT: ActionResult = { ok: false, msg: '' };

export function DeleteProject({ id, name }: { id: number; name: string }) {
  const [asking, setAsking] = useState(false);
  const [state, action, pending] = useActionState(deleteProject, INIT);

  if (!asking) {
    return (
      <button onClick={() => setAsking(true)}
        className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400/90 transition hover:bg-red-500/10">
        <Trash2 className="size-4" />
        Delete “{name}” and all its data
      </button>
    );
  }

  return (
    <form action={action} className="max-w-md rounded-xl border border-red-500/30 bg-red-500/[0.04] px-4 py-3.5">
      <input type="hidden" name="id" value={id} />
      <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-red-300">
        <ShieldAlert className="size-4 shrink-0" /> Delete “{name}”?
      </p>
      <p className="mb-3 text-xs leading-relaxed text-slate-400">
        This removes the project and everything in it — mentions, measures, uploaded files,
        reports and the charts you built. It cannot be undone. Type your account password to
        confirm.
      </p>
      <input
        type="password" name="password" autoFocus required
        placeholder="Your account password"
        autoComplete="current-password"
        className="mb-2 w-full rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
      />
      {state.msg && (
        <p className={`mb-2 text-xs ${state.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{state.msg}</p>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-red-500/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-red-400 disabled:opacity-50">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
          Delete permanently
        </button>
        <button type="button" onClick={() => setAsking(false)}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
          Cancel
        </button>
      </div>
    </form>
  );
}
