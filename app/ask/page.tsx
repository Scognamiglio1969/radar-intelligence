import { PageHeader, EmptyState } from '@/components/ui';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { AskChat } from '@/components/ask-chat';

export const metadata = { title: 'Ask the data' };

export default async function AskPage() {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;

  return (
    <>
      <PageHeader
        title="Ask the data"
        subtitle={`Ask questions in plain language about the data for “${project.name}”: the AI analyst answers with numbers and evidence`}
      />
      {claudeAvailable()
        ? <AskChat suggestions={[
            'What was the most discussed topic in the last 3 days?',
            'Is sentiment improving or worsening? Why?',
            'What is said differently in English vs other languages?',
            'Which sources are growing the most this week?',
          ]} />
        : <EmptyState message="You need the Claude API key to use the analyst." />}
    </>
  );
}
