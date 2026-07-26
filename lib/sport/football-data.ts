import { fetchJson } from '@/lib/connectors/util';
import { cfg } from '@/lib/connector-config';

// football-data.org v4: calendario e risultati di una squadra. Verificato dal
// vivo che l'indice delle competizioni funziona senza chiave, ma OGNI
// endpoint con dati veri (squadre, partite, classifiche) risponde 403 —
// serve una chiave gratuita, non registrabile in autonomia in questo
// ambiente. Questo file è scritto sulla documentazione ufficiale (stabile
// da anni, header di autenticazione ed errori coerenti con quanto già
// osservato dal vivo sull'endpoint pubblico) ma NON verificato end-to-end:
// stesso principio già applicato a Google Places e Discord.
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

type FdMatch = {
  id: number; utcDate: string; status: string;
  competition: { code: string };
  homeTeam: { name: string }; awayTeam: { name: string };
  score: { fullTime: { home: number | null; away: number | null } };
};

export function footballDataEnabled(): boolean {
  return Boolean(cfg('FOOTBALL_DATA_API_KEY'));
}

/** Partite recenti e prossime di una squadra (competizioni miste, come le gioca davvero). */
export async function fetchTeamMatches(teamId: string, limit = 20): Promise<SportMatch[]> {
  const key = cfg('FOOTBALL_DATA_API_KEY');
  if (!key) return [];
  const data = await fetchJson<{ matches?: FdMatch[] }>(
    `https://api.football-data.org/v4/teams/${encodeURIComponent(teamId)}/matches?limit=${limit}`,
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
