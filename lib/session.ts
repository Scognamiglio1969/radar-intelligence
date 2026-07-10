import { createHmac, timingSafeEqual } from 'node:crypto';

// Cookie di sessione firmato: "<userId>.<hmac>". Nessun accesso al DB qui,
// così può girare anche dentro il proxy (verifica solo la firma).

export const SESSION_COOKIE = 'sr_session';

function secret(): string {
  return process.env.SESSION_SECRET || process.env.APP_PASSWORD || 'sr-dev-secret-change-me';
}

function sign(userId: number): string {
  return createHmac('sha256', secret()).update(String(userId)).digest('hex');
}

export function signSession(userId: number): string {
  return `${userId}.${sign(userId)}`;
}

export function verifySession(cookieValue: string | undefined): number | null {
  if (!cookieValue) return null;
  const [idPart, sig] = cookieValue.split('.');
  const id = Number(idPart);
  if (!id || !sig) return null;
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}
