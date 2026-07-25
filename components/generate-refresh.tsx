'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';

/** Pulsante che chiama un endpoint AI e poi ricarica la pagina (dati in cache). */
export function GenerateRefresh({ endpoint, label, busyLabel }: {
  endpoint: string; label: string; busyLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, { method: 'POST' });
      if (!res.ok) {
        // Un 504/500 non restituisce JSON: senza questo ramo l'utente vedeva
        // solo "error", che non dice nulla su cosa è andato storto.
        const d = await res.json().catch(() => null);
        throw new Error(
          d?.error
          ?? (res.status === 504 || res.status === 408
            ? 'it took too long and timed out — try again in a moment'
            : `the server returned ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`),
        );
      }
      router.refresh();
    } catch (e) {
      const m = (e as Error).message;
      setError(/fetch|network/i.test(m) ? 'network error — check your connection and retry' : m);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <button onClick={run} disabled={busy}
        className="flex items-center gap-2 rounded-lg bg-sky-500/90 px-5 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
        {busy ? busyLabel : label}
      </button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
