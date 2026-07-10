'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, Sparkles } from 'lucide-react';

// Ricerca della pagina Ascolto: testuale classica oppure semantica
// (l'AI espande il concetto in sinonimi multilingua, ricerca in OR).
export function SearchBox() {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [semantic, setSemantic] = useState(Boolean(sp.get('st')));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    params.delete('pagina');
    params.delete('st');
    if (!q.trim()) {
      params.delete('q');
      router.push(`/listening?${params}`);
      return;
    }
    params.set('q', q.trim());
    if (semantic) {
      setBusy(true);
      try {
        const res = await fetch('/api/expand', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: q.trim() }),
        });
        const data = await res.json();
        if (res.ok && data.terms?.length) params.set('st', data.terms.join('|'));
      } finally {
        setBusy(false);
      }
    }
    router.push(`/listening?${params}`);
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={semantic ? 'Search a concept (e.g. complaints about prices)…' : 'Search text…'}
        className="w-64 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-3 py-1.5 text-xs outline-none placeholder:text-slate-600"
      />
      <button
        type="button"
        onClick={() => setSemantic(!semantic)}
        title="Semantic search: AI expands the concept into synonyms and expressions, across all languages"
        className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition ${
          semantic ? 'bg-violet-500/20 text-violet-300' : 'bg-white/5 text-slate-500 hover:text-slate-300'
        }`}
      >
        <Sparkles className="size-3" /> semantic
      </button>
      <button type="submit" disabled={busy}
        className="rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : 'Search'}
      </button>
    </form>
  );
}
