import Link from 'next/link';
import { getCurrentProject } from '@/lib/data';
import { ownedVsEarned } from '@/lib/owned';
import { PageHeader, EmptyState, SourceBadge, fmtNum } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { Heatmap } from '@/components/insight-charts';
import { Settings } from 'lucide-react';

export const metadata = { title: 'Owned vs Earned' };

export default async function OwnedInsightPage() {
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No project configured.')} />;
  const data = await ownedVsEarned(project.id, 30);

  const totalVol = data.ownedVolume + data.earnedVolume;

  return (
    <>
      <PageHeader
        title={t('ins.owned.title', 'Owned vs Earned')}
        info="Owned = your own Facebook Page and LinkedIn company page, pulled with your own credentials via the official APIs. Everything else is earned: what other people say, wherever they say it — even a keyword search on the same platforms. Period: last 30 days. No AI involved."
        subtitle="Are your own posts working, or is all the conversation happening without you? Owned channels compared with everything said about you elsewhere."
      />

      {data.configured.length === 0 ? (
        <div className="panel flex flex-col items-center gap-3 px-6 py-14 text-center">
          <p className="max-w-md text-sm text-slate-400">
            {t('ins.owned.empty',
              'No owned channel is connected yet. Radar can only compare your posts with the conversation once it can read them.')}
          </p>
          <p className="max-w-md text-xs text-slate-600">
            Connect your Facebook Page or LinkedIn company page — both are official, free APIs, just your own credentials.
          </p>
          <Link href="/impostazioni/fonti"
            className="mt-2 flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400">
            <Settings className="size-4" /> {t('ins.owned.connect', 'Connect a channel')}
          </Link>
        </div>
      ) : totalVol === 0 ? (
        <EmptyState message={t('ins.owned.noData',
          'Connected, but nothing collected yet in the last 30 days — it will fill in with the next refresh.')} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="panel px-5 py-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('ins.owned.split', 'Volume: owned vs earned')}</h2>
              <SplitBar owned={data.ownedVolume} earned={data.earnedVolume}
                ownedLabel={`${fmtNum(data.ownedVolume)} owned`} earnedLabel={`${fmtNum(data.earnedVolume)} earned`} />
              <h2 className="mb-3 mt-6 text-sm font-semibold text-slate-300">{t('ins.owned.engagement', 'Engagement: owned vs earned')}</h2>
              <SplitBar owned={data.ownedEngagement} earned={data.earnedEngagement}
                ownedLabel={`${fmtNum(data.ownedEngagement)} owned`} earnedLabel={`${fmtNum(data.earnedEngagement)} earned`} />
              <p className="mt-4 text-[11px] leading-relaxed text-slate-600">
                {t('ins.owned.engagementNote',
                  'Engagement weighs likes ×1, comments ×2, shares ×3 — the same score used everywhere else in Radar, so this is comparable with every other view.')}
              </p>
            </section>

            <section className="panel px-5 py-5">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('ins.owned.bySource', 'Your channels')}</h2>
              <div className="flex flex-col gap-3">
                {data.bySource.map((s) => (
                  <div key={s.source} className="rounded-lg bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <SourceBadge source={s.source} />
                      {!data.configured.includes(s.source) && (
                        <span className="text-[10px] text-slate-600">not connected</span>
                      )}
                      <span className="ml-auto text-sm font-semibold text-slate-200">{fmtNum(s.volume)} posts</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {s.volume > 0
                        ? `${fmtNum(s.engagement)} total engagement · ~${fmtNum(s.avgEngagement)} per post`
                        : 'connected, nothing published in this window'}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {data.ownedVolume > 0 && (
            <section className="panel px-5 py-5">
              <h2 className="mb-1 text-sm font-semibold text-slate-300">{t('ins.owned.peaks', 'When your posts go out')}</h2>
              <p className="mb-3 text-xs text-slate-500">
                {t('ins.owned.peaksSub', 'Your own publishing rhythm — compare it with the Hourly heatmap to see if it matches when people are actually talking.')}
              </p>
              <Heatmap grid={data.heat} />
            </section>
          )}
        </div>
      )}
    </>
  );
}

function SplitBar({ owned, earned, ownedLabel, earnedLabel }: {
  owned: number; earned: number; ownedLabel: string; earnedLabel: string;
}) {
  const total = owned + earned || 1;
  const ownedPct = Math.round((owned / total) * 100);
  return (
    <div>
      <div className="flex h-8 overflow-hidden rounded-lg bg-white/5">
        {owned > 0 && <div className="flex items-center justify-center bg-sky-500/80 text-[11px] font-semibold text-slate-950" style={{ width: `${ownedPct}%` }}>{ownedPct >= 12 ? `${ownedPct}%` : ''}</div>}
        {earned > 0 && <div className="flex items-center justify-center bg-violet-500/50 text-[11px] font-semibold text-slate-100" style={{ width: `${100 - ownedPct}%` }}>{100 - ownedPct >= 12 ? `${100 - ownedPct}%` : ''}</div>}
      </div>
      <div className="mt-1.5 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-sky-300"><span className="size-2 rounded-full bg-sky-500" />{ownedLabel}</span>
        <span className="flex items-center gap-1.5 text-violet-300"><span className="size-2 rounded-full bg-violet-500/70" />{earnedLabel}</span>
      </div>
    </div>
  );
}
