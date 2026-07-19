'use client';

import { useActionState } from 'react';
import { RotateCcw, Save, Lock } from 'lucide-react';
import { updateApiBudget, resetApiSpend, type ActionResult } from '@/app/settings/actions';

const INIT: ActionResult = { ok: false, msg: '' };

export function CostControl({ budget, lifetimeCost, lifetimeCalls, resetAt }: {
  budget: number; lifetimeCost: number; lifetimeCalls: number; resetAt: string;
}) {
  const [budgetState, budgetAction, budgetPending] = useActionState(updateApiBudget, INIT);
  const [resetState, resetAction, resetPending] = useActionState(resetApiSpend, INIT);

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-[var(--border)] pt-4">
      {/* Budget */}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Spend cap</h3>
        <form action={budgetAction} className="flex flex-wrap items-center gap-2">
          <span className="text-slate-400">$</span>
          <input name="budget" type="number" step="0.5" min="0.5" defaultValue={budget}
            className="w-28 rounded-lg border border-[var(--border)] bg-white/5 px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500" />
          <button type="submit" disabled={budgetPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <Save className="size-3.5" />{budgetPending ? 'Saving…' : 'Save budget'}
          </button>
          {budgetState.msg && <span className={`text-xs ${budgetState.ok ? 'text-emerald-400' : 'text-red-400'}`}>{budgetState.msg}</span>}
        </form>
        <p className="mt-1 text-[11px] text-slate-600">When spend since the last reset reaches this cap, Radar stops calling the AI (data collection keeps running).</p>
      </div>

      {/* Reset */}
      <div>
        <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Reset spend counter</h3>
        <form action={resetAction} className="flex flex-wrap items-center gap-2">
          <span className="relative inline-flex items-center">
            <Lock className="pointer-events-none absolute left-2.5 size-3.5 text-slate-500" />
            <input name="password" type="password" placeholder="Your account password" required
              className="w-56 rounded-lg border border-[var(--border)] bg-white/5 py-1.5 pl-8 pr-3 text-sm text-slate-100 outline-none focus:border-sky-500" />
          </span>
          <button type="submit" disabled={resetPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
            <RotateCcw className="size-3.5" />{resetPending ? 'Resetting…' : 'Reset to $0'}
          </button>
          {resetState.msg && <span className={`text-xs ${resetState.ok ? 'text-emerald-400' : 'text-red-400'}`}>{resetState.msg}</span>}
        </form>
        <p className="mt-1 text-[11px] text-slate-600">
          Zeroes the budget counter and starts a new window from now. Requires your admin password. Last reset:{' '}
          <span className="text-slate-500">{new Date(resetAt).toLocaleString('en-US')}</span>.
        </p>
      </div>

      {/* Totale storico */}
      <div className="rounded-lg border border-[var(--border)] bg-white/[0.02] px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">All-time spend · every user</p>
        <p className="mt-1 text-2xl font-bold text-slate-100">${lifetimeCost.toFixed(2)}</p>
        <p className="text-xs text-slate-500">{lifetimeCalls.toLocaleString('en-US')} AI calls total — this figure is never affected by resets.</p>
      </div>
    </div>
  );
}
