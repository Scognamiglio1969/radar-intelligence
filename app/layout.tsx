import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/sidebar';
import { AutoRefresh } from '@/components/auto-refresh';
import { ExportBar } from '@/components/export-bar';
import { getCurrentProject, getLastIngestAt, getProjects, getRecentAlertCount } from '@/lib/data';
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
  const stale = !lastIngest || Date.now() - lastIngest.getTime() > 2 * 3600_000;

  return (
    <html lang="it" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
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
      </body>
    </html>
  );
}
