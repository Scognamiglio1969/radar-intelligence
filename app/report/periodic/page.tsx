import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getCurrentProject } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { ReportTabs } from '@/components/report-tabs';
import { PeriodicReports } from '@/components/periodic-reports';

export const metadata = { title: 'Periodic report' };
export const dynamic = 'force-dynamic';

export default async function PeriodicReportPage() {
  if (!isAdmin(await getCurrentUser())) return <EmptyState message="Building reports is available to admins." />;
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="Select a project first." />;

  return (
    <>
      <PageHeader
        title="Periodic report"
        subtitle="The period’s figures, the brief and the thesis in one document — daily, weekly, fortnightly, monthly, quarterly, half-yearly or yearly."
        info="Short cadences REUSE the current Point of View rather than rewriting it: a thesis that holds for a week is realistic, and regenerating one per cadence per project would be the app's largest single cost. From monthly upwards a fresh thesis is written on that period's window. Either way the document always states where the thesis comes from — when it was written, on which window, on how many mentions, and whether it was reused. An issue is frozen once generated: the thesis is stored with it, so reopening a July issue in December still shows July's reading, not today's."
      />
      <ReportTabs />
      <PeriodicReports />
    </>
  );
}
