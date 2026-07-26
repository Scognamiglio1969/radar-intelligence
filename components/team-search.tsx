'use client';

import { useState } from 'react';
import { Search, Check } from 'lucide-react';

type TeamHit = { id: string; name: string; shortName: string; crest: string | null };

/**
 * Cerca la squadra dentro football-data.org invece di farla scrivere a mano:
 * il nome dei tabellini (es. "Juventus FC") spesso non coincide con quello
 * comune ("Juventus"), e un confronto sbagliato rompe in silenzio il calcolo
 * casa/trasferta. Qui il nome esatto arriva sempre dall'API, e anche la
 * competizione fa parte di questo stesso campo per poterla cambiare senza
 * ricaricare la pagina.
 */
export function TeamSearch({ competitions }: { competitions: { code: string; label: string }[] }) {
  const [competition, setCompetition] = useState(competitions[0]?.code ?? '');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TeamHit[]>([]);
  const [picked, setPicked] = useState<TeamHit | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(q: string, comp: string) {
    setPicked(null);
    setError(null);
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/sport/lookup-team?competition=${encodeURIComponent(comp)}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'search failed');
      setResults(data.teams ?? []);
    } catch (e) {
      setError((e as Error).message);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <input type="hidden" name="teamId" value={picked?.id ?? ''} />
      <input type="hidden" name="teamName" value={picked?.name ?? ''} />
      <select
        name="competition"
        value={competition}
        onChange={(e) => {
          setCompetition(e.target.value);
          setPicked(null);
          setResults([]);
          if (query.trim().length >= 2) runSearch(query, e.target.value);
        }}
        className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none"
      >
        {competitions.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
      </select>

      <div className="flex flex-col gap-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-600" />
          <input
            value={picked ? picked.name : query}
            onChange={(e) => { setQuery(e.target.value); runSearch(e.target.value, competition); }}
            placeholder="Search team (e.g. Juventus)"
            autoComplete="off"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] py-1.5 pl-8 pr-2.5 text-sm text-slate-100 outline-none focus:border-sky-500/50"
          />
        </div>
        {loading && <p className="text-[11px] text-slate-600">Searching…</p>}
        {error && <p className="text-[11px] text-red-400">{error}</p>}
        {!picked && results.length > 0 && (
          <div className="flex flex-col overflow-hidden rounded-lg border border-[var(--border)]">
            {results.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setPicked(t); setResults([]); }}
                className="flex items-center gap-2 px-3 py-1.5 text-left text-sm text-slate-200 transition hover:bg-white/5"
              >
                {t.crest && <img src={t.crest} alt="" className="size-4 shrink-0" />}
                <span className="truncate">{t.name}</span>
                <span className="ml-auto shrink-0 text-[11px] text-slate-600">{t.shortName}</span>
              </button>
            ))}
          </div>
        )}
        {picked && (
          <p className="flex items-center gap-1.5 text-[11px] text-emerald-400">
            <Check className="size-3.5" /> {picked.name} selected (ID {picked.id})
            <button type="button" onClick={() => { setPicked(null); setQuery(''); }} className="ml-1 text-slate-600 underline hover:text-slate-400">change</button>
          </p>
        )}
      </div>
    </>
  );
}
