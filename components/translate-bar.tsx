'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Languages, Loader2 } from 'lucide-react';

// Selettore lingua di lettura: scrive un cookie e ricarica la pagina;
// il server traduce (con cache permanente) i contenuti visualizzati.
// useTransition tiene lo spinner acceso per l'intera durata reale del refresh.
export function TranslateBar({ current, langs }: { current: string | null; langs: [string, string][] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(lang: string) {
    if (lang === 'off') {
      document.cookie = 'sr_translate=;path=/;max-age=0';
    } else {
      document.cookie = `sr_translate=${lang};path=/;max-age=31536000`;
    }
    startTransition(() => router.refresh());
  }

  return (
    <span className="flex items-center gap-1.5">
      {pending
        ? <Loader2 className="size-3.5 animate-spin text-violet-400" />
        : <Languages className="size-3.5 text-violet-400" />}
      <select
        value={current ?? 'off'}
        onChange={(e) => change(e.target.value)}
        disabled={pending}
        title="Traduci i contenuti nella lingua scelta (la prima volta richiede qualche secondo, poi è istantaneo)"
        className={`rounded-full border px-2 py-1 text-xs outline-none transition ${
          current ? 'border-violet-500/50 bg-violet-500/15 text-violet-300' : 'border-[var(--border)] bg-white/5 text-slate-400'
        }`}
      >
        <option value="off">lingua originale</option>
        {langs.map(([code, label]) => (
          <option key={code} value={code}>traduci in {label}</option>
        ))}
      </select>
      {pending && <span className="text-[10px] text-violet-300">traduco…</span>}
    </span>
  );
}
