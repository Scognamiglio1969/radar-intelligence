import { cookies } from 'next/headers';
import { getCurrentProject, mediaData } from '@/lib/data';
import { PageHeader, MentionCard, EmptyState, fmtDate } from '@/components/ui';
import { HBars } from '@/components/charts';
import { ExternalLink } from 'lucide-react';
import { TranslateBar } from '@/components/translate-bar';
import { translateMentions, TRANSLATE_LANGS, type Translated } from '@/lib/translate';

export const metadata = { title: 'Media' };

export default async function MediaPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const data = await mediaData(project.id);

  const readLang = (await cookies()).get('sr_translate')?.value ?? null;
  const translations: Map<number, Translated> = readLang
    ? await translateMentions(data.news, readLang)
    : new Map();

  return (
    <>
      <PageHeader title="Media Monitoring" subtitle="News and press from the last 7 days, grouped by story" />
      <div className="mb-4 flex items-center gap-2 text-xs">
        <TranslateBar current={readLang} langs={TRANSLATE_LANGS} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {data.stories.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-slate-300">Top stories</h2>
              <div className="flex flex-col gap-3">
                {data.stories.map((story) => {
                  const items = data.storyMentions.filter((m) => m.storyId === story.id);
                  return (
                    <article key={story.id} className="panel px-5 py-4">
                      <h3 className="text-sm font-bold">{story.title}</h3>
                      {story.summary && <p className="mt-1 text-sm text-slate-400">{story.summary}</p>}
                      <ul className="mt-2 flex flex-col gap-1">
                        {items.slice(0, 6).map((m) => (
                          <li key={m.id} className="flex items-center gap-2 text-xs text-slate-400">
                            <span className="shrink-0 text-slate-600">{fmtDate(m.publishedAt)}</span>
                            <span className="truncate">{m.community}</span>
                            {m.url ? (
                              <a href={m.url} target="_blank" rel="noopener noreferrer"
                                className="flex min-w-0 items-center gap-1 truncate text-sky-400 hover:text-sky-300">
                                <span className="truncate">{m.title}</span>
                                <ExternalLink className="size-3 shrink-0" />
                              </a>
                            ) : <span className="truncate">{m.title}</span>}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-[11px] text-slate-600">{items.length} articles</p>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-2 text-sm font-semibold text-slate-300">All news</h2>
            <div className="flex flex-col gap-2">
              {data.news.length
                ? data.news.map((m) => <MentionCard key={m.id} m={m} translated={translations.get(m.id)} />)
                : <EmptyState message="No news collected in the last 7 days." />}
            </div>
          </section>
        </div>

        <aside>
          <section className="panel sticky top-6 px-5 py-4">
            <h2 className="mb-3 text-sm font-semibold text-slate-300">Most active outlets</h2>
            {data.topOutlets.length
              ? <HBars items={data.topOutlets.map((o) => ({ label: o.community ?? '?', value: Number(o.n) }))} color="#f59e0b" />
              : <p className="text-sm text-slate-500">No data.</p>}
          </section>
        </aside>
      </div>
    </>
  );
}
