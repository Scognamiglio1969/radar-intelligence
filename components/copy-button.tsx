'use client';

import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  // La lingua si legge dopo il montaggio: così server e client partono uguali.
  const [en, setEn] = useState(false);
  useEffect(() => setEn(document.documentElement.lang === 'en'), []);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-sky-400 transition hover:bg-sky-500/10"
    >
      {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />}
      {en ? (copied ? 'copied' : 'copy') : (copied ? 'copiato' : 'copia')}
    </button>
  );
}
