'use client';

import { useRef, useState } from 'react';
import { marked } from 'marked';
import { Loader2, SendHorizonal } from 'lucide-react';

type Turn = { q: string; a: string };

export function AskChat({ suggestions }: { suggestions: string[] }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    setInput('');
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, history: turns.slice(-3) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'errore');
      setTurns((t) => [...t, { q: question, a: data.answer }]);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {turns.length === 0 && (
        <div className="panel px-5 py-5">
          <p className="mb-3 text-sm text-slate-400">Prova a chiedere:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => ask(s)}
                className="rounded-full border border-[var(--border)] bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition hover:border-sky-500/50 hover:text-sky-300">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {turns.map((t, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-sky-500/15 px-4 py-2.5 text-sm text-sky-100">
            {t.q}
          </div>
          <div className="panel max-w-[92%] px-5 py-4">
            <div className="brief-md text-sm text-slate-300"
              dangerouslySetInnerHTML={{ __html: marked.parse(t.a) as string }} />
          </div>
        </div>
      ))}

      {busy && (
        <div className="panel flex max-w-[92%] items-center gap-2 px-5 py-4 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin text-sky-400" /> Sto analizzando i dati…
        </div>
      )}
      {error && <p className="text-sm text-red-400">Errore: {error}</p>}
      <div ref={bottomRef} />

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="sticky bottom-4 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-2 shadow-lg"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Fai una domanda sui dati…"
          className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-slate-600"
        />
        <button type="submit" disabled={busy || !input.trim()}
          className="rounded-lg bg-sky-500/90 p-2 text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
          <SendHorizonal className="size-4" />
        </button>
      </form>
      <p className="text-center text-[11px] text-slate-600">
        Ogni domanda costa ~1 centesimo di API. Le risposte si basano sugli ultimi 14 giorni di dati.
      </p>
    </div>
  );
}
