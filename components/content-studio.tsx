'use client';

import { useState } from 'react';
import { Loader2, Sparkles, Briefcase, Hash, Camera, Film, Mail, Wand2, Send } from 'lucide-react';
import { CopyButton } from './copy-button';

type Kit = Record<string, string>;

const FORMATS: { id: string; label: string; icon: typeof Mail; pre?: boolean }[] = [
  { id: 'linkedin', label: 'LinkedIn', icon: Briefcase },
  { id: 'xthread', label: 'Thread X', icon: Hash, pre: true },
  { id: 'instagram', label: 'Instagram', icon: Camera },
  { id: 'videohook', label: 'Hook video', icon: Film },
  { id: 'newsletter', label: 'Newsletter', icon: Mail },
];

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none placeholder:text-slate-600';

export function ContentStudio({ suggestions }: { suggestions: string[] }) {
  const [concept, setConcept] = useState('');
  const [kit, setKit] = useState<Kit | null>(null);
  const [hooks, setHooks] = useState<string[] | null>(null);
  const [busyKit, setBusyKit] = useState(false);
  const [busyHooks, setBusyHooks] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call<T>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'errore');
    return data as T;
  }

  async function genKit() {
    if (!concept.trim()) return;
    setBusyKit(true); setError(null);
    try {
      const { kit } = await call<{ kit: Kit }>('/api/studio/kit', { concept });
      setKit(kit);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyKit(false); }
  }

  async function genHooks() {
    if (!concept.trim()) return;
    setBusyHooks(true); setError(null);
    try {
      const { hooks } = await call<{ hooks: string[] }>('/api/studio/hooks', { concept });
      setHooks(hooks);
    } catch (e) { setError((e as Error).message); }
    finally { setBusyHooks(false); }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Concetto */}
      <section className="panel px-5 py-4">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Concetto da sviluppare</label>
        <textarea value={concept} onChange={(e) => setConcept(e.target.value)} rows={2}
          placeholder="es. L'impatto dei data center AI sui consumi energetici, con un dato che sorprende"
          className={`${inputCls} mt-2 resize-y`} />
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="text-xs text-slate-600">Spunti dai trend:</span>
            {suggestions.map((s) => (
              <button key={s} onClick={() => setConcept((c) => c ? c : s)}
                className="rounded-full bg-white/5 px-2.5 py-1 text-xs text-slate-300 transition hover:bg-sky-500/15 hover:text-sky-300">
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={genKit} disabled={busyKit || !concept.trim()}
            className="flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
            {busyKit ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busyKit ? 'Genero il kit…' : 'Genera kit multi-formato'}
          </button>
          <button onClick={genHooks} disabled={busyHooks || !concept.trim()}
            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-50">
            {busyHooks ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4 text-violet-400" />}
            Hook Lab
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </section>

      {/* Hook Lab */}
      {hooks && (
        <section className="panel px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300">
            <Wand2 className="size-4 text-violet-400" /> Hook & titoli alternativi
          </h2>
          <div className="flex flex-col gap-1.5">
            {hooks.map((h, i) => (
              <div key={i} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                <span className="text-slate-200">{h}</span>
                <span className="ml-auto"><CopyButton text={h} /></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Kit multi-formato */}
      {kit && (
        <div className="grid gap-4 lg:grid-cols-2">
          {FORMATS.filter((f) => kit[f.id]).map((f) => (
            <KitCard key={f.id} format={f.id} label={f.label} Icon={f.icon} pre={f.pre}
              text={kit[f.id]} onUpdate={(t) => setKit((k) => ({ ...(k ?? {}), [f.id]: t }))} />
          ))}
        </div>
      )}
    </div>
  );
}

function KitCard({ format, label, Icon, pre, text, onUpdate }: {
  format: string; label: string; Icon: typeof Mail; pre?: boolean;
  text: string; onUpdate: (t: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [refining, setRefining] = useState(false);
  const QUICK = ['più ironico', 'più corto', 'più istituzionale', 'aggiungi un dato'];

  async function refine(inst: string) {
    if (!inst.trim() || refining) return;
    setRefining(true);
    try {
      const res = await fetch('/api/studio/refine', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, instruction: inst, format }),
      });
      const data = await res.json();
      if (res.ok) { onUpdate(data.text); setInstruction(''); }
    } finally { setRefining(false); }
  }

  return (
    <section className="panel flex flex-col px-5 py-4">
      <div className="mb-2 flex items-center gap-2">
        <Icon className="size-4 text-sky-400" />
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="ml-auto"><CopyButton text={text} /></span>
      </div>
      <p className={`flex-1 text-sm leading-relaxed text-slate-300 ${pre ? 'whitespace-pre-line' : ''} ${refining ? 'opacity-50' : ''}`}>{text}</p>
      <div className="mt-3 border-t border-[var(--border)] pt-2.5">
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {QUICK.map((q) => (
            <button key={q} onClick={() => refine(q)} disabled={refining}
              className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400 transition hover:bg-violet-500/15 hover:text-violet-300 disabled:opacity-50">
              {q}
            </button>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); refine(instruction); }} className="flex items-center gap-1.5">
          <input value={instruction} onChange={(e) => setInstruction(e.target.value)}
            placeholder="rifinisci: es. tono più diretto…"
            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-xs outline-none placeholder:text-slate-600" />
          <button type="submit" disabled={refining || !instruction.trim()}
            className="rounded-lg bg-violet-500/90 p-1.5 text-slate-950 transition hover:bg-violet-400 disabled:opacity-50">
            {refining ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
          </button>
        </form>
      </div>
    </section>
  );
}
