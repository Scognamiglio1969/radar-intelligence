import { PageHeader, EmptyState } from '@/components/ui';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { isDemoMode } from '@/lib/session';
import { AskChat } from '@/components/ask-chat';

export const metadata = { title: 'Ask the data' };

export default async function AskPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const aiOn = await claudeAvailable();

  return (
    <>
      <PageHeader
        title="Ask the data"
        subtitle={`Ask questions in plain language about the data for “${project.name}”: the AI analyst answers with numbers and evidence`}
      />
      {aiOn && !isDemoMode()
        ? <AskChat suggestions={[
            'What was the most discussed topic in the last 3 days?',
            'Is sentiment improving or worsening? Why?',
            'What is said differently in English vs other languages?',
            'Which sources are growing the most this week?',
          ]} />
        : <EmptyState message={isDemoMode()
            ? '✨ The conversational analyst is a live AI feature — self-host with your own Anthropic key to try it.'
            : 'You need the Claude API key to use the analyst.'} />}
    </>
  );
}
