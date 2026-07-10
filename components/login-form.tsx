'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Brand } from './brand';

export function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        // Primo accesso con password temporanea → invita a cambiarla
        window.location.href = data.mustChangePassword ? '/impostazioni/account?first=1' : '/';
        return;
      }
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel flex w-full max-w-sm flex-col gap-4 px-8 py-10">
      <div className="flex justify-center">
        <Brand size="lg" />
      </div>
      <p className="text-center text-sm text-slate-400">Team access only</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Work email"
        autoFocus
        autoComplete="username"
        className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-sky-500/60"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2.5 text-sm outline-none placeholder:text-slate-600 focus:border-sky-500/60"
      />
      {error && <p className="text-center text-xs text-red-400">Incorrect email or password.</p>}
      <button type="submit" disabled={busy || !email || !password}
        className="flex items-center justify-center gap-2 rounded-lg bg-sky-500/90 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-60">
        {busy && <Loader2 className="size-4 animate-spin" />} Sign in
      </button>
    </form>
  );
}
