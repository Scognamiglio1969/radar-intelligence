'use client';

import { useEffect, useState } from 'react';
import {
  Download, FileText, FileSpreadsheet, FileType2, Presentation,
  Loader2, X, Check, CheckCircle2,
} from 'lucide-react';
import { EXPORT_SECTIONS, ALL_SECTION_IDS, SECTION_GROUPS } from '@/lib/export-sections';

const ALL_IDS = ALL_SECTION_IDS as string[];

const FORMATS = [
  { id: 'pdf', label: 'PDF', icon: FileText, color: 'text-red-400', hint: 'Formatted report' },
  { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet, color: 'text-emerald-400', hint: 'Data in sheets' },
  { id: 'docx', label: 'Word', icon: FileType2, color: 'text-sky-400', hint: 'Document' },
  { id: 'pptx', label: 'PowerPoint', icon: Presentation, color: 'text-orange-400', hint: 'Presentation' },
] as const;

type Format = (typeof FORMATS)[number]['id'];

export function ExportBar() {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<Format>('pdf');
  const [scope, setScope] = useState<'complete' | 'custom'>('complete');
  const [selected, setSelected] = useState<Set<string>>(new Set(ALL_IDS));
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Ricorda l'ultima configurazione
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sr_export') ?? '{}');
      if (saved.format) setFormat(saved.format);
      if (saved.scope) setScope(saved.scope);
      if (saved.days) setDays(saved.days);
      if (Array.isArray(saved.selected)) setSelected(new Set(saved.selected));
    } catch { /* nessuna preferenza salvata */ }
  }, []);

  function persist(next: Partial<{ format: Format; scope: string; days: number; selected: string[] }>) {
    const cur = { format, scope, days, selected: [...selected], ...next };
    localStorage.setItem('sr_export', JSON.stringify(cur));
  }

  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
    persist({ selected: [...next] });
  }

  async function generate() {
    setBusy(true);
    try {
      const ids = scope === 'complete' ? ALL_IDS : [...selected];
      if (ids.length === 0) { setBusy(false); return; }
      const qs = new URLSearchParams({ sections: ids.join(','), days: String(days) });
      const res = await fetch(`/api/export/${format}?${qs}`);
      if (!res.ok) throw new Error('export failed');
      const blob = await res.blob();
      const name = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? `radar.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
      setOpen(false);
      setToast(`${format.toUpperCase()} export downloaded.`);
      setTimeout(() => setToast(null), 5000);
    } catch {
      setToast('Export failed, please retry.');
      setTimeout(() => setToast(null), 5000);
    } finally {
      setBusy(false);
    }
  }

  const activeFormat = FORMATS.find((f) => f.id === format)!;

  return (
    <>
      <div className="mb-5 flex justify-end">
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10">
          <Download className="size-4 text-sky-400" /> Export
        </button>
      </div>

      {/* Pannello: bottom-sheet su mobile, modale centrata da sm in su */}
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !busy && setOpen(false)} />
          <div className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--border)] bg-[#0c1226] shadow-2xl sm:max-w-lg sm:rounded-2xl">
            <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
              <Download className="size-4 text-sky-400" />
              <h2 className="text-sm font-semibold">Export report</h2>
              <button onClick={() => !busy && setOpen(false)} className="ml-auto rounded-lg p-1 text-slate-500 hover:bg-white/10 hover:text-slate-200">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Formato */}
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Format</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FORMATS.map((f) => {
                  const active = format === f.id;
                  return (
                    <button key={f.id} onClick={() => { setFormat(f.id); persist({ format: f.id }); }}
                      className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-xs transition ${
                        active ? 'border-sky-500/60 bg-sky-500/10 text-sky-200' : 'border-[var(--border)] text-slate-400 hover:bg-white/5'
                      }`}>
                      <f.icon className={`size-5 ${f.color}`} />
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* Ambito */}
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">What to export</p>
              <div className="grid grid-cols-2 gap-2">
                {(['complete', 'custom'] as const).map((s) => (
                  <button key={s} onClick={() => { setScope(s); persist({ scope: s }); }}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      scope === s ? 'border-sky-500/60 bg-sky-500/10 text-sky-200' : 'border-[var(--border)] text-slate-400 hover:bg-white/5'
                    }`}>
                    {s === 'complete' ? 'Full state' : 'Customize'}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-slate-600">
                {scope === 'complete'
                  ? `Everything the report can hold — all ${ALL_IDS.length} sections. Each format renders the ones that suit it (e.g. the raw mentions list goes to PDF/Word/Excel, not the slides).`
                  : 'Pick exactly what to include. Sections that a format cannot show are skipped automatically.'}
              </p>

              {/* Checklist sezioni (solo in personalizza) */}
              {scope === 'custom' && (
                <div className="mt-3 rounded-lg border border-[var(--border)] p-2">
                  <div className="mb-1 flex items-center justify-between px-1">
                    <span className="text-xs text-slate-500">{selected.size} sections selected</span>
                    <div className="flex gap-2 text-xs">
                      <button onClick={() => { setSelected(new Set(ALL_IDS)); persist({ selected: ALL_IDS }); }} className="text-sky-400 hover:text-sky-300">all</button>
                      <button onClick={() => { setSelected(new Set()); persist({ selected: [] }); }} className="text-slate-500 hover:text-slate-300">none</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {SECTION_GROUPS.map((group) => (
                      <div key={group}>
                        <p className="px-1 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-600">{group}</p>
                        <div className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                          {EXPORT_SECTIONS.filter((s) => s.group === group).map((s) => {
                            const on = selected.has(s.id);
                            return (
                              <button key={s.id} onClick={() => toggle(s.id)}
                                className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${on ? 'text-slate-200' : 'text-slate-500'} hover:bg-white/5`}>
                                <span className={`flex size-4 shrink-0 items-center justify-center rounded border ${on ? 'border-sky-500 bg-sky-500 text-slate-950' : 'border-[var(--border)]'}`}>
                                  {on && <Check className="size-3" />}
                                </span>
                                {s.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Periodo */}
              <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">Data period</p>
              <div className="flex gap-2">
                {[7, 30, 90].map((d) => (
                  <button key={d} onClick={() => { setDays(d); persist({ days: d }); }}
                    className={`rounded-full px-4 py-1.5 text-sm transition ${
                      days === d ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-slate-400 hover:text-slate-200'
                    }`}>
                    {d} days
                  </button>
                ))}
              </div>
            </div>

            {/* Azione */}
            <div className="border-t border-[var(--border)] px-5 py-3.5">
              <button onClick={generate} disabled={busy || (scope === 'custom' && selected.size === 0)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <activeFormat.icon className="size-4" />}
                {busy ? 'Generating file…' : `Generate ${activeFormat.label}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-500/30 bg-[#0c1226]/95 px-4 py-2.5 text-xs text-slate-200 shadow-xl backdrop-blur">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          {toast}
        </div>
      )}
    </>
  );
}
