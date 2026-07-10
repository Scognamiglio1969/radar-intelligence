'use client';

import { useState } from 'react';
import { marked } from 'marked';
import { Loader2, Sparkles } from 'lucide-react';

/** Pulsante "genera" + rendering markdown: usato da Cosa è cambiato e Content Studio. */
export function GenerateMd({ endpoint, responseKey, buttonLabel, busyLabel, hint, initial }: {
  endpoint: string;
  responseKey: string;
  buttonLabel: string;
  busyLabel: string;
  hint?: string;
  initial?: string | null;
}) {
  const [content, setContent] = useState<string | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'errore');
      setContent(String(data[responseKey]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!content && !busy && (
        <div className="panel flex flex-col items-center gap-3 px-6 py-12">
          <button onClick={generate}
            className="flex items-center gap-2 rounded-lg bg-sky-500/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-400">
            <Sparkles className="size-4" /> {buttonLabel}
          </button>
          {hint && <p className="text-xs text-slate-600">{hint}</p>}
        </div>
      )}
      {busy && (
        <div className="panel flex items-center gap-2 px-6 py-10 text-sm text-slate-400">
          <Loader2 className="size-4 animate-spin text-sky-400" /> {busyLabel}
        </div>
      )}
      {error && <p className="text-sm text-red-400">Errore: {error}</p>}
      {content && !busy && (
        <>
          <div className="panel px-6 py-5">
            <div className="brief-md text-sm text-slate-300"
              dangerouslySetInnerHTML={{ __html: marked.parse(content) as string }} />
          </div>
          <button onClick={generate}
            className="self-start text-xs text-sky-400 hover:text-sky-300">
            ↻ rigenera
          </button>
        </>
      )}
    </div>
  );
}
