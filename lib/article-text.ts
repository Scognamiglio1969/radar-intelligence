// ---------------------------------------------------------------------------
// Estrazione del testo di un articolo dalla sua pagina.
//
// Perché serve: i feed danno titolo e sommario, non il pezzo. Su un sommario
// non si distingue "l'articolo parla di te" da "sei citato alla riga 40", il
// sentiment si giudica su un titolo scritto per fare clic, e non si possono
// estrarre citazioni vere. È la differenza fra una rassegna stampa e un elenco
// di link.
//
// Regole di buona educazione, non negoziabili: user-agent che dichiara chi
// siamo, un solo tentativo per pagina, timeout stretto, tetto sulla dimensione
// scaricata e una pausa fra richieste allo stesso sito. Non si rincorre un
// paywall e non si riprova all'infinito.
// ---------------------------------------------------------------------------

const UA = 'Mozilla/5.0 (compatible; RadarBot/1.0; +https://github.com/Scognamiglio1969/radar-intelligence)';
const TIMEOUT_MS = 12_000;
const MAX_BYTES = 2_000_000;      // oltre, è una pagina che non vale la pena leggere
const MAX_CHARS = 20_000;         // tetto al testo conservato
const MIN_CHARS = 320;            // sotto, è un teaser o una pagina di consenso

export type ArticleFetch =
  | { ok: true; text: string; finalUrl: string }
  | { ok: false; reason: 'opaque_redirect' | 'too_short' | 'unreachable' | 'not_html' };

/**
 * Google News non pubblica l'indirizzo della testata: il link porta a una
 * pagina-guscio che risolve la destinazione via JavaScript, e il codice nel
 * link è un identificatore opaco che solo un'API interna di Google sa
 * sciogliere. Verificato: nel token non c'è alcun URL e nell'HTML nemmeno.
 * Si riconoscono e si saltano — bussare sarebbe traffico sprecato. Per avere
 * il testo pieno di una testata si aggiunge il suo feed RSS al progetto:
 * quei link sono diretti.
 */
export const isOpaqueRedirect = (url: string): boolean => /(^|\/\/)news\.google\./i.test(url);

/** Elementi che non fanno mai parte del pezzo. */
const STRIP = /<(script|style|noscript|svg|form|nav|header|footer|aside|figure|iframe|template)\b[^>]*>[\s\S]*?<\/\1>/gi;

function decode(s: string): string {
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    laquo: '«', raquo: '»', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    egrave: 'è', eacute: 'é', agrave: 'à', ograve: 'ò', ugrave: 'ù', igrave: 'ì',
    hellip: '…', mdash: '—', ndash: '–', euro: '€', deg: '°',
  };
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => named[n.toLowerCase()] ?? m);
}

const textOf = (html: string): string =>
  decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/**
 * Il corpo del pezzo. Si preferiscono i contenitori semantici; in mancanza, si
 * sceglie il blocco con più testo in paragrafi — nelle pagine di notizie il
 * corpo è quasi sempre la concentrazione maggiore di <p> lunghi.
 */
function mainText(html: string): string {
  const cleaned = html.replace(STRIP, ' ');

  const candidates: string[] = [];
  const containers = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of cleaned.matchAll(containers)) candidates.push(m[2]);
  for (const m of cleaned.matchAll(/<div\b[^>]*(?:articleBody|article-body|story-body|entry-content|post-content)[^>]*>([\s\S]*?)<\/div>/gi)) {
    candidates.push(m[1]);
  }
  candidates.push(cleaned);          // ultima spiaggia: tutta la pagina

  let best = '';
  for (const c of candidates) {
    // Solo paragrafi di lunghezza reale: esclude didascalie, menu e briciole.
    const paras = [...c.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => textOf(m[1]))
      .filter((t) => t.length > 60);
    const joined = paras.join('\n\n');
    if (joined.length > best.length) best = joined;
  }
  return best.slice(0, MAX_CHARS);
}

async function get(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' },
    });
    if (!res.ok) return null;
    if (!(res.headers.get('content-type') ?? '').includes('html')) return null;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > MAX_BYTES) return null;
    return { html: (await res.text()).slice(0, MAX_BYTES), finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Scarica una pagina e ne estrae il testo. Non solleva mai: riferisce e basta. */
export async function fetchArticleText(url: string): Promise<ArticleFetch> {
  // Si riconosce PRIMA di uscire in rete: nessuna richiesta inutile.
  if (isOpaqueRedirect(url)) return { ok: false, reason: 'opaque_redirect' };

  const page = await get(url);
  if (!page) return { ok: false, reason: 'unreachable' };
  if (isOpaqueRedirect(page.finalUrl)) return { ok: false, reason: 'opaque_redirect' };

  const text = mainText(page.html);
  if (text.length < MIN_CHARS) return { ok: false, reason: 'too_short' };
  return { ok: true, text, finalUrl: page.finalUrl };
}

/**
 * Estrae più articoli senza maltrattare i siti: poche richieste in parallelo e
 * mai due contemporanee allo stesso host. Restituisce solo ciò che è riuscito;
 * i fallimenti li registra chi chiama, per non ritentarli in eterno.
 */
export async function fetchArticles(
  items: { id: number; url: string }[], concurrency = 4,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const hostBusy = new Set<string>();
  const queue = [...items];

  const worker = async () => {
    while (queue.length) {
      // Salta i lavori il cui host è già occupato: li riprende il giro dopo.
      const idx = queue.findIndex((it) => {
        try { return !hostBusy.has(new URL(it.url).host); } catch { return false; }
      });
      if (idx === -1) { queue.shift(); continue; }
      const [job] = queue.splice(idx, 1);

      let host = '';
      try { host = new URL(job.url).host; } catch { continue; }
      hostBusy.add(host);
      try {
        const r = await fetchArticleText(job.url);
        if (r.ok) out.set(job.id, r.text);
      } finally {
        hostBusy.delete(host);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return out;
}
