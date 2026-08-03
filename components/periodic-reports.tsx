'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CalendarClock, Loader2, Download, Trash2, AlertTriangle, Check, Sparkles, Info,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Report periodico: POV + Brief + i numeri del periodo, alle cadenze scelte.
//
// Ogni edizione è un NUMERO USCITO, non una vista: resta com'era, e porta
// stampata la provenienza della tesi — quando è stata scritta, su che
// finestra, su quanti dati e se è stata riusata da una cadenza precedente.
// ---------------------------------------------------------------------------

type Provenance = {
  povGeneratedAt: string | null; povAgeDays: number | null; povWindowDays: number | null;
  povMentions: number | null; povSources: number | null; povReused: boolean;
  periodFrom: string; periodTo: string; periodMentions: number; generatedAt: string;
};
type Edition = {
  id: number; cadence: string; periodStart: string; periodEnd: string;
  provenance: Provenance; createdAt: string;
};

const CADENCES: { key: string; label: string; note: string }[] = [
  { key: 'daily', label: 'Giornaliero', note: 'tesi riusata' },
  { key: 'weekly', label: 'Settimanale', note: 'tesi riusata' },
  { key: 'biweekly', label: 'Quindicinale', note: 'tesi riusata' },
  { key: 'monthly', label: 'Mensile', note: 'tesi nuova' },
  { key: 'quarterly', label: 'Trimestrale', note: 'tesi nuova' },
  { key: 'semiannual', label: 'Semestrale', note: 'tesi nuova' },
  { key: 'annual', label: 'Annuale', note: 'tesi nuova' },
];
const LABEL = new Map(CADENCES.map((c) => [c.key, c.label]));

const day = (s: string) => new Date(s).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });

export function PeriodicReports() {
  const [editions, setEditions] = useState<Edition[]>([]);
  const [active, setActive] = useState<string[]>([]);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [r1, r2] = await Promise.all([
      fetch('/api/report/periodic'), fetch('/api/report/schedule'),
    ]);
    const d = await r1.json();
    if (r1.ok) setEditions(d.editions ?? []);
    else setMsg({ kind: 'warn', text: d.error ?? 'Errore di caricamento' });
    if (r2.ok) setActive((await r2.json()).cadences ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (cadence: string) => {
    const next = active.includes(cadence) ? active.filter((c) => c !== cadence) : [...active, cadence];
    setActive(next);
    const res = await fetch('/api/report/schedule', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cadences: next }),
    });
    if (!res.ok) { setMsg({ kind: 'warn', text: 'Cadenza non salvata' }); load(); }
  };

  const generate = async (cadence: string) => {
    setBusy(cadence); setMsg(null);
    try {
      const res = await fetch('/api/report/periodic', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cadence }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ kind: 'warn', text: d.error ?? 'Generazione fallita' }); return; }
      const p = d.provenance as Provenance;
      setMsg({
        kind: 'ok',
        text: p.povGeneratedAt
          ? `Edizione ${LABEL.get(cadence)?.toLowerCase()} pronta: ${d.pages} pagine, tesi ${p.povReused ? 'riusata' : 'generata ora'} su ${p.povWindowDays} giorni.`
          : `Edizione ${LABEL.get(cadence)?.toLowerCase()} pronta: ${d.pages} pagine, ma nessuna tesi era disponibile — genera un Point of View e rigenera l'edizione.`,
      });
      load();
    } catch (e) {
      setMsg({ kind: 'warn', text: (e as Error).message });
    } finally { setBusy(''); }
  };

  const remove = async (id: number) => {
    await fetch(`/api/report/periodic?id=${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="flex flex-col gap-4">
      <section className="panel px-5 py-4">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
          <CalendarClock className="size-4 text-sky-400" /> Genera un&rsquo;edizione
        </h2>
        <p className="mb-3 text-[11px] text-slate-600">
          Unisce i numeri del periodo, il brief e la tesi. Le cadenze brevi riusano il Point of View corrente
          invece di riscriverlo — dal mensile in su ne viene generato uno nuovo sulla finestra giusta.
          In entrambi i casi il documento dichiara sempre da dove viene la tesi.
        </p>
        <div className="flex flex-wrap gap-2">
          {CADENCES.map((c) => (
            <div key={c.key}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${active.includes(c.key)
                ? 'border-sky-500/40 bg-sky-500/[0.07]' : 'border-[var(--border)]'}`}>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-300" title="Esce da solo a questa cadenza">
                <input type="checkbox" checked={active.includes(c.key)} onChange={() => toggle(c.key)}
                  className="size-3.5 accent-sky-500" />
                {c.label}
              </label>
              <span className="text-[10px] text-slate-600">{c.note}</span>
              <button onClick={() => generate(c.key)} disabled={!!busy}
                title="Genera un'edizione adesso"
                className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-white/5 disabled:opacity-40">
                {busy === c.key ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                ora
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-600">
          La spunta accende la cadenza: l&rsquo;edizione esce da sola ogni mattina, quando il periodo è trascorso.
          &ldquo;Ora&rdquo; ne produce una subito senza toccare la programmazione.
        </p>
      </section>

      {msg && (
        <p className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm ${msg.kind === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {msg.kind === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {msg.text}
        </p>
      )}

      {editions.length === 0 ? (
        <p className="panel px-5 py-8 text-center text-xs text-slate-600">
          Nessuna edizione ancora. Generane una scegliendo una cadenza qui sopra.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {editions.map((e) => (
            <article key={e.id} className="panel flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3.5">
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm text-slate-200">
                  {LABEL.get(e.cadence) ?? e.cadence}
                  <span className="ml-2 text-xs text-slate-500">{day(e.periodStart)} → {day(e.periodEnd)}</span>
                </p>
                <p className="mt-0.5 flex items-start gap-1.5 text-[11px] text-slate-500">
                  <Info className="mt-0.5 size-3 shrink-0" />
                  {e.provenance?.povGeneratedAt
                    ? `Tesi ${e.provenance.povReused ? 'riusata' : 'generata per questa edizione'}, scritta il `
                      + `${new Date(e.provenance.povGeneratedAt).toLocaleDateString('it-IT')} su ${e.provenance.povWindowDays} giorni `
                      + `e ${(e.provenance.povMentions ?? 0).toLocaleString('it-IT')} menzioni · `
                      + `${e.provenance.periodMentions.toLocaleString('it-IT')} menzioni nel periodo`
                    : 'Nessuna tesi disponibile al momento della generazione'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a href={`/api/export/periodic?id=${e.id}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20">
                  <Download className="size-3.5" /> PDF
                </a>
                <button onClick={() => remove(e.id)}
                  className="rounded-lg border border-[var(--border)] p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-300">
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
