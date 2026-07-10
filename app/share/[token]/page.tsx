import { and, eq, gte } from 'drizzle-orm';
import { marked } from 'marked';
import { getDb } from '@/lib/db';
import { projects, shareLinks } from '@/lib/db/schema';
import { dashboardData } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { Brand } from '@/components/brand';
import { KpiCard, MentionCard, fmtNum } from '@/components/ui';
import { VolumeChart, SentimentPie } from '@/components/charts';

export const dynamic = 'force-dynamic';

// Report read-only: accessibile SOLO col token, senza login, nessuna azione.
export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();

  const [link] = await db.select().from(shareLinks)
    .where(and(eq(shareLinks.token, token), gte(shareLinks.expiresAt, new Date())));

  if (!link) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#060a16] px-6 text-center">
        <Brand size="lg" />
        <p className="text-slate-400">Questo link di condivisione non esiste più o è scaduto.</p>
      </div>
    );
  }

  const [project] = await db.select().from(projects).where(eq(projects.id, link.projectId));
  const [data, trends] = await Promise.all([dashboardData(project.id), getTrends(project.id)]);
  const sentimentLabel = data.kpi.avgSentiment === null ? '—'
    : data.kpi.avgSentiment > 0.15 ? 'positivo' : data.kpi.avgSentiment < -0.15 ? 'negativo' : 'neutro';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#060a16]">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <header className="mb-6 flex flex-wrap items-center gap-4">
          <Brand />
          <div className="ml-auto text-right">
            <p className="text-sm font-semibold">{project.name}</p>
            <p className="text-[11px] text-slate-500">
              Report condiviso · scade il {link.expiresAt.toLocaleDateString('it-IT')}
            </p>
          </div>
        </header>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Mention (7 giorni)" value={fmtNum(data.kpi.total7)} />
          <KpiCard label="Sentiment" value={sentimentLabel}
            hint={data.kpi.avgSentiment !== null ? `score ${data.kpi.avgSentiment.toFixed(2)}` : undefined} />
          <KpiCard label="Fonti attive" value={String(data.kpi.sources)} />
          <KpiCard label="Temi rilevati" value={String(data.topTopics.length)} />
        </div>

        {trends.length > 0 && (
          <section className="panel mt-4 border-orange-500/30 px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-orange-300">🔥 Trend emergenti</h2>
            <div className="flex flex-col gap-1.5">
              {trends.slice(0, 5).map((t) => (
                <p key={t.id} className="text-sm">
                  <span className="mr-2 font-bold text-orange-400">×{t.score.toFixed(0)}</span>
                  <span className="font-semibold">{t.topic}</span>
                  {t.explanation && <span className="text-slate-400"> — {t.explanation}</span>}
                </p>
              ))}
            </div>
          </section>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <section className="panel px-5 py-4 lg:col-span-2">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Volume per fonte (14 giorni)</h2>
            <VolumeChart data={data.volumeByDay.map((r) => ({ ...r, n: Number(r.n) }))} />
          </section>
          <section className="panel px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Sentiment (7 giorni)</h2>
            {data.sentimentDist.length > 0 && <SentimentPie data={data.sentimentDist} />}
          </section>
        </div>

        {data.topTopics.length > 0 && (
          <section className="panel mt-4 px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Temi principali</h2>
            <div className="flex flex-wrap gap-2">
              {data.topTopics.map((t) => (
                <span key={t.topic} className="rounded-full bg-sky-500/10 px-3 py-1 text-xs text-sky-300">
                  {t.topic} <span className="text-sky-500/70">{fmtNum(Number(t.n))}</span>
                </span>
              ))}
            </div>
          </section>
        )}

        {data.latestBrief && (
          <section className="panel mt-4 px-6 py-5">
            <h2 className="mb-1 text-sm font-semibold text-slate-300">Brief del giorno</h2>
            <p className="mb-3 text-xs text-slate-500">
              {new Date(data.latestBrief.briefDate).toLocaleDateString('it-IT', { dateStyle: 'full' })}
            </p>
            <div className="brief-md text-sm text-slate-300"
              dangerouslySetInnerHTML={{ __html: marked.parse(data.latestBrief.content) as string }} />
          </section>
        )}

        <section className="mt-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Ultime mention</h2>
          <div className="flex flex-col gap-2">
            {data.latest.map((m) => <MentionCard key={m.id} m={m} />)}
          </div>
        </section>

        <footer className="mt-8 border-t border-[var(--border)] pt-4 text-center text-[11px] text-slate-600">
          Generato da Radar · By Scognamiglio 2026 — report di sola lettura
        </footer>
      </div>
    </div>
  );
}
