'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Shapes, X } from 'lucide-react';

// ---------------------------------------------------------------------------
// I grafici costruiti dall'utente dentro l'hub degli insight.
//
// Stanno accanto a quelli di Radar perché rispondono alla stessa domanda del
// lettore — "che cosa posso guardare?" — ma non sono la stessa cosa, e la
// differenza si vede senza doverla spiegare: solo questi hanno la X.
// Un insight dell'app non si cancella perché non è tuo; il tuo sì.
// ---------------------------------------------------------------------------

type Chart = { id: number; title: string; question: string };

export function InsightStudioCards({ charts }: { charts: Chart[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const [error, setError] = useState('');

  const remove = async (id: number) => {
    setBusy(id); setError('');
    try {
      const res = await fetch(`/api/studio?id=${id}`, { method: 'DELETE' });
      if (!res.ok) {
        setError((await res.json().catch(() => ({}))).error ?? 'Non è stato possibile cancellarlo');
        return;
      }
      router.refresh();
    } finally {
      setBusy(null); setConfirm(null);
    }
  };

  return (
    <>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {charts.map((c) => (
          <div key={c.id}
            className="panel group relative flex items-start gap-3 px-4 py-3 transition hover:border-violet-500/40 hover:bg-violet-500/[0.04]">
            <Shapes className="mt-0.5 size-4 shrink-0 text-violet-400" />
            <Link href={`/graph?chart=${c.id}`} className="min-w-0 flex-1" title="Aprilo in Studio Graph">
              <span className="block pr-6 text-sm font-medium text-slate-200 transition group-hover:text-violet-200">
                {c.title}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{c.question}</span>
            </Link>

            {confirm === c.id ? (
              // La conferma sta dentro la scheda: una finestra di sistema per
              // togliere un grafico che si rifà in dieci secondi è di troppo.
              <span className="absolute right-2 top-2 flex items-center gap-1 rounded-lg border border-red-500/40 bg-[#0c1226] px-1.5 py-1 text-[10px]">
                <span className="text-slate-400">Tolgo?</span>
                <button onClick={() => remove(c.id)} disabled={busy === c.id}
                  className="rounded px-1 font-semibold text-red-300 hover:bg-red-500/15">
                  {busy === c.id ? <Loader2 className="size-3 animate-spin" /> : 'sì'}
                </button>
                <button onClick={() => setConfirm(null)} className="rounded px-1 text-slate-500 hover:text-slate-300">no</button>
              </span>
            ) : (
              <button onClick={() => setConfirm(c.id)}
                title="Togli questo grafico. Sparisce anche da report ed export che lo citano."
                className="absolute right-2 top-2 rounded-lg p-1 text-slate-600 opacity-0 transition hover:bg-red-500/15 hover:text-red-300 focus:opacity-100 group-hover:opacity-100">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
      {error && <p className="mt-2 text-xs text-amber-300">{error}</p>}
    </>
  );
}
