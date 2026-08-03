'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Sparkles, Loader2, Save, Download,
  FileText, BarChart3, AlertTriangle, Check, MessageSquareText,
} from 'lucide-react';
import { EXPORT_SECTIONS, SECTION_GROUPS } from '@/lib/export-sections';

// ---------------------------------------------------------------------------
// Il compositore di report.
//
// L'utente sceglie i grafici, li ordina, li alterna ai commenti — e ogni
// commento può essere scritto a mano o chiesto all'AI. Il report che ne esce
// è una SCALETTA salvata, non un documento congelato: i numeri si ricalcolano
// a ogni esportazione, quindi lo stesso report riesportato fra un mese
// racconta i dati di quel mese.
// ---------------------------------------------------------------------------

type Block =
  | { type: 'chart'; section: string }
  | { type: 'text'; text: string; ai?: boolean };
type Page = { title?: string; blocks: Block[] };
type Report = { id: number; title: string; days: number; pages: Page[]; updatedAt: string };

const LABEL: Record<string, string> = Object.fromEntries(EXPORT_SECTIONS.map((s) => [s.id, s.label]));

export function ReportBuilder() {
  const [reports, setReports] = useState<Report[]>([]);
  const [current, setCurrent] = useState<Report | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/report/custom');
    const d = await res.json();
    if (!res.ok) { setMsg({ kind: 'warn', text: d.error ?? 'Errore di caricamento' }); return; }
    setReports(d.reports ?? []);
    setCurrent((c) => (c ? (d.reports ?? []).find((r: Report) => r.id === c.id) ?? c : (d.reports ?? [])[0] ?? null));
  }, []);

  useEffect(() => { load(); }, [load]);

  const pages = current?.pages ?? [];
  const page = pages[pageIdx];

  const mutate = (fn: (r: Report) => Report) => {
    setCurrent((c) => (c ? fn(structuredClone(c)) : c));
    setDirty(true);
    setMsg(null);
  };

  const setPages = (fn: (p: Page[]) => Page[]) => mutate((r) => ({ ...r, pages: fn(r.pages) }));

  const addChart = (section: string) => setPages((ps) => {
    const next = structuredClone(ps);
    if (!next[pageIdx]) next.push({ title: `Pagina ${next.length + 1}`, blocks: [] });
    next[pageIdx].blocks.push({ type: 'chart', section });
    return next;
  });

  const addText = (at?: number) => setPages((ps) => {
    const next = structuredClone(ps);
    const blocks = next[pageIdx].blocks;
    blocks.splice(at ?? blocks.length, 0, { type: 'text', text: '' });
    return next;
  });

  const move = (i: number, dir: -1 | 1) => setPages((ps) => {
    const next = structuredClone(ps);
    const b = next[pageIdx].blocks;
    const j = i + dir;
    if (j < 0 || j >= b.length) return ps;
    [b[i], b[j]] = [b[j], b[i]];
    return next;
  });

  const removeBlock = (i: number) => setPages((ps) => {
    const next = structuredClone(ps);
    next[pageIdx].blocks.splice(i, 1);
    return next;
  });

  const editText = (i: number, text: string) => setPages((ps) => {
    const next = structuredClone(ps);
    const b = next[pageIdx].blocks[i];
    // Un commento AI toccato a mano smette di essere un commento AI: la
    // responsabilità editoriale è passata a chi ha scritto.
    if (b.type === 'text') { b.text = text; b.ai = false; }
    return next;
  });

  const newReport = async () => {
    setBusy('new');
    const res = await fetch('/api/report/custom', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: `Report ${new Date().toLocaleDateString('it-IT')}`, days: 30 }),
    });
    const d = await res.json();
    setBusy('');
    if (!res.ok) { setMsg({ kind: 'warn', text: d.error ?? 'Creazione fallita' }); return; }
    const res2 = await fetch('/api/report/custom');
    const all = (await res2.json()).reports as Report[];
    setReports(all);
    setCurrent(all.find((r) => r.id === d.id) ?? null);
    setPageIdx(0);
    setDirty(false);
  };

  const save = async () => {
    if (!current) return;
    setBusy('save');
    const res = await fetch('/api/report/custom', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.id, title: current.title, days: current.days, pages: current.pages }),
    });
    setBusy('');
    if (!res.ok) { setMsg({ kind: 'warn', text: (await res.json()).error ?? 'Salvataggio fallito' }); return; }
    setDirty(false);
    setMsg({ kind: 'ok', text: 'Report salvato.' });
    load();
  };

  const remove = async () => {
    if (!current || !confirm(`Eliminare “${current.title}”?`)) return;
    await fetch(`/api/report/custom?id=${current.id}`, { method: 'DELETE' });
    setCurrent(null);
    setPageIdx(0);
    load();
  };

  /**
   * Commenta i grafici della pagina corrente. Una sola richiesta per tutti:
   * il commento arriva subito SOTTO il grafico a cui si riferisce, e i grafici
   * che hanno già un commento non vengono ricommentati.
   */
  const comment = async (only?: string) => {
    if (!current || !page) return;
    const targets: string[] = [];
    page.blocks.forEach((b, i) => {
      if (b.type !== 'chart') return;
      if (only && b.section !== only) return;
      const next = page.blocks[i + 1];
      if (!only && next && next.type === 'text' && next.text.trim()) return;
      targets.push(b.section);
    });
    if (!targets.length) { setMsg({ kind: 'warn', text: 'Ogni grafico di questa pagina ha già un commento.' }); return; }

    setBusy(only ? `comment-${only}` : 'comment');
    setMsg(null);
    try {
      const res = await fetch('/api/report/comment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sections: [...new Set(targets)], days: current.days }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ kind: 'warn', text: d.error ?? 'Generazione fallita' }); return; }

      const comments = d.comments as Record<string, string>;
      const written = new Set<string>();
      setPages((ps) => {
        const next = structuredClone(ps);
        const blocks = next[pageIdx].blocks;
        for (let i = blocks.length - 1; i >= 0; i--) {
          const b = blocks[i];
          if (b.type !== 'chart' || !comments[b.section]) continue;
          if (only && b.section !== only) continue;
          const after = blocks[i + 1];
          if (after && after.type === 'text' && !after.text.trim()) {
            blocks[i + 1] = { type: 'text', text: comments[b.section], ai: true };
          } else if (after && after.type === 'text' && after.ai && only) {
            blocks[i + 1] = { type: 'text', text: comments[b.section], ai: true };
          } else {
            blocks.splice(i + 1, 0, { type: 'text', text: comments[b.section], ai: true });
          }
          written.add(b.section);
        }
        return next;
      });

      const missing = targets.filter((t) => !comments[t]);
      const emptyIds = (d.empty ?? []) as string[];
      setMsg({
        kind: missing.length ? 'warn' : 'ok',
        text: missing.length
          ? `Commenti scritti: ${targets.length - missing.length}. Senza commento: ${missing.map((m) => LABEL[m] ?? m).join(', ')}${emptyIds.length ? ' (nessun dato nel periodo scelto)' : ''}.`
          : `${written.size} commenti generati. Rileggili prima di esportare: la responsabilità editoriale resta tua.`,
      });
    } catch (e) {
      setMsg({ kind: 'warn', text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };

  const download = () => {
    if (!current) return;
    window.location.href = `/api/export/report?id=${current.id}`;
  };

  const chartCount = useMemo(
    () => pages.reduce((s, p) => s + p.blocks.filter((b) => b.type === 'chart').length, 0),
    [pages],
  );
  const textCount = useMemo(
    () => pages.reduce((s, p) => s + p.blocks.filter((b) => b.type === 'text' && b.text.trim()).length, 0),
    [pages],
  );

  if (!current) {
    return (
      <section className="panel px-6 py-10 text-center">
        <BarChart3 className="mx-auto mb-3 size-8 text-slate-600" />
        <p className="mb-1 text-sm text-slate-300">Nessun report personalizzato in questo progetto.</p>
        <p className="mb-5 text-xs text-slate-500">
          Scegli i grafici che ti servono, mettili nell&rsquo;ordine che vuoi e aggiungi i commenti — a mano o generati dall&rsquo;AI.
        </p>
        <button onClick={newReport} disabled={!!busy}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm text-sky-200 hover:bg-sky-500/20 disabled:opacity-50">
          {busy === 'new' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crea il primo report
        </button>
        {msg && <p className="mt-4 text-xs text-amber-300">{msg.text}</p>}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra del report */}
      <section className="panel flex flex-wrap items-center gap-3 px-5 py-3">
        <select value={current.id}
          onChange={(e) => { setCurrent(reports.find((r) => r.id === Number(e.target.value)) ?? null); setPageIdx(0); setDirty(false); }}
          className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-2.5 py-1.5 text-sm text-slate-200">
          {reports.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
        </select>
        <input value={current.title} onChange={(e) => mutate((r) => ({ ...r, title: e.target.value }))}
          className="min-w-[14rem] flex-1 rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm text-slate-100"
          placeholder="Titolo del report" />
        <label className="flex items-center gap-1.5 text-xs text-slate-500">
          periodo
          <select value={current.days} onChange={(e) => mutate((r) => ({ ...r, days: Number(e.target.value) }))}
            className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-2 py-1.5 text-sm text-slate-200">
            {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d} giorni</option>)}
          </select>
        </label>
        <span className="text-xs text-slate-600">{chartCount} grafici · {textCount} commenti</span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={newReport} disabled={!!busy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">
            <Plus className="size-3.5" /> Nuovo
          </button>
          <button onClick={save} disabled={!!busy || !dirty}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/20 disabled:opacity-40">
            {busy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            {dirty ? 'Salva' : 'Salvato'}
          </button>
          <button onClick={download} disabled={!!busy || dirty || chartCount + textCount === 0}
            title={dirty ? 'Salva prima di scaricare' : undefined}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-40">
            <Download className="size-3.5" /> PDF
          </button>
          <button onClick={remove} disabled={!!busy}
            className="rounded-lg border border-[var(--border)] p-1.5 text-slate-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50">
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </section>

      {msg && (
        <p className={`flex items-start gap-2 rounded-lg border px-4 py-2.5 text-sm ${msg.kind === 'ok'
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-200'}`}>
          {msg.kind === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          {msg.text}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[19rem_1fr]">
        {/* Catalogo dei grafici */}
        <section className="panel h-fit px-4 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-200">Grafici disponibili</h2>
          <p className="mb-3 text-[11px] text-slate-600">Clicca per aggiungerli alla pagina aperta.</p>
          <div className="flex flex-col gap-3">
            {SECTION_GROUPS.map((g) => (
              <div key={g}>
                <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">{g}</p>
                <div className="flex flex-wrap gap-1.5">
                  {EXPORT_SECTIONS.filter((s) => s.group === g).map((s) => (
                    <button key={s.id} onClick={() => addChart(s.id)}
                      className="rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-slate-300 hover:border-sky-500/50 hover:bg-sky-500/10 hover:text-sky-200">
                      + {s.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Pagine */}
        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {pages.map((p, i) => (
              <button key={i} onClick={() => setPageIdx(i)}
                className={`rounded-lg border px-3 py-1.5 text-xs ${i === pageIdx
                  ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
                  : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
                {p.title?.trim() || `Pagina ${i + 1}`}
                <span className="ml-1.5 text-slate-600">{p.blocks.length}</span>
              </button>
            ))}
            <button onClick={() => { setPages((ps) => [...ps, { title: `Pagina ${ps.length + 1}`, blocks: [] }]); setPageIdx(pages.length); }}
              className="rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-300">
              <Plus className="inline size-3" /> pagina
            </button>
            {pages.length > 1 && (
              <button onClick={() => { setPages((ps) => ps.filter((_, i) => i !== pageIdx)); setPageIdx(Math.max(0, pageIdx - 1)); }}
                className="rounded-lg border border-[var(--border)] p-1.5 text-slate-600 hover:bg-red-500/10 hover:text-red-300">
                <Trash2 className="size-3.5" />
              </button>
            )}
          </div>

          {page && (
            <div className="panel px-5 py-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input value={page.title ?? ''}
                  onChange={(e) => setPages((ps) => { const n = structuredClone(ps); n[pageIdx].title = e.target.value; return n; })}
                  placeholder="Titolo della pagina (facoltativo)"
                  className="flex-1 rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-1.5 text-sm text-slate-100" />
                <button onClick={() => addText()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                  <MessageSquareText className="size-3.5" /> Commento
                </button>
                <button onClick={() => comment()} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
                  {busy === 'comment' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  Commenta con l&rsquo;AI
                </button>
              </div>

              {page.blocks.length === 0 && (
                <p className="py-8 text-center text-xs text-slate-600">
                  Pagina vuota. Aggiungi un grafico dal catalogo a sinistra.
                </p>
              )}

              <div className="flex flex-col gap-2">
                {page.blocks.map((b, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex flex-col gap-0.5 pt-0.5">
                      <button onClick={() => move(i, -1)} disabled={i === 0}
                        className="text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronUp className="size-3.5" /></button>
                      <button onClick={() => move(i, 1)} disabled={i === page.blocks.length - 1}
                        className="text-slate-600 hover:text-slate-300 disabled:opacity-20"><ChevronDown className="size-3.5" /></button>
                    </div>

                    {b.type === 'chart' ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <BarChart3 className="size-4 text-sky-400" />
                        <span className="text-sm text-slate-200">{LABEL[b.section] ?? b.section}</span>
                        <button onClick={() => comment(b.section)} disabled={!!busy}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-violet-500/30 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-500/10 disabled:opacity-50">
                          {busy === `comment-${b.section}` ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          commenta
                        </button>
                        <button onClick={() => addText(i + 1)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5">
                          <MessageSquareText className="size-3" /> scrivi
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1">
                        <textarea value={b.text} onChange={(e) => editText(i, e.target.value)} rows={3}
                          placeholder="Il tuo commento…"
                          className="w-full resize-y rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm text-slate-100" />
                        {b.ai && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] text-violet-300/80">
                            <Sparkles className="size-3" /> generato dall&rsquo;AI sui numeri del progetto — rileggilo, modificandolo diventa tuo
                          </p>
                        )}
                      </div>
                    )}

                    <button onClick={() => removeBlock(i)}
                      className="pt-0.5 text-slate-600 hover:text-red-300"><Trash2 className="size-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="flex items-start gap-2 px-1 text-[11px] text-slate-600">
            <FileText className="mt-0.5 size-3.5 shrink-0" />
            I grafici vengono ridisegnati con i dati del periodo scelto ogni volta che esporti: il report è una scaletta,
            non una fotografia. Ogni file esportato porta l&rsquo;informativa sull&rsquo;uso dell&rsquo;intelligenza artificiale.
          </p>
        </section>
      </div>
    </div>
  );
}
