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
