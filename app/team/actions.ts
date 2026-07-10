'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { hashPassword } from '@/lib/password';

async function requireAdmin() {
  const user = await getCurrentUser();
  return isAdmin(user) ? user : null;
}

function tempPassword(): string {
  // Password temporanea leggibile: 3 blocchi (es. "k7mq-2xvp-9htr")
  return randomBytes(9).toString('base64url').replace(/[_-]/g, '').slice(0, 12)
    .replace(/(.{4})(.{4})(.{4})/, '$1-$2-$3');
}

export type TeamActionState = { ok?: boolean; error?: string; tempPassword?: string; email?: string };

export async function addUser(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  if (!(await requireAdmin())) return { error: 'not authorized' };
  const name = String(formData.get('name') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  if (!name || !/^[^@]+@[^@]+\.[^@]+$/.test(email)) return { error: 'Invalid name or email.' };

  const db = await getDb();
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) return { error: 'A user with this email already exists.' };

  const pw = tempPassword();
  await db.insert(users).values({
    name, email, role: 'member', aiEnabled: 0, mustChangePassword: 1,
    passwordHash: hashPassword(pw),
  });
  revalidatePath('/team');
  return { ok: true, tempPassword: pw, email };
}

export async function resetPassword(_prev: TeamActionState, formData: FormData): Promise<TeamActionState> {
  if (!(await requireAdmin())) return { error: 'not authorized' };
  const id = Number(formData.get('id'));
  if (!id) return { error: 'invalid user' };
  const db = await getDb();
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return { error: 'user not found' };
  const pw = tempPassword();
  await db.update(users).set({ passwordHash: hashPassword(pw), mustChangePassword: 1 }).where(eq(users.id, id));
  revalidatePath('/team');
  return { ok: true, tempPassword: pw, email: u.email };
}

export async function toggleAi(formData: FormData) {
  if (!(await requireAdmin())) return;
  const id = Number(formData.get('id'));
  const enable = formData.get('enable') === '1';
  if (!id) return;
  const db = await getDb();
  await db.update(users).set({ aiEnabled: enable ? 1 : 0 }).where(eq(users.id, id));
  revalidatePath('/team');
}

export async function deleteUser(formData: FormData) {
  const admin = await requireAdmin();
  if (!admin) return;
  const id = Number(formData.get('id'));
  if (!id || id === admin.id) return; // non elimina se stesso
  const db = await getDb();
  const [u] = await db.select({ role: users.role }).from(users).where(eq(users.id, id));
  if (u?.role === 'admin') return; // mai eliminare un admin
  await db.delete(users).where(eq(users.id, id));
  revalidatePath('/team');
}
