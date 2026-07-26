'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UploadCloud, FileSpreadsheet, Check, Loader2, ArrowRight } from 'lucide-react';

type Preview = { columns: string[]; sample: Record<string, unknown>[]; total: number };

const FIELDS: { key: string; label: string; hint: string; required?: boolean }[] = [
  { key: 'rating', label: 'Rating', hint: '1-5 (or 1-10 / 1-100 — anything gets rounded to 1-5)', required: true },
  { key: 'content', label: 'Review text', hint: 'the review itself', required: true },
  { key: 'title', label: 'Title', hint: 'optional headline' },
  { key: 'author', label: 'Author', hint: 'who wrote it' },
  { key: 'date', label: 'Date', hint: 'when it was written' },
  { key: 'url', label: 'Link', hint: 'URL to the original, if any' },
];
const GUESS: Record<string, RegExp> = {
  rating: /(rating|stars|score|vote|nps)/i,
  content: /(review|comment|feedback|text|message|body)/i,
  title: /(title|headline|subject)/i,
  author: /(author|user|name|customer|reviewer)/i,
  date: /(date|time|created|published)/i,
  url: /(url|link|permalink)/i,
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

/** Import di un file di recensioni (NPS, sondaggi, export da altri strumenti):
 *  riusa l'anteprima generica /api/import/preview, ma il commit va in reviews,
 *  non in mentions — nessuna analisi AI da lanciare dopo, il voto basta. */
export function ReviewImportWizard() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ inserted: number; skipped: number; total: number } | null>(null);

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
    if (!file || !map.rating || !map.content) { setError('Pick a file and map both Rating and Review text.'); return; }
    setBusy('import'); setError(''); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('label', label);
      fd.append('map', JSON.stringify(map));
      const res = await fetch('/api/reviews/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Import failed'); return; }
      setResult(data);
      router.refresh();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold text-slate-300">Import a file (NPS export, survey results, anything with a rating)</p>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--border)] bg-white/[0.02] px-6 py-5 text-center hover:border-sky-500/50">
        <UploadCloud className="size-5 text-slate-500" />
        <span className="text-xs text-slate-300">{file ? file.name : 'Drop or choose an .xlsx or .csv file'}</span>
        <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      </label>
      {busy === 'preview' && <p className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 className="size-3.5 animate-spin" /> Reading the file…</p>}
      {preview && <p className="flex items-center gap-1.5 text-xs text-slate-500"><FileSpreadsheet className="size-3.5" />{preview.total.toLocaleString('en-US')} rows · {preview.columns.length} columns detected.</p>}

      {preview && (
        <div className="rounded-lg border border-[var(--border)] px-4 py-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="flex flex-col gap-1">
                <span className="text-xs text-slate-300">{f.label}{f.required && <span className="text-sky-400"> *</span>} <span className="text-slate-600">· {f.hint}</span></span>
                <select value={map[f.key] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [f.key]: e.target.value }))}
                  className={`rounded-lg border bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none ${f.required && !map[f.key] ? 'border-sky-500/50' : 'border-[var(--border)]'}`}>
                  <option value="">— none —</option>
                  {preview.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            ))}
            <label className="flex flex-col gap-1">
              <span className="text-xs text-slate-300">Source label <span className="text-slate-600">· shown as the source name</span></span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={file?.name}
                className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none" />
            </label>
          </div>
          <button onClick={runImport} disabled={!!busy || !map.rating || !map.content}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
            {busy === 'import' ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
            {busy === 'import' ? 'Importing…' : `Import ${preview.total.toLocaleString('en-US')} rows`}
          </button>
        </div>
      )}

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}
      {result && (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-4 py-2.5 text-sm text-emerald-300">
          <Check className="size-4" /> Imported {result.inserted.toLocaleString('en-US')} reviews
          {result.skipped ? ` · ${result.skipped} skipped (no rating or empty text)` : ''}.
        </p>
      )}
    </div>
  );
}
