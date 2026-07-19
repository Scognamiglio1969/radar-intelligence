import { getCurrentProject } from '@/lib/data';
import { topicSentimentMap } from '@/lib/insights';
import { PageHeader, EmptyState } from '@/components/ui';
import { TopicSentimentBubble } from '@/components/insight-charts';

export const metadata = { title: 'Topics × Sentiment' };

export default async function TopicsInsightPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const data = await topicSentimentMap(project.id, 14);

  return (
    <>
      <PageHeader
        title="Topics × Sentiment map"
        info="Each bubble is a topic, placed by its sentiment (left–right) and relative weight (up–down); bubble size = volume. Data: the AI topic and sentiment tags on your mentions. Period: last 14 days. Source: your collected mentions across all active sources."
        subtitle="Each bubble is a topic: horizontal = sentiment, vertical = how much it is gaining or losing weight in the conversation, size = volume. Topics gaining importance are at the top, declining ones at the bottom."
      />
      {data.length < 3 ? (
        <EmptyState message="More AI-analyzed topics are needed to build the map." />
      ) : (
        <section className="panel px-4 py-5">
          <TopicSentimentBubble data={data} />
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-emerald-400/70" /> positive</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-slate-400/70" /> neutral</span>
            <span className="flex items-center gap-1"><span className="size-2.5 rounded-full bg-red-400/70" /> negative</span>
            <span className="ml-auto">Relative weight: share of conversation in the second half vs the first half of the analyzed period.</span>
          </div>
        </section>
      )}
    </>
  );
}
