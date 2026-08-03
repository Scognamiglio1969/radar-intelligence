'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutList, CalendarClock } from 'lucide-react';

// I due modi di produrre un report vivono sotto la stessa voce di menu: uno lo
// componi tu, l'altro esce da solo a una cadenza. Separarli in due voci
// avrebbe suggerito che siano due strumenti diversi, e non lo sono.
const TABS = [
  { href: '/report', label: 'Composto da te', icon: LayoutList },
  { href: '/report/periodic', label: 'Periodico', icon: CalendarClock },
];

export function ReportTabs() {
  const pathname = usePathname();
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = pathname === t.href;
        const Icon = t.icon;
        return (
          <Link key={t.href} href={t.href}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${active
              ? 'border-sky-500/50 bg-sky-500/10 text-sky-200'
              : 'border-[var(--border)] text-slate-400 hover:bg-white/5'}`}>
            <Icon className="size-3.5" /> {t.label}
          </Link>
        );
      })}
    </div>
  );
}
