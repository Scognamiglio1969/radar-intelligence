import { getCurrentUser, isAdmin } from '@/lib/auth';
import { SettingsTabs } from '@/components/settings-tabs';
import type { Metadata } from 'next';
import { getT } from '@/lib/i18n';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('nav.account', 'Settings') };
}

export default async function ImpostazioniLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <div>
      <SettingsTabs isAdmin={isAdmin(user)} />
      {children}
    </div>
  );
}
