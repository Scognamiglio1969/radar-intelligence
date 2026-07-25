import { getCurrentProject, dashboardData } from '@/lib/data';
import { getTrends } from '@/lib/trends';
import { getNarratives } from '@/lib/narratives';
import { getRecentAlerts } from '@/lib/alerts';
import {
  emotionDistribution, geoDistribution, authorPyramid, hourlyHeatmap, brandHealth,
} from '@/lib/insights';
import { EmptyState } from '@/components/ui';
import { TvShow } from '@/components/tv-show';

export const metadata = { title: 'War Room' };

export default async function TvPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;

  // Tutte query SQL: la War Room si ricarica da sola ogni 5 minuti e non deve
  // mai costare una chiamata AI per restare accesa.
  const [data, trends, narratives, alerts, emotions, geo, pyramid, heat, health] = await Promise.all([
    dashboardData(project.id),
    getTrends(project.id),
    getNarratives(project.id),
    getRecentAlerts(project.id, 4),
    emotionDistribution(project.id),
    geoDistribution(project.id),
    authorPyramid(project.id),
    hourlyHeatmap(project.id),
    brandHealth(project.id),
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
      emotions={emotions.filter((e) => e.value > 0)}
      geo={geo.slice(0, 6).map((g) => ({
        country: g.country, flag: g.flag, volume: g.volume, sentiment: g.sentiment, share: g.share,
      }))}
      pyramid={pyramid.tiers.map((t) => ({
        key: t.key, label: t.label, authors: t.authors, sharePct: t.sharePct,
      }))}
      topConcentration={pyramid.topConcentration}
      heat={heat}
      health={{ score: health.score, grade: health.grade, spark: health.spark, components: health.components }}
    />
  );
}
