import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { importFiles } from '@/lib/db/schema';
import { callClaudeDetailed, MODELS, type AiFailure } from '@/lib/claude';
import type { ColumnProfile } from '@/lib/import-profile';
import type { MetricMap } from '@/lib/import-metrics';
import { sheetStats, type SheetStats } from '@/lib/import-stats';
import { sheetRelations, type Relation } from '@/lib/import-relations';

// ---------------------------------------------------------------------------
// L'agente che legge il file.
//
// La mappatura colonna per colonna sa rispondere a "che cos'è questa colonna?".
// Non sa rispondere a "che cos'è questo file?" — e su una cartella da
// quarantatré fogli è quella la domanda che conta: otto fogli con le stesse
// colonne e nomi di persona diversi non sono otto tabelle, sono una tabella
// sola divisa per manager. Trattarli separatamente non è un errore di
// mappatura: è perdere l'unica cosa interessante che il file aveva da dire.
//
// L'agente lavora in tre strati, e la divisione è deliberata:
//
//   1. il DOSSIER — quello che si sa senza chiedere niente a nessuno: forme,
//      firme delle colonne, fogli che si somigliano. È deterministico, è
//      verificabile, e non costa una chiamata;
//   2. la LETTURA — che cosa significa, e soprattutto DOVE la risposta non è
//      ovvia. Qui serve il modello, e vede solo il dossier: mai le righe;
//   3. le AZIONI — quello che una risposta cambia davvero. Sono un elenco
//      chiuso: il modello sceglie fra quelle, non ne inventa. Un agente che
//      esegue istruzioni scritte da sé è un agente di cui non ci si può fidare.
// ---------------------------------------------------------------------------

export type SheetDossier = {
  fileId: number;
  /** Il file caricato da cui viene: "database.xlsx". */
  origin: string;
  /** Il foglio dentro quel file: "BOREAN_mensile". */
  sheet: string;
  rows: number;
  kind: 'mentions' | 'metrics';
  archetype: string | null;
  status: string;
  columns: string[];
  /** La firma delle colonne: due fogli con la stessa firma sono la stessa tabella. */
  signature: string;
  profiles: { name: string; kind: string; filled: number; distinct: number; samples: string[] }[];
  mapped: boolean;
  /** Le distribuzioni vere, lette dalle righe: il materiale su cui si ragiona. */
  stats?: SheetStats;
};

export type SheetGroup = {
  signature: string;
  sheets: string[];
  columns: string[];
  /** I nomi dei fogli differiscono per una parte sola: probabilmente è il soggetto. */
  varyingPart: string[] | null;
};

export type Dossier = {
  projectId: number;
  sheets: SheetDossier[];
  groups: SheetGroup[];
  /** Come si parlano le tabelle fra loro: dove si duplicano, dove si legano. */
  relations: Relation[];
  totalRows: number;
};

/** Firma di un foglio: le sue colonne, normalizzate e ordinate. */
function signatureOf(columns: string[]): string {
  return columns.map((c) => c.trim().toLowerCase()).sort().join('|');
}

/**
 * La parte che varia fra i nomi di un gruppo di fogli.
 *
 * "BOREAN_mensile", "DONNET_mensile", "GURTLER_mensile" → Borean, Donnet,
 * Gurtler. È il soggetto della tabella, e nel file non sta in nessuna colonna:
 * sta nel nome del foglio, dove nessun import lo cerca.
 */
export function varyingParts(names: string[]): string[] | null {
  if (names.length < 2) return null;
  const parts = names.map((n) => n.split(/[\s_\-–—]+/).filter(Boolean));
  if (parts.some((p) => p.length !== parts[0].length)) {
    // Lunghezze diverse: si ripiega sul prefisso/suffisso comune.
    const common = (a: string, b: string) => {
      let i = 0;
      while (i < a.length && i < b.length && a[i].toLowerCase() === b[i].toLowerCase()) i++;
      return a.slice(0, i);
    };
    const pre = names.reduce(common);
    const rest = names.map((n) => n.slice(pre.length).replace(/^[\s_\-–—]+/, '').trim());
    return rest.every((r) => r.length > 1) && new Set(rest).size === rest.length ? rest : null;
  }
  // Stessa struttura: si tiene la posizione in cui i nomi differiscono tutti.
  for (let i = 0; i < parts[0].length; i++) {
    const col = parts.map((p) => p[i]);
    if (new Set(col.map((c) => c.toLowerCase())).size === names.length) return col;
  }
  return null;
}

/** "BOREAN" → "Borean", "gruppo fs" → "Gruppo FS": il valore finisce nei grafici. */
function prettyName(raw: string): string {
  const s = raw.replace(/[_\-]+/g, ' ').trim();
  if (!s) return raw;
  if (s === s.toUpperCase() && s.length > 3) {
    return s.toLowerCase().replace(/(^|\s)(\w)/g, (_, a, b) => a + b.toUpperCase());
  }
  return s;
}

/**
 * Quello che si sa del progetto senza chiedere niente a nessuno.
 *
 * Con `deep` legge anche le distribuzioni di ogni colonna dalle righe in
 * archivio: costa qualche secondo, e trasforma la lettura da un'interpretazione
 * di nomi in un ragionamento su numeri.
 */
export async function buildDossier(projectId: number, deep = false): Promise<Dossier> {
  const db = await getDb();
  const rows = await db.select().from(importFiles).where(eq(importFiles.projectId, projectId));

  const sheets: SheetDossier[] = rows.map((r) => {
    const profiles = (r.profiles ?? []) as ColumnProfile[];
    const columns = (r.columns ?? []) as string[];
    const metricMap = r.metricMap as MetricMap | null;
    return {
      fileId: r.id,
      origin: r.filename.split(' › ')[0].trim(),
      sheet: r.sheetName ?? r.filename,
      rows: r.rowCount,
      kind: r.kind as 'mentions' | 'metrics',
      archetype: r.archetype ?? null,
      status: r.status,
      columns,
      signature: signatureOf(columns),
      profiles: profiles.slice(0, 40).map((p) => ({
        name: p.name, kind: p.kind, filled: p.filled, distinct: p.distinct,
        samples: (p.samples ?? []).slice(0, 3).map((s) => String(s).slice(0, 80)),
      })),
      mapped: r.kind === 'metrics'
        ? Boolean(metricMap?.date && (metricMap?.metrics?.length ?? 0) > 0)
        : Boolean((r.mapping as Record<string, string>)?.content),
    };
  });

  const bySig = new Map<string, SheetDossier[]>();
  for (const s of sheets) {
    if (!s.columns.length) continue;
    (bySig.get(s.signature) ?? bySig.set(s.signature, []).get(s.signature)!).push(s);
  }
  const groups: SheetGroup[] = [...bySig.values()]
    .filter((g) => g.length > 1)
    .map((g) => ({
      signature: g[0].signature,
      sheets: g.map((s) => s.sheet),
      columns: g[0].columns,
      varyingPart: varyingParts(g.map((s) => s.sheet)),
    }))
    .sort((a, b) => b.sheets.length - a.sheets.length);

  if (deep) {
    // In parallelo a blocchi: quaranta fogli uno dopo l'altro sarebbero minuti.
    for (let i = 0; i < sheets.length; i += 6) {
      const chunk = sheets.slice(i, i + 6);
      const got = await Promise.all(chunk.map((s) => sheetStats(s.fileId).catch(() => undefined)));
      chunk.forEach((s, j) => { s.stats = got[j]; });
    }
  }

  return {
    projectId,
    sheets,
    groups,
    relations: deep ? sheetRelations(sheets, groups) : [],
    totalRows: sheets.reduce((n, s) => n + s.rows, 0),
  };
}

// --- Le azioni: elenco chiuso ----------------------------------------------

/**
 * Quello che una risposta può cambiare.
 *
 * Il modello sceglie fra queste e ne compila i parametri; il server esegue
 * solo queste. Un agente che si scrive da sé le istruzioni da eseguire è un
 * agente di cui non ci si può fidare, e su dati di un cliente non è un rischio
 * teorico.
 */
export type AgentAction =
  /** Leggere questi fogli come contenuti o come misure. */
  | { do: 'kind'; sheets: string[]; kind: 'mentions' | 'metrics' }
  /** Il nome del foglio è il soggetto: diventa un campo su ogni riga. */
  | { do: 'entityFromSheet'; sheets: string[]; label: string }
  /** Quale colonna è la data di pubblicazione. */
  | { do: 'dateColumn'; sheets: string[]; column: string }
  /** Quale colonna è il testo del contenuto. */
  | { do: 'contentColumn'; sheets: string[]; column: string }
  /** Questo foglio non è dati: non importarlo. */
  | { do: 'skip'; sheets: string[] }
  /** Va bene così: nessun cambiamento. */
  | { do: 'nothing' };

export type AgentQuestion = {
  id: string;
  /** La domanda, in italiano, con i nomi veri dei fogli e delle colonne. */
  text: string;
  /** Perché la risposta cambia qualcosa: senza, è una domanda burocratica. */
  why: string;
  options: { id: string; label: string; effect: string; action: AgentAction }[];
  /** L'opzione che l'agente consiglia: si risponde con un clic, non si studia. */
  recommended: string;
  sheets: string[];
};

export type AgentReading = {
  /** Che cos'è questo file, in due o tre frasi. */
  summary: string;
  /** Una riga per foglio: che cosa contiene davvero. */
  sheets: { sheet: string; what: string }[];
  questions: AgentQuestion[];
};

const SYSTEM = `Sei un analista di dati che riceve la SCHEDA TECNICA di un file appena caricato in
un'applicazione di media intelligence (Radar). Non vedi le righe: vedi i fogli, le colonne, il tipo
di ogni colonna, quanto è piena, quanti valori distinti ha e tre valori di esempio.

Leggi la scheda come la leggerebbe un analista esperto, cioè guardando i NUMERI e non i nomi:

- "non_cala_mai" vuol dire che nell'ordine in cui sono scritte le righe i valori non calano mai.
  Su una serie storica è il segno di un TOTALE CUMULATO (i follower che uno HA): sommarlo fra
  periodi lo raddoppia, va preso l'ultimo valore. Ma è un indizio, non una prova: su un elenco
  ordinato per data può essere una coincidenza. Guarda anche l'ordine di grandezza — un totale sta
  su una scala diversa dall'incremento che lo alimenta ("Follower" mediana 5468 accanto a "Nuovi
  follower" mediana 70 dice tutto).
- "sembra_un_tasso" (valori con decimali fra 0 e 1 o fra 0 e 100) vuol dire che è una media o una
  percentuale: sommarla non significa niente, va mediata.
- "tutti_i_valori_diversi" è un fatto, non una conclusione: anche "Mi piace" ha sessanta valori
  diversi su sessanta post. Su una colonna di testo o di codici lunghi è un identificativo tecnico
  e non va messo in un grafico; su una colonna numerica in una scala plausibile è solo una misura.
- "sempre_uguale" vuol dire che la colonna non distingue niente DENTRO il foglio, ma spesso dice
  che cos'è il foglio (il canale, il mese, la campagna).
- "ogni: mensile" con poche righe è una serie storica aggregata; "ogni: giornaliera" con molte
  righe e una colonna di testo lunga è un elenco di pubblicazioni.
- "attenzione_riga_di_totali" vuol dire che l'ultima riga è probabilmente la somma delle altre:
  importarla raddoppia ogni conto. Se c'è, dillo e proponi di toglierla.
- "zeri" alti su una colonna dove lo zero è implausibile (impression, copertura) vuol dire che il
  foglio scrive 0 dove il dato manca: va detto, perché falsa ogni media.
- Colonne quasi vuote, duplicati, date che coprono un periodo diverso dagli altri fogli: se
  cambiano il modo di leggere il file, dillo.

Nella sezione "COME SI PARLANO LE TABELLE" trovi le relazioni fra i fogli, già calcolate. Sono le
tre cose che rovinano un'analisi senza che nessuno se ne accorga, e vanno dette per prime:
- "doppio-caricamento": lo stesso foglio risulta caricato due volte. Ogni conto viene doppio, e
  nella pagina i due fogli si chiamano uguale, quindi non si nota. Dillo per primo e proponi di
  toglierne uno.
- "scala-diversa": la stessa metrica scritta in unità diverse in due fogli. Confrontarli mette un
  canale mille volte sopra gli altri e il grafico sembra perfetto. È l'avviso più urgente.
- "stesso-periodo": due fogli con le stesse colonne che coprono lo stesso tempo. Se sono la stessa
  misura vista due volte, sommarli raddoppia tutto.
- "periodi-consecutivi": la stessa serie divisa per periodo, da mettere in fila.
- "stessi-soggetti": due tabelle che parlano delle stesse persone o degli stessi canali. Tenerle
  separate butta via l'analisi più interessante che il file conteneva: dillo, e proponi di
  marcare il soggetto.

Il tuo compito è DOPPIO:

1. CAPIRE. Scrivi che cos'è il file nel suo insieme (2-3 frasi) e una riga per ogni foglio. Nella
   riga di un foglio di' la GRANULARITÀ (una riga per cosa: per post? per manager per mese?) e il
   periodo coperto, quando si vedono.
   Se più fogli hanno le stesse colonne, dillo: quasi sempre sono la stessa tabella divisa per
   soggetto (una persona, un canale, un mese), e il soggetto sta nel NOME del foglio.

2. CHIEDERE, ma solo dove la risposta cambia davvero il risultato. Ogni domanda deve essere
   inutile da fare se la risposta è ovvia. Massimo 4 domande. Ogni domanda ha 2-3 opzioni
   concrete, e una consigliata.

Le domande possibili sono SOLO queste, con questi effetti:
- "kind": leggere certi fogli come CONTENUTI (righe con un testo: post, articoli) o come MISURE
  (serie di numeri nel tempo: follower, impression). Chiedila quando un foglio ha sia una colonna
  di testo lunga sia molte colonne numeriche, e la scelta non è evidente.
- "entityFromSheet": i nomi dei fogli di un gruppo contengono il soggetto (un manager, un canale).
  Chiedi se vuoi che quel nome diventi un campo su ogni riga, così i grafici possono confrontarli.
  Proponi tu l'etichetta del campo (es. "Manager", "Canale", "Mese").
- "dateColumn": ci sono più colonne che sembrano date e non è chiaro quale sia quella di
  pubblicazione.
- "contentColumn": ci sono più colonne di testo lungo e non è chiaro quale sia il contenuto.
- "skip": un foglio non contiene dati (legenda, istruzioni, appunti) e importarlo sporcherebbe il
  progetto.

REGOLE FERREE
- Usa SOLO nomi di fogli e di colonne che ti sono stati dati, scritti esattamente così.
- Non inventare colonne, valori o significati che i dati non mostrano.
- Scrivi in italiano, parlando a chi ha caricato il file: niente gergo tecnico, niente "dataset".
- Quando affermi qualcosa, deve poggiare su un dato della scheda: "non cala mai, quindi è un
  totale" è una lettura; "sembra un totale" è un'opinione.
- Se non c'è niente di ambiguo, restituisci "questions": []. Una domanda inutile fa perdere
  fiducia in tutte le altre.

Rispondi SOLO con questo JSON:
{
  "summary": "...",
  "sheets": [{ "sheet": "nome esatto", "what": "una riga" }],
  "questions": [{
    "id": "q1",
    "text": "...",
    "why": "...",
    "sheets": ["nome esatto", "..."],
    "recommended": "a",
    "options": [
      { "id": "a", "label": "...", "effect": "...",
        "action": { "do": "entityFromSheet", "sheets": ["..."], "label": "Manager" } },
      { "id": "b", "label": "...", "effect": "...", "action": { "do": "nothing" } }
    ]
  }]
}`;

/**
 * Il dossier ridotto a quello che serve al modello.
 *
 * Non nomi ed esempi, ma EVIDENZA: estremi, mediana, monotonia, cadenza delle
 * date, zeri, colonne chiave, righe di totale. È la differenza fra chiedere
 * "che cosa sarà mai questa colonna" e far leggere quello che i numeri fanno.
 */
/**
 * Quanti fogli e quante colonne stanno in una richiesta.
 *
 * Una cartella da cinquantasei fogli per quaranta colonne produce centinaia di
 * migliaia di caratteri: la richiesta o viene rifiutata o non torna in tempo, e
 * all'utente arriva "non disponibile" senza sapere perché. Meglio leggerne una
 * parte rappresentativa e DIRE che è una parte.
 */
const MAX_SHEETS = 24;
const MAX_COLUMNS = 24;

function brief(d: Dossier): string {
  const col = (c: NonNullable<SheetDossier['stats']>['columns'][number]) => ({
    nome: c.name,
    contiene: c.reads,
    pieno: `${c.filled}%`,
    distinti: c.distinct,
    ...(c.unique ? { tutti_i_valori_diversi: true } : {}),
    ...(c.constant !== null ? { sempre_uguale: c.constant } : {}),
    ...(c.min !== undefined ? { min: c.min, max: c.max, mediana: c.median } : {}),
    ...(c.zeros ? { zeri: c.zeros } : {}),
    ...(c.monotonic ? { non_cala_mai: true } : {}),
    ...(c.looksLikeRate ? { sembra_un_tasso: true } : {}),
    ...(c.from ? { dal: c.from, al: c.to, ogni: c.cadence } : {}),
    ...(c.avgLength ? { lunghezza_media_testo: c.avgLength } : {}),
    esempi: c.samples,
  });

  // Si tengono i fogli più informativi: quelli con più righe, e comunque un
  // rappresentante per ogni gruppo — un gruppo di venti fogli identici si
  // capisce guardandone uno.
  const seen = new Set<string>();
  const ordered = [...d.sheets].sort((a, b) => b.rows - a.rows);
  const picked: SheetDossier[] = [];
  for (const s of ordered) {
    const first = !seen.has(s.signature);
    seen.add(s.signature);
    if (first || picked.length < MAX_SHEETS) picked.push(s);
    if (picked.length >= MAX_SHEETS) break;
  }
  const omitted = d.sheets.length - picked.length;

  const sheets = picked.map((s) => ({
    foglio: s.sheet,
    file: s.origin,
    righe: s.rows,
    letto_come: s.kind === 'metrics' ? 'misure' : 'contenuti',
    ...(s.stats?.key ? { colonna_che_identifica_la_riga: s.stats.key } : {}),
    ...(s.stats?.duplicates ? { righe_duplicate: s.stats.duplicates } : {}),
    ...(s.stats?.totalRow ? { attenzione_riga_di_totali: s.stats.totalRow.evidence } : {}),
    ...(s.columns.length > MAX_COLUMNS ? { colonne_totali: s.columns.length } : {}),
    colonne: s.stats
      ? s.stats.columns.slice(0, MAX_COLUMNS).map(col)
      : s.profiles.slice(0, MAX_COLUMNS).map((p) => ({
        nome: p.name, contiene: p.kind, pieno: `${p.filled}%`,
        distinti: p.distinct, esempi: p.samples,
      })),
  }));
  const groups = d.groups.map((g) => ({
    fogli_con_le_stesse_colonne: g.sheets,
    la_parte_che_cambia_nel_nome: g.varyingPart,
  }));
  const relazioni = d.relations.map((r) => ({ fra: [r.a, r.b], che_cosa: r.kind, nota: r.note }));

  const note = omitted > 0
    ? `\n\nNOTA: ti ho dato ${picked.length} fogli su ${d.sheets.length}; gli altri hanno le stesse colonne di uno di questi. Non parlare dei fogli che non hai visto.`
    : '';
  return `FOGLI:\n${JSON.stringify(sheets, null, 1)}`
    + `\n\nGRUPPI:\n${JSON.stringify(groups, null, 1)}`
    + (relazioni.length ? `\n\nCOME SI PARLANO LE TABELLE:\n${JSON.stringify(relazioni, null, 1)}` : '')
    + note;
}

const ACTIONS = new Set(['kind', 'entityFromSheet', 'dateColumn', 'contentColumn', 'skip', 'nothing']);

/**
 * Valida la lettura contro il dossier.
 *
 * Vale qui la regola di tutto l'import: l'AI propone, i dati validano. Un
 * foglio che non esiste, una colonna inventata o un'azione fuori elenco non
 * arrivano all'utente — non come avviso, proprio non arrivano.
 */
export function validateReading(raw: unknown, d: Dossier): AgentReading {
  const r = (raw ?? {}) as Partial<AgentReading>;
  const knownSheets = new Set(d.sheets.map((s) => s.sheet));
  const columnsOf = new Map(d.sheets.map((s) => [s.sheet, new Set(s.columns)]));

  const okAction = (a: AgentAction | undefined): a is AgentAction => {
    if (!a || typeof a !== 'object' || !ACTIONS.has((a as AgentAction).do)) return false;
    if (a.do === 'nothing') return true;
    if (!Array.isArray(a.sheets) || !a.sheets.length) return false;
    if (!a.sheets.every((s) => knownSheets.has(s))) return false;
    if (a.do === 'kind') return a.kind === 'mentions' || a.kind === 'metrics';
    if (a.do === 'entityFromSheet') return typeof a.label === 'string' && a.label.trim().length > 0;
    if (a.do === 'dateColumn' || a.do === 'contentColumn') {
      return typeof a.column === 'string'
        && a.sheets.every((s) => columnsOf.get(s)?.has(a.column));
    }
    return true;
  };

  const questions = (Array.isArray(r.questions) ? r.questions : [])
    .slice(0, 4)
    .map((q, i): AgentQuestion | null => {
      const options = (Array.isArray(q.options) ? q.options : [])
        .filter((o) => o && typeof o.label === 'string' && okAction(o.action))
        .slice(0, 3)
        .map((o, j) => ({
          id: String(o.id ?? String.fromCharCode(97 + j)),
          label: String(o.label).slice(0, 120),
          effect: String(o.effect ?? '').slice(0, 200),
          action: o.action,
        }));
      // Una domanda con una sola risposta possibile non è una domanda.
      if (options.length < 2 || typeof q.text !== 'string') return null;
      const sheets = (Array.isArray(q.sheets) ? q.sheets : []).filter((s) => knownSheets.has(s));
      return {
        id: String(q.id ?? `q${i + 1}`),
        text: String(q.text).slice(0, 400),
        why: String(q.why ?? '').slice(0, 300),
        sheets,
        options,
        recommended: options.some((o) => o.id === q.recommended) ? String(q.recommended) : options[0].id,
      };
    })
    .filter((q): q is AgentQuestion => q !== null);

  return {
    summary: String(r.summary ?? '').slice(0, 1200),
    sheets: (Array.isArray(r.sheets) ? r.sheets : [])
      .filter((s) => s && knownSheets.has(s.sheet))
      .map((s) => ({ sheet: s.sheet, what: String(s.what ?? '').slice(0, 300) })),
    questions,
  };
}

/** Legge il file: che cos'è, e dove serve una decisione. */
export async function readFile(
  d: Dossier,
): Promise<{ reading: AgentReading } | { failure: AiFailure }> {
  if (!d.sheets.length) {
    return { failure: { why: 'empty', message: 'Non c’è ancora nessun foglio da leggere.' } };
  }
  const payload = brief(d);
  const { text, failure } = await callClaudeDetailed(
    MODELS.sonnet, 'import_agent', SYSTEM, payload, 3000, false, 240_000,
  );
  if (!text) {
    return {
      failure: failure ?? { why: 'empty', message: 'Il modello non ha risposto.' },
    };
  }
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return { failure: { why: 'empty', message: 'La risposta del modello non era leggibile. Riprova.' } };
  }
  try {
    return { reading: validateReading(JSON.parse(text.slice(start, end + 1)), d) };
  } catch {
    return { failure: { why: 'empty', message: 'La risposta del modello non era leggibile. Riprova.' } };
  }
}

// --- Eseguire una risposta -------------------------------------------------

export type ApplyResult = { changed: number; note: string };

/** Esegue l'azione scelta. Solo queste, e solo sui fogli di questo progetto. */
export async function applyAction(
  projectId: number, action: AgentAction,
): Promise<ApplyResult> {
  if (action.do === 'nothing') return { changed: 0, note: 'Niente da cambiare.' };

  const db = await getDb();
  const d = await buildDossier(projectId);
  const targets = d.sheets.filter((s) => action.sheets.includes(s.sheet));
  if (!targets.length) return { changed: 0, note: 'Nessun foglio corrispondente.' };

  const { updateKind, updateMapping, updateMetricMap, deleteFile } =
    await import('@/lib/import-store');

  let changed = 0;
  for (const t of targets) {
    switch (action.do) {
      case 'kind':
        if (t.kind !== action.kind) { await updateKind(t.fileId, projectId, action.kind); changed++; }
        break;

      case 'entityFromSheet': {
        // Il soggetto sta nel nome del foglio e in nessuna colonna: diventa un
        // campo costante, scritto su ogni riga derivata da questo foglio.
        const parts = varyingParts(targets.map((x) => x.sheet));
        const value = (parts?.[targets.indexOf(t)] ?? t.sheet).trim();
        const label = action.label.trim().slice(0, 40);
        await db.update(importFiles)
          .set({ constants: { ...((await db.select().from(importFiles)
            .where(and(eq(importFiles.id, t.fileId), eq(importFiles.projectId, projectId))))[0]?.constants ?? {}),
            [label]: prettyName(value) } })
          .where(and(eq(importFiles.id, t.fileId), eq(importFiles.projectId, projectId)));
        changed++;
        break;
      }

      case 'dateColumn': {
        const row = await db.select().from(importFiles)
          .where(and(eq(importFiles.id, t.fileId), eq(importFiles.projectId, projectId)));
        if (!row[0]) break;
        if (t.kind === 'metrics') {
          const mm = { ...(row[0].metricMap ?? {}) } as MetricMap;
          mm.date = action.column;
          await updateMetricMap(t.fileId, projectId, mm as Record<string, unknown>);
        } else {
          const map = { ...(row[0].mapping ?? {}) } as Record<string, string>;
          map.date = action.column;
          await updateMapping(t.fileId, projectId, map);
        }
        changed++;
        break;
      }

      case 'contentColumn': {
        const row = await db.select().from(importFiles)
          .where(and(eq(importFiles.id, t.fileId), eq(importFiles.projectId, projectId)));
        if (!row[0]) break;
        const map = { ...(row[0].mapping ?? {}) } as Record<string, string>;
        map.content = action.column;
        await updateMapping(t.fileId, projectId, map);
        changed++;
        break;
      }

      case 'skip':
        await deleteFile(t.fileId, projectId);
        changed++;
        break;
    }
  }

  const what: Record<string, string> = {
    kind: `Letti come ${action.do === 'kind' && action.kind === 'metrics' ? 'misure' : 'contenuti'}`,
    entityFromSheet: 'Il nome del foglio diventa un campo su ogni riga',
    dateColumn: 'Colonna della data assegnata',
    contentColumn: 'Colonna del testo assegnata',
    skip: 'Fogli tolti dal progetto',
  };
  return { changed, note: `${what[action.do] ?? 'Fatto'}: ${changed} fogli.` };
}
