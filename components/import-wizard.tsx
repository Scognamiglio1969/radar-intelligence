'use client';

import { useState } from 'react';
import { UploadCloud, FileSpreadsheet, Check, Loader2, ArrowRight, Sparkles } from 'lucide-react';

type Preview = { columns: string[]; sample: Record<string, unknown>[]; total: number };

// I campi di Radar su cui si mappano le colonne del file. Solo "content" è obbligatorio.
const FIELDS: { key: string; label: string; hint: string; required?: boolean }[] = [
  { key: 'content', label: 'Text / content', hint: 'the text that gets analyzed — sentiment, topics…', required: true },
  { key: 'date', label: 'Date', hint: 'when it was published (for time charts)' },
  { key: 'title', label: 'Title', hint: 'optional headline' },
  { key: 'author', label: 'Author', hint: 'who wrote it' },
  { key: 'source', label: 'Source / channel', hint: 'e.g. platform or dataset name' },
  { key: 'url', label: 'Link', hint: 'URL to the original' },
  { key: 'engagement', label: 'Engagement', hint: 'a number: likes, views, reach…' },
];

// Auto-riconoscimento della colonna più probabile per ciascun campo.
const GUESS: Record<string, RegExp> = {
  content: /(content|text|message|body|post|comment|caption|description|review)/i,
  date: /(date|time|created|published|timestamp|day)/i,
  title: /(title|headline|subject|name)/i,
  author: /(author|user|handle|account|from|by)/i,
  source: /(source|platform|channel|network|site|dataset)/i,
  url: /(url|link|permalink|href)/i,
  engagement: /(engag|likes|views|reach|score|shares|retweet|impression|reactions)/i,
};

function autoMap(columns: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const used = new Set<string>();
  for (const f of FIELDS) {
    const hit = columns.find((c) => GUESS[f.key].test(c) && !used.has(c));
    if (hit) { map[f.key] = hit; used.add(hit); }
  }
  return map;
}

export function ImportWizard({ project }: { project: { id: number; name: string } }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ inserted: number; skipped: number; total: number } | null>(null);
  const [analyzeMsg, setAnalyzeMsg] = useState('');

  const onFile = async (f: File) => {
    setFile(f); setPreview(null); setResult(null); setError('');
    setBusy('preview');
    try {
      const fd = new FormData(); fd.append('file', f);
      const res = await fetch('/api/import/preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Could not read the file'); return; }
      setPreview(data);
      setMap(autoMap(data.columns));
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const runImport = async () => {
    if (!file || !map.content) { setError('Pick a file and map the Text/content column.'); return; }
    setBusy('import'); setError(''); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('projectId', String(project.id));
      fd.append('map', JSON.stringify(map));
      const res = await fetch('/api/import/commit', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed'); return; }
      setResult(data);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const analyzeNow = async () => {
    setBusy('analyze'); setAnalyzeMsg('');
    try {
      const res = await fetch('/api/import/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: project.id }) });
      const d = await res.json();
      if (!res.ok) { setAnalyzeMsg(d.error || 'Analysis failed'); return; }
      setAnalyzeMsg(`Analyzed ${d.analyzed} rows${d.pending ? ` · ${d.pending} still queued (run again or wait for the next refresh)` : ''}.`);
    } catch (e) { setAnalyzeMsg((e as Error).message); }
    finally { setBusy(''); }
  };

  const openProject = () => {
    document.cookie = `sr_project=${project.id};path=/;max-age=31536000`;
    window.location.href = '/listening';
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Step 1 — file */}
      <section className="panel px-5 py-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Step 1 · File</p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-white/[0.02] px-6 py-8 text-center hover:border-sky-500/50">
          <UploadCloud className="size-7 text-slate-500" />
          <span className="text-sm text-slate-300">{file ? file.name : 'Drop or choose an .xlsx or .csv file'}</span>
          <span className="text-[11px] text-slate-600">The first row must be the column headers.</span>
          <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
        </label>
        {busy === 'preview' && <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" /> Reading the file…</p>}
        {preview && <p className="mt-2 text-xs text-slate-500"><FileSpreadsheet className="mr-1 inline size-3.5" />{preview.total.toLocaleString('en-US')} rows · {preview.columns.length} columns detected.</p>}
      </section>

      {/* Step 2 — mappatura */}
      {preview && (
        <section className="panel px-5 py-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Step 2 · Map your columns</p>
          <p className="mb-3 text-xs text-slate-500">Tell Radar which column is which. Only <span className="text-slate-300">Text / content</span> is required — the rest are optional.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs text-slate-300">{f.label}{f.required && <span className="text-sky-400"> *</span>} <span className="text-slate-600">· {f.hint}</span></span>
                <select value={map[f.key] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}
                  className={`rounded-lg border bg-[var(--panel)] px-2.5 py-1.5 text-sm text-slate-100 outline-none ${f.required && !map[f.key] ? 'border-sky-500/50' : 'border-[var(--border)]'}`}>
                  <option value="">— none —</option>
                  {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            ))}
          </div>

          {/* Anteprima della colonna testo scelta */}
          {map.content && (
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-white/[0.02] px-3 py-2">
              <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-600">Preview of “{map.content}”</p>
              {preview.sample.slice(0, 3).map((r, i) => (
                <p key={i} className="truncate text-xs text-slate-400">• {String(r[map.content] ?? '')}</p>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={runImport} disabled={!!busy || !map.content}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
              {busy === 'import' ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
              {busy === 'import' ? 'Importing…' : `Import ${preview.total.toLocaleString('en-US')} rows`}
            </button>
          </div>
        </section>
      )}

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}

      {/* Esito */}
      {result && (
        <section className="panel border-emerald-500/30 bg-emerald-500/[0.05] px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Check className="size-4" /> Imported {result.inserted.toLocaleString('en-US')} rows{result.skipped ? ` · ${result.skipped} skipped (empty text or duplicates)` : ''}.</p>
          <p className="mt-1 text-xs text-slate-400">They’re in Radar now, untagged. Run the AI analysis to add sentiment, emotions, topics and relevance — then every insight and chart works on this data.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={analyzeNow} disabled={!!busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200 hover:bg-sky-500/20 disabled:opacity-50">
              {busy === 'analyze' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />} Analyze now
            </button>
            <button onClick={openProject} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
              Open in Listening <ArrowRight className="size-3.5" />
            </button>
            {analyzeMsg && <span className="text-xs text-slate-400">{analyzeMsg}</span>}
          </div>
        </section>
      )}
    </div>
  );
}
