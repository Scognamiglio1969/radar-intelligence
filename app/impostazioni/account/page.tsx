import { getCurrentUser } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import { ChangePasswordForm } from '@/components/change-password-form';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('page.account.title', 'My account') };
}

export default async function AccountPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return <EmptyState message={t('account.sessionExpired', 'Session expired, please sign in again.')} />;
  const first = (await searchParams).first === '1';

  return (
    <>
      <PageHeader title={t('page.account.title', 'My account')} />
      <div className="max-w-md">
        <div className="panel mb-4 px-5 py-4 text-sm">
          <p><span className="text-slate-500">{t('account.name', 'Name')}:</span> {user.name}</p>
          <p className="mt-1"><span className="text-slate-500">Email:</span> {user.email}</p>
          <p className="mt-1">
            <span className="text-slate-500">{t('account.role', 'Role')}:</span>{' '}
            {user.role === 'admin' ? t('account.admin', 'Administrator') : t('account.member', 'Member')}
            {user.role !== 'admin' && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${user.aiEnabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>
                AI {user.aiEnabled ? t('account.aiActive', 'active') : t('account.aiPending', 'pending activation')}
              </span>
            )}
          </p>
        </div>

        {(first || user.mustChangePassword === 1) && (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
            {t('account.temporaryPassword', 'You are using a temporary password. Set your own password to continue securely.')}
          </p>
        )}

        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">{t('account.changePassword', 'Change password')}</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
