'use client';

import { useState } from 'react';
import { marked } from 'marked';
import { Loader2, UserSearch } from 'lucide-react';

export function InfluencerButton({ author, source }: { author: string; source: string }) {
  const [profile, setProfile] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (profile) { setOpen(!open); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/influencer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, source }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'error');
      setProfile(data.profile);
      setOpen(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button onClick={generate} disabled={busy}
        title="AI profile + outreach draft"
        className="shrink-0 rounded-md p-1 text-slate-500 transition hover:bg-sky-500/15 hover:text-sky-300 disabled:opacity-60">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <UserSearch className="size-3.5" />}
      </button>
      {error && <span className="text-[10px] text-red-400">{error}</span>}
      {profile && open && (
        <div className="brief-md col-span-full mt-1 w-full rounded-lg border border-sky-500/20 bg-sky-500/5 px-4 py-3 text-sm text-slate-300"
          dangerouslySetInnerHTML={{ __html: marked.parse(profile) as string }} />
      )}
    </>
  );
}
