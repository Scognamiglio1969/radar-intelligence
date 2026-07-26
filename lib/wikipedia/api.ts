// Wikipedia: chi modifica la pagina di un brand/persona e quando. Nessun
// altro connettore di Radar copre questo segnale — non è una menzione da
// interpretare, è un fatto strutturale (chi ha toccato una pagina pubblica,
// con quale account, cancellando o aggiungendo cosa) che spesso anticipa una
// crisi reputazionale prima che se ne parli altrove: edit war, cancellazioni
// di sezioni scomode, comparsa improvvisa di account anonimi.
//
// API ufficiale MediaWiki (action=query), gratis, nessuna chiave. Verificato
// dal vivo sulla pagina reale "Anthropic": la risposta include già i tag utili
// (mw-undo, mw-rollback, mw-manual-revert, mw-reverted) e distingue gli
// account temporanei/anonimi (campo "temp"/"anon") — non serve altra euristica
// per capire "chi" ha fatto la modifica.

const UA = 'SocialRadar/1.0 (monitoraggio media; contatto: admin@example.com)';
const API = 'https://en.wikipedia.org/w/api.php';

async function api<T>(params: Record<string, string>): Promise<T> {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Wikipedia API: HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export type WikiPageHit = { title: string; snippet: string; wordcount: number };

/** Pagine il cui titolo o testo corrisponde alla ricerca — per farla scegliere all'utente, non scriverla a mano. */
export async function searchWikiPages(query: string): Promise<WikiPageHit[]> {
  if (query.trim().length < 2) return [];
  const data = await api<{ query?: { search?: { title: string; snippet: string; wordcount: number }[] } }>({
    action: 'query', list: 'search', srsearch: query, srlimit: '8',
  });
  return (data.query?.search ?? []).map((s) => ({
    title: s.title, wordcount: s.wordcount,
    snippet: s.snippet.replace(/<[^>]+>/g, ''),
  }));
}

type ApiRevision = {
  revid: number; user: string; timestamp: string; size: number;
  minor?: boolean; anon?: boolean; temp?: boolean; comment?: string; tags: string[];
};

export type WikiRevision = {
  revId: number; user: string; isAnon: boolean; isMinor: boolean;
  comment: string; size: number; sizeDiff: number | null; tags: string[]; timestamp: Date;
};

const IP_RE = /^(\d{1,3}\.){3}\d{1,3}$|^[0-9a-f:]+:[0-9a-f:]+$/i;

/** Ultime revisioni di una pagina, più recenti prima, con il delta di dimensione già calcolato. */
export async function fetchRecentRevisions(title: string, limit = 50): Promise<WikiRevision[]> {
  const data = await api<{ query?: { pages?: { revisions?: ApiRevision[] }[] } }>({
    action: 'query', prop: 'revisions', titles: title,
    rvlimit: String(limit), rvprop: 'ids|timestamp|user|comment|size|flags|tags',
  });
  const revisions = data.query?.pages?.[0]?.revisions ?? [];
  return revisions.map((r, i) => ({
    revId: r.revid,
    user: r.user,
    isAnon: Boolean(r.anon || r.temp || IP_RE.test(r.user)),
    isMinor: Boolean(r.minor),
    comment: r.comment ?? '',
    size: r.size,
    // Il delta si calcola contro la revisione successiva in ordine cronologico
    // (precedente nel tempo): l'ultima della pagina resta senza delta, non 0.
    sizeDiff: i + 1 < revisions.length ? r.size - revisions[i + 1].size : null,
    tags: r.tags ?? [],
    timestamp: new Date(r.timestamp),
  }));
}

const REVERT_TAGS = new Set(['mw-undo', 'mw-rollback', 'mw-manual-revert', 'mw-reverted']);
export const isRevert = (rev: { tags: string[] }): boolean => rev.tags.some((t) => REVERT_TAGS.has(t));
