
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
  'nav.reviewsSection': 'Recensioni',
  'nav.reviews': 'Recensioni',
  'nav.sportSection': 'Sport',
  'nav.sport': 'Sport',
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
  'page.reviews.title': 'Recensioni',
  'page.reviews.refresh': 'Controlla le fonti ora',
  'page.reviews.checking': 'Controllo…',
  'page.reviews.sources': 'Fonti',
  'page.reviews.distribution': 'Distribuzione dei voti',
  'page.reviews.trend': 'Andamento settimanale',
  'page.reviews.recent': 'Recensioni recenti',
  'page.sport.title': 'Sport',
  'page.sport.refresh': 'Controlla aggiornamenti',
  'page.sport.checking': 'Controllo…',
  'page.sport.teams': 'Squadre seguite',
  'page.sport.upcoming': 'Prossime partite',
  'page.sport.aggregate': 'Vincere cambia le cose?',
  'page.sport.recent': 'Partite recenti',
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


  // ── Dashboard
  'dash.kpi.mentions': 'Menzioni (7 giorni)',
  'dash.kpi.sentiment': 'Sentiment medio',
  'dash.kpi.sources': 'Fonti attive',
  'dash.kpi.topics': 'Temi rilevati',
  'dash.awaiting': 'In attesa dell\'analisi AI',
  'dash.emerging': 'Temi emergenti',
  'dash.latestBrief': 'Ultimo brief',
  'dash.latestMentions': 'Ultime menzioni',
  'dash.noProject': 'Nessun progetto configurato. Vai su Progetti per crearne uno.',
  'dash.noMentions': 'Ancora nessuna menzione raccolta.',
  'dash.noBrief': 'Il primo brief quotidiano sara generato dal ciclo del mattino (richiede la chiave API).',
  'page.media.subtitle': 'News e stampa degli ultimi 7 giorni, raggruppate per storia',
  'page.audience.subtitle': 'Chi discute del tema: community, lingue e voci piu influenti (ultimi 14 giorni)',
  'page.benchmark.subtitle': 'Share of voice e confronto del sentiment tra le entita del settore (ultimi 14 giorni)',
  'bench.noEntities': 'Nessuna entita da confrontare. Aggiungile in Progetti (es. brand o competitor di settore).',
  'page.content.subtitle': 'Contenuti con piu engagement (7 giorni): percentile per piattaforma + valutazione AI',
  'content.none': 'Nessun contenuto con engagement negli ultimi 7 giorni.',
  'alerts.none': 'Nessuna allerta. Il controllo gira a ogni aggiornamento dei dati.',
  'page.brief.subtitle': 'Briefing esecutivo generato ogni mattina dall\'AI sui dati delle ultime 24 ore',
  'page.changes.subtitle': 'Confronto intelligente: gli ultimi 7 giorni contro i 7 precedenti, spiegato a parole',
  'page.timeline.subtitle': 'La memoria storica del tuo monitoraggio: eventi salienti, estratti ogni giorno dall\'AI. Cresce da sola nel tempo.',
  'page.narratives.subtitle': 'Chi spinge cosa: gruppi di messaggi che sostengono la stessa tesi, con segnalazione dei pattern coordinati',
  'narratives.none': 'Nessuna narrazione rilevata. L\'analisi gira col ciclo giornaliero (servono almeno 8 post social nelle ultime 48 ore).',
  'page.studio.subtitle': 'Da un concetto al kit multi-formato, con esplorazione degli hook e revisione conversazionale',
  'page.ask.subtitle': 'Fai una domanda ai tuoi dati: l\'AI risponde usando le menzioni raccolte',
  'page.insights.subtitle': 'modi di leggere la stessa conversazione, raggruppati per la domanda a cui rispondono. Ogni scheda dice a cosa serve: scegli la domanda, non il grafico.',
  'page.messages.subtitle2': 'Il volume ti dice quanto parlano di te. Questo ti dice se dicono quello che volevi far dire: quali dei tuoi messaggi chiave vengono ripresi, da quali fonti e con che tono.',
  'page.emv.subtitle2': 'La domanda che il management fa sempre: quanto vale questa copertura? Ecco una risposta difendibile, con tutte le assunzioni sul tavolo.',
  'page.pov.subtitle': 'La tesi da portare in riunione: cosa si sta spostando negli ultimi 90 giorni, i numeri che lo dimostrano, i post che lo testimoniano, piu cosa dice la ricerca e cosa gioca contro. Ogni blocco e pronto per una slide. Clicca un numero di citazione per leggere il post.',
  'pov.thesis': 'La tesi',
  'pov.shifting': 'La storia in blocchi',
  'pov.slideHint': 'ogni blocco e una slide: titolo, narrativa, numeri',
  'pov.counter': 'Contro-segnali',
  'pov.counterHint': 'Cosa gioca contro la tesi: leggili prima di sposarla.',
  'pov.soWhat': 'E quindi',
  'pov.watch': 'Cosa monitorare',
  'pov.evidence': 'Le prove dietro la tesi',
  'pov.research': 'Evidenza accademica',
  'pov.rebuild': 'Rigenera la tesi',
  'pov.confidence': 'confidenza',


  // ── Titoli delle pagine insight
  'ins.causal.title': 'Grafico causa-effetto',
  'ins.clusters.title': 'Cluster conversazionali',
  'ins.constellation.title': 'Costellazione semantica',
  'ins.crisis.title': 'Radar di crisi e anatomia del picco',
  'ins.crisis.forecast.title': 'Dove sta andando',
  'ins.crisis.forecast.subtitle': 'Il ritmo recente, proiettato in avanti — non una previsione di eventi, solo la tendenza se nulla cambia. La fascia ombreggiata è quanto sono variati davvero gli ultimi 30 giorni: una proiezione fuori da quella fascia sarebbe una vera sorpresa.',
  'ins.crisis.forecast.warning': 'La quota di negatività sta salendo in modo costante.',
  'ins.emotions.title': 'Radar delle emozioni',
  'ins.flow.title': 'Flusso della conversazione',
  'ins.galaxy.title': 'Galassia della conversazione',
  'ins.geo.title': 'Lingue della conversazione',
  'ins.health.title': 'Indice di salute',
  'ins.health.subtitle': 'Come sta andando la conversazione, in un unico punteggio 0-100.',
  'ins.heatmap.title': 'Mappa oraria e settimanale',
  'ins.heatmap.subtitle': 'Quando esplodono le conversazioni: intensita per giorno della settimana e ora (ultimi 30 giorni). Utile per sapere quando monitorare e quando pubblicare.',
  'ins.momentum.title': 'Quadrante dello slancio',
  'ins.network.title': 'Rete degli influencer',
  'ins.owned.title': 'Owned vs Earned',
  'ins.owned.empty': 'Nessun canale owned è ancora collegato. Radar può confrontare i tuoi post con la conversazione solo una volta che può leggerli.',
  'ins.owned.connect': 'Collega un canale',
  'ins.owned.noData': 'Collegato, ma non è stato ancora raccolto nulla negli ultimi 30 giorni — si popolerà al prossimo aggiornamento.',
  'ins.owned.split': 'Volume: owned vs earned',
  'ins.owned.engagement': 'Coinvolgimento: owned vs earned',
  'ins.owned.engagementNote': 'Il coinvolgimento pesa i like ×1, i commenti ×2, le condivisioni ×3 — lo stesso punteggio usato in tutto il resto di Radar, quindi è confrontabile con ogni altra vista.',
  'ins.owned.bySource': 'I tuoi canali',
  'ins.owned.peaks': 'Quando escono i tuoi post',
  'ins.owned.peaksSub': 'Il tuo ritmo di pubblicazione — confrontalo con la Mappa oraria per vedere se coincide con quando le persone parlano davvero.',
  'ins.pyramid.title': 'Piramide di influenza degli autori',
  'ins.sov.title': 'Share of Voice nel tempo',
  'ins.topics.title': 'Mappa Temi x Sentiment',
  'ins.waterfall.title': 'Cascata del sentiment',


  // ── Configurazione e altre pagine
  'page.account.title': 'Il mio account',
  'page.budget.title': 'Budget e costi',
  'page.credits.title': 'Crediti e note legali',
  'page.sources.title': 'Fonti',
  'page.team.title': 'Team',
  'page.import.title': 'Importa dati',
  'tabs.account': 'Il mio account',
  'tabs.team': 'Team',
  'tabs.sources': 'Fonti',
  'tabs.budget': 'Budget',
  'tabs.credits': 'Crediti e note legali',

  'page.media.title2': 'Monitoraggio media',
  'page.audience.title2': 'Analisi del pubblico',
  'page.content.title2': 'Valutazione dei contenuti',
  'ins.health.brand': 'Indice di salute del brand',
  'ins.health.market': 'Indice di salute del mercato',

  // ── Valore dei media (EMV): spiegazione in chiaro
  'emv.what': 'Si parla di te — e non l\'hai pagato.',
  'emv.what.body': 'Giornalisti che scrivono articoli, utenti che pubblicano, community che discutono: tutta quell\'attenzione ha raggiunto persone vere. Se avessi voluto la stessa attenzione con la pubblicità, avresti dovuto comprarla. Questa pagina stima quel conto: quanto sarebbe costata la tua copertura se l\'avessi pagata.',
  'emv.step1': 'La copertura',
  'emv.step1.body': 'contenuti che parlano del tuo tema',
  'emv.step2': 'Quante persone l\'hanno vista',
  'emv.step2.body': 'visualizzazioni stimate',
  'emv.step3': 'Quanto sarebbe costata',
  'emv.step3.body': 'in pubblicità',
  'emv.caveat': 'È una stima, non una fattura — e volutamente prudente: qui la copertura negativa non vale nulla, e non si applica nessuno dei trucchi gonfia-numeri della vecchia metrica AVE. Il metodo completo è in fondo alla pagina.',

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
