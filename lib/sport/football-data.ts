import { fetchJson } from '@/lib/connectors/util';
import { cfg } from '@/lib/connector-config';

// football-data.org v4: calendario e risultati di una squadra. Verificato dal
// vivo (con una chiave reale) — non solo dalla documentazione:
//
// - Il nome nei tabellini NON è quello mostrato altrove: Juventus compare
//   come "Juventus FC" (il nome legale, campo `name`), non "Juventus" (quello
//   è `shortName`). Chiedere all'utente di scrivere il nome a mano avrebbe
//   rotto in silenzio il confronto casa/trasferta — e quindi vittoria/
//   sconfitta — ogni volta che il nome digitato non coincideva esattamente.
//   Per questo il nome non si digita più: si cerca (searchTeams) e si usa
//   il campo `name` restituito dall'API, mai un valore scritto a mano.
// - Senza un intervallo di date esplicito, l'endpoint delle partite
//   restituisce ben poco in bassa stagione (verificato: 0 partite finite per
//   una richiesta senza dateFrom/dateTo, 25 con un intervallo di 9 mesi) — il
//   filtro di default evidentemente guarda una finestra stretta attorno ad
//   "oggi", non l'intera stagione. Si passa sempre un intervallo esplicito.
//
// Limite dichiarato del piano gratuito: 10 richieste/minuto.

export type SportMatch = {
  externalId: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string;
  utcDate: Date;
};
export type TeamHit = { id: string; name: string; shortName: string; crest: string | null };

type FdMatch = {
  id: number; utcDate: string; status: string;
  competition: { code: string };
  homeTeam: { name: string }; awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
};
type FdTeam = { id: number; name: string; shortName?: string; tla?: string; crest?: string | null };

export function footballDataEnabled(): boolean {
  return Boolean(cfg('FOOTBALL_DATA_API_KEY'));
}

function ymd(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'UTC' });
}

/** Squadre di una competizione il cui nome contiene il termine cercato. */
export async function searchTeams(competition: string, query: string): Promise<TeamHit[]> {
  const key = cfg('FOOTBALL_DATA_API_KEY');
  if (!key || query.trim().length < 2) return [];
  const data = await fetchJson<{ teams?: FdTeam[] }>(
    `https://api.football-data.org/v4/competitions/${encodeURIComponent(competition)}/teams`,
    { headers: { 'X-Auth-Token': key } },
  );
  const q = query.trim().toLowerCase();
  return (data.teams ?? [])
    .filter((t) => t.name.toLowerCase().includes(q) || (t.shortName ?? '').toLowerCase().includes(q) || (t.tla ?? '').toLowerCase() === q)
    .slice(0, 8)
    .map((t) => ({ id: String(t.id), name: t.name, shortName: t.shortName ?? t.name, crest: t.crest ?? null }));
}

/** Partite recenti e prossime di una squadra (competizioni miste, come le gioca davvero). */
export async function fetchTeamMatches(teamId: string, limit = 40): Promise<SportMatch[]> {
  const key = cfg('FOOTBALL_DATA_API_KEY');
  if (!key) return [];
  const now = Date.now();
  const params = new URLSearchParams({
    dateFrom: ymd(new Date(now - 200 * 86400_000)),
    dateTo: ymd(new Date(now + 60 * 86400_000)),
    limit: String(limit),
  });
  const data = await fetchJson<{ matches?: FdMatch[] }>(
    `https://api.football-data.org/v4/teams/${encodeURIComponent(teamId)}/matches?${params}`,
    { headers: { 'X-Auth-Token': key } },
  );
  return (data.matches ?? []).map((m) => ({
    externalId: String(m.id),
    competition: m.competition.code,
    homeTeam: m.homeTeam.name,
    awayTeam: m.awayTeam.name,
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    status: m.status,
    utcDate: new Date(m.utcDate),
  }));
}
