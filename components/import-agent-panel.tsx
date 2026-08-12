'use client';

import { useState } from 'react';
import { Brain, Loader2, Check, ArrowRight, AlertTriangle, FileSpreadsheet } from 'lucide-react';

// ---------------------------------------------------------------------------
// L'agente che legge il file, e le sue domande.
//
// Due regole di forma, che vengono da come si legge davvero:
//
//   la LETTURA sta in alto e si legge come un paragrafo, non come una scheda
//   tecnica: chi ha appena caricato un file vuole sapere che cosa ha caricato;
//
//   le DOMANDE arrivano solo dove la risposta cambia il risultato, con le
//   opzioni già scritte e una consigliata. Rispondere è un clic. Una domanda
//   che si può saltare senza conseguenze non andava fatta, e chiederla lo
//   stesso toglie credito a quelle che contano.
// ---------------------------------------------------------------------------

type Action = Record<string, unknown> & { do: string };
type Question = {
  id: string; text: string; why: string; sheets: string[];
  recommended: string;
  options: { id: string; label: string; effect: string; action: Action }[];
};
type Reading = {
  summary: string;
  sheets: { sheet: string; what: string }[];
  questions: Question[];
};

export function ImportAgentPanel({ projectId, onApplied }: {
  projectId: number;
  onApplied: () => void;
}) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [answered, setAnswered] = useState<Record<string, string>>({});
  const [applying, setApplying] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const read = async () => {
    setBusy(true); setError(''); setReading(null); setAnswered({}); setNotes({});
    try {
      const res = await fetch('/api/import/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Lettura non riuscita'); return; }
      setReading(d.reading);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };

  const answer = async (q: Question, optionId: string) => {
    const opt = q.options.find((o) => o.id === optionId);
    if (!opt) return;
    setApplying(q.id);
    try {
      const res = await fetch('/api/import/agent', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, action: opt.action }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Non riuscito'); return; }
      setAnswered((a) => ({ ...a, [q.id]: optionId }));
      setNotes((n) => ({ ...n, [q.id]: d.note ?? '' }));
      onApplied();
    } catch (e) { setError((e as Error).message); }
    finally { setApplying(''); }
  };

  const open = reading ? reading.questions.filter((q) => !answered[q.id]).length : 0;

  return (
    <section className="panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Brain className="size-4 shrink-0 text-violet-300" />
        <h2 className="text-sm font-semibold text-slate-200">Fammi leggere i file</h2>
        <p className="min-w-0 flex-1 text-[11px] text-slate-600">
          Guardo tutti i fogli insieme — forme, distribuzioni, che cosa si somiglia — e ti dico che
          cosa hai caricato. Poi chiedo solo dove la tua risposta cambia il risultato.
        </p>
        <button onClick={read} disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Brain className="size-3.5" />}
          {busy ? 'Sto leggendo tutto…' : reading ? 'Rileggi' : 'Leggi i file'}
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3.5 py-2.5 text-xs text-amber-200">{error}</p>}

      {reading && (
        <div className="mt-4 flex flex-col gap-4">
          {reading.summary && (
            <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{reading.summary}</p>
          )}

          {reading.sheets.length > 0 && (
            <ul className="flex flex-col gap-1">
              {reading.sheets.map((s) => (
                <li key={s.sheet} className="flex items-baseline gap-2 text-xs">
                  <FileSpreadsheet className="mt-0.5 size-3 shrink-0 text-slate-600" />
                  <span className="shrink-0 font-medium text-slate-300">{s.sheet}</span>
                  <span className="text-slate-500">{s.what}</span>
                </li>
              ))}
            </ul>
          )}

          {reading.questions.length > 0 ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                {open === 0
                  ? 'Hai risposto a tutto'
                  : `${open} ${open === 1 ? 'domanda' : 'domande'} — solo dove la risposta cambia qualcosa`}
              </p>
              {reading.questions.map((q) => (
                <QuestionCard
                  key={q.id} q={q}
                  chosen={answered[q.id]} note={notes[q.id]}
                  busy={applying === q.id}
                  onAnswer={(o) => answer(q, o)}
                />
              ))}
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-emerald-300">
              <Check className="size-3.5 shrink-0" />
              Non c’è niente di ambiguo: i fogli si leggono da soli.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function QuestionCard({ q, chosen, note, busy, onAnswer }: {
  q: Question; chosen?: string; note?: string; busy: boolean;
  onAnswer: (optionId: string) => void;
}) {
  if (chosen) {
    const opt = q.options.find((o) => o.id === chosen);
    return (
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.04] px-4 py-3">
        <p className="flex items-start gap-1.5 text-xs text-emerald-300">
          <Check className="mt-0.5 size-3.5 shrink-0" />
          <span><span className="text-slate-400">{q.text}</span> — {opt?.label}</span>
        </p>
        {note && <p className="mt-1 pl-5 text-[11px] text-slate-500">{note}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-3.5">
      <p className="mb-1 flex items-start gap-1.5 text-sm text-slate-200">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-sky-400" />
        {q.text}
      </p>
      {q.why && <p className="mb-1 pl-5 text-[11px] leading-relaxed text-slate-500">{q.why}</p>}
      {q.sheets.length > 0 && (
        <p className="mb-2.5 pl-5 text-[11px] text-slate-600">
          Riguarda: {q.sheets.slice(0, 6).join(', ')}{q.sheets.length > 6 ? ` e altri ${q.sheets.length - 6}` : ''}
        </p>
      )}
      <div className="flex flex-col gap-1.5 pl-5">
        {q.options.map((o) => (
          <button key={o.id} onClick={() => onAnswer(o.id)} disabled={busy}
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition disabled:opacity-50 ${
              o.id === q.recommended
                ? 'border-sky-500/40 bg-sky-500/[0.07] hover:bg-sky-500/15'
                : 'border-[var(--border)] hover:bg-white/5'
            }`}>
            {busy ? <Loader2 className="mt-0.5 size-3.5 shrink-0 animate-spin text-slate-500" />
              : <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-slate-600" />}
            <span className="min-w-0">
              <span className="block text-xs text-slate-200">
                {o.label}
                {o.id === q.recommended && <span className="ml-1.5 text-[10px] text-sky-400">consigliato</span>}
              </span>
              {o.effect && <span className="block text-[11px] leading-snug text-slate-600">{o.effect}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
