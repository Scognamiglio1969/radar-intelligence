// Interesse di ricerca (Google Trends) via l'API interna del sito — non
// esiste un'API pubblica ufficiale. Verificato dal vivo (senza travestirsi da
// browser: lo stesso User-Agent onesto usato da tutti gli altri connettori
// funziona) con una sequenza a tre passi:
//
//  1. GET trends.google.com/  → serve solo a ottenere il cookie NID.
//  2. GET .../api/explore?req={termini} → risponde con un JSON preceduto dal
//     prefisso anti-hijacking ")]}',"; contiene un "token" monouso per il
//     passo 3.
//  3. GET .../api/widgetdata/multiline?req=...&token=... → i dati veri.
//
// Fino a 5 termini nella STESSA richiesta arrivano già scalati l'uno rispetto
// all'altro (100 = punta massima fra tutti i termini insieme, non per singolo
// termine) — verificato dal vivo con 3 squadre di Serie A. Questo è esattamente
// lo "share of search" fra un brand e i suoi competitor, non tre serie separate.
//
// Endpoint non documentato: nessuna garanzia di stabilità né un vero limite di
// frequenza dichiarato. Per questo si interroga al massimo una volta al giorno
// (stesso principio già usato per Alpha Vantage) e ogni fallimento è silenzioso
// per il resto della pipeline — è un arricchimento, non una fonte critica.

const UA = 'SocialRadar/1.0 (monitoraggio media; contatto: admin@example.com)';
const MAX_TERMS = 5; // limite reale imposto dal sito stesso, non nostro

export type SearchInterestPoint = { date: string; values: number[] };

async function getCookie(): Promise<string> {
  const res = await fetch('https://trends.google.com/?geo=US', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(15000),
  });
  const setCookie = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  return setCookie.map((c) => c.split(';')[0]).join('; ');
}

function parseJsonp(text: string): unknown {
  return JSON.parse(text.replace(/^\)\]\}'[,]?\s*/, ''));
}

/**
 * Interesse di ricerca giornaliero per fino a 5 termini, scalati fra loro.
 * `values[i]` corrisponde a `terms[i]`, stesso ordine.
 */
export async function fetchSearchInterest(terms: string[], days = '3-m'): Promise<SearchInterestPoint[]> {
  const capped = terms.slice(0, MAX_TERMS);
  if (capped.length === 0) return [];

  const cookie = await getCookie();
  const headers = { 'User-Agent': UA, Cookie: cookie };

  const exploreReq = {
    comparisonItem: capped.map((keyword) => ({ keyword, geo: '', time: `today ${days}` })),
    category: 0, property: '',
  };
  const exploreRes = await fetch(
    `https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(exploreReq))}`,
    { headers, signal: AbortSignal.timeout(15000) },
  );
  if (!exploreRes.ok) throw new Error(`Google Trends explore: HTTP ${exploreRes.status}`);
  const exploreData = parseJsonp(await exploreRes.text()) as {
    widgets?: { token: string; request: unknown }[];
  };
  const widget = exploreData.widgets?.[0];
  if (!widget) throw new Error('Google Trends: nessun widget nella risposta');

  const dataRes = await fetch(
    `https://trends.google.com/trends/api/widgetdata/multiline?hl=en-US&tz=0&req=${encodeURIComponent(JSON.stringify(widget.request))}&token=${widget.token}`,
    { headers, signal: AbortSignal.timeout(15000) },
  );
  if (!dataRes.ok) throw new Error(`Google Trends widgetdata: HTTP ${dataRes.status}`);
  const data = parseJsonp(await dataRes.text()) as {
    default?: { timelineData?: { time: string; value: number[]; isPartial?: boolean }[] };
  };
  const points = data.default?.timelineData ?? [];

  // L'ultimo giorno è quasi sempre "isPartial" (giornata non ancora conclusa):
  // scartarlo evita un calo artificiale nell'ultimo punto del grafico.
  return points
    .filter((p) => !p.isPartial)
    .map((p) => ({
      date: new Date(Number(p.time) * 1000).toISOString().slice(0, 10),
      values: p.value,
    }));
}
