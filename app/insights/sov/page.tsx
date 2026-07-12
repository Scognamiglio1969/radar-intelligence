import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { sovOverTime } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { ShareOfVoiceStream } from '@/components/insight-charts';

export const metadata = { title: 'Share of Voice' };

export default async function SovInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const { entities, days } = await sovOverTime(project.id, 30);
  const hasData = entities.length > 0 && days.some((d) => entities.some((e) => Number(d[e]) > 0));

  return (
    <>
      <PageHeader
        title="Share of Voice over time"
        subtitle="How the conversation splits between the entities you track, day by day (last 30 days). The flowing bands show who owns the discussion and how that balance shifts — the signature competitive view."
      />
      {entities.length === 0 ? (
        <EmptyState message="Add benchmark entities (brands/competitors) in Settings to see share of voice." />
      ) : !hasData ? (
        <EmptyState message="No mentions matched your entities in the last 30 days." />
      ) : (
        <section className="panel px-4 py-5">
          <ShareOfVoiceStream entities={entities} days={days} />
          <p className="mt-3 text-xs text-slate-500">
            Band thickness = mentions citing that entity. Manage entities in{' '}
            <Link href="/settings" className="text-sky-400 hover:underline">Settings</Link>.
          </p>
        </section>
      )}
    </>
  );
}
