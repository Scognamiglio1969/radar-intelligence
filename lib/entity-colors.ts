/**
 * Palette categorica delle entità di benchmark. Vive fuori da components/charts.tsx
 * perché quel file è 'use client': una funzione esportata da lì non è
 * richiamabile da un componente server (la pagina Benchmark lo è).
 *
 * Otto tinte in ordine FISSO. L'ordine non è estetico: è il meccanismo che
 * garantisce la distinguibilità anche con un deficit di visione dei colori.
 * Validate contro la superficie reale dei pannelli (#10172e) — banda di
 * luminosità, soglia di croma, separazione CVD (peggior coppia adiacente
 * ΔE 8.4) e contrasto ≥ 3:1: tutte superate.
 *
 * Oltre l'ottava entità NON si ricicla la palette: due concorrenti dello
 * stesso colore sono peggio di nessun colore (con 12 entità comparivano AON e
 * Cohere Health entrambi rossi, Marsh McLennan e Previmedical entrambi blu).
 * Le eccedenze prendono il grigio neutro e, nei grafici, si accorpano.
 */
export const ENTITY_COLORS = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];

export const OVERFLOW_COLOR = '#64748b';

/** Colore di un'entità per POSIZIONE STABILE (ordine di creazione), non per
 *  rango: un filtro che cambia la classifica non deve ricolorare chi resta. */
export const entityColor = (i: number): string => ENTITY_COLORS[i] ?? OVERFLOW_COLOR;

// ---------------------------------------------------------------------------
// Le palette di Studio Graph.
//
// Non sono "temi" estetici: sono i tre MESTIERI che il colore può fare, e la
// scelta giusta dipende dalla domanda, non dal gusto.
//
// Una nota che vale più di tutte: la palette categorica è validata NELL'ORDINE
// in cui è scritta. Riordinarla la rompe — le stesse otto tinte in ordine
// diverso mettono vicini rosa e verde, che per un daltonico deuteranope
// distano ΔE 1,6, cioè sono lo stesso colore. Per questo non esiste
// un'opzione "cambia ordine": sarebbe un modo silenzioso di rendere il
// grafico illeggibile a una persona su dodici.
// ---------------------------------------------------------------------------

export type PaletteId = 'categorical' | 'sequential' | 'diverging';

export const PALETTES: Record<PaletteId, {
  label: string; use: string; colors: string[];
}> = {
  categorical: {
    label: 'Identità',
    use: 'Serie diverse fra loro: canali, persone, temi. Il colore dice CHI, non quanto.',
    colors: ENTITY_COLORS,
  },
  sequential: {
    label: 'Intensità',
    use: 'Una sola grandezza che cresce: classifiche, volumi. Dal chiaro allo scuro.',
    colors: ['#c6e0f9', '#a3cbf4', '#7fb5ef', '#5c9fea', '#3987e5', '#2e6bb0'],
  },
  diverging: {
    label: 'Polarità',
    use: 'Qualcosa che ha due versi opposti attorno a uno zero: sentiment, variazioni.',
    colors: ['#d24b3f', '#e0836f', '#94a3b8', '#5bb98c', '#199e70'],
  },
};

/** Il colore di una serie dentro una palette, senza mai ciclare le tinte. */
export function paletteColor(palette: PaletteId, i: number, total = 1): string {
  const c = PALETTES[palette].colors;
  if (palette === 'categorical') return c[i] ?? OVERFLOW_COLOR;
  // Le rampe si campionano sull'intera estensione: con tre serie si prendono
  // il primo, il centrale e l'ultimo, non i primi tre passi quasi identici.
  if (total <= 1) return c[Math.floor(c.length / 2)];
  const pos = Math.round((i / (total - 1)) * (c.length - 1));
  return c[Math.min(c.length - 1, Math.max(0, pos))];
}
