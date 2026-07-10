import { getCurrentUser } from '@/lib/auth';
import { PageHeader, EmptyState } from '@/components/ui';
import { ChangePasswordForm } from '@/components/change-password-form';

export const metadata = { title: 'Il mio account' };

export default async function AccountPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) return <EmptyState message="Sessione scaduta, rientra." />;
  const first = (await searchParams).first === '1';

  return (
    <>
      <PageHeader title="Il mio account" />
      <div className="max-w-md">
        <div className="panel mb-4 px-5 py-4 text-sm">
          <p><span className="text-slate-500">Nome:</span> {user.name}</p>
          <p className="mt-1"><span className="text-slate-500">Email:</span> {user.email}</p>
          <p className="mt-1">
            <span className="text-slate-500">Ruolo:</span>{' '}
            {user.role === 'admin' ? 'Amministratore' : 'Membro'}
            {user.role !== 'admin' && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] ${user.aiEnabled ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-500/15 text-slate-400'}`}>
                AI {user.aiEnabled ? 'attiva' : 'in attesa di attivazione'}
              </span>
            )}
          </p>
        </div>

        {(first || user.mustChangePassword === 1) && (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300">
            Stai usando una password temporanea: impostane una tua per continuare in sicurezza.
          </p>
        )}

        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Cambia password</h2>
          <ChangePasswordForm />
        </section>
      </div>
    </>
  );
}
