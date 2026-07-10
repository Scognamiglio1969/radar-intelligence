'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

// Se i dati sono più vecchi di 2 ore, lancia un refresh in background
// all'apertura dell'app: sostituisce il cron ravvicinato non disponibile
// sul piano free di Vercel.
export function AutoRefresh({ stale }: { stale: boolean }) {
  const router = useRouter();
  const fired = useRef(false);

  useEffect(() => {
    if (!stale || fired.current) return;
    fired.current = true;
    fetch('/api/refresh', { method: 'POST' })
      .then(() => router.refresh())
      .catch(() => {});
  }, [stale, router]);

  return null;
}
