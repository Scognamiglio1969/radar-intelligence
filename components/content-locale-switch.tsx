'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, PenLine } from 'lucide-react';
import { LOCALES, type Locale } from '@/lib/i18n-dict';

/**
 * Lingua in cui l'AI SCRIVE. Volutamente separata dalla lingua dell'interfaccia:
 * si può leggere Radar in italiano e far generare brief e Point of View in
 * inglese (o viceversa), perché la lingua del deliverable dipende da chi lo legge,
 * non da chi usa lo strumento.
 * Vale per i testi generati DA ORA: quelli già salvati restano come sono.
 */
export function ContentLocaleSwitch({ current, label }: { current: Locale; label?: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(locale: Locale) {
    if (locale === current || pending) return;
    startTransition(async () => {
      await fetch('/api/content-locale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      router.refresh();
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-white/[0.03] px-2.5 py-1"
      title="The language the AI writes in — briefs, Point of View, answers, narratives. Independent from the interface language: you can read Radar in one language and generate deliverables in another. Applies to text generated from now on.">
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
  );
}
