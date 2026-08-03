'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UploadCloud, FileSpreadsheet, Check, Loader2, ArrowRight, Sparkles, AlertTriangle,
  EyeOff, Wand2, Trash2, RefreshCw, ChevronDown, ChevronRight, Archive,
  Download, Eye, Table2, Layers, CalendarRange, PlayCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Il distillatore di file.
//
// Il flusso è sempre lo stesso e resta visibile: CARICA → ASSEGNA → VERIFICA →
// IMPORTA. La verifica è il passo che mancava: prima si assegnavano le colonne
// alla cieca e si scopriva il risultato solo dopo aver scritto in archivio.
// Ora l'anteprima passa dalla stessa funzione dell'import, quindi ciò che
// mostra è letteralmente ciò che verrà scritto.
//
// I file restano materiale grezzo: si rimappa e si reimporta senza ricaricare
// nulla, e da qui esce anche il NORMALIZZATO — gli N file fusi in un'unica
// tabella, che è il motivo per cui un progetto nasce da più export.
// ---------------------------------------------------------------------------

type Profile = { name: string; kind: string; filled: number; distinct: number; samples: string[]; avgLength: number };
type Proposal = { column: string; field: string | null; confidence: 'alta' | 'media' | 'bassa' | null; reason: string };
type Report = { total: number; inserted: number; skippedEmpty: number; duplicates: number; datesFailed: number; sentimentImported: number };
type Issues = { formulas: number; formulaErrors: number; formulaNoValue: number };
type ImportFile = {
  id: number; filename: string; sizeBytes: number; rowCount: number;
  columns: string[]; profiles: Profile[]; proposal: Proposal[] | null;
  mapping: Record<string, string>; status: 'uploaded' | 'mapped' | 'imported';
  report: Report | null; rawPurged: boolean; usedAi: boolean; issues: Issues | null;
  createdAt: string; importedAt: string | null;
};
type PreviewRow = {
  publishedAt: string; dateFellBack: boolean; source: string; content: string;
  author: string | null; sentiment: string | null; reach: number | null;
  likes: number | null; comments: number | null; shares: number | null;
  engagementScore: number; language: string | null; url: string | null;
};

const FIELDS: { key: string; label: string; hint: string; required?: boolean }[] = [
  { key: 'content', label: 'Testo', hint: 'ciò che viene analizzato', required: true },
  { key: 'date', label: 'Data', hint: 'per i grafici temporali' },
  { key: 'time', label: 'Ora', hint: 'solo se in colonna separata' },
  { key: 'title', label: 'Titolo', hint: 'headline, se distinta' },
  { key: 'author', label: 'Autore', hint: 'chi ha scritto' },
  { key: 'authorHandle', label: 'Handle', hint: '@username' },
  { key: 'source', label: 'Fonte', hint: 'piattaforma o testata' },
  { key: 'url', label: 'Link', hint: "URL all'originale" },
  { key: 'language', label: 'Lingua', hint: 'it, en, "Italiano"…' },
  { key: 'community', label: 'Community', hint: 'gruppo, pagina, subreddit' },
  { key: 'sentiment', label: 'Sentiment', hint: 'già calcolato: evita il costo AI' },
  { key: 'reach', label: 'Reach', hint: 'impression potenziali' },
  { key: 'likes', label: 'Like', hint: 'reazioni' },
  { key: 'comments', label: 'Commenti', hint: 'risposte' },
  { key: 'shares', label: 'Condivisioni', hint: 'retweet, repost' },
  { key: 'views', label: 'Visualizzazioni', hint: 'views' },
  { key: 'engagement', label: 'Engagement totale', hint: 'solo se manca il dettaglio' },
];
const FIELD_LABEL: Record<string, string> = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

const STATUS: Record<ImportFile['status'], { label: string; cls: string; step: number }> = {
  uploaded: { label: 'da assegnare', cls: 'bg-amber-500/15 text-amber-300', step: 1 },
  mapped: { label: 'pronto', cls: 'bg-sky-500/15 text-sky-300', step: 2 },
  imported: { label: 'importato', cls: 'bg-emerald-500/15 text-emerald-300', step: 3 },
};

const num = (n: number) => n.toLocaleString('it-IT');

export function ImportWorkspace({ project }: { project: { id: number; name: string } }) {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [analyzeMsg, setAnalyzeMsg] = useState('');

  const load = useCallback(async () => {
    const res = await fetch(`/api/import/files?project=${project.id}`);
    const d = await res.json();
    if (res.ok) setFiles(d.files ?? []);
    else setError(d.error ?? 'Errore di caricamento');
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  const upload = async (f: File) => {
    setBusy('upload'); setError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('projectId', String(project.id));
      const res = await fetch('/api/import/files', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Errore nell'upload"); return; }
      await load();
      setOpen(d.fileId);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const act = async (fileId: number, action: string, mapping?: Record<string, string>) => {
    setBusy(`${action}-${fileId}`); setError('');
    try {
      const res = await fetch('/api/import/files', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, fileId, action, mapping }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Operazione fallita'); return; }
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  /** Importa in fila tutti i file che hanno già il testo assegnato. */
  const importAll = async () => {
    const todo = files.filter((f) => !f.rawPurged && f.mapping.content && f.status !== 'imported');
    if (!todo.length) return;
    setBusy('all'); setError('');
    try {
      for (const f of todo) {
        const res = await fetch('/api/import/files', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, fileId: f.id, action: 'derive' }),
        });
        if (!res.ok) { setError(`${f.filename}: ${(await res.json()).error ?? 'import fallito'}`); break; }
      }
      await load();
    } finally { setBusy(''); }
  };

  const analyzeNow = async () => {
    setBusy('analyze'); setAnalyzeMsg('');
    try {
      const res = await fetch('/api/import/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const d = await res.json();
      setAnalyzeMsg(res.ok
        ? `Analizzate ${d.analyzed} righe${d.pending ? ` · ${d.pending} ancora in coda` : ''}.`
        : (d.error ?? 'Analisi fallita'));
    } catch (e) { setAnalyzeMsg((e as Error).message); }
    finally { setBusy(''); }
  };

  const stats = useMemo(() => {
    const imported = files.filter((f) => f.status === 'imported');
    return {
      rawRows: files.reduce((s, f) => s + f.rowCount, 0),
      mentions: files.reduce((s, f) => s + (f.report?.inserted ?? 0), 0),
      pending: files.filter((f) => f.status !== 'imported').length,
      ready: files.filter((f) => !f.rawPurged && f.mapping.content && f.status !== 'imported').length,
      importedCount: imported.length,
      datesFailed: files.reduce((s, f) => s + (f.report?.datesFailed ?? 0), 0),
      withSentiment: files.reduce((s, f) => s + (f.report?.sentimentImported ?? 0), 0),
      exportable: files.some((f) => f.mapping.content && !f.rawPurged),
    };
  }, [files]);

  return (
    <div className="flex flex-col gap-4">
      {/* Il quadro del progetto: N file che diventano un archivio solo. */}
      {files.length > 0 && (
        <section className="panel px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-3">
              <Stat icon={Layers} label="File" value={num(files.length)}
                hint={stats.pending ? `${stats.pending} da importare` : 'tutti importati'} />
              <Stat icon={Table2} label="Righe grezze" value={num(stats.rawRows)} hint="conservate, rimappabili" />
              <Stat icon={Check} label="Mention derivate" value={num(stats.mentions)}
                hint={stats.withSentiment ? `${num(stats.withSentiment)} con sentiment dal file` : 'dalla mappatura corrente'}
                tone={stats.mentions > 0 ? 'ok' : undefined} />
              {stats.datesFailed > 0 && (
                <Stat icon={CalendarRange} label="Date illeggibili" value={num(stats.datesFailed)}
                  hint="finite a oggi: controlla la colonna data" tone="warn" />
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {stats.ready > 0 && (
                <button onClick={importAll} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
                  {busy === 'all' ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
                  Importa i {stats.ready} pronti
                </button>
              )}
              {stats.mentions > 0 && (
                <button onClick={analyzeNow} disabled={!!busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-1.5 text-xs text-violet-200 hover:bg-violet-500/20 disabled:opacity-50">
                  {busy === 'analyze' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                  Analizza con l&rsquo;AI
                </button>
              )}
              {stats.exportable && (
                <div className="flex items-center overflow-hidden rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-200">
                  <span className="px-2.5 py-1.5 text-emerald-300/70">Normalizzato</span>
                  <a href={`/api/import/normalized?project=${project.id}&format=xlsx`}
                    title="Tutti i file, fusi e normalizzati, in un unico foglio Excel"
                    className="inline-flex items-center gap-1 border-l border-emerald-500/30 px-2.5 py-1.5 hover:bg-emerald-500/20">
                    <Download className="size-3.5" /> Excel
                  </a>
                  <a href={`/api/import/normalized?project=${project.id}&format=csv`}
                    className="inline-flex items-center gap-1 border-l border-emerald-500/30 px-2.5 py-1.5 hover:bg-emerald-500/20">
                    <Download className="size-3.5" /> CSV
                  </a>
                </div>
              )}
            </div>
          </div>
          {analyzeMsg && <p className="mt-2 text-xs text-slate-400">{analyzeMsg}</p>}
        </section>
      )}

      <section className="panel px-5 py-4">
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--border)] bg-white/[0.02] px-6 py-7 text-center hover:border-sky-500/50">
          {busy === 'upload'
            ? <Loader2 className="size-7 animate-spin text-sky-400" />
            : <UploadCloud className="size-7 text-slate-500" />}
          <span className="text-sm text-slate-300">
            {busy === 'upload' ? 'Lettura, profilazione e proposta in corso…' : 'Aggiungi un file .xlsx o .csv'}
          </span>
          <span className="text-[11px] text-slate-600">
            Puoi caricarne quanti vuoi. I file restano come materiale grezzo: puoi rimappare e reimportare senza ricaricarli.
          </span>
          <input type="file" accept=".xlsx,.csv" className="hidden" disabled={!!busy}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
        </label>
      </section>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-300">{error}</p>}

      {files.map((f) => (
        <FileCard
          key={f.id} file={f} busy={busy} projectId={project.id}
          expanded={open === f.id}
          onToggle={() => setOpen(open === f.id ? null : f.id)}
          onAct={act}
        />
      ))}
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint, tone }: {
  icon: typeof Layers; label: string; value: string; hint?: string; tone?: 'ok' | 'warn';
}) {
  const color = tone === 'ok' ? 'text-emerald-300' : tone === 'warn' ? 'text-amber-300' : 'text-slate-200';
  return (
    <div>
      <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-600">
        <Icon className="size-3" /> {label}
      </p>
      <p className={`text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
}

/** I quattro passi, sempre visibili: si sa dove si è e cosa manca. */
function Steps({ step, hasContent }: { step: number; hasContent: boolean }) {
  const items = ['Caricato', hasContent ? 'Assegnato' : 'Da assegnare', 'Verificato', 'Importato'];
  const done = step >= 3 ? 4 : hasContent ? 2 : 1;
  return (
    <div className="flex items-center gap-1.5 text-[10px]">
      {items.map((label, i) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`rounded-full px-1.5 py-0.5 ${i < done
            ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/[0.04] text-slate-600'}`}>{label}</span>
          {i < items.length - 1 && <span className="text-slate-700">›</span>}
        </span>
      ))}
    </div>
  );
}

function FileCard({ file, busy, projectId, expanded, onToggle, onAct }: {
  file: ImportFile; busy: string; projectId: number; expanded: boolean;
  onToggle: () => void;
  onAct: (fileId: number, action: string, mapping?: Record<string, string>) => Promise<void>;
}) {
  const [map, setMap] = useState<Record<string, string>>(file.mapping);
  const [preview, setPreview] = useState<{ rows: PreviewRow[]; report: Report } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewErr, setPreviewErr] = useState('');

  // Se il file cambia sotto (ricaricato dopo un'azione) la bozza locale si allinea.
  useEffect(() => { setMap(file.mapping); }, [file.mapping]);

  const dirty = JSON.stringify(map) !== JSON.stringify(file.mapping);
  const st = STATUS[file.status];
  const busyHere = busy.endsWith(`-${file.id}`);

  /** L'anteprima usa la bozza corrente, non quella salvata: si prova prima di decidere. */
  const runPreview = async () => {
    setPreviewing(true); setPreviewErr('');
    try {
      const res = await fetch('/api/import/normalized', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fileId: file.id, mapping: map }),
      });
      const d = await res.json();
      if (!res.ok) { setPreviewErr(d.error ?? 'Anteprima non riuscita'); setPreview(null); return; }
      setPreview({ rows: d.rows, report: d.report });
    } catch (e) { setPreviewErr((e as Error).message); }
    finally { setPreviewing(false); }
  };

  return (
    <section className="panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          {expanded ? <ChevronDown className="size-4 shrink-0 text-slate-500" /> : <ChevronRight className="size-4 shrink-0 text-slate-500" />}
          <FileSpreadsheet className="size-4 shrink-0 text-slate-500" />
          <span className="truncate text-sm font-medium text-slate-200">{file.filename}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${st.cls}`}>{st.label}</span>
          <span className="shrink-0 text-[11px] text-slate-600">
            {num(file.rowCount)} righe · {file.columns.length} colonne
            {file.rawPurged && ' · grezzo eliminato'}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {file.status === 'imported' && !file.rawPurged && (
            <a href={`/api/import/normalized?project=${projectId}&file=${file.id}&format=xlsx`}
              title="Scarica solo questo file, normalizzato"
              className="rounded-lg p-1.5 text-slate-600 hover:text-emerald-300">
              <Download className="size-4" />
            </a>
          )}
          {!file.rawPurged && (
            <button onClick={() => onAct(file.id, 'derive')} disabled={!!busy || !map.content}
              title={!map.content ? 'Assegna prima la colonna del testo' : file.status === 'imported' ? 'Rigenera le mention da questo file' : 'Deriva le mention'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
              {busyHere && busy.startsWith('derive') ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
              {file.status === 'imported' ? 'Reimporta' : 'Importa'}
            </button>
          )}
          <button onClick={() => onAct(file.id, 'delete')} disabled={!!busy}
            title="Elimina il file e le mention che ne derivano"
            className="rounded-lg p-1.5 text-slate-600 hover:text-red-400 disabled:opacity-50">
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      <div className="mt-2"><Steps step={st.step} hasContent={Boolean(map.content)} /></div>

      {file.report && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px]">
          <li className="text-emerald-300">{num(file.report.inserted)} importate</li>
          {file.report.skippedEmpty > 0 && <li className="text-slate-500">{file.report.skippedEmpty} senza testo</li>}
          {file.report.duplicates > 0 && <li className="text-slate-500">{file.report.duplicates} duplicati</li>}
          {file.report.datesFailed > 0 && (
            <li className="text-amber-300">
              <AlertTriangle className="mr-1 inline size-3" />
              {file.report.datesFailed} date illeggibili — quelle righe sono finite a oggi
            </li>
          )}
          {file.report.sentimentImported > 0 && (
            <li className="text-emerald-300">{file.report.sentimentImported} con sentiment dal file (nessun costo AI)</li>
          )}
        </ul>
      )}

      {/* Le formule: cosa è stato letto e cosa non c'era da leggere. */}
      {file.issues && file.issues.formulas > 0 && (
        <p className={`mt-2 flex items-start gap-1.5 text-xs ${file.issues.formulaNoValue > 0 || file.issues.formulaErrors > 0
          ? 'text-amber-300' : 'text-slate-500'}`}>
          {file.issues.formulaNoValue > 0 || file.issues.formulaErrors > 0
            ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            : <Check className="mt-0.5 size-3.5 shrink-0" />}
          <span>
            {file.issues.formulas} celle calcolate con formule: Radar ne ha preso il risultato, non la formula.
            {file.issues.formulaErrors > 0 && ` ${file.issues.formulaErrors} davano errore (#DIV/0!, #N/D…) e sono state lasciate vuote.`}
            {file.issues.formulaNoValue > 0 && ` ${file.issues.formulaNoValue} non avevano il valore salvato nel file: riaprilo in Excel e risalvalo per recuperarle.`}
          </span>
        </p>
      )}

      {expanded && (
        <div className="mt-4 flex flex-col gap-4 border-t border-[var(--border)] pt-4">
          {file.proposal && file.proposal.length > 0 && <ProposalPanel proposal={file.proposal} usedAi={file.usedAi} />}

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Assegnazione dei campi</p>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="flex flex-col gap-1">
                  <span className="text-xs text-slate-300">
                    {f.label}{f.required && <span className="text-sky-400"> *</span>}
                    <span className="text-slate-600"> · {f.hint}</span>
                  </span>
                  <select value={map[f.key] ?? ''}
                    onChange={(e) => { setMap((m) => ({ ...m, [f.key]: e.target.value })); setPreview(null); }}
                    className={`rounded-lg border bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 outline-none ${
                      f.required && !map[f.key] ? 'border-sky-500/50' : 'border-[var(--border)]'
                    }`}>
                    <option value="">— nessuna —</option>
                    {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={runPreview} disabled={previewing || !map.content || file.rawPurged}
                title={!map.content ? 'Serve almeno la colonna del testo' : 'Vedi come diventano le righe, senza scrivere niente'}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/20 disabled:opacity-40">
                {previewing ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                Verifica il risultato
              </button>
              <button onClick={() => onAct(file.id, 'map', map)} disabled={!!busy || !dirty}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">
                {busyHere && busy.startsWith('map') ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Salva assegnazione
              </button>
              {dirty && (
                <span className="text-[11px] text-amber-300">
                  Modifiche non salvate — dopo il salvataggio usa &ldquo;Reimporta&rdquo; per rigenerare le mention.
                </span>
              )}
              {!file.rawPurged && file.status === 'imported' && (
                <button onClick={() => onAct(file.id, 'purge')} disabled={!!busy}
                  title="Elimina le righe grezze per liberare spazio: le mention restano, ma il file non sarà più rimappabile"
                  className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-50">
                  <Archive className="size-3.5" /> Libera spazio grezzo
                </button>
              )}
            </div>
            {previewErr && <p className="mt-2 text-xs text-amber-300">{previewErr}</p>}
          </div>

          {preview && <PreviewTable preview={preview} />}

          <ColumnTable profiles={file.profiles} mapping={map} />
        </div>
      )}
    </section>
  );
}

/** Come diventano davvero le righe: stessa funzione dell'import, zero scritture. */
function PreviewTable({ preview }: { preview: { rows: PreviewRow[]; report: Report } }) {
  const { rows, report } = preview;
  const fellBack = rows.filter((r) => r.dateFellBack).length;
  return (
    <div className="rounded-lg border border-sky-500/25 bg-sky-500/[0.04] px-3 py-2.5">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-sky-300">
        <Eye className="size-3.5" /> Come diventeranno le righe
      </p>
      <p className="mb-2 text-xs text-slate-500">
        {`Prime ${rows.length} righe valide, prodotte dalla stessa funzione che scrive l’import: quello che vedi è quello che verrà salvato.`}
        {report.skippedEmpty > 0 && <span className="text-slate-400"> · {report.skippedEmpty} righe scartate perché senza testo</span>}
        {fellBack > 0 && <span className="text-amber-300"> · {fellBack} con data non leggibile, finite a oggi</span>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="pb-1 pr-3">Data</th>
              <th className="pb-1 pr-3">Fonte</th>
              <th className="pb-1 pr-3">Autore</th>
              <th className="pb-1 pr-3">Testo</th>
              <th className="pb-1 pr-3">Sent.</th>
              <th className="pb-1 pr-3 text-right">Reach</th>
              <th className="pb-1 text-right">Engag.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-[var(--border)]/40 align-top">
                <td className={`py-1 pr-3 whitespace-nowrap tabular-nums ${r.dateFellBack ? 'text-amber-400' : 'text-slate-400'}`}>
                  {new Date(r.publishedAt).toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })}
                  {r.dateFellBack && <AlertTriangle className="ml-1 inline size-3" />}
                </td>
                <td className="py-1 pr-3 text-slate-400">{r.source}</td>
                <td className="py-1 pr-3 text-slate-400">{r.author ?? <span className="text-slate-700">—</span>}</td>
                <td className="max-w-[24rem] truncate py-1 pr-3 text-slate-300">{r.content}</td>
                <td className="py-1 pr-3 text-slate-400">{r.sentiment ?? <span className="text-slate-700">—</span>}</td>
                <td className="py-1 pr-3 text-right tabular-nums text-slate-400">{r.reach == null ? '—' : num(r.reach)}</td>
                <td className="py-1 text-right tabular-nums text-slate-400">{Math.round(r.engagementScore)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ProposalPanel({ proposal, usedAi }: { proposal: Proposal[]; usedAi: boolean }) {
  const sure = proposal.filter((p) => p.field && p.confidence === 'alta');
  const unsure = proposal.filter((p) => p.field && p.confidence !== 'alta');
  const ignored = proposal.filter((p) => !p.field);
  const Row = ({ p }: { p: Proposal }) => (
    <li className="flex flex-wrap items-baseline gap-x-2 text-xs">
      <span className="font-medium text-slate-300">{p.column}</span>
      {p.field && <><span className="text-slate-600">→</span><span className="text-sky-300">{FIELD_LABEL[p.field] ?? p.field}</span></>}
      <span className="text-slate-600">{p.reason}</span>
    </li>
  );
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        <Wand2 className="size-3.5 text-violet-400" /> Cosa ha capito Radar
      </p>
      <p className="mb-2 text-xs text-slate-600">
        Letto dai <span className="text-slate-400">valori</span> delle colonne, non dai loro nomi: funziona in qualsiasi lingua. Resta tutto modificabile qui sotto.
        {!usedAi && (
          <span className="text-amber-400"> · Riconoscimento automatico senza AI (chiave assente, tetto di spesa raggiunto o modello non raggiungibile): controlla le assegnazioni.</span>
        )}
      </p>
      <div className="flex flex-col gap-2">
        {sure.length > 0 && (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-emerald-300"><Check className="size-3" /> Riconosciute ({sure.length})</p>
            <ul className="flex flex-col gap-0.5">{sure.map((p) => <Row key={p.column} p={p} />)}</ul>
          </div>
        )}
        {unsure.length > 0 && (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-300"><AlertTriangle className="size-3" /> Da controllare ({unsure.length})</p>
            <ul className="flex flex-col gap-0.5">{unsure.map((p) => <Row key={p.column} p={p} />)}</ul>
          </div>
        )}
        {ignored.length > 0 && (
          <div>
            <p className="mb-0.5 flex items-center gap-1 text-[11px] font-medium text-slate-500"><EyeOff className="size-3" /> Non importate ({ignored.length})</p>
            <p className="text-xs text-slate-600">{ignored.map((p) => p.column).join(' · ')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Le colonne come sono davvero nel file: tipo osservato, riempimento, esempi. */
function ColumnTable({ profiles, mapping }: { profiles: Profile[]; mapping: Record<string, string> }) {
  const assignedTo = (col: string) => Object.entries(mapping).find(([, v]) => v === col)?.[0];
  return (
    <details className="rounded-lg border border-[var(--border)] px-3 py-2">
      <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-widest text-slate-500 [&::-webkit-details-marker]:hidden">
        <RefreshCw className="mr-1 inline size-3" /> Colonne del file ({profiles.length})
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="pb-1 pr-3">Colonna</th>
              <th className="pb-1 pr-3">Tipo</th>
              <th className="pb-1 pr-3 text-right">Piena</th>
              <th className="pb-1 pr-3 text-right">Distinti</th>
              <th className="pb-1 pr-3">Esempi</th>
              <th className="pb-1">Assegnata a</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const field = assignedTo(p.name);
              return (
                <tr key={p.name} className="border-t border-[var(--border)]/40">
                  <td className="py-1 pr-3 font-medium text-slate-300">{p.name}</td>
                  <td className="py-1 pr-3 text-slate-500">{p.kind}</td>
                  <td className={`py-1 pr-3 text-right tabular-nums ${p.filled < 60 ? 'text-amber-400' : 'text-slate-500'}`}>{p.filled}%</td>
                  <td className="py-1 pr-3 text-right tabular-nums text-slate-500">{p.distinct}</td>
                  <td className="max-w-[22rem] truncate py-1 pr-3 text-slate-600">{p.samples.join(' ¦ ')}</td>
                  <td className="py-1 text-sky-300">{field ? (FIELD_LABEL[field] ?? field) : <span className="text-slate-700">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </details>
  );
}
