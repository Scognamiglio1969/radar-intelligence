'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, CornerDownLeft } from 'lucide-react';
import { SEARCHABLE } from '@/lib/nav';
import { tFor, type Locale } from '@/lib/i18n-dict';

// ---------------------------------------------------------------------------
// La ricerca rapida (⌘K).
//
// Con più di venti destinazioni, chi sa dove vuole andare non dovrebbe cercarlo
// con gli occhi: scrive tre lettere e ci arriva. Chi non lo sa continua a
// scorrere il menù, che resta esattamente com'era — è l'unica aggiunta che non
// toglie niente a nessuno.
//
// Trova anche le pagine diventate schede dentro un'altra: chi cerca "timeline"
// la cerca per nome, non per il posto in cui è finita.
//
// Il filtro è per SOTTOSEQUENZA, non per prefisso: "stkm" trova "Stakeholder
// map". È come si cerca quando si ha già in testa la destinazione.
// ---------------------------------------------------------------------------

/** Le lettere della query compaiono nell'ordine dato? */
function subsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return needle.length === 0;
}

function score(q: string, label: string, also: string[]): number {
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 100;
  if (l.includes(q)) return 80;
  if (also.some((a) => a.toLowerCase().includes(q))) return 60;
  if (subsequence(q, l)) return 40;
  // Le iniziali delle parole: "sg" → "Studio Graph".
  if (subsequence(q, l.split(/\s+/).map((w) => w[0] ?? '').join(''))) return 50;
  return 0;
}

export function CommandPalette({ locale = 'en' }: { locale?: Locale }) {
  const t = tFor(locale);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const scored = SEARCHABLE.map((item) => ({
      item,
      s: needle ? score(needle, t(item.key, item.label), item.also ?? []) : 1,
    })).filter((r) => r.s > 0);
    if (needle) scored.sort((a, b) => b.s - a.s);
    return scored.slice(0, 9).map((r) => r.item);
  }, [q, t]);

  const go = useCallback((href: string) => {
    setOpen(false); setQ(''); setCursor(0);
    router.push(href);
  }, [router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  // Il cursore non ha bisogno di un effetto per restare nei limiti: si ricava.
  const active = Math.min(cursor, Math.max(0, results.length - 1));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]"
      role="dialog" aria-modal="true" aria-label={t('nav.search', 'Search')}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[#0c1226] shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-3">
          <Search className="size-4 shrink-0 text-slate-500" />
          <input
            ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            placeholder={t('nav.searchPlaceholder', 'Go to…')}
            className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-600"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(Math.min(active + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(Math.max(active - 1, 0)); }
              if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active].href); }
            }}
          />
          <kbd className="shrink-0 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-slate-600">esc</kbd>
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-slate-600">
            {t('nav.searchEmpty', 'Nothing with that name.')}
          </p>
        ) : (
          <ul className="max-h-[52vh] overflow-y-auto py-1.5">
            {results.map((r, i) => {
              const Icon = r.icon;
              return (
                <li key={r.href}>
                  <button
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => go(r.href)}
                    className={`flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm ${
                      i === active ? 'bg-sky-500/15 text-sky-200' : 'text-slate-300'
                    }`}>
                    <Icon className="size-4 shrink-0 opacity-70" />
                    <span className="flex-1 truncate">{t(r.key, r.label)}</span>
                    {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-slate-500" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/** La riga cliccabile sopra il menù: la scorciatoia deve essere visibile. */
export function CommandHint({ locale = 'en' }: { locale?: Locale }) {
  const t = tFor(locale);
  const [mac, setMac] = useState(true);
  useEffect(() => { setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)); }, []);

  return (
    <button
      onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}
      className="flex w-full items-center gap-2 rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-1.5 text-left text-xs text-slate-500 transition hover:bg-white/5 hover:text-slate-300">
      <Search className="size-3.5 shrink-0" />
      <span className="flex-1 truncate">{t('nav.searchPlaceholder', 'Go to…')}</span>
      <kbd className="shrink-0 rounded border border-[var(--border)] px-1 py-0.5 text-[10px]">
        {mac ? '⌘' : 'Ctrl'}K
      </kbd>
    </button>
  );
}
