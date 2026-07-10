'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Radar, LayoutDashboard, Ear, Newspaper, BarChart3, Users,
  Star, Bell, FileText, Settings, MessageSquareText, GitBranch,
  Diff, PenLine, Menu, X, MonitorPlay, Network, History,
  UserCog, LogOut, UserCircle2, ScatterChart, Grid3x3, TrendingDown, Boxes, Workflow,
} from 'lucide-react';
import { RefreshButton } from './refresh-button';
import { Brand } from './brand';

const NAV: ({ href: string; label: string; icon: typeof Radar } | { section: string })[] = [
  { section: 'Analisi' },
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/listening', label: 'Ascolto', icon: Ear },
  { href: '/media', label: 'Media', icon: Newspaper },
  { href: '/benchmark', label: 'Benchmark', icon: BarChart3 },
  { href: '/audience', label: 'Audience', icon: Users },
  { href: '/content', label: 'Contenuti', icon: Star },
  { section: 'Intelligence' },
  { href: '/narratives', label: 'Narrazioni', icon: GitBranch },
  { href: '/stakeholders', label: 'Mappa attori', icon: Network },
  { href: '/timeline', label: 'Timeline', icon: History },
  { href: '/changes', label: 'Cosa è cambiato', icon: Diff },
  { href: '/alerts', label: 'Alert', icon: Bell },
  { href: '/brief', label: 'Brief', icon: FileText },
  { section: 'Insight avanzati' },
  { href: '/insights/topics', label: 'Temi × Sentiment', icon: ScatterChart },
  { href: '/insights/heatmap', label: 'Heatmap oraria', icon: Grid3x3 },
  { href: '/insights/waterfall', label: 'Sentiment Waterfall', icon: TrendingDown },
  { href: '/insights/clusters', label: 'Cluster conversazionali', icon: Boxes },
  { href: '/insights/causal', label: 'Causa-Effetto', icon: Workflow },
  { section: 'AI Studio' },
  { href: '/ask', label: 'Chiedi ai dati', icon: MessageSquareText },
  { href: '/studio', label: 'Content Studio', icon: PenLine },
  { section: '' },
  { href: '/tv', label: 'War Room', icon: MonitorPlay },
  { href: '/settings', label: 'Gestione progetti', icon: Settings },
];

type Props = {
  projects: { id: number; name: string }[];
  currentId: number | null;
  lastIngest: string | null;
  alertCount?: number;
  user?: { name: string; role: string } | null;
};

export function Sidebar({ projects, currentId, lastIngest, alertCount = 0, user = null }: Props) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ logout: true }),
    });
    window.location.href = '/login';
  }

  const userBlock = user && (
    <div className="border-t border-[var(--border)] pt-2">
      <div className="flex items-center gap-2 px-2 py-1">
        <UserCircle2 className="size-5 shrink-0 text-slate-500" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-300">{user.name}</p>
          <p className="text-[10px] uppercase tracking-wide text-slate-600">{user.role === 'admin' ? 'Admin' : 'Membro'}</p>
        </div>
      </div>
      <Link href="/impostazioni/account" onClick={() => setOpen(false)}
        className="flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-slate-200">
        <UserCog className="size-4" /> Impostazioni
      </Link>
      <button onClick={logout}
        className="flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition hover:bg-white/5 hover:text-red-300">
        <LogOut className="size-4" /> Esci
      </button>
    </div>
  );

  return (
    <>
      {/* Header mobile/tablet (sotto lg) */}
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--border)] bg-[#0c1226]/95 px-4 py-2.5 backdrop-blur lg:hidden">
        <button onClick={() => setOpen(true)} aria-label="Apri il menu"
          className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10">
          <Menu className="size-5" />
        </button>
        <Brand size="sm" />
        <div className="ml-auto">
          <ProjectSelect projects={projects} currentId={currentId} compact />
        </div>
      </header>

      {/* Drawer mobile */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-4 overflow-y-auto bg-[#0c1226] px-3 py-4 shadow-2xl">
            <div className="flex items-center gap-2 px-2">
              <Brand />
              <button onClick={() => setOpen(false)} aria-label="Chiudi il menu"
                className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-white/10">
                <X className="size-5" />
              </button>
            </div>
            <NavLinks pathname={pathname} alertCount={alertCount} onNavigate={() => setOpen(false)} />
            {userBlock}
            <FooterBlock lastIngest={lastIngest} />
          </div>
        </div>
      )}

      {/* Sidebar desktop (da lg in su) */}
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-3 border-r border-[var(--border)] bg-[#0c1226] px-3 py-5 lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <ProjectSelect projects={projects} currentId={currentId} />
        <NavLinks pathname={pathname} alertCount={alertCount} />
        <div className="mt-auto flex flex-col gap-3">
          {userBlock}
          <FooterBlock lastIngest={lastIngest} />
        </div>
      </aside>
    </>
  );
}

function ProjectSelect({ projects, currentId, compact }: {
  projects: Props['projects']; currentId: number | null; compact?: boolean;
}) {
  const router = useRouter();
  if (projects.length === 0) return null;
  return (
    <select
      value={currentId ?? undefined}
      onChange={(e) => {
        document.cookie = `sr_project=${e.target.value};path=/;max-age=31536000`;
        router.refresh();
      }}
      className={`rounded-lg border border-[var(--border)] bg-[var(--panel)] text-sm outline-none ${
        compact ? 'max-w-[45vw] truncate px-2 py-1 text-xs' : 'mx-1 px-2 py-1.5'
      }`}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.name}</option>
      ))}
    </select>
  );
}

function NavLinks({ pathname, alertCount = 0, onNavigate }: {
  pathname: string; alertCount?: number; onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 overflow-y-auto">
      {NAV.map((item, i) => {
        if ('section' in item) {
          return item.section
            ? <p key={i} className="mt-3 mb-0.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-600">{item.section}</p>
            : <hr key={i} className="my-2 border-[var(--border)]" />;
        }
        const { href, label, icon: Icon } = item;
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              active
                ? 'bg-sky-500/15 text-sky-300 font-medium'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Icon className="size-4" />
            {label}
            {href === '/alerts' && alertCount > 0 && (
              <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/90 px-1.5 text-[11px] font-bold text-white">
                {alertCount > 9 ? '9+' : alertCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function FooterBlock({ lastIngest }: { lastIngest: string | null }) {
  return (
    <div className="mt-auto flex flex-col gap-2 px-1">
      <RefreshButton />
      <p className="px-1 text-[11px] leading-4 text-slate-500">
        {lastIngest
          ? `Ultimo aggiornamento: ${new Date(lastIngest).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`
          : 'Nessuna raccolta dati ancora eseguita'}
      </p>
    </div>
  );
}
