'use client';

import { useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import { changePassword } from '@/app/account/actions';

const input = 'w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none placeholder:text-slate-600';

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input name="current" type="password" placeholder="Password attuale" autoComplete="current-password" required className={input} />
      <input name="next" type="password" placeholder="Nuova password (min 8 caratteri)" autoComplete="new-password" required className={input} />
      <input name="confirm" type="password" placeholder="Ripeti la nuova password" autoComplete="new-password" required className={input} />
      {state.error && <p className="text-xs text-red-400">{state.error}</p>}
      {state.ok && <p className="text-xs text-emerald-400">Password aggiornata.</p>}
      <button type="submit" disabled={pending}
        className="flex items-center justify-center gap-2 self-start rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">
        {pending && <Loader2 className="size-4 animate-spin" />} Aggiorna password
      </button>
    </form>
  );
}
