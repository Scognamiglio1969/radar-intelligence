import { getCurrentUser, isAdmin } from '@/lib/auth';
import { SettingsTabs } from '@/components/settings-tabs';

export const metadata = { title: 'Impostazioni' };

export default async function ImpostazioniLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div>
      <SettingsTabs isAdmin={isAdmin(user)} />
      {children}
    </div>
  );
}
