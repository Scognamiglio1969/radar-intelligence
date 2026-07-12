import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
import { AutoRefresh } from '@/components/auto-refresh';
import { ExportBar } from '@/components/export-bar';
import { getCurrentProject, getLastIngestAt, getProjects, getPulse, getRecentAlertCount } from '@/lib/data';
import { LiveFavicon } from '@/components/live-favicon';
import { getCurrentUser } from '@/lib/auth';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    default: 'Radar — By Scognamiglio 2026',
    template: '%s — Radar',
  },
  description: 'Social listening and media intelligence',
};

// Tutte le pagine leggono dal database a ogni richiesta: niente prerender statico.
export const dynamic = 'force-dynamic';

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [projects, current, lastIngest, user] = await Promise.all([
    getProjects(), getCurrentProject(), getLastIngestAt(), getCurrentUser(),
  ]);
  const alertCount = current ? await getRecentAlertCount(current.id) : 0;
  const pulse = current ? await getPulse(current.id) : { mentions24h: 0, sentiment: null };
  const stale = !lastIngest || Date.now() - lastIngest.getTime() > 2 * 3600_000;

  const demo = process.env.DEMO_MODE === '1';

  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {demo && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-sky-500/15 px-4 py-2 text-center text-xs text-sky-200">
            <span>🛰️ <strong>Live demo</strong> — read-only, sample data. Interactive AI features run when you self-host with your own key.</span>
            <a href="https://github.com/Scognamiglio1969/radar-intelligence" target="_blank" rel="noopener noreferrer"
              className="rounded-full bg-sky-500/90 px-3 py-0.5 font-semibold text-slate-950 transition hover:bg-sky-400">
              ⭐ GitHub
            </a>
          </div>
        )}
        <div className="flex min-h-screen flex-col lg:flex-row">
          <Sidebar
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            currentId={current?.id ?? null}
            lastIngest={lastIngest?.toISOString() ?? null}
            alertCount={alertCount}
            user={user ? { name: user.name, role: user.role } : null}
          />
          <div className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-10 lg:py-6">
            <div className="mx-auto max-w-[1250px]">
              <ExportBar />
              <main>{children}</main>
            </div>
          </div>
        </div>
        <AutoRefresh stale={stale} />
        <LiveFavicon sentiment={pulse.sentiment} mentions24h={pulse.mentions24h} alerts={alertCount} />
      </body>
    </html>
  );
}
