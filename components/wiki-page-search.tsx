'use client';

import { useRef, useState } from 'react';
import { Search, Check } from 'lucide-react';

type WikiPageHit = { title: string; snippet: string; wordcount: number };

/** Cerca la pagina Wikipedia invece di farla scrivere a mano: il titolo esatto
 *  (es. "Anthropic" e non "Anthropic PBC" o "Anthropic Inc") deve combaciare
 *  con quello vero, altrimenti l'API delle revisioni risponde vuota in silenzio. */
export function WikiPageSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WikiPageHit[]>([]);
  const [picked, setPicked] = useState<WikiPageHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runSearch(q: string) {
    setError(null);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/wikipedia/lookup-page?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'search failed');
      setResults(data.pages ?? []);
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function scheduleSearch(q: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(q), 350);
  }

  return (
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <input type="hidden" name="title" value={picked?.title ?? ''} />
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
        <input
          value={picked ? picked.title : query}
          onChange={(e) => { setQuery(e.target.value); setPicked(null); scheduleSearch(e.target.value); }}
          placeholder="Search Wikipedia page (e.g. Anthropic)"
          autoComplete="off"
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] py-1.5 pl-8 pr-2.5 text-sm text-slate-100 outline-none focus:border-sky-500/50"
        />
      </div>
      {loading && <p className="text-[11px] text-slate-600">Searching…</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!picked && results.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)]">
          {results.map((p) => (
            <button
              key={p.title}
              type="button"
              onClick={() => { setPicked(p); setResults([]); }}
              className="flex flex-col gap-0.5 px-3 py-1.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
            >
              <span className="truncate font-medium">{p.title}</span>
              <span className="truncate text-[11px] text-slate-600">{p.snippet}</span>
            </button>
          ))}
        </div>
      )}
      {picked && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <Check className="size-3.5" /> {picked.title} selected
          <button type="button" onClick={() => { setPicked(null); setQuery(''); }} className="ml-1 text-slate-600 underline hover:text-slate-400">change</button>
        </p>
      )}
    </div>
  );
}
