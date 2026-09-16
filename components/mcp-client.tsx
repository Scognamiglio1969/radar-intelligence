'use client';

import { useState } from 'react';
import { KeyRound, Loader2, PlayCircle, AlertTriangle, Check } from 'lucide-react';
import { CopyButton } from './copy-button';
import { generateMcpTokenAction } from '@/app/mcp/actions';

// ---------------------------------------------------------------------------
// I controlli della pagina MCP che vivono nel browser: il token mostrato una
// volta sola, e la prova dell'endpoint.
// ---------------------------------------------------------------------------

export function TokenGenerator({ hasToken, lang }: { hasToken: boolean; lang: 'it' | 'en' }) {
  const L = (it: string, en: string) => (lang === 'it' ? it : en);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true); setError('');
    const r = await generateMcpTokenAction();
    setBusy(false); setConfirm(false);
    if (r.error) setError(r.error);
    else if (r.token) setToken(r.token);
  };

  if (token) {
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-4 py-3 text-xs">
        <p className="mb-1.5 flex items-center gap-1.5 font-semibold text-emerald-300">
          <Check className="size-3.5" /> {L('Nuovo token — copialo adesso: non verrà più mostrato.', 'New token — copy it now: it will not be shown again.')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="break-all rounded bg-black/30 px-2 py-1 text-[11px] text-slate-200">{token}</code>
          <CopyButton text={token} />
        </div>
        <p className="mt-2 text-[11px] text-slate-400">{L('Le istruzioni qui sotto usano il segnaposto IL_TUO_TOKEN: sostituiscilo con questo.', 'The instructions below use the placeholder YOUR_TOKEN: replace it with this one.')}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {hasToken && !confirm && (
        <button onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
          <KeyRound className="size-3.5" /> {L('Genera un nuovo token', 'Generate a new token')}
        </button>
      )}
      {hasToken && confirm && (
        <span className="flex flex-wrap items-center gap-2 text-xs text-amber-200">
          <AlertTriangle className="size-3.5" />
          {L('Il token attuale smetterà di funzionare: andranno aggiornati i client già collegati.', 'The current token will stop working: connected clients will need updating.')}
          <button onClick={run} disabled={busy} className="rounded-lg bg-amber-500/90 px-2.5 py-1 font-medium text-slate-950 hover:bg-amber-400 disabled:opacity-50">
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : L('Genera comunque', 'Generate anyway')}
          </button>
          <button onClick={() => setConfirm(false)} className="text-slate-400 hover:text-slate-200">{L('Annulla', 'Cancel')}</button>
        </span>
      )}
      {!hasToken && (
        <button onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <KeyRound className="size-3.5" />}
          {L('Accendi l’MCP: genera il token', 'Turn MCP on: generate the token')}
        </button>
      )}
      {error && <span className="text-xs text-red-300">{error}</span>}
    </div>
  );
}

export function McpSelfTest({ lang }: { lang: 'it' | 'en' }) {
  const L = (it: string, en: string) => (lang === 'it' ? it : en);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok?: boolean; ms?: number; tools?: number; prompts?: number; projects?: number; error?: string } | null>(null);

  const run = async () => {
    setBusy(true); setResult(null);
    try {
      const res = await fetch('/api/admin/mcp-test', { method: 'POST' });
      setResult(await res.json());
    } catch (e) {
      setResult({ error: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <button onClick={run} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 px-3 py-1.5 text-sky-200 hover:bg-sky-500/10 disabled:opacity-50">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PlayCircle className="size-3.5" />}
        {L('Prova l’endpoint', 'Test the endpoint')}
      </button>
      {result?.ok && (
        <span className="text-emerald-300">
          {L(`Risponde in ${result.ms} ms: ${result.tools} strumenti, ${result.prompts} prompt, ${result.projects} progetti visibili.`,
            `Answers in ${result.ms} ms: ${result.tools} tools, ${result.prompts} prompts, ${result.projects} projects visible.`)}
        </span>
      )}
      {result?.error && <span className="text-red-300">{result.error}</span>}
    </div>
  );
}
