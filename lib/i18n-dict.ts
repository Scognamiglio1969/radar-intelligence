
// ---------------------------------------------------------------------------
// Doppia lingua EN/IT.
//
// Due piani distinti, di proposito:
//  - INTERFACCIA: dizionario qui sotto, scelto dal cookie sr_locale (per utente).
//  - CONTENUTI generati dall'AI: lib/content-locale.ts (impostazione dell'app,
//    perché anche il cron deve sapere in che lingua scrivere).
// La bandierina cambia entrambi.
//
// Ciò che NON si tocca mai: le mention raccolte, i topic, il sentiment e la
// ricerca semantica. Nascono dalle keyword del progetto e restano nella lingua
// d'origine — la lingua dell'interfaccia non deve alterare la base dati.
// ---------------------------------------------------------------------------

export type Locale = 'en' | 'it';
export const LOCALES: { code: Locale; flag: string; label: string }[] = [
  { code: 'en', flag: '🇬🇧', label: 'English' },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
];

/** Inglese = default (com'è oggi, e com'è il README open source). */
export const DEFAULT_LOCALE: Locale = 'en';

/** Traduzioni: solo le stringhe italiane. Manca una chiave → resta l'inglese. */
const IT: Record<string, string> = {
  // ── Navigazione
  'nav.monitor': 'Monitoraggio',
  'nav.analyze': 'Analisi',
  'nav.interpret': 'Interpretazione',
  'nav.create': 'Produzione',
  'nav.setup': 'Configurazione',
  'nav.dashboard': 'Dashboard',
  'nav.listening': 'Ascolto',
  'nav.media': 'Media',
  'nav.alerts': 'Allerte',
  'nav.changes': 'Cosa è cambiato',
  'nav.audience': 'Pubblico',
  'nav.benchmark': 'Benchmark',
  'nav.content': 'Contenuti top',
  'nav.messages': 'Ripresa dei messaggi',
  'nav.emv': 'Valore media',
  'nav.insights': 'Esplora gli insight',
  'nav.pov': 'Point of View',
  'nav.narratives': 'Narrazioni',
  'nav.timeline': 'Cronologia',
  'nav.stakeholders': 'Mappa attori',
  'nav.ask': 'Chiedi ai dati',
  'nav.studio': 'Content Studio',
  'nav.brief': 'Brief quotidiano',
  'nav.tv': 'War Room',
  'nav.settings': 'Progetti',
  'nav.account': 'Impostazioni',
  'nav.logout': 'Esci',
  'nav.admin': 'Admin',
  'nav.member': 'Membro',

  // ── Azioni e UI comune
  'ui.export': 'Esporta',
  'ui.refresh': 'Aggiorna ora',
  'ui.updating': 'Aggiornamento…',
  'ui.lastUpdate': 'Ultimo aggiornamento',
  'ui.save': 'Salva',
  'ui.saving': 'Salvataggio…',
  'ui.search': 'Cerca',
  'ui.searchPlaceholder': 'Cerca nel testo…',
  'ui.showAll': 'Mostra tutto',
  'ui.seeAll': 'vedi tutti',
  'ui.open': 'apri',
  'ui.loading': 'Caricamento…',
  'ui.noProject': 'Nessun progetto configurato.',
  'ui.noData': 'Ancora nessun dato.',
  'ui.translated': 'tradotto',
  'ui.translate': 'traduci',
  'ui.showOriginal': 'mostra originale',
  'ui.previous': 'precedente',
  'ui.next': 'successivo',
  'ui.page': 'pagina',
  'ui.of': 'di',
  'ui.mentions': 'menzioni',
  'ui.mentionsFound': 'menzioni trovate',
  'ui.days': 'giorni',
  'ui.hours': 'ore',
  'ui.sentiment': 'Sentiment',
  'ui.source': 'Fonte',
  'ui.sources': 'Fonti',
  'ui.period': 'Periodo',
  'ui.language': 'Lingua',
  'ui.relevance': 'Rilevanza',
  'ui.sort': 'Ordina',
  'ui.positive': 'positivo',
  'ui.neutral': 'neutro',
  'ui.negative': 'negativo',
  'ui.engagement': 'engagement',
  'ui.topics': 'temi',
  'ui.author': 'autore',
  'ui.analyzing': 'in analisi',

  // ── Titoli e sottotitoli delle pagine
  'page.dashboard.title': 'Dashboard',
  'page.listening.title': 'Ascolto',
  'page.media.title': 'Media',
  'page.alerts.title': 'Allerte',
  'page.changes.title': 'Cosa è cambiato',
  'page.audience.title': 'Pubblico',
  'page.benchmark.title': 'Benchmark',
  'page.content.title': 'Contenuti top',
  'page.messages.title': 'Ripresa dei messaggi',
  'page.messages.subtitle': 'Il volume ti dice quanto parlano di te. Questo ti dice se dicono quello che volevi far dire: quali dei tuoi messaggi chiave vengono ripresi, da quali fonti e con che tono.',
  'page.emv.title': 'Valore dei media guadagnati',
  'page.emv.subtitle': 'La domanda che il management fa sempre: quanto vale questa copertura? Ecco una risposta difendibile, con tutte le assunzioni sul tavolo — perché un EMV senza le sue assunzioni è solo un numero su cui litigare.',
  'page.insights.title': 'Esplora gli insight',
  'page.pov.title': 'Point of View',
  'page.narratives.title': 'Narrazioni',
  'page.timeline.title': 'Cronologia',
  'page.stakeholders.title': 'Mappa degli attori',
  'page.ask.title': 'Chiedi ai dati',
  'page.studio.title': 'Content Studio',
  'page.brief.title': 'Brief quotidiano',
  'page.settings.title': 'Progetti',

  'listening.found': 'menzioni trovate',
  'listening.semantic': 'ricerca semantica',
  'listening.terms': 'termini',
  'listening.deepdive': 'Approfondisci',
  'listening.setOfPosts': 'un insieme specifico di post (da una narrazione)',
  'listening.fromAccounts': 'post da account (da una narrazione)',
  'listening.noMentions': 'Nessuna menzione con questi filtri.',
  'listening.h24': '24 ore',
  'listening.d7': '7 giorni',
  'listening.d30': '30 giorni',
  'listening.d90': '90 giorni',

  // ── Landing pubblica
  'landing.cta': 'Accedi',
  'landing.hero.sub': 'Media intelligence e social listening open source: un\'alternativa auto-ospitabile a Talkwalker e Brandwatch, costruita su fonti gratuite e sull\'AI che scegli tu.',
  'landing.philosophy': 'La filosofia',
  'landing.features': 'Cosa fa',
  'landing.how': 'Come funziona',
  'landing.compare': 'Radar a confronto',
  'landing.signin': 'Accedi',
  'landing.badge': 'Media intelligence potenziata dall\'AI',
  'landing.h1a': 'Tutto ciò che il mondo dice del tuo tema.',
  'landing.h1b': 'Compreso, valutato, sintetizzato.',
  'landing.lead': 'Radar ascolta news e social in oltre 30 lingue, giudica la rilevanza di ogni contenuto, coglie i trend prima che esplodano e ti scrive il briefing ogni mattina. Il lavoro di una piattaforma enterprise, senza il prezzo enterprise.',
  'landing.open': 'Apri Radar',
  'landing.tour': '▶ Guarda il tour',
  'landing.seeFeatures': 'Scopri le funzioni',
};

export const DICT: Record<Locale, Record<string, string>> = { en: {}, it: IT };

/** Versione sincrona per i componenti client, che ricevono già il locale. */
export function tFor(locale: Locale) {
  const dict = DICT[locale];
  return (key: string, fallback: string) => dict[key] ?? fallback;
}

/** Formattazione date coerente con la lingua scelta. */
export function localeTag(locale: Locale): string {
  return locale === 'it' ? 'it-IT' : 'en-US';
}
