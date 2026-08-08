'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Plus, Trash2, ChevronUp, ChevronDown, Sparkles, Loader2, Save, Download,
  FileText, BarChart3, AlertTriangle, Check, MessageSquareText,
  Presentation, GitMerge, PenLine,
  Shapes,
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

type Role = 'intro' | 'comment' | 'synthesis' | 'free';
type Block =
  | { type: 'chart'; section: string }
  | { type: 'text'; text: string; ai?: boolean; role?: Role }
  | { type: 'studio'; chartId: number };
type Page = { title?: string; blocks: Block[] };
type Report = { id: number; title: string; days: number; pages: Page[]; updatedAt: string };

const LABEL: Record<string, string> = Object.fromEntries(EXPORT_SECTIONS.map((s) => [s.id, s.label]));

// Ogni ruolo ha la sua icona e il suo colore, gli stessi che nel PDF diventano
// etichetta e filetto: chi compone a schermo riconosce a colpo d'occhio che
// cosa troverà stampato.
const ROLE: Record<Role, { label: string; icon: typeof Sparkles; cls: string; rule: string }> = {
  intro: { label: 'Presentazione', icon: Presentation, cls: 'text-sky-300', rule: 'bg-sky-500' },
  comment: { label: 'Commento', icon: MessageSquareText, cls: 'text-violet-300', rule: 'bg-violet-500' },
  synthesis: { label: 'Sintesi della pagina', icon: GitMerge, cls: 'text-teal-300', rule: 'bg-teal-500' },
  free: { label: 'Nota', icon: PenLine, cls: 'text-slate-400', rule: 'bg-slate-500' },
};

const REQUESTS: { key: 'intro' | 'comment' | 'both' | 'synthesis'; label: string; hint: string }[] = [
  { key: 'comment', label: 'Commento (dopo il grafico)', hint: 'legge i numeri e ne trae l’implicazione' },
  { key: 'intro', label: 'Presentazione (prima del grafico)', hint: 'prepara la lettura senza anticipare la conclusione' },
  { key: 'both', label: 'Entrambi (prima e dopo)', hint: 'due testi distinti, non lo stesso spostato' },
  { key: 'synthesis', label: 'Sintesi della pagina (in fondo)', hint: 'che cosa dicono insieme i grafici della pagina' },
];

export function ReportBuilder() {
  const [reports, setReports] = useState<Report[]>([]);
  const [current, setCurrent] = useState<Report | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  // Il ruolo si sceglie PRIMA di generare: è la differenza fra un testo che
  // apre la lettura e uno che la chiude.
  const [request, setRequest] = useState<'intro' | 'comment' | 'both' | 'synthesis'>('comment');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'warn'; text: string } | null>(null);
  // I grafici costruiti in Studio Graph: entrano nel catalogo accanto a quelli
  // di serie, perche per chi compone il report non c'e differenza.
  const [studio, setStudio] = useState<{ id: number; title: string }[]>([]);

  const load = useCallback(async () => {
    const res = await fetch('/api/report/custom');
    const d = await res.json();
    if (!res.ok) { setMsg({ kind: 'warn', text: d.error ?? 'Errore di caricamento' }); return; }
    setReports(d.reports ?? []);
    setCurrent((c) => (c ? (d.reports ?? []).find((r: Report) => r.id === c.id) ?? c : (d.reports ?? [])[0] ?? null));
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    fetch('/api/studio')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStudio(d.saved ?? []))
      .catch(() => {});
  }, []);

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

  const addStudio = (chartId: number) => setPages((ps) => {
    const next = structuredClone(ps);
    if (!next[pageIdx]) next.push({ title: `Pagina ${next.length + 1}`, blocks: [] });
    next[pageIdx].blocks.push({ type: 'studio', chartId });
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

  const setRole = (i: number, role: Role) => setPages((ps) => {
    const next = structuredClone(ps);
    const b = next[pageIdx].blocks[i];
    if (b.type === 'text') b.role = role;
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
   * La chiave con cui un blocco viene commentato: l'id della sezione per i
   * grafici di serie, `studio:<id>` per quelli costruiti dall'utente. I testi
   * non sono blocchi commentabili e restituiscono null.
   */
  const blockKey = (b: Block): string | null =>
    b.type === 'chart' ? b.section : b.type === 'studio' ? `studio:${b.chartId}` : null;

  const targetLabel = (key: string) => (key.startsWith('studio:')
    ? studio.find((g) => g.id === Number(key.slice(7)))?.title ?? 'grafico di Studio Graph'
    : LABEL[key] ?? key);

  /**
   * Genera i testi per i grafici della pagina corrente, nel ruolo scelto.
   * Una sola richiesta per tutta la pagina, e ogni testo finisce nel punto che
   * il suo ruolo impone: la presentazione PRIMA del grafico, il commento DOPO,
   * la sintesi in fondo alla pagina.
   *
   * Un testo già scritto non viene mai sovrascritto senza che sia stato chiesto
   * esplicitamente per quel grafico: rigenerare l'intera pagina non deve poter
   * cancellare un commento riscritto a mano.
   */
  const comment = async (only?: string) => {
    if (!current || !page) return;
    const wantsIntro = request === 'intro' || request === 'both';
    const wantsComment = request === 'comment' || request === 'both';

    const hasRole = (i: number, role: Role) => {
      const b = page.blocks[i];
      return Boolean(b && b.type === 'text' && b.text.trim() && (b.role ?? 'comment') === role);
    };

    const targets: string[] = [];
    page.blocks.forEach((b, i) => {
      const key = blockKey(b);
      if (!key) return;
      if (only && key !== only) return;
      if (!only && request !== 'synthesis') {
        // Già coperto per tutto ciò che è stato chiesto: salta.
        const introDone = !wantsIntro || hasRole(i - 1, 'intro');
        const commentDone = !wantsComment || hasRole(i + 1, 'comment');
        if (introDone && commentDone) return;
      }
      targets.push(key);
    });
    if (!targets.length) {
      setMsg({ kind: 'warn', text: 'Ogni grafico di questa pagina ha già il testo che hai chiesto.' });
      return;
    }

    setBusy(only ? `comment-${only}` : 'comment');
    setMsg(null);
    try {
      const res = await fetch('/api/report/comment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // I grafici di serie e quelli di Studio Graph viaggiano insieme:
          // il modello vede la pagina intera, come la vedrà chi legge.
          sections: [...new Set(targets.filter((t) => !t.startsWith('studio:')))],
          studio: [...new Set(targets.filter((t) => t.startsWith('studio:')))].map((t) => Number(t.slice(7))),
          days: current.days, role: request,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ kind: 'warn', text: d.error ?? 'Generazione fallita' }); return; }

      if (request === 'synthesis') {
        const text = d.synthesis as string | undefined;
        if (!text) { setMsg({ kind: 'warn', text: 'Il modello non ha restituito una sintesi. Riprova.' }); return; }
        setPages((ps) => {
          const next = structuredClone(ps);
          const blocks = next[pageIdx].blocks;
          const at = blocks.findIndex((b) => b.type === 'text' && b.role === 'synthesis');
          const block: Block = { type: 'text', text, ai: true, role: 'synthesis' };
          // La sintesi è una sola per pagina: se c'è già, si sostituisce.
          if (at >= 0) blocks[at] = block; else blocks.push(block);
          return next;
        });
        setMsg({ kind: 'ok', text: 'Sintesi della pagina generata. Rileggila prima di esportare: la responsabilità editoriale resta tua.' });
        return;
      }

      const comments = d.comments as Record<string, { intro?: string; comment?: string }>;
      let written = 0;
      setPages((ps) => {
        const next = structuredClone(ps);
        const blocks = next[pageIdx].blocks;
        // All'indietro: inserire un blocco non sposta gli indici già visitati.
        for (let i = blocks.length - 1; i >= 0; i--) {
          const key = blockKey(blocks[i]);
          if (!key) continue;
          if (only && key !== only) continue;
          const got = comments[key];
          if (!got) continue;

          // Il commento va DOPO: si scrive per primo, così l'inserimento
          // dell'introduzione non ne sposta la posizione.
          if (wantsComment && got.comment) {
            const after = blocks[i + 1];
            const block: Block = { type: 'text', text: got.comment, ai: true, role: 'comment' };
            const replaceable = after && after.type === 'text'
              && (after.role ?? 'comment') === 'comment' && (!after.text.trim() || after.ai || only);
            if (replaceable) blocks[i + 1] = block; else blocks.splice(i + 1, 0, block);
            written++;
          }
          if (wantsIntro && got.intro) {
            const before = blocks[i - 1];
            const block: Block = { type: 'text', text: got.intro, ai: true, role: 'intro' };
            const replaceable = before && before.type === 'text'
              && before.role === 'intro' && (!before.text.trim() || before.ai || only);
            if (replaceable) blocks[i - 1] = block; else blocks.splice(i, 0, block);
            written++;
          }
        }
        return next;
      });

      const missing = targets.filter((t) => !comments[t]);
      const emptyIds = (d.empty ?? []) as string[];
      setMsg({
        kind: missing.length ? 'warn' : 'ok',
        text: missing.length
          ? `Testi scritti: ${written}. Senza testo: ${missing.map(targetLabel).join(', ')}${emptyIds.length || (d.emptyStudio ?? []).length ? ' (nessun dato nel periodo scelto)' : ''}.`
          : `${written} testi generati. Rileggili prima di esportare: la responsabilità editoriale resta tua.`,
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
    // Anche i grafici di Studio Graph sono grafici: il contatore in testata
    // deve dire quanti ne uscirà, non quanti ne conosce il catalogo di serie.
    () => pages.reduce((s, p) => s + p.blocks.filter((b) => b.type === 'chart' || b.type === 'studio').length, 0),
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

            <div>
              <p className="mb-1 text-[10px] uppercase tracking-wider text-slate-600">Studio Graph</p>
              {studio.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {studio.map((g) => (
                    <button key={g.id} onClick={() => addStudio(g.id)}
                      title="Grafico costruito da te in Studio Graph"
                      className="rounded-lg border border-violet-500/30 px-2 py-1 text-[11px] text-violet-200 hover:border-violet-400/60 hover:bg-violet-500/10">
                      + {g.title}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] leading-snug text-slate-600">
                  Nessuno ancora. In <a href="/graph" className="text-sky-400 hover:underline">Studio Graph</a> puoi
                  costruire un grafico scegliendo tu gli assi: una volta salvato lo ritrovi qui.
                </p>
              )}
            </div>
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
                  <PenLine className="size-3.5" /> Scrivi
                </button>
                <select value={request} onChange={(e) => setRequest(e.target.value as typeof request)}
                  title={REQUESTS.find((r) => r.key === request)?.hint}
                  className="rounded-lg border border-[var(--border)] bg-white/[0.03] px-2 py-1.5 text-xs text-slate-200">
                  {REQUESTS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                </select>
                <button onClick={() => comment()} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
                  {busy === 'comment' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  Genera con l&rsquo;AI
                </button>
              </div>
              <p className="-mt-1 mb-3 text-[11px] text-slate-600">
                {REQUESTS.find((r) => r.key === request)?.hint}
              </p>

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

                    {b.type === 'studio' ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <Shapes className="size-4 text-violet-400" />
                        <span className="text-sm text-slate-200">
                          {studio.find((g) => g.id === b.chartId)?.title ?? 'Grafico di Studio Graph'}
                        </span>
                        {!studio.some((g) => g.id === b.chartId) && (
                          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-300">
                            cancellato da Studio Graph
                          </span>
                        )}
                        <button onClick={() => comment(`studio:${b.chartId}`)} disabled={!!busy}
                          title={`Genera: ${REQUESTS.find((r) => r.key === request)?.label}`}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-violet-500/30 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-500/10 disabled:opacity-50">
                          {busy === `comment-studio:${b.chartId}` ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          genera
                        </button>
                        <button onClick={() => addText(i + 1)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5">
                          <PenLine className="size-3" /> scrivi
                        </button>
                      </div>
                    ) : b.type === 'chart' ? (
                      <div className="flex flex-1 flex-wrap items-center gap-2">
                        <BarChart3 className="size-4 text-sky-400" />
                        <span className="text-sm text-slate-200">{LABEL[b.section] ?? b.section}</span>
                        <button onClick={() => comment(b.section)} disabled={!!busy}
                          title={`Genera: ${REQUESTS.find((r) => r.key === request)?.label}`}
                          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-violet-500/30 px-2 py-1 text-[11px] text-violet-300 hover:bg-violet-500/10 disabled:opacity-50">
                          {busy === `comment-${b.section}` ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                          genera
                        </button>
                        <button onClick={() => addText(i + 1)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-slate-400 hover:bg-white/5">
                          <PenLine className="size-3" /> scrivi
                        </button>
                      </div>
                    ) : (() => {
                      const role = b.role ?? (b.ai ? 'comment' : 'free');
                      const R = ROLE[role];
                      const Icon = R.icon;
                      return (
                        <div className="flex flex-1 gap-2">
                          {/* Il filetto colorato è lo stesso segno che finisce nel PDF. */}
                          <span className={`mt-1 w-0.5 shrink-0 rounded ${R.rule}`} />
                          <div className="flex-1">
                            <div className="mb-1 flex items-center gap-1.5">
                              <Icon className={`size-3.5 ${R.cls}`} />
                              <select value={role}
                                onChange={(e) => setRole(i, e.target.value as Role)}
                                className={`rounded border border-transparent bg-transparent py-0 pl-0 pr-4 text-[11px] ${R.cls} hover:border-[var(--border)]`}>
                                {(Object.keys(ROLE) as Role[]).map((k) => (
                                  <option key={k} value={k} className="bg-[#0f172a] text-slate-200">{ROLE[k].label}</option>
                                ))}
                              </select>
                              {b.ai && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-violet-300/80">
                                  <Sparkles className="size-3" /> AI — rileggilo, modificandolo diventa tuo
                                </span>
                              )}
                            </div>
                            <textarea value={b.text} onChange={(e) => editText(i, e.target.value)} rows={3}
                              placeholder="Il tuo testo…"
                              className="w-full resize-y rounded-lg border border-[var(--border)] bg-white/[0.03] px-3 py-2 text-sm text-slate-100" />
                          </div>
                        </div>
                      );
                    })()}

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
