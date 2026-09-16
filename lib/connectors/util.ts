const UA = 'SocialRadar/1.0 (monitoraggio media; contatto: admin@example.com)';

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, Accept: 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} da ${new URL(url).host}`);
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Risposta non JSON da ${new URL(url).host}`);
  }
}

export async function fetchText(url: string, init?: RequestInit): Promise<string> {
  const res = await fetch(url, {
    ...init,
    headers: { 'User-Agent': UA, ...init?.headers },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} da ${new URL(url).host}`);
  return res.text();
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    // Entità numeriche generiche (&#176; = °, &#8217; = '...): l'elenco fisso
    // sopra copre solo le più comuni. Trovato su un titolo Stack Exchange
    // ("27 &#176;C") rimasto non decodificato — qualunque fonte può emetterne.
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/** Esegue una lista di fetch in parallelo ignorando i singoli fallimenti. */
export async function collect<T>(tasks: Promise<T[]>[]): Promise<T[]> {
  const results = await Promise.allSettled(tasks);
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

/**
 * Un estratto che contiene il termine cercato.
 *
 * Tagliare un testo lungo dall'inizio può lasciare fuori proprio la parola per
 * cui è stato raccolto: chi legge la menzione non capisce perché è lì. Qui si
 * parte poco prima della prima occorrenza.
 */
export function excerptAround(text: string, term: string, n: number): string {
  if (text.length <= n) return text;
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0 || at + term.length <= n - 1) return truncate(text, n);
  const start = Math.max(0, at - Math.floor(n / 4));
  const slice = text.slice(start, start + n - 2);
  return `…${slice}${start + n - 2 < text.length ? '…' : ''}`;
}
