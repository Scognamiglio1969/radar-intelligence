import { fetchJson } from '@/lib/connectors/util';
import { cfg } from '@/lib/connector-config';
import type { RawReview } from './types';

// Yelp Fusion API v3: richiede una chiave gratuita (Authorization: Bearer),
// verificato dal vivo che l'endpoint di ricerca rifiuta qualunque richiesta
// senza — "Authorization is a required parameter" — quindi non esiste un
// livello davvero anonimo come per football-data.org.
//
// ATTENZIONE — come per Google Places, questo NON è verificato dal vivo oltre
// alla chiamata anonima (nessuna chiave disponibile in questo ambiente per
// testare con dati reali). Scritto sulla documentazione ufficiale Yelp,
// stabile da anni. Un limite dichiarato nella documentazione stessa, non
// aggirabile: l'endpoint delle recensioni restituisce al massimo 3 estratti
// per attività, troncati — non l'elenco completo. È una restrizione di Yelp
// sui dati di terze parti, non un limite tecnico di questo connettore.
type YelpBusiness = {
  id: string; name: string; rating?: number; review_count?: number;
  location?: { display_address?: string[] };
};
type YelpReview = {
  id: string; url?: string; text?: string; rating?: number;
  time_created?: string; user?: { name?: string };
};

export function yelpEnabled(): boolean {
  return Boolean(cfg('YELP_API_KEY'));
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${cfg('YELP_API_KEY')}` };
}

export type YelpHit = { id: string; name: string; address: string; rating: number | null; reviewCount: number };

/** Attività che corrispondono al termine cercato — l'id Yelp non si indovina, si cerca. */
export async function searchYelpBusinesses(term: string, location: string): Promise<YelpHit[]> {
  const key = cfg('YELP_API_KEY');
  if (!key || term.trim().length < 2 || location.trim().length < 2) return [];
  const params = new URLSearchParams({ term, location, limit: '8' });
  const data = await fetchJson<{ businesses?: YelpBusiness[] }>(
    `https://api.yelp.com/v3/businesses/search?${params}`, { headers: authHeaders() },
  );
  return (data.businesses ?? []).map((b) => ({
    id: b.id, name: b.name,
    address: (b.location?.display_address ?? []).join(', '),
    rating: b.rating ?? null, reviewCount: b.review_count ?? 0,
  }));
}

export async function fetchYelpReviews(businessId: string): Promise<RawReview[]> {
  const key = cfg('YELP_API_KEY');
  if (!key) return [];
  const data = await fetchJson<{ reviews?: YelpReview[] }>(
    `https://api.yelp.com/v3/businesses/${encodeURIComponent(businessId)}/reviews?limit=20&sort_by=newest`,
    { headers: authHeaders() },
  );
  const reviews = data.reviews ?? [];
  return reviews
    .filter((r): r is YelpReview & { rating: number } => typeof r.rating === 'number' && r.rating >= 1 && r.rating <= 5)
    .map((r) => ({
      externalId: r.id,
      rating: Math.round(r.rating),
      content: r.text ?? '',
      author: r.user?.name,
      url: r.url,
      publishedAt: r.time_created ? new Date(r.time_created) : new Date(),
    } satisfies RawReview));
}
