import { getMeta, setMeta } from '@/lib/db';

// Lingua dei CONTENUTI generati dall'AI (brief, narratives, trend, ecc.).
// Distinta dalla lingua dell'interfaccia (Fase 2). Impostazione a livello app:
// così anche la generazione lato server (cron, senza utente) sa in che lingua
// scrivere. Default inglese. NON tocca l'analisi dei dati (sentiment, topic,
// espansione semantica): quella resta agnostica alla lingua e guidata dalle
// keyword, per non alterare la base dati.
export type ContentLocale = 'en' | 'it';

const NAMES: Record<ContentLocale, string> = { en: 'English', it: 'Italian' };

export async function getContentLocale(): Promise<ContentLocale> {
  const v = await getMeta<string>('content_locale');
  return v === 'it' ? 'it' : 'en';
}

export async function setContentLocale(locale: ContentLocale): Promise<void> {
  await setMeta('content_locale', locale === 'it' ? 'it' : 'en');
}

/**
 * Direttiva da appendere al system prompt dei generatori rivolti all'utente.
 * Traduce SOLO il testo leggibile; lascia in inglese chiavi JSON e valori enum
 * (sentiment, stance, quadranti…) così il parsing e la logica non si rompono.
 */
export function localeDirective(locale: ContentLocale): string {
  if (locale === 'en') return '';
  return `\n\nIMPORTANT: Write every human-readable text value — titles, descriptions, summaries, explanations, narratives, answers — in ${NAMES[locale]}. Keep all JSON keys and controlled enum/category values (sentiment labels, stance, quadrant names, risk levels, etc.) exactly in English.`;
}
