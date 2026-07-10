'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { hashPassword, verifyPasswordHash } from '@/lib/password';

export async function changePassword(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: 'sessione scaduta' };

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!verifyPasswordHash(current, user.passwordHash)) {
    return { error: 'La password attuale non è corretta.' };
  }
  if (next.length < 8) return { error: 'La nuova password deve avere almeno 8 caratteri.' };
  if (next !== confirm) return { error: 'Le due password non coincidono.' };

  const db = await getDb();
  await db.update(users)
    .set({ passwordHash: hashPassword(next), mustChangePassword: 0 })
    .where(eq(users.id, user.id));
  return { ok: true };
}
