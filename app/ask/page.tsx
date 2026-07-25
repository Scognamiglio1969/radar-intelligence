import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ContentLocaleSwitch } from '@/components/content-locale-switch';
import { getContentLocale } from '@/lib/content-locale';
import { getCurrentProject } from '@/lib/data';
import { claudeAvailable } from '@/lib/claude';
import { isDemoMode } from '@/lib/session';
import { AskChat } from '@/components/ask-chat';

export const metadata = { title: 'Ask the data' };

export default async function AskPage() {
  const contentLocale = await getContentLocale();
  const t = await getT();
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={t('ui.noProject', 'No project configured.')} />;
  const aiOn = await claudeAvailable();

  return (
    <>
      <PageHeader
        title={t('page.ask.title', 'Ask the data')}
        subtitle={`Ask questions in plain language about the data for “${project.name}”: the AI analyst answers with numbers and evidence`}
      />
      <div className="mb-4 flex justify-end"><ContentLocaleSwitch current={contentLocale} /></div>
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
