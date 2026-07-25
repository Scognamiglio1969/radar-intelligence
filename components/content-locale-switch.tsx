'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PenLine } from 'lucide-react';
import { LOCALES, type Locale } from '@/lib/i18n-dict';

/**
 * Lingua in cui l'AI SCRIVE. Volutamente separata dalla lingua dell'interfaccia:
 * si può leggere Radar in italiano e far generare brief e Point of View in
 * inglese (o viceversa), perché la lingua del deliverable dipende da chi lo legge,
 * non da chi usa lo strumento.
 * Vale per i testi generati DA ORA: quelli già salvati restano come sono —
 * a meno che translateEndpoint non sia passato: in quel caso il click sulla
 * bandierina traduce SUBITO il contenuto già generato in quella pagina
 * (es. Point of View), invece di limitarsi a impostare una preferenza per
 * la prossima generazione manuale.
 */
export function ContentLocaleSwitch({ current, label, translateEndpoint }: {
  current: Locale; label?: string; translateEndpoint?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function change(locale: Locale) {
    if (locale === current || pending) return;
    setError(null);
    startTransition(async () => {
      const body = JSON.stringify({ locale });
      const headers = { 'Content-Type': 'application/json' };
      await fetch('/api/content-locale', { method: 'POST', headers, body });

      if (translateEndpoint) {
        // Una traduzione fallita NON deve passare inosservata: prima veniva
        // ingoiata e il testo restava nella lingua di prima senza spiegazione,
        // così sembrava che la bandierina non facesse nulla.
        try {
          const res = await fetch(translateEndpoint, { method: 'POST', headers, body });
          if (!res.ok) {
            const d = await res.json().catch(() => null);
            throw new Error(d?.error ?? `translation failed (${res.status})`);
          }
        } catch (e) {
          const m = (e as Error).message;
          setError(/fetch|network/i.test(m) ? 'network error — retry' : m);
          return;                       // niente refresh: l'errore resta visibile
        }
      }
      router.refresh();
    });
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-1"
      title={translateEndpoint
        ? 'The language this content is written in. Click a flag to translate what is already generated on this page — it does not redo the analysis.'
        : 'The language the AI writes in — briefs, Point of View, answers, narratives. Independent from the interface language: you can read Radar in one language and generate deliverables in another. Applies to text generated from now on.'}>
      {pending
        ? <Loader2 className="size-3 animate-spin text-violet-400" />
        : <PenLine className="size-3 text-violet-400" />}
      <span className="text-[11px] text-slate-500">{label ?? 'AI writes in'}</span>
      {LOCALES.map((l) => (
        <button
          key={l.code}
          onClick={() => change(l.code)}
          disabled={pending}
          aria-label={`Generate content in ${l.label}`}
          title={l.code === current ? `${l.label} — active` : `Generate in ${l.label}`}
          className={`rounded px-0.5 text-sm leading-none transition ${
            l.code === current ? 'opacity-100' : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0'
          }`}
        >
          {l.flag}
        </button>
      ))}
    </span>
    {error && <span className="max-w-[22rem] text-[11px] leading-snug text-red-400">{error}</span>}
    </span>
  );
}
