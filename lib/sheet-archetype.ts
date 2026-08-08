import type { ColumnProfile } from '@/lib/import-profile';
import type { MetricMap } from '@/lib/import-metrics';

// ---------------------------------------------------------------------------
// Che TIPO di foglio è.
//
// Sapere che un foglio è "di misure" non basta a decidere che cosa mostrarne:
// una serie di follower, un conteggio di pubblicazioni e una ripartizione di
// audience sono tutte misure, ma rispondono a domande diverse e vogliono
// grafici diversi. Un catalogo fisso di grafici che si adatta a ciò che trova
// produce sempre le stesse quattro viste; riconoscere l'ARCHETIPO permette
// invece di far nascere dal foglio gli insight che quel foglio può dare.
//
// Il riconoscimento guarda tre cose, in quest'ordine di affidabilità:
//   1. la FORMA dei dati (che colonne, che tipi, quante entità);
//   2. i VALORI (nomi di piattaforma, nomi di persona, percentuali);
//   3. il NOME del foglio, che è l'indizio più debole e non decide mai da solo.
// ---------------------------------------------------------------------------

export type Archetype =
  | 'platform-posts'      // post di un canale, con le metriche native
  | 'person-posts'        // post di una persona (personal branding)
  | 'audience-series'     // follower/iscritti nel tempo
  | 'publishing-series'   // quanti contenuti pubblicati nel tempo
  | 'performance-series'  // impression, interazioni, medie nel tempo
  | 'audience-breakdown'  // composizione del pubblico per azienda/ruolo/luogo
  | 'unknown';

export type ArchetypeGuess = {
  archetype: Archetype;
  /** Perché: si mostra all'utente, così la scelta è contestabile. */
  reason: string;
  /** Se le entità di questo foglio sono PERSONE (personal branding). */
  people: boolean;
};

const PLATFORM = /^(twitter|x|facebook|fb|instagram|ig|ig feed|ig story|ig stories|tiktok|tt|linkedin|lk|youtube|yt|threads|reddit|telegram)$/i;
/** Basta UNA parola da piattaforma per escludere che sia una persona:
 *  "Instagram Story" e "LinkedIn Profile" sono canali, non nomi propri. */
const PLATFORM_WORD = /^(twitter|x|facebook|fb|instagram|ig|tiktok|tt|linkedin|lk|youtube|yt|threads|reddit|telegram|whatsapp|snapchat|pinterest|twitch|mastodon|bluesky)$/i;
const AUDIENCE_METRIC = /(follower|fan|iscritti|subscriber|audience|seguaci)/i;
const PUBLISH_METRIC = /(pubblicazion|post|updates|contenuti|video pubblicati|uscite)/i;
const BREAKDOWN_DIM = /(azienda|company|job title|ruolo|role|location|luogo|settore|industry|seniority|paese|country)/i;

/**
 * Un nome di persona: due o tre parole capitalizzate, senza cifre e senza
 * parole da piattaforma. Volutamente prudente — sbagliare qui significa
 * promettere una scheda personale su un canale aziendale.
 */
/**
 * Il vocabolario delle MISURE.
 *
 * "AVG Commenti", "Engagement Rate", "Total Followers" sono due parole
 * capitalizzate come "Marco Sesana", e senza questo filtro finivano
 * nell'elenco delle persone. Una scheda personale intestata a una metrica è il
 * genere di errore che fa perdere fiducia in tutto il resto.
 */
const METRIC_WORD = /\b(avg|average|medi[aeo]|total[ei]?|sum|somma|rate|tasso|perc|engagement|impression\w*|reach|follower\w*|iscritti|subscriber\w*|like|dislike|preferiti|reaction\w*|reazion\w*|comment\w*|rispost\w*|repl\w*|condivision\w*|share\w*|reshare\w*|repost|retweet|update\w*|post|stor(y|ies|ia|ie)|reel\w*|video|view\w*|visualizzazion\w*|spettatori|interazion\w*|interaction\w*|clic\w*|click\w*|copertura|salvataggi|segnalibri|bookmark\w*|durata|tempo|watch\w*|delta|count|rank\w*|mes[ei]|ann[oi]|month|year|dat[ae]|canale|channel|profil\w*|panoramica|pubblicazion\w*|contenut\w*|articol\w*|menzion\w*|citazion\w*|uscite|crescita|audience|pubblico|punteggi\w*|frequenza|ritmo|performance|attivit\w*|risultat\w*|obiettiv\w*|budget|spesa|costo|valore|volum\w*)\b/i;

export function looksLikePerson(name: string): boolean {
  const s = name.trim();
  if (!s || /\d/.test(s)) return false;
  if (PLATFORM.test(s)) return false;
  if (METRIC_WORD.test(s)) return false;
  if (s.split(/[\s_]+/).some((w) => PLATFORM_WORD.test(w))) return false;
  if (/(spa|srl|group|gruppo|italia|italiane|official|brand|channel|canale|corporate|team)/i.test(s)) return false;
  const words = s.split(/[\s_]+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  // Un cognome solo va bene (i fogli reali si chiamano "Donnet", "Borean"),
  // purché sia una parola vera e non una sigla.
  if (words.length === 1) return /^[A-ZÀ-Ý][a-zà-ÿ']{2,}$/.test(words[0]);
  return words.every((w) => /^[A-ZÀ-Ý][A-Za-zà-ÿ'’.-]*$/.test(w));
}

export function classifySheet(
  profiles: ColumnProfile[], kind: 'mentions' | 'metrics',
  sheetName: string, metricMap?: MetricMap | null,
): ArchetypeGuess {
  const names = profiles.map((p) => p.name);
  const has = (re: RegExp) => names.some((n) => re.test(n));
  const valuesOf = (re: RegExp) => profiles.find((p) => re.test(p.name))?.samples ?? [];

  if (kind === 'mentions') {
    // Post di una PERSONA o di un CANALE? Lo dice chi firma i contenuti: un
    // foglio per manager non ha una colonna autore perché l'autore è il foglio.
    const authorCol = profiles.find((p) => /(autore|author|manager|persona)/i.test(p.name));
    const authorsArePeople = (authorCol?.samples ?? []).filter(looksLikePerson).length
      >= Math.max(1, Math.ceil((authorCol?.samples.length ?? 0) / 2));
    const sheetIsPerson = looksLikePerson(sheetName.replace(/_/g, ' '));

    if (sheetIsPerson || (authorsArePeople && (authorCol?.distinct ?? 0) <= 5)) {
      return {
        archetype: 'person-posts', people: true,
        reason: sheetIsPerson
          ? `Il foglio si chiama "${sheetName}": i contenuti sono di una persona.`
          : `La colonna "${authorCol?.name}" contiene sempre le stesse poche persone.`,
      };
    }
    return {
      archetype: 'platform-posts', people: false,
      reason: 'Righe con un testo e le metriche native di un canale.',
    };
  }

  // --- fogli di misure ---
  const metrics = metricMap?.metrics ?? [];
  const dims = metricMap?.dims ?? [];
  const audienceMetrics = metrics.filter((m) => AUDIENCE_METRIC.test(m)).length;
  const publishMetrics = metrics.filter((m) => PUBLISH_METRIC.test(m) || PLATFORM.test(m.trim())).length;

  if (dims.some((d) => BREAKDOWN_DIM.test(d)) || has(BREAKDOWN_DIM)) {
    return {
      archetype: 'audience-breakdown', people: false,
      reason: 'Percentuali ripartite per azienda, ruolo o luogo: è la composizione di un pubblico.',
    };
  }
  if (audienceMetrics >= Math.max(1, metrics.length * 0.5)) {
    // Le colonne sono nomi di persona (formato largo, un manager per colonna)?
    const peopleCols = metrics.filter(looksLikePerson).length;
    return {
      archetype: 'audience-series',
      people: peopleCols >= Math.max(2, metrics.length * 0.4),
      reason: peopleCols >= 2
        ? 'Una colonna di follower per ogni persona seguita.'
        : 'Serie di follower o iscritti nel tempo.',
    };
  }
  if (publishMetrics >= Math.max(1, metrics.length * 0.5)) {
    return {
      archetype: 'publishing-series', people: false,
      reason: 'Conteggi di contenuti pubblicati, canale per canale.',
    };
  }

  // Aggregati per entità: se l'entità è una persona, è personal branding.
  const entityCol = profiles.find((p) => p.name === metricMap?.entity);
  const entityIsPerson = (entityCol?.samples ?? []).some(looksLikePerson)
    || looksLikePerson(sheetName.replace(/_(mensile|monthly)$/i, '').replace(/_/g, ' '));
  if (metrics.length >= 2) {
    return {
      archetype: 'performance-series', people: entityIsPerson,
      reason: entityIsPerson
        ? 'Aggregati periodici di una persona: impression, interazioni, medie.'
        : 'Aggregati periodici: impression, interazioni, medie.',
    };
  }
  void valuesOf;
  return { archetype: 'unknown', people: false, reason: 'Forma non riconosciuta.' };
}

/** Etichette leggibili, usate nell'interfaccia. */
export const ARCHETYPE_LABEL: Record<Archetype, string> = {
  'platform-posts': 'Contenuti di canale',
  'person-posts': 'Contenuti di una persona',
  'audience-series': 'Pubblico nel tempo',
  'publishing-series': 'Pubblicazioni nel tempo',
  'performance-series': 'Performance periodiche',
  'audience-breakdown': 'Composizione del pubblico',
  unknown: 'Da classificare',
};
