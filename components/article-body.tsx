'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, FileText } from 'lucide-react';

/**
 * Il testo integrale dell'articolo, a richiesta.
 *
 * Le parole significative sono evidenziate perché la domanda vera, davanti a
 * una rassegna stampa, non è "di cosa parla" ma "dove parla di me": un pezzo
 * che ti nomina nel titolo e uno che ti cita alla quarantesima riga hanno lo
 * stesso aspetto in un elenco di link. Colori distinti separano ciò che stavi
 * cercando dai termini che il progetto sorveglia.
 */
function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type Props = {
  text: string;
  /** Ciò che l'utente sta cercando ora: evidenziato in primo piano. */
  query?: string[];
  /** Termini sorvegliati dal progetto: evidenziati in secondo piano. */
  keywords?: string[];
  label?: string;
  hideLabel?: string;
};

export function ArticleBody({ text, query = [], keywords = [], label, hideLabel }: Props) {
  const [open, setOpen] = useState(false);

  const parts = useMemo(() => {
    const q = query.map((s) => s.trim()).filter((s) => s.length > 2);
    const k = keywords.map((s) => s.trim()).filter((s) => s.length > 2 && !q.includes(s));
    if (q.length === 0 && k.length === 0) return [{ s: text, hit: 0 as 0 | 1 | 2 }];

    // I termini più lunghi per primi: senza, "AI" spezzerebbe "AI Act" a metà.
    const all = [...q.map((s) => [s, 1] as const), ...k.map((s) => [s, 2] as const)]
      .sort((a, b) => b[0].length - a[0].length);
    const rank = new Map(all.map(([s, r]) => [s.toLowerCase(), r]));
    const re = new RegExp(`(${all.map(([s]) => escapeRe(s)).join('|')})`, 'gi');

    return text.split(re).map((s) => ({ s, hit: (rank.get(s.toLowerCase()) ?? 0) as 0 | 1 | 2 }));
  }, [text, query, keywords]);

  const hits = parts.filter((p) => p.hit).length;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-slate-400 transition hover:bg-white/5 hover:text-sky-300"
        aria-expanded={open}
      >
        <FileText className="size-3.5" />
        {open ? (hideLabel ?? 'Hide the article') : (label ?? 'Read the full article')}
        <span className="text-slate-600">
          · {Math.round(text.length / 1000)}k chars{hits > 0 && `, ${hits} matches`}
        </span>
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 max-h-[26rem] overflow-y-auto rounded-lg border border-[var(--border)] bg-black/20 px-4 py-3">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-300">
            {parts.map((p, i) =>
              p.hit === 1 ? (
                <mark key={i} className="rounded bg-sky-400/25 px-0.5 font-medium text-sky-200">{p.s}</mark>
              ) : p.hit === 2 ? (
                <mark key={i} className="rounded bg-amber-400/20 px-0.5 text-amber-200">{p.s}</mark>
              ) : (
                <span key={i}>{p.s}</span>
              ),
            )}
          </p>
          <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10px] text-slate-600">
            Extracted from the publisher’s page for analysis. Open the original link to read it in context.
          </p>
        </div>
      )}
    </div>
  );
}
