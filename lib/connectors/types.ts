import type { Engagement } from '@/lib/db/schema';

export interface ListeningQuery {
  /** OR — almeno uno di questi termini */
  anyTerms: string[];
  /** AND — tutti questi termini devono comparire */
  allTerms: string[];
  /** NOT — nessuno di questi termini */
  excludeTerms: string[];
  languages: string[];
  /** Codici paese ISO (IT, US, …): applicato alle fonti che lo supportano (news) */
  countries: string[];
  /**
   * Id del progetto Talkwalker da interrogare (solo per i progetti in modalità
   * 'talkwalker'). Le altre fonti lo ignorano.
   */
  talkwalkerProject?: string;
  /**
   * Topic già configurati in Talkwalker da cui prendere i documenti. Se ci
   * sono, la query booleana di Radar non viene inviata: comanda il topic.
   */
  talkwalkerTopics?: string[];
}

export interface RawMention {
  source: string;
  externalId: string;
  url?: string;
  title?: string;
  content: string;
  author?: string;
  authorHandle?: string;
  community?: string;
  publishedAt: Date;
  language?: string;
  /** Paese DICHIARATO dalla fonte (nome o codice): non una deduzione. */
  country?: string;
  engagement?: Engagement;
  reach?: number;
}

export interface Connector {
  id: string;
  label: string;
  /**
   * free    = gratuita, attiva da subito, nessuna chiave;
   * freekey = gratuita ma richiede una chiave/registrazione gratuita;
   * premium = richiede chiave/abbonamento a pagamento.
   */
  tier: 'free' | 'freekey' | 'premium';
  /** false = connettore presente ma spento (es. manca la chiave API) */
  enabled: () => boolean;
  /** Motivo per cui è spento, mostrato nelle Impostazioni */
  disabledReason?: string;
  fetchMentions(q: ListeningQuery): Promise<RawMention[]>;
}

const quote = (t: string) => (t.includes(' ') ? `"${t.replace(/"/g, '')}"` : t.replace(/"/g, ''));

/**
 * Query booleana in sintassi standard (Google News, GDELT, X):
 * ("a" OR "b") "c" -"d"
 */
export function booleanQuery(q: ListeningQuery): string {
  const parts: string[] = [];
  if (q.anyTerms.length) parts.push(`(${q.anyTerms.map(quote).join(' OR ')})`);
  parts.push(...q.allTerms.map(quote));
  parts.push(...q.excludeTerms.map((t) => `-${quote(t)}`));
  return parts.join(' ');
}
