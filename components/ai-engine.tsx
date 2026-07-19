'use client';

import { useActionState } from 'react';
import { Cpu, Check, Save } from 'lucide-react';
import { updateAiProvider, updateAiModels, type ActionResult } from '@/app/settings/actions';
import { ConnectorKeys, type KeyField } from './connector-keys';

const INIT: ActionResult = { ok: false, msg: '' };

export type EngineOption = {
  id: string;
  label: string;
  configured: boolean;
  fields: KeyField[];
  models: { fast: string; smart: string };
  defaults: { fast: string; smart: string };
};

/**
 * Settings → Budget panel: pick the AI engine (Claude / OpenAI / Grok), enter
 * its key, and optionally override the fast/smart model ids per provider.
 */
export function AiEngine({ options, active }: { options: EngineOption[]; active: string }) {
  const [provState, provAction, provPending] = useActionState(updateAiProvider, INIT);
  const [modelState, modelAction, modelPending] = useActionState(updateAiModels, INIT);
  const current = options.find((o) => o.id === active) ?? options[0];

  return (
    <section className="panel px-5 py-4">
      <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-300">
        <Cpu className="size-4" /> AI engine
      </h2>
      <p className="mb-3 text-[11px] text-slate-600">
        The engine that powers sentiment, briefs, ratings and every AI feature. Pick a provider, enter its key (stored encrypted), and you can switch at any time.
      </p>

      {/* Provider picker */}
      <form action={provAction} className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => (
          <button key={o.id} type="submit" name="provider" value={o.id} disabled={provPending}
            className={`flex flex-col items-start rounded-xl border px-3 py-2.5 text-left transition disabled:opacity-60 ${
              o.id === active
                ? 'border-sky-400 bg-sky-500/10'
                : 'border-[var(--border)] bg-white/[0.02] hover:border-sky-500/40'
            }`}>
            <span className="flex w-full items-center gap-1.5">
              <span className={`text-sm font-semibold ${o.id === active ? 'text-sky-300' : 'text-slate-200'}`}>{o.label}</span>
              {o.id === active && <Check className="ml-auto size-3.5 text-sky-400" />}
            </span>
            <span className={`mt-0.5 text-[10px] ${o.configured ? 'text-emerald-400' : 'text-slate-500'}`}>
              {o.configured ? 'key set' : 'no key yet'}
            </span>
          </button>
        ))}
      </form>
      {provState.msg && <p className={`mt-1.5 text-xs ${provState.ok ? 'text-emerald-400' : 'text-red-400'}`}>{provState.msg}</p>}

      {/* Key for the active provider */}
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{current.label} · API key</p>
        <ConnectorKeys connectorId={current.id} fields={current.fields} />
        {!current.configured && (
          <p className="mt-1.5 text-[11px] text-amber-400/90">Without this key, AI features stay off while {current.label} is the active engine.</p>
        )}
      </div>

      {/* Models for the active provider */}
      <div className="mt-3 border-t border-[var(--border)] pt-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{current.label} · models</p>
        <form action={modelAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="provider" value={current.id} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">Fast model <span className="text-slate-600">· batch tagging, translations</span></span>
            <input name="fast" defaultValue={current.models.fast} placeholder={current.defaults.fast}
              className="w-52 rounded-md border border-[var(--border)] bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-slate-400">Smart model <span className="text-slate-600">· briefs, insights, studio</span></span>
            <input name="smart" defaultValue={current.models.smart} placeholder={current.defaults.smart}
              className="w-52 rounded-md border border-[var(--border)] bg-white/5 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-500" />
          </label>
          <button type="submit" disabled={modelPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <Save className="size-3.5" />{modelPending ? 'Saving…' : 'Save models'}
          </button>
          {modelState.msg && <span className={`text-xs ${modelState.ok ? 'text-emerald-400' : 'text-red-400'}`}>{modelState.msg}</span>}
        </form>
        <p className="mt-1.5 text-[11px] text-slate-600">
          Model ids as the provider publishes them — when a new model comes out, just type its id here. Leave blank to go back to the default ({current.defaults.fast} / {current.defaults.smart}).
        </p>
      </div>
    </section>
  );
}
