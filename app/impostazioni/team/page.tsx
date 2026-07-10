import { redirect } from 'next/navigation';
import { desc, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users, projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { TeamManager } from '@/components/team-manager';

export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const me = await getCurrentUser();
  if (!isAdmin(me)) redirect('/impostazioni/account');
  const db = await getDb();

  const rows = await db.select({
    id: users.id, name: users.name, email: users.email, role: users.role,
    aiEnabled: users.aiEnabled, mustChangePassword: users.mustChangePassword,
  }).from(users).orderBy(desc(sql`${users.role} = 'admin'`), users.name);

  // Conteggio progetti per proprietario (query separata: la subquery correlata è ambigua)
  const counts = await db.select({ ownerId: projects.ownerId, n: sql<number>`count(*)` })
    .from(projects).groupBy(projects.ownerId);
  const countByOwner = new Map(counts.map((c) => [c.ownerId, Number(c.n)]));

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Gestisci gli accessi. I membri con AI «in attesa» raccolgono dati ma non consumano API finché non li attivi (serve budget)."
      />
      <TeamManager users={rows.map((r) => ({ ...r, projectCount: countByOwner.get(r.id) ?? 0 }))} />
    </>
  );
}
