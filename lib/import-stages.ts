// ---------------------------------------------------------------------------
// L'import come una catena di consegne.
//
// Il problema della pagina vecchia non era la mancanza di spiegazioni: erano
// troppe, tutte insieme, tutte allo stesso livello. Caricamento, mappatura,
// import, verifica, analisi convivevano nella stessa schermata, e due pulsanti
// diversi dicevano "AI" facendo cose che non c'entrano niente fra loro.
//
// Qui il lavoro è diviso come lo sarebbe in una stanza di persone, e ogni
// passaggio ha un responsabile con un nome:
//
//   ARCHIVISTA        apre i file e cataloga i fogli
//   JR DATA ANALYST   guarda le colonne di ogni foglio e propone che cosa sono
//   DATA SCIENTIST    legge tutti i fogli INSIEME, vede le trappole, chiede
//   CONTROLLO QUALITÀ importa e verifica che in archivio ci sia il file
//   ANALISTA          prende in mano il progetto finito
//
// Non è una metafora decorativa: è il motivo per cui una cosa sta prima e
// un'altra dopo. Un file sconclusionato lo capisce il data scientist, non
// l'archivista, e chiederglielo prima che le colonne siano lette non avrebbe
// senso. E soprattutto: si vede sempre a chi tocca adesso.
// ---------------------------------------------------------------------------

export type StageId = 'archivio' | 'colonne' | 'scienza' | 'qualita' | 'analisi';

export type StageState = 'done' | 'current' | 'todo' | 'skipped';

export type Stage = {
  id: StageId;
  /** Chi fa questo passaggio. */
  role: string;
  /** Che cosa fa, in una riga. */
  does: string;
  state: StageState;
  /** Che cosa è successo qui, quando è finito. */
  outcome?: string;
};

export type StageInput = {
  files: number;
  /** File caricati ma senza le scelte minime per essere importati. */
  incomplete: number;
  /** Pronti da importare, non ancora importati. */
  ready: number;
  imported: number;
  /** Righe in archivio adesso. */
  inArchive: number;
  /** Fogli importati con una mappatura poi cambiata: da rifare. */
  drifted: number;
  /** Il data scientist ha già letto i file in questa sessione. */
  readByScientist: boolean;
  /** C'è un caricamento in corso, o una scelta di fogli aperta. */
  working: boolean;
};

const N = (n: number) => n.toLocaleString('it-IT');

/**
 * A che punto è il lavoro.
 *
 * Una sola regola: c'è SEMPRE esattamente un passaggio corrente, e sta dove
 * c'è la prima cosa da fare. Senza, la pagina torna a essere un elenco di
 * possibilità in cui l'utente sceglie a caso.
 */
export function stages(input: StageInput): Stage[] {
  const {
    files, incomplete, ready, imported, inArchive, drifted, readByScientist, working,
  } = input;

  const list: Stage[] = [
    {
      id: 'archivio',
      role: 'Archivista',
      does: 'Apre i file e cataloga i fogli',
      state: 'todo',
      outcome: files ? `${files} fogli in archivio, righe grezze conservate` : undefined,
    },
    {
      id: 'colonne',
      role: 'Jr Data Analyst',
      does: 'Guarda le colonne di ogni foglio e propone che cosa sono',
      state: 'todo',
      outcome: files && !incomplete ? 'Tutti i fogli hanno le colonne assegnate' : undefined,
    },
    {
      id: 'scienza',
      role: 'Data Scientist',
      does: 'Legge tutti i fogli insieme, trova le trappole e chiede solo dove serve',
      state: 'todo',
      outcome: readByScientist ? 'File letti nel loro insieme' : undefined,
    },
    {
      id: 'qualita',
      role: 'Controllo qualità',
      does: 'Importa e verifica che in archivio ci sia quello che c’è nel file',
      state: 'todo',
      outcome: imported ? `${N(inArchive)} righe importate e verificabili riga per riga` : undefined,
    },
    {
      id: 'analisi',
      role: 'Analista',
      does: 'Prende in mano il progetto: grafici, insight, report',
      state: 'todo',
      outcome: undefined,
    },
  ];

  const at = (id: StageId) => list.find((s) => s.id === id)!;
  const markDoneUpTo = (id: StageId) => {
    for (const s of list) {
      if (s.id === id) break;
      s.state = 'done';
    }
  };

  // Il primo passaggio con qualcosa da fare è quello corrente.
  let current: StageId;
  if (working || files === 0) current = 'archivio';
  else if (incomplete > 0) current = 'colonne';
  else if (ready > 0 || drifted > 0) current = 'qualita';
  else if (imported === 0) current = 'colonne';
  else current = 'analisi';

  markDoneUpTo(current);
  at(current).state = 'current';

  // Il data scientist è un passaggio facoltativo: quando le colonne sono a
  // posto e non è stato interpellato, resta a disposizione invece che "da
  // fare". Dirgli "manca" quando non manca niente è il modo più rapido per
  // far ignorare anche gli avvisi veri.
  const sci = at('scienza');
  if (sci.state !== 'current' && !readByScientist && files > 0) {
    sci.state = current === 'archivio' || current === 'colonne' ? 'todo' : 'skipped';
  }
  if (readByScientist && sci.state === 'todo') sci.state = 'done';

  return list;
}

/** Il ruolo a cui tocca adesso. */
export function currentStage(list: Stage[]): Stage {
  return list.find((s) => s.state === 'current') ?? list[0];
}
