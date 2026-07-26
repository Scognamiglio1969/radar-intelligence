import { fetchJson, truncate } from '@/lib/connectors/util';
import type { RawReview } from './types';

// Feed RSS pubblico delle recensioni App Store: nessuna chiave, nessun account
// sviluppatore — funziona per QUALSIASI app, anche non tua. Verificato dal vivo
// prima di scrivere questo file: ogni entry porta sempre voto, titolo, testo,
// autore e data; un app id inesistente risponde HTTP 200 con `feed.entry`
// assente (non un errore) — va trattato come "zero recensioni", non come guasto.
type AppStoreEntry = {
  author?: { name?: { label?: string } };
  updated?: { label?: string };
  'im:rating'?: { label?: string };
  id?: { label?: string };
  title?: { label?: string };
  content?: { label?: string };
  link?: { attributes?: { href?: string } };
};

export async function fetchAppStoreReviews(
  appId: string, country = 'us', pages = 2,
): Promise<RawReview[]> {
  const out: RawReview[] = [];
  for (let page = 1; page <= pages; page++) {
    const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${appId}/sortby=mostrecent/json`;
    let data: { feed?: { entry?: AppStoreEntry | AppStoreEntry[] } };
    try {
      data = await fetchJson(url);
    } catch {
      break; // pagina non raggiungibile: si tiene quanto già raccolto
    }
    let entries = data.feed?.entry;
    if (!entries) break;
    if (!Array.isArray(entries)) entries = [entries];
    if (entries.length === 0) break;

    for (const e of entries) {
      const rating = Number(e['im:rating']?.label);
      const id = e.id?.label;
      if (!id || !Number.isInteger(rating) || rating < 1 || rating > 5) continue;
      out.push({
        externalId: id,
        rating,
        title: e.title?.label,
        content: truncate(e.content?.label ?? '', 2000),
        author: e.author?.name?.label,
        url: e.link?.attributes?.href,
        publishedAt: e.updated?.label ? new Date(e.updated.label) : new Date(),
      });
    }
  }
  return out;
}
