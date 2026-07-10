import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Hashing password con scrypt (nessuna dipendenza esterna).
// Formato memorizzato: "<saltHex>:<hashHex>".

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPasswordHash(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const hash = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(password, Buffer.from(saltHex, 'hex'), 64);
  return hash.length === candidate.length && timingSafeEqual(hash, candidate);
}
