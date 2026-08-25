'use server';

import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getCurrentUser } from '@/lib/auth';
import { hashPassword, verifyPasswordHash } from '@/lib/password';
import { getT } from '@/lib/i18n';

export async function changePassword(_prev: unknown, formData: FormData): Promise<{ ok?: boolean; error?: string }> {
  const t = await getT();
  const user = await getCurrentUser();
  if (!user) return { error: t('account.sessionExpired', 'Session expired, please sign in again.') };

  const current = String(formData.get('current') ?? '').trim();
  const next = String(formData.get('next') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!verifyPasswordHash(current, user.passwordHash)) {
    return { error: t('account.passwordIncorrect', 'The current password is incorrect.') };
  }
  if (next.length < 8) return { error: t('account.passwordTooShort', 'The new password must be at least 8 characters.') };
  if (next !== confirm) return { error: t('account.passwordMismatch', 'The two passwords do not match.') };

  const db = await getDb();
  await db.update(users)
    .set({ passwordHash: hashPassword(next), mustChangePassword: 0 })
    .where(eq(users.id, user.id));
  return { ok: true };
}
