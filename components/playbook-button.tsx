'use client';

import { useState } from 'react';
import { marked } from 'marked';
import { Loader2, ShieldAlert } from 'lucide-react';

export function PlaybookButton({ alertId, existing }: { alertId: number; existing: string | null }) {
  const [playbook, setPlaybook] = useState<string | null>(existing);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (playbook) { setOpen(!open); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/playbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setPlaybook(data.playbook);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button onClick={generate} disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldAlert className="size-3.5" />}
        {busy ? 'Generating plan…' : playbook ? (open ? 'Hide response plan' : 'Show response plan') : 'Generate response plan'}
      </button>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
      {playbook && open && (
        <div className="brief-md mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-slate-300"
          dangerouslySetInnerHTML={{ __html: marked.parse(playbook) as string }} />
      )}
    </div>
  );
}
