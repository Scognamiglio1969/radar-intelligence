import { cookies } from 'next/headers';
import { DICT, DEFAULT_LOCALE, localeTag, type Locale } from '@/lib/i18n-dict';

// Parte SERVER della doppia lingua (legge i cookie). Il dizionario e gli helper
// condivisi stanno in i18n-dict.ts, così possono usarli anche i componenti client.
export * from '@/lib/i18n-dict';

export async function getLocale(): Promise<Locale> {
  const v = (await cookies()).get('sr_locale')?.value;
  return v === 'it' ? 'it' : DEFAULT_LOCALE;
}

/** Traduttore per i componenti server. La chiave non tradotta resta in inglese. */
export async function getT(): Promise<(key: string, fallback: string) => string> {
  const locale = await getLocale();
  const dict = DICT[locale];
  return (key: string, fallback: string) => dict[key] ?? fallback;
}

declare global {
  // eslint-disable-next-line no-var
  var __srLocaleTag: string | undefined;
}

/** Imposta il tag locale per la formattazione date lato server (letto da fmtDate). */
export function setServerLocaleTag(locale: Locale) {
  globalThis.__srLocaleTag = localeTag(locale);
}
