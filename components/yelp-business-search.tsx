'use client';

import { useRef, useState } from 'react';
import { Search, Check, Star } from 'lucide-react';

type YelpHit = { id: string; name: string; address: string; rating: number | null; reviewCount: number };

/** Cerca l'attività su Yelp invece di scrivere l'id a mano — non è un valore
 *  visibile da nessuna parte nell'interfaccia di Yelp, va cercato. */
export function YelpBusinessSearch() {
  const [term, setTerm] = useState('');
  const [location, setLocation] = useState('');
  const [results, setResults] = useState<YelpHit[]>([]);
  const [picked, setPicked] = useState<YelpHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function runSearch(t: string, loc: string) {
    setError(null);
    if (t.trim().length < 2 || loc.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/reviews/lookup-yelp?term=${encodeURIComponent(t)}&location=${encodeURIComponent(loc)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'search failed');
      setResults(data.businesses ?? []);
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  function scheduleSearch(t: string, loc: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(t, loc), 350);
  }

  return (
    <>
      <input type="hidden" name="identifier" value={picked?.id ?? ''} />
      <input type="hidden" name="label" value={picked?.name ?? ''} />
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
          <input
            value={picked ? picked.name : term}
            onChange={(e) => { setTerm(e.target.value); setPicked(null); scheduleSearch(e.target.value, location); }}
            placeholder="Business name"
            autoComplete="off"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] py-1.5 pl-8 pr-2.5 text-sm text-slate-100 outline-none focus:border-sky-500/50"
          />
        </div>
        <input
          value={location}
          onChange={(e) => { setLocation(e.target.value); setPicked(null); scheduleSearch(term, e.target.value); }}
          placeholder="City"
          className="w-32 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/50"
        />
      </div>
      {loading && <p className="text-[11px] text-slate-600">Searching…</p>}
      {error && <p className="text-[11px] text-red-400">{error}</p>}
      {!picked && results.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)]">
          {results.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => { setPicked(b); setResults([]); }}
              className="flex flex-col gap-0.5 px-3 py-1.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
            >
              <span className="flex items-center gap-1.5 truncate font-medium">
                {b.name}
                {b.rating !== null && (
                  <span className="flex items-center gap-0.5 text-[11px] text-amber-400">
                    <Star className="size-3" style={{ fill: 'currentColor' }} /> {b.rating} ({b.reviewCount})
                  </span>
                )}
              </span>
              <span className="truncate text-[11px] text-slate-600">{b.address}</span>
            </button>
          ))}
        </div>
      )}
      {picked && (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
          <Check className="size-3.5" /> {picked.name} selected
          <button type="button" onClick={() => { setPicked(null); setTerm(''); }} className="ml-1 text-slate-600 underline hover:text-slate-400">change</button>
        </p>
      )}
    </>
  );
}
