// Cache in memoria delle credenziali dei connettori (nome-variabile -> valore).
// Viene idratata lato server prima di usare i connettori (vedi
// hydrateConnectorCredentials in connector-credentials.ts) e letta in modo
// SINCRONO dentro enabled()/fetchMentions().
//
// Questo file NON importa nulla di server-only (niente DB, niente node:crypto):
// così i connettori restano importabili anche dai componenti client che usano
// SOURCE_META, senza trascinare il database nel bundle del browser.

let cache: Record<string, string> = {};

export function setConnectorConfig(store: Record<string, string>) {
  cache = store;
}

/**
 * Valore di una credenziale: prima quella inserita dall'utente (salvata nel
 * DB e idratata in cache), poi la variabile d'ambiente come fallback (le chiavi
 * "embeddate" lato server continuano quindi a funzionare). Stringa vuota = assente.
 */
export function cfg(env: string): string | undefined {
  const fromCache = cache[env];
  if (fromCache && fromCache.trim()) return fromCache;
  const fromEnv = typeof process !== 'undefined' ? process.env[env] : undefined;
  return fromEnv && fromEnv.trim() ? fromEnv : undefined;
}
