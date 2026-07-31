'use client';

import { useState } from 'react';
import { UploadCloud, FileSpreadsheet, Check, Loader2, ArrowRight, Sparkles, AlertTriangle, EyeOff, Wand2 } from 'lucide-react';

type Profile = { name: string; kind: string; filled: number; distinct: number; samples: string[]; avgLength: number };
type Proposal = { column: string; field: string | null; confidence: 'alta' | 'media' | 'bassa' | null; reason: string };
type Preview = {
  columns: string[]; sample: Record<string, unknown>[]; total: number;
  profiles?: Profile[]; proposal?: Proposal[] | null;
};
type ImportReport = {
  total: number; inserted: number; skippedEmpty: number;
  duplicates: number; datesFailed: number; sentimentImported: number;
};

// I campi di Radar su cui si mappano le colonne del file. Solo "content" è obbligatorio.
const FIELDS: { key: string; label: string; hint: string; required?: boolean }[] = [
  { key: 'content', label: 'Text / content', hint: 'the text that gets analyzed — sentiment, topics…', required: true },
  { key: 'date', label: 'Date', hint: 'when it was published (for time charts)' },
  { key: 'time', label: 'Time', hint: 'only if the hour sits in its own column' },
  { key: 'title', label: 'Title', hint: 'optional headline' },
  { key: 'author', label: 'Author', hint: 'who wrote it' },
  { key: 'authorHandle', label: 'Author handle', hint: '@username, if separate' },
  { key: 'source', label: 'Source / channel', hint: 'e.g. platform or dataset name' },
  { key: 'url', label: 'Link', hint: 'URL to the original' },
  { key: 'language', label: 'Language', hint: 'it, en, "Italian"…' },
  { key: 'community', label: 'Community', hint: 'group, subreddit, page' },
  { key: 'sentiment', label: 'Sentiment', hint: 'already scored by your tool — saves re-analysis' },
  { key: 'reach', label: 'Reach', hint: 'potential impressions / followers' },
  { key: 'likes', label: 'Likes', hint: 'likes, reactions, favourites' },
  { key: 'comments', label: 'Comments', hint: 'replies / comments' },
  { key: 'shares', label: 'Shares', hint: 'retweets / reposts' },
  { key: 'views', label: 'Views', hint: 'video or post views' },
  { key: 'engagement', label: 'Engagement (total)', hint: 'only if the breakdown above is missing' },
];
const FIELD_LABEL: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

export function ImportWizard({ project }: { project: { id: number; name: string } }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportReport | null>(null);
  const [proposal, setProposal] = useState<Proposal[]>([]);
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
      // La proposta AI diventa la mappa iniziale: le colonne con confidenza
      // alta o media entrano già compilate, quelle incerte restano visibili
      // ma da confermare a mano.
      const props: Proposal[] = data.proposal ?? [];
      setProposal(props);
      const initial: Record<string, string> = {};
      for (const p of props) {
        if (p.field && p.confidence && p.confidence !== 'bassa') initial[p.field] = p.column;
      }
      setMap(initial);
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

      {/* Proposta AI: cosa ha capito il modello, colonna per colonna */}
      {preview && proposal.length > 0 && (
        <section className="panel px-5 py-4">
          <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
            <Wand2 className="size-3.5 text-violet-400" /> What Radar understood
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Read from your column <span className="text-slate-300">values</span>, not just their names — so headers in any language work.
            Everything below is a suggestion: change it in Step 2.
          </p>
          {(() => {
            const sure = proposal.filter((p) => p.field && p.confidence === 'alta');
            const unsure = proposal.filter((p) => p.field && p.confidence !== 'alta');
            const ignored = proposal.filter((p) => !p.field);
            const Row = ({ p }: { p: Proposal }) => (
              <li key={p.column} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                <span className="font-medium text-slate-300">{p.column}</span>
                {p.field && <><span className="text-slate-600">→</span><span className="text-sky-300">{FIELD_LABEL[p.field] ?? p.field}</span></>}
                <span className="text-slate-600">{p.reason}</span>
              </li>
            );
            return (
              <div className="flex flex-col gap-3">
                {sure.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-emerald-300"><Check className="size-3" /> Recognised ({sure.length})</p>
                    <ul className="flex flex-col gap-0.5">{sure.map((p) => <Row key={p.column} p={p} />)}</ul>
                  </div>
                )}
                {unsure.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-amber-300"><AlertTriangle className="size-3" /> Worth a check ({unsure.length})</p>
                    <ul className="flex flex-col gap-0.5">{unsure.map((p) => <Row key={p.column} p={p} />)}</ul>
                  </div>
                )}
                {ignored.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-slate-500"><EyeOff className="size-3" /> Not imported ({ignored.length})</p>
                    <p className="text-xs text-slate-600">{ignored.map((p) => p.column).join(' · ')}</p>
                  </div>
                )}
              </div>
            );
          })()}
        </section>
      )}

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
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300"><Check className="size-4" /> Imported {result.inserted.toLocaleString('en-US')} of {result.total.toLocaleString('en-US')} rows.</p>
          {/* Cosa NON è entrato, e perché: un import che scarta in silenzio un
              quinto del file è peggio di uno che fallisce. */}
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-400">
            {result.skippedEmpty > 0 && <li>{result.skippedEmpty.toLocaleString('en-US')} without text</li>}
            {result.duplicates > 0 && <li>{result.duplicates.toLocaleString('en-US')} duplicates</li>}
            {result.datesFailed > 0 && (
              <li className="text-amber-300">
                <AlertTriangle className="mr-1 inline size-3" />
                {result.datesFailed.toLocaleString('en-US')} unreadable dates — those rows landed on today, so time charts will be off
              </li>
            )}
            {result.sentimentImported > 0 && (
              <li className="text-emerald-300">{result.sentimentImported.toLocaleString('en-US')} with sentiment taken from the file — no AI cost for those</li>
            )}
          </ul>
          <p className="mt-1.5 text-xs text-slate-400">Rows without an imported sentiment still need the AI pass to add emotions, topics and relevance.</p>
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
