'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UploadCloud, FileSpreadsheet, Check, Loader2, ArrowRight, Sparkles, AlertTriangle,
  EyeOff, Wand2, Trash2, RefreshCw, ChevronDown, ChevronRight, Archive,
  Download, Eye, Table2, Layers, CalendarRange, PlayCircle, ClipboardCheck,
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
  sheetName: string | null;
  kind: 'mentions' | 'metrics';
  metricMap: MetricMap | null;
  extras: Record<string, string>;
  createdAt: string; importedAt: string | null;
};
type MetricMap = {
  date?: string; entity?: string; entityLabel?: string;
  metrics?: string[]; dims?: string[];
};
type SheetInfo = {
  name: string; hidden: boolean; rows: number; columns: number;
  headerRow: number; headers: string[]; twoRowHeader: boolean;
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

/** Un foglio è pronto quando ha ciò che serve al SUO tipo di lettura. */
const isReady = (f: ImportFile) => (f.kind === 'metrics'
  ? Boolean(f.metricMap?.date && (f.metricMap.metrics ?? []).length)
  : Boolean(f.mapping.content));

export function ImportWorkspace({ project }: { project: { id: number; name: string } }) {
  const [files, setFiles] = useState<ImportFile[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [analyzeMsg, setAnalyzeMsg] = useState('');
  /** File caricato in attesa che l'utente scelga quali fogli importare. */
  const [pending, setPending] = useState<{ file: File; sheets: SheetInfo[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/import/files?project=${project.id}`);
    const d = await res.json();
    if (res.ok) setFiles(d.files ?? []);
    else setError(d.error ?? 'Errore di caricamento');
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  /**
   * Carica un file. Se contiene più fogli non se ne sceglie uno a caso: si
   * mostra l'inventario e decide l'utente. Il file resta qui nel browser, così
   * la scelta non costa un secondo caricamento all'utente.
   */
  const upload = async (f: File, sheets?: string[]) => {
    setBusy('upload'); setError('');
    try {
      const fd = new FormData();
      fd.append('file', f);
      fd.append('projectId', String(project.id));
      if (sheets?.length) fd.append('sheets', sheets.join('\n'));
      const res = await fetch('/api/import/files', { method: 'POST', body: fd });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? "Errore nell'upload"); return; }
      if (d.needsChoice) { setPending({ file: f, sheets: d.sheets }); return; }
      setPending(null);
      await load();
      if (d.fileId) setOpen(d.fileId);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  const act = async (fileId: number, action: string, payload?: Record<string, unknown>) => {
    setBusy(`${action}-${fileId}`); setError('');
    try {
      const res = await fetch('/api/import/files', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, fileId, action, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error ?? 'Operazione fallita'); return; }
      await load();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(''); }
  };

  /** Importa in fila tutti i file che hanno già il testo assegnato. */
  const importAll = async () => {
    // Pronto significa cose diverse per un foglio di contenuti e uno di misure.
    const todo = files.filter((f) => !f.rawPurged && f.status !== 'imported' && isReady(f));
    if (!todo.length) return;
    setBusy('all'); setError('');
    try {
      for (const f of todo) {
        const res = await fetch('/api/import/files', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: project.id, fileId: f.id, action: 'derive', kind: f.kind }),
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
      ready: files.filter((f) => !f.rawPurged && f.status !== 'imported' && isReady(f)).length,
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

      {files.length > 0 && <AuditPanel projectId={project.id} files={files} />}

      {pending && (
        <SheetChooser
          filename={pending.file.name} sheets={pending.sheets} busy={busy === 'upload'}
          onCancel={() => setPending(null)}
          onConfirm={(names) => upload(pending.file, names)}
        />
      )}

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

type Audit = {
  fileId: number; label: string; kind: 'mentions' | 'metrics'; status: string;
  rowsInSheet: number; produced: number;
  skipped: { reason: string; rows: number }[];
  columnsTotal: number;
  mapped: { column: string; field: string }[];
  kept: { column: string; label: string }[];
  ignored: string[];
  balanced: boolean; notes: string[];
};

/**
 * La quadratura.
 *
 * "Ho preso tutti i dati?" non si risponde con una rassicurazione. Si risponde
 * con due conti che devono tornare: le righe del foglio contro quelle
 * importate, con il motivo di ogni scarto; e le colonne del foglio contro
 * quelle usate, conservate o ignorate, con i nomi. Finché tornano, niente è
 * sparito in silenzio.
 */
function AuditPanel({ projectId, files }: { projectId: number; files: ImportFile[] }) {
  const [open, setOpen] = useState(false);
  const [audit, setAudit] = useState<Audit[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/import/audit?project=${projectId}`);
      const d = await res.json();
      if (res.ok) setAudit(d.audit ?? []);
    } finally { setLoading(false); }
  };

  // Si ricarica quando cambia lo stato dei file: una quadratura vecchia
  // rassicurerebbe su un import che nel frattempo è cambiato.
  const signature = files.map((f) => `${f.id}:${f.status}:${f.report?.inserted ?? 0}`).join('|');
  useEffect(() => { if (open) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open, signature]);

  const done = audit?.filter((a) => a.status === 'imported') ?? [];
  const unexplained = done.filter((a) => !a.balanced).length;
  const ignoredCols = audit?.reduce((s, a) => s + a.ignored.length, 0) ?? 0;

  return (
    <section className="panel px-5 py-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        {open ? <ChevronDown className="size-4 text-slate-500" /> : <ChevronRight className="size-4 text-slate-500" />}
        <ClipboardCheck className="size-4 text-emerald-400" />
        <span className="text-sm font-medium text-slate-200">Quadratura</span>
        <span className="text-[11px] text-slate-600">
          righe e colonne: dove sono finite tutte
        </span>
        {audit && (
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] ${unexplained
            ? 'bg-red-500/15 text-red-300'
            : ignoredCols ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/15 text-emerald-300'}`}>
            {unexplained ? `${unexplained} fogli non quadrano`
              : ignoredCols ? `${ignoredCols} colonne non usate` : 'tutto spiegato'}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
          {loading && <p className="text-xs text-slate-500"><Loader2 className="mr-1 inline size-3 animate-spin" /> Conteggio…</p>}
          {audit?.map((a) => (
            <div key={a.fileId} className="rounded-lg border border-[var(--border)] px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-slate-200">{a.label}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] ${a.kind === 'metrics'
                  ? 'bg-violet-500/15 text-violet-300' : 'bg-sky-500/15 text-sky-300'}`}>
                  {a.kind === 'metrics' ? 'misure' : 'contenuti'}
                </span>
                {a.status === 'imported' ? (
                  a.balanced
                    ? <span className="inline-flex items-center gap-1 text-[11px] text-emerald-300"><Check className="size-3" /> quadra</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] text-red-300"><AlertTriangle className="size-3" /> non quadra</span>
                ) : <span className="text-[11px] text-amber-300">non importato</span>}
              </div>

              <p className="mt-1 text-[11px] text-slate-500">
                <span className="text-slate-300">{num(a.rowsInSheet)}</span> righe nel foglio →
                {' '}<span className="text-emerald-300">{num(a.produced)}</span>
                {' '}{a.kind === 'metrics' ? 'punti di misura' : 'mention'}
                {a.skipped.map((s) => (
                  <span key={s.reason}> · {num(s.rows)} {s.reason}</span>
                ))}
              </p>

              <p className="mt-0.5 text-[11px] text-slate-500">
                <span className="text-slate-300">{a.columnsTotal}</span> colonne →
                {' '}<span className="text-sky-300">{a.mapped.length}</span> assegnate,
                {' '}<span className="text-violet-300">{a.kept.length}</span> conservate,
                {' '}<span className={a.ignored.length ? 'text-amber-300' : 'text-slate-600'}>{a.ignored.length}</span> non usate
                {a.ignored.length > 0 && (
                  <span className="text-slate-600"> — {a.ignored.slice(0, 8).join(', ')}{a.ignored.length > 8 ? '…' : ''}</span>
                )}
              </p>

              {a.notes.map((n) => (
                <p key={n} className="mt-0.5 text-[11px] text-amber-300/80">{n}</p>
              ))}
            </div>
          ))}
          {audit && audit.length === 0 && <p className="text-xs text-slate-600">Nessun file da quadrare.</p>}
        </div>
      )}
    </section>
  );
}

/**
 * La scelta dei fogli.
 *
 * Un database vero ne ha venticinque o cinquanta, con forme diverse e metà
 * nascosti. Importarli tutti d'ufficio riempirebbe il progetto di tabelle di
 * servizio; importarne uno a caso perderebbe il grosso. Quindi si mostra cosa
 * c'è dentro — righe, colonne, prime intestazioni — e si sceglie guardando.
 */
function SheetChooser({ filename, sheets, busy, onCancel, onConfirm }: {
  filename: string; sheets: SheetInfo[]; busy: boolean;
  onCancel: () => void; onConfirm: (names: string[]) => void;
}) {
  const withData = useMemo(() => sheets.filter((s) => s.rows > 0), [sheets]);
  // Preselezione onesta: i fogli visibili con dei dati. I nascosti sono spesso
  // appunti di lavoro, ma restano a un clic di distanza.
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(withData.filter((s) => !s.hidden).map((s) => s.name)),
  );
  const [showEmpty, setShowEmpty] = useState(false);
  const visible = showEmpty ? sheets : withData;
  const toggle = (n: string) => setPicked((p) => {
    const next = new Set(p);
    if (next.has(n)) next.delete(n); else next.add(n);
    return next;
  });

  return (
    <section className="panel border-sky-500/30 px-5 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Layers className="size-4 text-sky-400" />
        <p className="text-sm font-medium text-slate-200">
          {filename} contiene {sheets.length} fogli
        </p>
        <p className="text-xs text-slate-500">
          {withData.length} con dati · scegli quali importare
        </p>
        <div className="ml-auto flex items-center gap-2 text-[11px]">
          <button onClick={() => setPicked(new Set(withData.map((s) => s.name)))}
            className="text-sky-300 hover:underline">tutti</button>
          <span className="text-slate-700">·</span>
          <button onClick={() => setPicked(new Set(withData.filter((s) => !s.hidden).map((s) => s.name)))}
            className="text-sky-300 hover:underline">solo visibili</button>
          <span className="text-slate-700">·</span>
          <button onClick={() => setPicked(new Set())} className="text-slate-500 hover:underline">nessuno</button>
        </div>
      </div>

      <div className="max-h-[26rem] overflow-y-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--panel-2)]">
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="w-8 px-3 py-2"></th>
              <th className="px-2 py-2">Foglio</th>
              <th className="px-2 py-2 text-right">Righe</th>
              <th className="px-2 py-2 text-right">Colonne</th>
              <th className="px-2 py-2">Prime intestazioni</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const on = picked.has(s.name);
              const empty = s.rows === 0;
              return (
                <tr key={s.name}
                  onClick={() => !empty && toggle(s.name)}
                  className={`border-t border-[var(--border)]/40 ${empty ? 'opacity-40' : 'cursor-pointer hover:bg-white/[0.03]'} ${on ? 'bg-sky-500/[0.06]' : ''}`}>
                  <td className="px-3 py-1.5">
                    <input type="checkbox" checked={on} disabled={empty} readOnly className="size-3.5 accent-sky-500" />
                  </td>
                  <td className="px-2 py-1.5">
                    <span className="font-medium text-slate-200">{s.name}</span>
                    {s.hidden && <span className="ml-1.5 rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-slate-500">nascosto</span>}
                    {s.twoRowHeader && <span className="ml-1.5 rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] text-violet-300">intestazione doppia</span>}
                    {s.headerRow > 1 && <span className="ml-1.5 text-[10px] text-slate-600">intestazione a riga {s.headerRow}</span>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{empty ? '—' : num(s.rows)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{s.columns}</td>
                  <td className="max-w-[24rem] truncate px-2 py-1.5 text-slate-600">{s.headers.slice(0, 6).join(' · ')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={() => onConfirm([...picked])} disabled={busy || picked.size === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3.5 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-40">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowRight className="size-3.5" />}
          Importa {picked.size} {picked.size === 1 ? 'foglio' : 'fogli'}
        </button>
        <button onClick={onCancel} disabled={busy}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5 disabled:opacity-40">
          Annulla
        </button>
        {sheets.length > withData.length && (
          <button onClick={() => setShowEmpty((v) => !v)} className="text-[11px] text-slate-500 hover:text-slate-300">
            {showEmpty ? 'nascondi' : 'mostra'} i {sheets.length - withData.length} fogli vuoti
          </button>
        )}
        {busy && <span className="text-[11px] text-slate-500">Lettura e profilazione di ogni foglio: può richiedere qualche minuto.</span>}
      </div>
    </section>
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
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
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
          <span className="truncate text-sm font-medium text-slate-200">{file.sheetName ?? file.filename}</span>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${file.kind === 'metrics' ? 'bg-violet-500/15 text-violet-300' : 'bg-sky-500/15 text-sky-300'}`}>{file.kind === 'metrics' ? 'misure' : 'contenuti'}</span>
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
            <button onClick={() => onAct(file.id, 'derive', { kind: file.kind })} disabled={!!busy || !isReady(file)}
              title={!isReady(file)
                ? (file.kind === 'metrics' ? 'Scegli prima la data e almeno una colonna di valori' : 'Assegna prima la colonna del testo')
                : file.status === 'imported' ? 'Rigenera i dati da questo foglio' : 'Deriva i dati'}
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

      <div className="mt-2"><Steps step={st.step} hasContent={isReady(file)} /></div>

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
          <KindSwitch file={file} busy={busy} onAct={onAct} />

          {file.kind === 'metrics' ? (
            <MetricEditor file={file} busy={busy} onAct={onAct} />
          ) : (
          <>
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
              <button onClick={() => onAct(file.id, 'map', { mapping: map })} disabled={!!busy || !dirty}
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

          <ExtrasEditor file={file} busy={busy} onAct={onAct} />

          {preview && <PreviewTable preview={preview} />}
          </>
          )}

          <ColumnTable profiles={file.profiles} mapping={map} />
        </div>
      )}
    </section>
  );
}

/**
 * Post o misure. Il riconoscimento automatico ci prende quasi sempre, ma un
 * foglio di storie senza didascalia somiglia a una tabella di numeri pur
 * essendo fatto di contenuti: l'ultima parola resta a chi guarda.
 */
function KindSwitch({ file, busy, onAct }: {
  file: ImportFile; busy: string;
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const opts: { k: 'mentions' | 'metrics'; label: string; hint: string }[] = [
    { k: 'mentions', label: 'Contenuti', hint: 'righe con un testo: post, articoli, commenti' },
    { k: 'metrics', label: 'Misure', hint: 'serie di numeri nel tempo: follower, impression, medie' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Questo foglio è</span>
      {opts.map((o) => (
        <button key={o.k} title={o.hint} disabled={!!busy}
          onClick={() => file.kind !== o.k && onAct(file.id, 'kind', { kind: o.k })}
          className={`rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${file.kind === o.k
            ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
            : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
          {o.label}
        </button>
      ))}
      <span className="text-[11px] text-slate-600">
        {opts.find((o) => o.k === file.kind)?.hint}
        {file.status === 'imported' && ' · cambiando tipo, quanto già importato da questo foglio viene rifatto'}
      </span>
    </div>
  );
}

/** La mappatura di un foglio di misure: data, chi, che cosa, e come tagliarlo. */
function MetricEditor({ file, busy, onAct }: {
  file: ImportFile; busy: string;
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [m, setM] = useState<MetricMap>(file.metricMap ?? {});
  useEffect(() => { setM(file.metricMap ?? {}); }, [file.metricMap]);
  const dirty = JSON.stringify(m) !== JSON.stringify(file.metricMap ?? {});

  const numeric = file.profiles.filter((p) => p.kind === 'number').map((p) => p.name);
  const textual = file.profiles.filter((p) => p.kind === 'text').map((p) => p.name);
  const toggleIn = (key: 'metrics' | 'dims', col: string) => setM((prev) => {
    const cur = new Set(prev[key] ?? []);
    if (cur.has(col)) cur.delete(col); else cur.add(col);
    return { ...prev, [key]: [...cur] };
  });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">Come leggere questo foglio</p>
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-300">Data <span className="text-sky-400">*</span><span className="text-slate-600"> · quando</span></span>
          <select value={m.date ?? ''} onChange={(e) => setM({ ...m, date: e.target.value })}
            className={`rounded-lg border bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100 ${m.date ? 'border-[var(--border)]' : 'border-sky-500/50'}`}>
            <option value="">— nessuna —</option>
            {file.columns.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-slate-300">Entità<span className="text-slate-600"> · chi</span></span>
          <select value={m.entity ?? ''} onChange={(e) => setM({ ...m, entity: e.target.value })}
            className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100">
            <option value="">— il foglio stesso —</option>
            {textual.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {!m.entity && (
          <label className="flex flex-col gap-1">
            <span className="text-xs text-slate-300">Nome dell&rsquo;entità<span className="text-slate-600"> · come chiamarla</span></span>
            <input value={m.entityLabel ?? ''} onChange={(e) => setM({ ...m, entityLabel: e.target.value })}
              placeholder={file.sheetName ?? file.filename}
              className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1.5 text-sm text-slate-100" />
          </label>
        )}
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-300">
          Colonne dei valori <span className="text-sky-400">*</span>
          <span className="text-slate-600"> · ognuna diventa una serie ({(m.metrics ?? []).length} scelte)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {numeric.map((c) => {
            const on = (m.metrics ?? []).includes(c);
            return (
              <button key={c} onClick={() => toggleIn('metrics', c)}
                className={`rounded-lg border px-2 py-1 text-[11px] ${on
                  ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'
                  : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>{c}</button>
            );
          })}
          {!numeric.length && <span className="text-[11px] text-slate-600">Nessuna colonna numerica in questo foglio.</span>}
        </div>
      </div>

      <div>
        <p className="mb-1 text-xs text-slate-300">
          Dimensioni<span className="text-slate-600"> · come tagliare i numeri: canale, pillar, azienda ({(m.dims ?? []).length} scelte)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {textual.filter((c) => c !== m.entity).map((c) => {
            const on = (m.dims ?? []).includes(c);
            return (
              <button key={c} onClick={() => toggleIn('dims', c)}
                className={`rounded-lg border px-2 py-1 text-[11px] ${on
                  ? 'border-violet-500/50 bg-violet-500/10 text-violet-200'
                  : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>{c}</button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => onAct(file.id, 'map-metrics', { metricMap: m })} disabled={!!busy || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">
          <Check className="size-3.5" /> Salva la lettura
        </button>
        {dirty && <span className="text-[11px] text-amber-300">Modifiche non salvate — poi usa &ldquo;Reimporta&rdquo;.</span>}
      </div>
    </div>
  );
}

/**
 * I campi conservati: le colonne che non sono un campo di Radar e che sarebbero
 * andate perse. L'etichetta è modificabile perché "CAT. TRASVERSALE" dice
 * qualcosa solo a chi ha costruito quel file.
 */
function ExtrasEditor({ file, busy, onAct }: {
  file: ImportFile; busy: string;
  onAct: (fileId: number, action: string, payload?: Record<string, unknown>) => Promise<void>;
}) {
  const [ex, setEx] = useState<Record<string, string>>(file.extras ?? {});
  useEffect(() => { setEx(file.extras ?? {}); }, [file.extras]);
  const dirty = JSON.stringify(ex) !== JSON.stringify(file.extras ?? {});
  const mapped = new Set(Object.values(file.mapping));
  const available = file.columns.filter((c) => !mapped.has(c) && !(c in ex));

  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        Campi conservati <span className="normal-case tracking-normal text-slate-600">— colonne che non sono un campo di Radar, ma che restano</span>
      </p>
      {Object.keys(ex).length === 0 && (
        <p className="mb-2 text-xs text-slate-600">Nessuna: tutte le colonne utili sono già assegnate a un campo.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {Object.entries(ex).map(([col, label]) => (
          <div key={col} className="flex flex-wrap items-center gap-2">
            <span className="min-w-[9rem] truncate text-xs text-slate-500">{col}</span>
            <ArrowRight className="size-3 shrink-0 text-slate-700" />
            <input value={label} onChange={(e) => setEx({ ...ex, [col]: e.target.value })}
              className="min-w-[10rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2.5 py-1 text-xs text-slate-100" />
            <button onClick={() => { const n = { ...ex }; delete n[col]; setEx(n); }}
              title="Non conservare questa colonna"
              className="text-slate-600 hover:text-red-300"><Trash2 className="size-3.5" /></button>
          </div>
        ))}
      </div>
      {available.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-600">aggiungi:</span>
          {available.slice(0, 14).map((c) => (
            <button key={c} onClick={() => setEx({ ...ex, [c]: c })}
              className="rounded-lg border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-slate-500 hover:text-slate-300">
              + {c}
            </button>
          ))}
        </div>
      )}
      {dirty && (
        <button onClick={() => onAct(file.id, 'extras', { extras: ex })} disabled={!!busy}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-40">
          <Check className="size-3.5" /> Salva i campi conservati
        </button>
      )}
    </div>
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
