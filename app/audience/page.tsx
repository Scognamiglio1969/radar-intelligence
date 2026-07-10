import { audienceData, getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState, SourceBadge } from '@/components/ui';
import { HBars } from '@/components/charts';
import { InfluencerButton } from '@/components/influencer-button';
import { claudeAvailable } from '@/lib/claude';

export const metadata = { title: 'Audience' };

export default async function AudiencePage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Nessun progetto configurato." />;
  const data = await audienceData(project.id);

  return (
    <>
      <PageHeader
        title="Audience Insights"
        subtitle="Chi discute del tema: community, lingue e voci più influenti (ultimi 14 giorni)"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Community più attive</h2>
          {data.communities.length ? (
            <div className="flex flex-col gap-2.5">
              {data.communities.map((c) => (
                <div key={`${c.source}:${c.community}`} className="flex items-center gap-2 text-sm">
                  <SourceBadge source={c.source} />
                  <span className="truncate">{c.community}</span>
                  <span className="ml-auto shrink-0 text-xs text-slate-500">{c.n} mention</span>
                  {c.avgSentiment !== null && (
                    <span className={`shrink-0 text-xs ${c.avgSentiment > 0.15 ? 'text-emerald-400' : c.avgSentiment < -0.15 ? 'text-red-400' : 'text-slate-500'}`}>
                      {c.avgSentiment.toFixed(2)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Nessun dato.</p>}
        </section>

        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Lingue delle conversazioni</h2>
          {data.languages.length
            ? <HBars items={data.languages.map((l) => ({ label: l.language.toUpperCase(), value: l.n }))} color="#a78bfa" />
            : <p className="text-sm text-slate-500">In attesa dell&apos;analisi AI.</p>}
        </section>

        <section className="panel px-5 py-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Autori più influenti</h2>
          <p className="mb-3 text-xs text-slate-600">
            Clicca la lente per il profilo AI con bozza di contatto personalizzata.
          </p>
          {data.authors.length ? (
            <div className="flex flex-col gap-2.5">
              {data.authors.map((a) => (
                <div key={`${a.source}:${a.authorHandle ?? a.author}`} className="flex flex-wrap items-center gap-2 text-sm">
                  <SourceBadge source={a.source} />
                  <span className="truncate">{a.author}</span>
                  {a.authorHandle && a.authorHandle !== a.author && (
                    <span className="truncate text-xs text-slate-500">{a.authorHandle}</span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-slate-500">
                    {a.n} post · engagement {Math.round(a.engagement).toLocaleString('it-IT')}
                  </span>
                  {claudeAvailable() && (
                    <InfluencerButton author={a.authorHandle ?? a.author ?? ''} source={a.source} />
                  )}
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Nessun dato.</p>}
        </section>

        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Temi per community</h2>
          {data.topicsByCommunity.length ? (
            <div className="flex flex-col gap-1.5 text-sm">
              {data.topicsByCommunity.slice(0, 15).map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="truncate text-slate-400">{t.community}</span>
                  <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-xs text-sky-300">{t.topic}</span>
                  <span className="ml-auto text-xs text-slate-600">{Number(t.n)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">In attesa dell&apos;analisi AI.</p>}
        </section>
      </div>
    </>
  );
}
