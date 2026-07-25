'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { LOCALES, type Locale } from '@/lib/i18n-dict';

/**
 * Bandierine EN/IT. Cambiano la lingua dell'interfaccia E quella dei contenuti
 * che l'AI genererà d'ora in poi (brief, narrazioni, Point of View…).
 * I contenuti già salvati restano come sono: si riscrivono al prossimo giro.
 */
export function LocaleSwitch({ current, compact = false, publicPage = false }: {
  current: Locale;
  compact?: boolean;
  /** Landing pubblica: nessun login, quindi imposta solo il cookie della lingua. */
  publicPage?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(locale: Locale) {
    if (locale === current || pending) return;
    startTransition(async () => {
      if (publicPage) {
        document.cookie = `sr_locale=${locale};path=/;max-age=31536000;samesite=lax`;
      } else {
        await fetch('/api/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale }),
        });
      }
      router.refresh();
    });
  }

  return (
    <div className={`flex items-center gap-1 ${compact ? '' : 'px-1'}`}>
      {pending && <Loader2 className="size-3 animate-spin text-slate-500" />}
      {LOCALES.map((l) => {
        const active = l.code === current;
        return (
          <button
            key={l.code}
            onClick={() => change(l.code)}
            disabled={pending}
            aria-label={l.label}
            title={active
              ? `${l.label} — active`
              : `Switch to ${l.label}: interface and newly generated AI content (briefs, narratives, Point of View). Collected data is never translated.`}
            className={`rounded px-1 text-base leading-none transition ${
              active ? 'opacity-100' : 'opacity-40 grayscale hover:opacity-80 hover:grayscale-0'
            }`}
          >
            {l.flag}
          </button>
        );
      })}
    </div>
  );
}
