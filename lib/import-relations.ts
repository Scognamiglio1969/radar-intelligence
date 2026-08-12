import type { SheetDossier, SheetGroup } from '@/lib/import-agent';

// ---------------------------------------------------------------------------
// Come si parlano le tabelle fra loro.
//
// Davanti a un file con quaranta fogli, la prima domanda di chi sa leggere i
// dati non è "che cos'è questa colonna": è "come si incastrano queste tabelle".
// Da lì vengono le uniche tre cose che possono rovinare un'analisi senza che
// nessuno se ne accorga:
//
//   IL DOPPIO CONTEGGIO — due fogli che coprono lo stesso periodo e parlano
//   degli stessi soggetti, sommati insieme, raddoppiano tutto. Sono la stessa
//   misura vista due volte, non due misure;
//
//   LA SCALA — la stessa metrica scritta in migliaia in un foglio e per esteso
//   in un altro. Confrontarle mette un canale mille volte sopra gli altri, e
//   il grafico sembra perfetto;
//
//   IL LEGAME MANCATO — due tabelle che parlano delle stesse persone senza
//   dirlo. Tenerle separate non è un errore: è buttare via l'unica analisi
//   interessante che il file conteneva.
//
// Sono tutte deducibili dai numeri, senza chiedere niente a nessuno. Quello che
// serve al modello è vederle scritte.
// ---------------------------------------------------------------------------

export type Relation =
  | {
    kind: 'doppio-caricamento';
    a: string; b: string;
    note: string;
  }
  | {
    kind: 'stessi-soggetti';
    a: string; b: string;
    /** La colonna, in ciascuno dei due fogli, che contiene gli stessi valori. */
    column: string;
    shared: number;
    examples: string[];
    note: string;
  }
  | {
    kind: 'stesso-periodo';
    a: string; b: string;
    from: string; to: string;
    note: string;
  }
  | {
    kind: 'periodi-consecutivi';
    a: string; b: string;
    note: string;
  }
  | {
    kind: 'scala-diversa';
    a: string; b: string;
    column: string;
    ratio: number;
    note: string;
  };

/** Quanto due insiemi di etichette si sovrappongono, sul più piccolo dei due. */
function overlap(a: string[], b: string[]): { shared: string[]; ratio: number } {
  const norm = (s: string) => s.trim().toLowerCase();
  const setB = new Set(b.map(norm));
  const shared = a.filter((x) => setB.has(norm(x)));
  return { shared, ratio: shared.length / Math.max(1, Math.min(a.length, b.length)) };
}

const dateRange = (s: SheetDossier) => {
  const cols = (s.stats?.columns ?? []).filter((c) => c.from && c.to);
  if (!cols.length) return null;
  return {
    from: cols.map((c) => c.from!).sort()[0],
    to: cols.map((c) => c.to!).sort().reverse()[0],
  };
};

/**
 * Le relazioni fra i fogli di un progetto.
 *
 * Si confrontano a coppie, con un tetto: quaranta fogli fanno ottocento
 * coppie, e oltre un certo punto un elenco di relazioni smette di essere una
 * lettura e diventa rumore. Si tengono le più forti.
 */
export function sheetRelations(
  sheets: SheetDossier[], groups: SheetGroup[] = [], maxPairs = 400,
): Relation[] {
  const out: Relation[] = [];
  const withStats = sheets.filter((s) => s.stats);
  let pairs = 0;

  /**
   * Due fogli con le stesse colonne e lo stesso periodo sono un doppio
   * conteggio — a meno che il nome non dica che parlano di soggetti diversi.
   *
   * "Rilevazione LinkedIn" e "Rilevazione Instagram" hanno le stesse colonne e
   * gli stessi mesi perché sono due canali, non lo stesso dato due volte.
   * Gridare al duplicato lì invita a cancellare dati veri, ed è un danno
   * peggiore di quello che l'avviso voleva evitare.
   */
  const soggettiDiversi = new Set<string>();
  for (const g of groups) {
    if (!g.varyingPart) continue;
    for (const a of g.sheets) for (const b of g.sheets) if (a !== b) soggettiDiversi.add(`${a}|${b}`);
  }

  // Una coppia si guarda una volta sola, e due fogli si confrontano per NOME:
  // caricando due volte lo stesso file nascono due schede diverse con lo stesso
  // nome, e senza questo si finirebbe a confrontare un foglio con sé stesso.
  const visto = new Set<string>();

  for (let i = 0; i < withStats.length; i++) {
    for (let j = i + 1; j < withStats.length; j++) {
      if (++pairs > maxPairs) break;
      const a = withStats[i];
      const b = withStats[j];

      const coppia = [a.sheet, b.sheet].sort().join('|');
      if (visto.has(coppia)) continue;
      visto.add(coppia);

      // Stesso nome e stesse colonne: è lo stesso foglio caricato due volte.
      // È il caso più frequente di tutti — si ricarica il file per sicurezza —
      // ed è anche il più facile da non vedere, perché nella pagina i due
      // fogli si chiamano uguale. Ogni conto risulta doppio.
      if (a.sheet === b.sheet && a.signature === b.signature) {
        out.push({
          kind: 'doppio-caricamento', a: a.sheet, b: b.sheet,
          note: 'Lo stesso foglio risulta caricato due volte: importandoli entrambi ogni conto viene doppio. Tienine uno.',
        });
        continue;
      }

      // 1. Parlano degli stessi soggetti?
      for (const ca of a.stats!.columns) {
        if (!ca.values?.length) continue;
        const cb = b.stats!.columns.find((c) => c.name === ca.name && c.values?.length);
        if (!cb) continue;
        const { shared, ratio } = overlap(ca.values, cb.values!);
        // Metà dei valori in comune, e almeno due: sotto questa soglia è una
        // coincidenza (due fogli che contengono entrambi "Italia").
        if (ratio >= 0.5 && shared.length >= 2) {
          out.push({
            kind: 'stessi-soggetti', a: a.sheet, b: b.sheet, column: ca.name,
            shared: shared.length,
            examples: shared.slice(0, 4),
            note: `"${ca.name}" contiene gli stessi ${shared.length} valori in entrambi: le due tabelle si possono mettere in relazione.`,
          });
          break;
        }
      }

      // 2. Coprono lo stesso tempo, o tempi che si susseguono?
      const ra = dateRange(a);
      const rb = dateRange(b);
      if (ra && rb) {
        const sovrapposti = ra.from <= rb.to && rb.from <= ra.to;
        if (sovrapposti && a.signature === b.signature && !soggettiDiversi.has(`${a.sheet}|${b.sheet}`)) {
          out.push({
            kind: 'stesso-periodo', a: a.sheet, b: b.sheet,
            from: ra.from < rb.from ? ra.from : rb.from,
            to: ra.to > rb.to ? ra.to : rb.to,
            note: 'Stesse colonne e periodo sovrapposto: se sono la stessa misura vista due volte, sommarli raddoppia tutto.',
          });
        } else if (!sovrapposti && a.signature === b.signature) {
          out.push({
            kind: 'periodi-consecutivi', a: a.sheet, b: b.sheet,
            note: 'Stesse colonne e periodi che non si sovrappongono: è probabile che siano la stessa serie divisa per periodo, da mettere in fila.',
          });
        }
      }

      // 3. La stessa metrica, ma su scale diverse.
      for (const ca of a.stats!.columns) {
        if (ca.reads !== 'number' || !ca.median || ca.median <= 0) continue;
        const cb = b.stats!.columns.find((c) => c.name === ca.name);
        if (!cb || cb.reads !== 'number' || !cb.median || cb.median <= 0) continue;
        const ratio = ca.median > cb.median ? ca.median / cb.median : cb.median / ca.median;
        // Tre ordini di grandezza non è una differenza fra due canali: è
        // un'unità di misura diversa (migliaia contro unità).
        if (ratio >= 500) {
          out.push({
            kind: 'scala-diversa', a: a.sheet, b: b.sheet, column: ca.name,
            ratio: Math.round(ratio),
            note: `"${ca.name}" ha valori ${Math.round(ratio)} volte più grandi in un foglio che nell'altro: quasi sempre è la stessa cosa scritta in unità diverse.`,
          });
          break;
        }
      }
    }
    if (pairs > maxPairs) break;
  }

  // Le più informative per prime, e senza inondare: dodici relazioni sono già
  // un quadro, cinquanta sono un elenco che nessuno legge.
  const rank: Record<Relation['kind'], number> = {
    'doppio-caricamento': 0, 'scala-diversa': 1, 'stesso-periodo': 2,
    'stessi-soggetti': 3, 'periodi-consecutivi': 4,
  };
  return out.sort((x, y) => rank[x.kind] - rank[y.kind]).slice(0, 12);
}
