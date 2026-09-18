'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserCog, Users, Database, Wallet, Scale } from 'lucide-react';
import { useI18n } from '@/components/i18n-provider';

const TABS = [
  { href: '/impostazioni/account', key: 'tabs.account', label: 'My account', icon: UserCog, adminOnly: false },
  { href: '/impostazioni/team', key: 'tabs.team', label: 'Team', icon: Users, adminOnly: true },
  { href: '/impostazioni/fonti', key: 'tabs.sources', label: 'Sources', icon: Database, adminOnly: false },
  { href: '/impostazioni/budget', key: 'tabs.budget', label: 'Budget', icon: Wallet, adminOnly: false },
  { href: '/impostazioni/credits', key: 'tabs.credits', label: 'Credits & Legal', icon: Scale, adminOnly: false },
] as const;

export function SettingsTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const { t } = useI18n();
  return (
    <div className="mb-5 flex flex-wrap gap-1 border-b border-[var(--border)]">
      {TABS.filter((tab) => !tab.adminOnly || isAdmin).map(({ href, key, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 rounded-t-lg border border-b-0 px-4 py-2 text-sm transition ${
              active
                ? 'border-[var(--border)] bg-[var(--panel)] font-medium text-sky-300'
                : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
            }`}
          >
            <Icon className="size-4" />
            {t(key, label)}
          </Link>
        );
      })}
    </div>
  );
}
