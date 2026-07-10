import { getCurrentProject, dashboardData } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { getNarratives } from '@/lib/narratives';
import { getRecentAlerts } from '@/lib/alerts';
import { EmptyState } from '@/components/ui';
import { TvShow } from '@/components/tv-show';

export const metadata = { title: 'War Room' };

export default async function TvPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;

  const [data, trends, narratives, alerts] = await Promise.all([
    dashboardData(project.id),
    getTrends(project.id),
    getNarratives(project.id),
    getRecentAlerts(project.id, 4),
  ]);

  return (
    <TvShow
      projectName={project.name}
      kpi={data.kpi}
      volumeByDay={data.volumeByDay.map((r) => ({ ...r, n: Number(r.n) }))}
      sentimentDist={data.sentimentDist}
      topTopics={data.topTopics.map((t) => ({ topic: t.topic, n: Number(t.n) }))}
      trends={trends.map((t) => ({
        topic: t.topic, score: t.score, n24: t.n24, explanation: t.explanation,
      }))}
      narratives={narratives.slice(0, 4).map((n) => ({
        title: n.title, stance: n.stance, coordinated: n.coordinated === 1, count: n.mentionCount,
      }))}
      alerts={alerts.map((a) => ({ message: a.message, severity: a.severity }))}
      latest={data.latest.slice(0, 5).map((m) => ({
        source: m.source, title: m.title, content: m.content,
        community: m.community, sentiment: m.sentiment,
      }))}
    />
  );
}
