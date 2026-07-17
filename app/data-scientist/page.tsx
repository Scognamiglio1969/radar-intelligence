import Link from 'next/link';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { analystAvailable, ANALYST_PRESETS } from '@/lib/analyst';
import { PageHeader, EmptyState } from '@/components/ui';
import { DataScientist } from '@/components/data-scientist';
import { Lock } from 'lucide-react';

export const metadata = { title: 'Data Scientist' };

export default async function DataScientistPage() {
  const [project, user] = await Promise.all([getCurrentProject(), getCurrentUser()]);
  if (!project) return <EmptyState message="No project configured." />;
  const gate = await analystAvailable();
  const admin = isAdmin(user);

  return (
    <>
      <PageHeader
        title="Data Scientist"
        subtitle="A senior analyst that queries your data, computes the evidence and delivers a source-cited report — every number traces to a real query, nothing is invented. Ask a question or run a deep analysis, tailored to your audience."
      />
      {!admin ? (
        <EmptyState message="The Data Scientist is available to admins." />
      ) : !gate.ok ? (
        <section className="panel px-5 py-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-amber-300"><Lock className="size-4" /> Requires an analyst-grade model</p>
          <p className="mt-2 max-w-xl text-sm text-slate-400">{gate.reason}</p>
          <p className="mt-3 max-w-xl text-xs text-slate-500">
            The Data Scientist runs multi-step analysis and must reason precisely over your data, so it only unlocks on a top model:
            <span className="text-slate-300"> Claude Opus 4.8+ or Fable 5+</span>, or a top OpenAI/Grok model. Set it in{' '}
            <Link href="/impostazioni/budget" className="text-sky-400 hover:underline">Settings → Budget</Link>.
          </p>
        </section>
      ) : (
        <DataScientist presets={ANALYST_PRESETS} />
      )}
    </>
  );
}
