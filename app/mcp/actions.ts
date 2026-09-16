'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { saveConnectorCredentials } from '@/lib/connector-credentials';

/**
 * Genera un nuovo token per l'endpoint MCP e lo restituisce UNA volta.
 *
 * Salvato cifrato come le altre chiavi, e da quel momento prevale sulla
 * variabile d'ambiente: i client configurati con il token precedente
 * smettono di funzionare, e la pagina lo dice prima del clic.
 */
export async function generateMcpTokenAction(): Promise<{ token?: string; error?: string }> {
  if (!isAdmin(await getCurrentUser())) return { error: 'Solo un amministratore può generare il token.' };
  const token = `rdr_${randomBytes(32).toString('base64url')}`;
  await saveConnectorCredentials('mcp', { RADAR_MCP_TOKEN: token });
  revalidatePath('/mcp');
  return { token };
}
