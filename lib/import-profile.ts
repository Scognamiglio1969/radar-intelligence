import { MODELS, callClaude } from '@/lib/claude';

/**
 * Campi di Radar in cui una colonna di un file di listening può finire.
 * L'elenco è molto più ampio dei 7 campi mappati storicamente: gli export dei
 * tool di listening portano già lingua, sentiment, reach e il dettaglio
 * dell'engagement, e buttarli via significava rianalizzare (a pagamento) dati
 * che il file conteneva già.
 */
export const TARGET_FIELDS = {
  content: 'Il testo del post/articolo. OBBLIGATORIO.',
  title: 'Titolo o headline, se distinto dal testo.',
  date: 'Data di pubblicazione.',
  time: "Ora di pubblicazione, SOLO se sta in una colonna separata dalla data.",
  author: "Nome dell'autore.",
  authorHandle: "Handle/username dell'autore (@nome).",
  source: 'Piattaforma o testata (Twitter, Corriere, Reddit…).',
  url: 'Link al contenuto originale.',
  language: 'Lingua del contenuto (it, en, "Italian"…).',
  community: 'Gruppo/subreddit/pagina/community di appartenenza.',
  country: 'Paese.',
  sentiment: 'Sentiment già calcolato (positivo/negativo/neutro o punteggio).',
  reach: 'Copertura potenziale / impression / follower.',
  likes: 'Numero di like/reazioni/preferiti.',
  comments: 'Numero di commenti/risposte.',
  shares: 'Numero di condivisioni/retweet/repost.',
  views: 'Numero di visualizzazioni.',
  engagement: 'Engagement totale già aggregato (usare solo se non ci sono le colonne separate).',
} as const;

export type TargetField = keyof typeof TARGET_FIELDS;

export type ColumnProfile = {
  name: string;
  /** Tipo prevalente osservato nei valori, non dichiarato dal file. */
  kind: 'text' | 'number' | 'date' | 'time' | 'boolean' | 'empty';
  /** Percentuale di celle non vuote (0-100): una colonna vuota all'80% è sospetta. */
  filled: number;
  /** Valori distinti: 2-5 valori su migliaia di righe = categoria (es. sentiment). */
  distinct: number;
  samples: string[];
  /** Lunghezza media del testo: separa un titolo (60) da un contenuto (400). */
  avgLength: number;
};

const DATE_RE = /^\d{4}[-/]\d{1,2}[-/]\d{1,2}|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/;
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i;
const NUM_RE = /^-?[\d.,\s]+(k|m|mln|mila)?$/i;

function cellKind(v: string): ColumnProfile['kind'] {
  const s = v.trim();
  if (!s) return 'empty';
  // Gli URL vanno esclusi PRIMA del controllo data: contengono "/" e ":" e
  // Date.parse ne accetta parecchi, così una colonna di link veniva
  // classificata come data — e un profilo sbagliato porta fuori strada anche
  // la proposta dell'AI, che si fida del tipo osservato.
  if (/^(https?:\/\/|www\.)/i.test(s)) return 'text';
  if (TIME_RE.test(s)) return 'time';
  if (DATE_RE.test(s) || !Number.isNaN(Date.parse(s)) && /[-/:]/.test(s)) return 'date';
  if (NUM_RE.test(s) && /\d/.test(s)) return 'number';
  if (/^(true|false|si|sì|no|yes)$/i.test(s)) return 'boolean';
  return 'text';
}

/** Osserva i VALORI, non solo l'intestazione: una colonna "col_3" piena di date
 *  è una data, e un'intestazione in italiano non deve far fallire il
 *  riconoscimento come accadeva con il match per espressioni regolari. */
export function profileColumns(columns: string[], rows: Record<string, unknown>[]): ColumnProfile[] {
  const sample = rows.slice(0, 400);
  return columns.map((name) => {
    const raw = sample.map((r) => (r[name] == null ? '' : String(r[name])));
    const nonEmpty = raw.filter((v) => v.trim() !== '');
    const kinds = new Map<ColumnProfile['kind'], number>();
    for (const v of nonEmpty) kinds.set(cellKind(v), (kinds.get(cellKind(v)) ?? 0) + 1);
    const kind = [...kinds.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'empty';
    const lens = nonEmpty.map((v) => v.length);
    return {
      name,
      kind,
      filled: sample.length ? Math.round((nonEmpty.length / sample.length) * 100) : 0,
      distinct: new Set(nonEmpty.map((v) => v.toLowerCase())).size,
      samples: [...new Set(nonEmpty)].slice(0, 5).map((v) => v.slice(0, 120)),
      avgLength: lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0,
    };
  });
}

export type FieldProposal = {
  column: string;
  field: TargetField | null;
  /** 'alta' = mappata d'ufficio, 'media'/'bassa' = da confermare, null = ignorata. */
  confidence: 'alta' | 'media' | 'bassa' | null;
  reason: string;
};

const SYSTEM = `Sei un analista di dati che prepara l'import di un file esportato da uno strumento di social listening (Talkwalker, Brandwatch, Meltwater, Sprinklr o simili) dentro Radar.

Ricevi il PROFILO delle colonne: nome, tipo osservato nei valori, percentuale di celle piene, numero di valori distinti, lunghezza media del testo e alcuni valori di esempio. Non ricevi il file: non inventare valori.

Assegna a ogni colonna UNO dei campi di destinazione, oppure null se non corrisponde a nessuno.

REGOLE:
- Il nome della colonna può essere in qualunque lingua. Fidati dei VALORI DI ESEMPIO più che del nome.
- "content" è il testo lungo da analizzare (lunghezza media alta). "title" è breve. Se c'è una sola colonna di testo lungo, quella è "content".
- Se data e ora sono in due colonne separate, mappa entrambe: "date" e "time". Se una sola colonna contiene già entrambe, usa solo "date".
- Preferisci likes/comments/shares/views separati a "engagement" aggregato. Usa "engagement" SOLO se non esistono le colonne separate.
- Una colonna con pochissimi valori distinti (2-5) su molte righe e valori tipo positivo/negativo/neutro è "sentiment".
- Ogni campo può essere assegnato a UNA SOLA colonna. Se due colonne competono, scegli la migliore e lascia l'altra a null.
- confidence: "alta" se il nome E i valori concordano; "media" se lo deduci dai soli valori o dal solo nome; "bassa" se è un'ipotesi. Usa null quando field è null.
- reason: UNA frase breve, in italiano, che spiega perché — citando il valore o la statistica che ti ha convinto.

Rispondi SOLO con JSON: {"mappings":[{"column":"...","field":"..."|null,"confidence":"alta"|"media"|"bassa"|null,"reason":"..."}]}`;

/**
 * Proposta di mappatura via AI. Al modello vanno SOLO i profili delle colonne
 * (nomi, statistiche, una manciata di valori), mai il file intero: mandare
 * decine di migliaia di righe sarebbe lento, costoso e — soprattutto —
 * lascerebbe al modello la possibilità di alterare i dati. Qui il modello
 * decide il significato delle colonne; a trasformare i valori è poi codice
 * deterministico.
 */
export async function proposeMapping(profiles: ColumnProfile[]): Promise<FieldProposal[] | null> {
  const fieldList = Object.entries(TARGET_FIELDS).map(([k, v]) => `- ${k}: ${v}`).join('\n');
  const user = `CAMPI DI DESTINAZIONE:\n${fieldList}\n\nCOLONNE DEL FILE:\n${JSON.stringify(profiles, null, 1)}`;

  const text = await callClaude(MODELS.sonnet, 'import_mapping', SYSTEM, user, 2000, false, 90_000);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as
      { mappings?: FieldProposal[] };
    const valid = new Set(Object.keys(TARGET_FIELDS));
    const known = new Set(profiles.map((p) => p.name));
    const used = new Set<string>();
    const out: FieldProposal[] = [];
    for (const m of parsed.mappings ?? []) {
      if (!known.has(m.column)) continue;            // colonna inventata: scartata
      const field = m.field && valid.has(m.field) ? m.field : null;
      // Un campo assegnato due volte sovrascriverebbe i dati in silenzio.
      const dup = field !== null && used.has(field);
      if (field && !dup) used.add(field);
      out.push({
        column: m.column,
        field: dup ? null : field,
        confidence: dup || !field ? null : (m.confidence ?? 'media'),
        reason: dup ? `Campo "${field}" già assegnato a un'altra colonna.` : String(m.reason ?? '').slice(0, 200),
      });
    }
    // Colonne che il modello non ha nominato: esplicitamente ignorate.
    for (const p of profiles) {
      if (!out.some((o) => o.column === p.name)) {
        out.push({ column: p.name, field: null, confidence: null, reason: 'Nessuna corrispondenza proposta.' });
      }
    }
    return out;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Riconoscimento deterministico, senza AI.
//
// Serve come base SEMPRE presente: la chiamata al modello è un servizio esterno
// (può mancare la chiave, scattare il tetto di spesa, andare in timeout) e non
// deve essere un punto di rottura unico. Se l'AI risponde, raffina questa base;
// se non risponde, lo strumento resta comunque utile.
//
// A differenza del vecchio match per sole espressioni regolari sui nomi
// (inglese e basta), qui il nome è solo uno degli indizi: contano anche il tipo
// osservato nei valori, la lunghezza media del testo e quanti valori distinti
// ci sono — così una colonna "col_3" piena di date viene riconosciuta e un
// file con intestazioni italiane non fallisce in blocco.
// ---------------------------------------------------------------------------
/** Piattaforme riconoscibili nei valori: l'indizio più forte per "source",
 *  più forte del nome della colonna. È il caso in cui una colonna chiamata
 *  proprio "Source" contiene Organic/Sponsored mentre la piattaforma vera sta
 *  in "Social Network": il nome inganna, i valori no. */
const PLATFORMS = /^(twitter|x|facebook|instagram|tiktok|linkedin|youtube|reddit|telegram|threads|pinterest|snapchat|twitch|mastodon|bluesky|weibo|vk|blog|forum|news|web)$/i;

/** Nome italiano equivalente, per la corrispondenza esatta. */
const FIELD_ALIASES: Partial<Record<TargetField, string>> = {
  content: 'testo', title: 'titolo', date: 'data', time: 'ora', author: 'autore',
  source: 'fonte', url: 'link', language: 'lingua', country: 'paese',
  likes: 'like', comments: 'commenti', shares: 'condivisioni', views: 'visualizzazioni',
};

const NAME_HINTS: Partial<Record<TargetField, RegExp>> = {
  content: /(content|text|testo|message|messaggio|body|post|comment|caption|descri|snippet)/i,
  title: /(title|titolo|headline|subject|oggetto)/i,
  date: /(date|data|giorno|created|published|pubblic|timestamp)/i,
  time: /(time|ora|orario|hour)/i,
  author: /(author|autore|user|utente|name|nome|profile|profilo)/i,
  authorHandle: /(handle|username|screen.?name|account|nick)/i,
  source: /(source|fonte|platform|piattaforma|network|social|channel|canale|site|sito|media)/i,
  url: /(url|link|permalink|href|indirizzo)/i,
  language: /(lang|lingua|idioma|locale)/i,
  community: /(communit|group|gruppo|subreddit|page|pagina|forum)/i,
  country: /(country|paese|nazione|geo|region)/i,
  sentiment: /(sentiment|tono|polarity|polarit|opinion)/i,
  reach: /(reach|impression|potential|follower|audience|copertura)/i,
  likes: /(like|mi.?piace|favorit|reaction|reazion|upvote)/i,
  comments: /(comment|comment|repl|rispost)/i,
  shares: /(share|condivis|retweet|repost|rilanci)/i,
  views: /(view|visualizz|watch|impression.?video|play)/i,
  engagement: /(engagement|interazion|interaction|total)/i,
};

/** Tipo di valore atteso: una colonna di testo non può essere "like". */
const EXPECTED_KIND: Partial<Record<TargetField, ColumnProfile['kind'][]>> = {
  date: ['date'], time: ['time'],
  reach: ['number'], likes: ['number'], comments: ['number'],
  shares: ['number'], views: ['number'], engagement: ['number'],
};

function scoreField(field: TargetField, p: ColumnProfile, rowCount: number): number {
  const expected = EXPECTED_KIND[field];
  // Tipo incompatibile: la colonna è esclusa a prescindere dal nome, perché
  // un nome può ingannare (una colonna "Source" che contiene Organic/Sponsored
  // non è la fonte) mentre il tipo dei valori no.
  if (expected && !expected.includes(p.kind)) return 0;

  let score = 0;
  if (NAME_HINTS[field]?.test(p.name)) score += 50;
  // Corrispondenza ESATTA col nome del campo: una colonna chiamata proprio
  // "Reach" batte "Followers", che pure contiene un indizio valido. Senza
  // questo, fra due candidati plausibili vinceva semplicemente il primo.
  const exact = p.name.trim().toLowerCase();
  if (exact === field.toLowerCase() || exact === (FIELD_ALIASES[field] ?? '')) score += 45;
  // Un tasso o una percentuale non è un conteggio: "Engagement Rate %" vale
  // 15.44, non 15 interazioni, e usarlo come totale falserebbe ogni classifica.
  if (EXPECTED_KIND[field] && /(rate|%|perc|ratio|media|avg)/i.test(p.name)) score -= 60;

  // Indizi dai VALORI, che pesano quanto il nome.
  if (field === 'content' && p.kind === 'text' && p.avgLength >= 40) score += 40;
  if (field === 'title' && p.kind === 'text' && p.avgLength >= 12 && p.avgLength < 90) score += 15;
  if (field === 'sentiment' && p.distinct <= 6 && p.kind === 'text') score += 35;
  if (field === 'language' && p.avgLength <= 6 && p.distinct <= 20) score += 30;
  if (field === 'country' && p.kind === 'text' && p.distinct <= 40 && p.avgLength <= 20) score += 15;
  if (field === 'url' && p.samples.some((s) => /^https?:\/\//i.test(s))) score += 60;
  if (field === 'source') {
    const hits = p.samples.filter((s) => PLATFORMS.test(s.trim())).length;
    // I valori sono nomi di piattaforme: batte qualunque indizio dal nome.
    if (hits >= Math.max(1, Math.ceil(p.samples.length / 2))) score += 70;
    // Colonna che si CHIAMA "source" ma contiene altro: l'indizio del nome va
    // annullato, altrimenti vince su quella giusta.
    else if (p.kind === 'text' && p.distinct <= 4 && hits === 0) score -= 45;
  }
  if (field === 'authorHandle' && p.samples.some((s) => /^@|^[a-z0-9._]+$/i.test(s)) && p.distinct > rowCount * 0.3) score += 15;
  if (expected && expected.includes(p.kind)) score += 15;
  // Una colonna quasi vuota è raramente quella giusta.
  if (p.filled < 40) score -= 25;
  return score;
}

/**
 * Assegna i campi con una scelta globale (non "primo che passa"): ogni campo
 * prende la colonna con il punteggio più alto, e ogni colonna può servire un
 * solo campo — così due candidati non si sovrascrivono a vicenda.
 */
export function heuristicMapping(profiles: ColumnProfile[], rowCount: number): FieldProposal[] {
  const pairs: { field: TargetField; profile: ColumnProfile; score: number }[] = [];
  for (const field of Object.keys(TARGET_FIELDS) as TargetField[]) {
    for (const p of profiles) {
      const score = scoreField(field, p, rowCount);
      if (score >= 40) pairs.push({ field, profile: p, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);

  const usedField = new Set<string>();
  const usedCol = new Set<string>();
  const chosen = new Map<string, { field: TargetField; score: number }>();
  for (const { field, profile, score } of pairs) {
    if (usedField.has(field) || usedCol.has(profile.name)) continue;
    usedField.add(field); usedCol.add(profile.name);
    chosen.set(profile.name, { field, score });
  }

  return profiles.map((p) => {
    const hit = chosen.get(p.name);
    if (!hit) return { column: p.name, field: null, confidence: null, reason: 'Nessuna corrispondenza riconosciuta.' };
    return {
      column: p.name,
      field: hit.field,
      confidence: hit.score >= 80 ? 'alta' : hit.score >= 55 ? 'media' : 'bassa',
      reason: `Riconosciuta dal nome e dai valori (tipo ${p.kind}, ${p.filled}% piena, ${p.distinct} valori distinti).`,
    };
  });
}

/** Base deterministica + raffinamento AI quando disponibile. */
export async function buildProposal(
  profiles: ColumnProfile[], rowCount: number,
): Promise<{ proposal: FieldProposal[]; usedAi: boolean }> {
  const base = heuristicMapping(profiles, rowCount);
  const ai = await proposeMapping(profiles).catch(() => null);
  if (!ai) return { proposal: base, usedAi: false };

  // L'AI vince dove si esprime; dove tace resta la base — così il modello può
  // solo migliorare il risultato, mai peggiorarlo azzerando un riconoscimento
  // che il codice aveva già fatto.
  const byCol = new Map(base.map((b) => [b.column, b]));
  const usedField = new Set(ai.filter((a) => a.field).map((a) => a.field as string));
  const merged: FieldProposal[] = ai.map((a) => {
    if (a.field) return a;
    const fallback = byCol.get(a.column);
    return fallback && fallback.field && !usedField.has(fallback.field)
      ? (usedField.add(fallback.field), fallback)
      : a;
  });
  return { proposal: merged, usedAi: true };
}
