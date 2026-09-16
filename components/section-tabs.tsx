'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_TABS } from '@/lib/nav';

// ---------------------------------------------------------------------------
// Le schede di una famiglia di pagine.
//
// Quattro voci di menù che rispondono alla stessa domanda erano quattro voci di
// menù. Ora sono schede: il menù si accorcia e non si nasconde niente, perché
// le sorelle di una pagina sono visibili mentre la si guarda — che è anche il
// momento in cui viene voglia di passare all'altra.
//
// Gli indirizzi restano quelli di prima: un link salvato o condiviso non deve
// morire per una riorganizzazione del menù.
// ---------------------------------------------------------------------------

const GROUPS: Record<string, { href: string; label: string; it?: string }[]> = {
  story: [
    { href: '/narratives', label: 'Narratives' },
    { href: '/timeline', label: 'Timeline' },
    { href: '/stakeholders', label: 'Stakeholders' },
    { href: '/messages', label: 'Message pull-through' },
  ],
  data: [
    { href: '/measures', label: 'Measures' },
    { href: '/people', label: 'People' },
  ],
  facts: [
    { href: '/riscontri', label: 'Cross-checks', it: 'Riscontri' },
    { href: '/verifiche', label: 'Fact checks', it: 'Verifiche' },
    { href: '/evidenze', label: 'Clinical trials', it: 'Studi clinici' },
    { href: '/podcast', label: 'Podcasts', it: 'Podcast' },
  ],
};

export function SectionTabs({ group, lang = 'en' }: { group: keyof typeof GROUPS | string; lang?: 'it' | 'en' }) {
  const pathname = usePathname();
  const tabs = GROUPS[group] ?? [];
  if (!tabs.length) return null;

  return (
    <nav className="mb-4 flex flex-wrap gap-1.5">
      {tabs.map((t) => {
        const active = pathname === t.href;
        const meta = NAV_TABS.find((n) => n.href === t.href);
        const Icon = meta?.icon;
        return (
          <Link key={t.href} href={t.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition ${
              active
                ? 'border-sky-500/50 bg-sky-500/10 font-medium text-sky-200'
                : 'border-[var(--border)] text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}>
            {Icon && <Icon className="size-3.5 shrink-0" />}
            {lang === 'it' && t.it ? t.it : t.label}
          </Link>
        );
      })}
    </nav>
  );
}
