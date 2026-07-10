import Link from 'next/link';
import {
  Ear, Star, Flame, FileText, MonitorPlay, GitBranch, MessageSquareText,
  PenLine, Share2, Radar as RadarIcon, ArrowRight, Sparkles, Globe2,
  Database, Wallet, Check, X as XMark, Minus, ScatterChart,
} from 'lucide-react';
import { ParticleField } from '@/components/particle-field';
import { Brand } from '@/components/brand';

export const metadata = { title: 'Radar, media intelligence By Scognamiglio 2026' };

const FEATURES = [
  {
    icon: Ear, color: 'text-sky-400',
    title: 'Ascolto multicanale',
    text: '9 fonti pubbliche gratuite, news mondiali via GDELT (oltre 100.000 testate in 65+ lingue) e Google News, più Reddit, Bluesky, Mastodon, YouTube, Telegram e feed RSS illimitati. In più 6 connettori premium pronti: X, Instagram, Facebook, TikTok, LinkedIn e NewsAPI (150.000 testate).',
  },
  {
    icon: Star, color: 'text-amber-400',
    title: 'Rilevanza a stelle',
    text: 'Ogni contenuto è letto dall’AI e valutato da 1 a 5 stelle rispetto al tuo tema, con la motivazione. Il rumore sparisce.',
  },
  {
    icon: Flame, color: 'text-orange-400',
    title: 'Radar dei trend',
    text: 'I temi in accelerazione anomala vengono intercettati prima che esplodano, con la spiegazione del perché stanno crescendo.',
  },
  {
    icon: FileText, color: 'text-emerald-400',
    title: 'Daily brief esecutivo',
    text: 'Ogni mattina un briefing scritto dall’AI sui dati delle ultime 24 ore: cosa è successo, sentiment, rischi e opportunità.',
  },
  {
    icon: MonitorPlay, color: 'text-red-400',
    title: 'War Room live',
    text: 'Una regia a schermo intero con radar animato, contatori e feed continuo. Da proiettare in riunione o su uno schermo in ufficio.',
  },
  {
    icon: GitBranch, color: 'text-violet-400',
    title: 'Narrazioni e coordinamento',
    text: 'Non solo cosa si dice: chi sta spingendo quale tesi, con segnalazione dei pattern sospetti di coordinamento.',
  },
  {
    icon: MessageSquareText, color: 'text-cyan-400',
    title: 'Chiedi ai dati',
    text: 'Un analista AI conversazionale: fai domande in italiano e ricevi risposte con numeri e citazioni come prove.',
  },
  {
    icon: ScatterChart, color: 'text-fuchsia-400',
    title: 'Insight avanzati',
    text: 'Mappa Temi × Sentiment, heatmap oraria, sentiment waterfall, cluster conversazionali e grafico causa-effetto: analisi visive che i tool standard non offrono.',
  },
  {
    icon: PenLine, color: 'text-pink-400',
    title: 'Content Studio avanzato',
    text: 'Da un concetto a un kit multi-formato, LinkedIn, thread X, Instagram, hook video, newsletter, più 10 hook alternativi e rifinitura conversazionale di ogni bozza, nel tono di voce del brand.',
  },
  {
    icon: Share2, color: 'text-teal-400',
    title: 'Export e condivisione',
    text: 'PDF, Excel, Word, PowerPoint con grafici modificabili. E link di sola lettura a scadenza per capi e clienti.',
  },
];

// ✓ = incluso, ~ = parziale/con limiti, ✗ = non disponibile
type MarkValue = 'si' | 'parz' | 'no';
type CompareRow = [string, MarkValue, MarkValue, string?, string?]; // [funzione, talkwalker, radar, notaTW, notaRadar]

const COMPARISON: { cat: string; rows: CompareRow[] }[] = [
  {
    cat: 'Fonti pubbliche (gratuite in Radar)',
    rows: [
      ['News mondiali (GDELT)', 'si', 'si', 'incluse', 'oltre 100.000 testate, 65+ lingue'],
      ['News aggregate (Google News)', 'si', 'si', , 'migliaia di testate'],
      ['Reddit, Bluesky, Mastodon, Hacker News', 'parz', 'si', , 'social pubblici, senza chiavi'],
      ['YouTube', 'si', 'si', , 'chiave gratuita'],
      ['Canali Telegram pubblici', 'parz', 'si', , 'watchlist di canali'],
      ['Feed RSS/Atom illimitati', 'parz', 'si', , 'testate, blog, Google Alerts'],
      ['Copertura 30+ lingue', 'si', 'si'],
      ['Query booleane (AND / OR / NOT) e aree geografiche', 'si', 'si'],
    ],
  },
  {
    cat: 'Fonti premium (private, a pagamento)',
    rows: [
      ['NewsAPI, 150.000 testate news', 'si', 'parz', 'inclusa in licenza', 'connettore pronto, chiave a parte'],
      ['X (Twitter)', 'si', 'parz', 'inclusa', 'connettore pronto, chiave a parte'],
      ['Instagram e Facebook (Meta)', 'si', 'parz', 'inclusi', 'connettori pronti, token a parte'],
      ['TikTok', 'si', 'parz', 'inclusa', 'connettore pronto, accesso a parte'],
      ['LinkedIn', 'si', 'parz', 'inclusa', 'connettore pronto, token a parte'],
      ['Archivio storico pluriennale', 'si', 'no', , '90 giorni, estendibile'],
    ],
  },
  {
    cat: 'Analisi AI',
    rows: [
      ['Sentiment multilingua', 'si', 'si'],
      ['Temi ed entità automatici', 'si', 'si'],
      ['Rilevanza 1–5 spiegata per contenuto', 'no', 'si', , 'con motivazione AI'],
      ['Traduzione integrata delle news', 'parz', 'si', , '8 lingue, cache permanente'],
      ['Daily brief esecutivo scritto dall’AI', 'parz', 'si'],
      ['Analista conversazionale sui dati', 'no', 'si', , '«Chiedi ai dati»'],
      ['Ricerca semantica per concetti', 'parz', 'si'],
      ['Area semantica del progetto in linguaggio naturale', 'no', 'si'],
    ],
  },
  {
    cat: 'Insight avanzati',
    rows: [
      ['Mappa Temi × Sentiment (bolle a quadranti)', 'parz', 'si', , 'volume, sentiment, crescita'],
      ['Heatmap oraria e giornaliera', 'parz', 'si'],
      ['Sentiment Waterfall (cosa ha mosso il tono)', 'no', 'si'],
      ['Cluster conversazionali (famiglie di discorso)', 'no', 'si'],
      ['Grafico Causa-Effetto (eventi → conseguenze)', 'no', 'si'],
    ],
  },
  {
    cat: 'Intelligence',
    rows: [
      ['Alert su picchi e crolli di sentiment', 'si', 'si'],
      ['Trend emergenti con spiegazione del perché', 'parz', 'si'],
      ['Rilevamento narrazioni coordinate', 'no', 'si'],
      ['Crisis playbook con bozza di comunicato', 'no', 'si', , 'in 30 secondi dall’alert'],
      ['Timeline storica degli eventi del settore', 'no', 'si'],
      ['Mappa attori e stakeholder', 'parz', 'si'],
      ['Confronto settimanale in linguaggio naturale', 'no', 'si'],
      ['Benchmark e share of voice', 'si', 'si'],
      ['Notifiche push', 'si', 'si', 'email e app', 'Telegram'],
      ['Demografia audience (età, genere)', 'si', 'no', , 'non derivabile da fonti accessibili'],
    ],
  },
  {
    cat: 'Output e collaborazione',
    rows: [
      ['Export Excel, Word, PDF', 'si', 'si'],
      ['PowerPoint con grafici modificabili', 'parz', 'si', 'immagini statiche', 'grafici nativi Office'],
      ['Report condivisibili con scadenza', 'si', 'si'],
      ['War Room / display live animato', 'parz', 'si', 'dashboard TV', 'regia animata a rotazione'],
      ['Content Studio: kit multi-formato (5 canali)', 'no', 'si', , 'da un concetto a tutti i canali'],
      ['Content Studio: Hook Lab + editing conversazionale', 'no', 'si'],
      ['Profili influencer con bozza di contatto', 'parz', 'si'],
      ['Multi-progetto', 'si', 'si'],
    ],
  },
  {
    cat: 'Piattaforma',
    rows: [
      ['Dati nel proprio database', 'no', 'si'],
      ['Funzioni nuove su misura in pochi giorni', 'no', 'si', 'roadmap del vendor'],
      ['Tetto di spesa AI configurabile', 'no', 'si'],
      ['Nessun vincolo contrattuale', 'no', 'si', 'contratti annuali'],
    ],
  },
];

function CheckIcon() { return <Check className="inline size-4 text-emerald-400" aria-label="incluso" />; }
function XIcon() { return <XMark className="inline size-4 text-red-400" aria-label="non disponibile" />; }
function PartialIcon() { return <Minus className="inline size-4 text-amber-400" aria-label="parziale" />; }

function Mark({ v, note }: { v: MarkValue; note?: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      {v === 'si' ? <CheckIcon /> : v === 'no' ? <XIcon /> : <PartialIcon />}
      {note && <span className="max-w-[150px] text-[10px] leading-tight text-slate-500">{note}</span>}
    </span>
  );
}

const STEPS = [
  { n: '01', title: 'Descrivi il tema', text: 'Anche in linguaggio naturale: l’AI trasforma la descrizione in una query di monitoraggio multilingua.' },
  { n: '02', title: 'Radar lavora da solo', text: 'Raccoglie, traduce, valuta e organizza i contenuti ogni giorno. Alert automatici se qualcosa esplode.' },
  { n: '03', title: 'Tu decidi', text: 'Dashboard, brief, mappe e report pronti da esportare: le decisioni si prendono con i dati davanti.' },
];

export default function LandingPage() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#04070f] text-slate-200">
      {/* sfondi */}
      <div className="pointer-events-none fixed inset-0">
        <ParticleField />
        <div aria-hidden className="absolute -right-[30vmax] -top-[30vmax] size-[80vmax] rounded-full opacity-[0.07]"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, #38bdf8 25deg, transparent 60deg)', animation: 'radarsweep 16s linear infinite' }} />
        <div aria-hidden className="tv-aurora absolute -left-[15vmax] top-[30vmax] size-[55vmax] rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 60%)' }} />
      </div>

      {/* header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center gap-4 px-5 py-5 sm:px-8">
        <Brand />
        <Link href="/login"
          className="ml-auto rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
          Accedi
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        {/* hero */}
        <section className="tv-3d flex flex-col items-center py-16 text-center sm:py-24">
          <span className="mb-6 flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-sky-300">
            <Sparkles className="size-3.5" /> Media intelligence potenziata dall&apos;AI
          </span>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
            Tutto ciò che il mondo dice sul tuo tema.{' '}
            <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              Capito, valutato, raccontato.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Radar ascolta news e social in più di 30 lingue, giudica la rilevanza di ogni contenuto,
            intercetta i trend prima che esplodano e ogni mattina ti scrive il briefing.
            Il lavoro di una piattaforma enterprise, senza il prezzo di una piattaforma enterprise.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login"
              className="flex items-center gap-2 rounded-xl bg-sky-500 px-7 py-3 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:bg-sky-400">
              Entra in Radar <ArrowRight className="size-4" />
            </Link>
            <a href="#funzioni"
              className="rounded-xl border border-[var(--border)] px-7 py-3 text-base font-medium text-slate-300 transition hover:bg-white/5">
              Scopri le funzioni
            </a>
          </div>
        </section>

        {/* numeri */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [<Database key="i" className="mx-auto size-5 text-sky-400" />, '15', 'fonti · 9 gratuite + 6 premium'],
            [<Globe2 key="i" className="mx-auto size-5 text-violet-400" />, '30+', 'lingue analizzate'],
            [<Sparkles key="i" className="mx-auto size-5 text-amber-400" />, '20', 'moduli di intelligence'],
            [<Wallet key="i" className="mx-auto size-5 text-emerald-400" />, '<1%', 'del costo dei tool enterprise'],
          ].map(([icon, big, small], i) => (
            <div key={i} className="tv-shine rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 px-4 py-6 text-center backdrop-blur">
              {icon}
              <p className="mt-2 text-3xl font-black tracking-tight">{big}</p>
              <p className="mt-1 text-xs text-slate-500">{small}</p>
            </div>
          ))}
        </section>

        {/* filosofia */}
        <section className="mx-auto max-w-3xl py-20 text-center sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-400">La filosofia</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">AI Employee: a real one man band</h2>
          <div className="mt-6 flex flex-col gap-4 text-left text-base leading-relaxed text-slate-400 sm:text-lg">
            <p>
              Radar nasce da una convinzione di <strong className="text-slate-200">Massimo Scognamiglio</strong>:
              nell&apos;era dell&apos;intelligenza artificiale, <strong className="text-slate-200">un singolo professionista
              può mettere a disposizione della propria azienda strumenti che ieri richiedevano budget enterprise</strong>,
              se impara a orchestrare l&apos;AI invece di limitarsi a usarla.
            </p>
            <p>
              Questa piattaforma ne è la prova: un progetto personale nato per portare valore, in cui una persona
              dirige l&apos;intelligenza artificiale come si coordina un team, l&apos;AI raccoglie, legge, valuta,
              scrive e avvisa; <strong className="text-slate-200">le decisioni restano alle persone</strong>.
              Il risultato: capacità di livello enterprise a una frazione del costo, con la libertà
              di far evolvere lo strumento su misura delle esigenze di chi lo usa.
            </p>
            <blockquote className="flex flex-col gap-3 border-l-2 border-violet-500/50 pl-4 italic text-slate-300">
              <p>
                «Il valore che porti non si misura più in ore di lavoro: si misura in quanto sai far rendere
                l&apos;intelligenza, quella artificiale e quella delle persone intorno a te.
              </p>
              <p>
                Conta la tua capacità di trasformare strumenti, idee e relazioni in risultati più lucidi,
                più rapidi, più profondi.»
              </p>
            </blockquote>
          </div>
        </section>

        {/* funzioni */}
        <section id="funzioni" className="pb-8">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Cosa fa Radar</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
            Le funzioni delle piattaforme di social intelligence enterprise, ripensate con l&apos;AI generativa al centro.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 px-6 py-6 backdrop-blur transition hover:border-sky-500/40 hover:bg-[var(--panel)]">
                <f.icon className={`size-6 ${f.color}`} />
                <h3 className="mt-3 text-base font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* confronto */}
        <section className="py-16">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Radar vs Competitor products</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
            Funzione per funzione, un confronto onesto con le piattaforme enterprise di riferimento.
          </p>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 backdrop-blur">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-5 py-4 font-semibold text-slate-400">Funzionalità</th>
                  <th className="w-40 px-4 py-4 text-center font-semibold text-slate-300">Competitor products</th>
                  <th className="w-40 bg-sky-500/10 px-4 py-4 text-center font-bold text-sky-300">Radar</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                {COMPARISON.map((group) => (
                  [
                    <tr key={group.cat}>
                      <td colSpan={3} className="border-b border-[var(--border)]/60 bg-white/[0.03] px-5 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        {group.cat}
                      </td>
                    </tr>,
                    ...group.rows.map(([feat, tw, radar, twNote, radarNote]) => (
                      <tr key={feat} className="border-b border-[var(--border)]/40 last:border-0">
                        <td className="px-5 py-2.5 text-[13px] font-medium text-slate-300">{feat}</td>
                        <td className="px-4 py-2.5 text-center"><Mark v={tw} note={twNote} /></td>
                        <td className="bg-sky-500/5 px-4 py-2.5 text-center"><Mark v={radar} note={radarNote} /></td>
                      </tr>
                    )),
                  ]
                ))}
                <tr>
                  <td className="px-5 py-4 text-[13px] font-bold text-slate-200">Costo mensile</td>
                  <td className="px-4 py-4 text-center text-sm font-bold text-red-300">€800–2.000+</td>
                  <td className="bg-sky-500/10 px-4 py-4 text-center text-sm font-bold text-emerald-300">~€10–40</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1"><CheckIcon /> incluso</span>
            <span className="flex items-center gap-1"><PartialIcon /> parziale o con limiti</span>
            <span className="flex items-center gap-1"><XIcon /> non disponibile</span>
          </div>
        </section>

        {/* come funziona */}
        <section className="py-20">
          <h2 className="text-center text-3xl font-black tracking-tight">Come funziona</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 px-6 py-7">
                <span className="bg-gradient-to-b from-sky-300 to-sky-600 bg-clip-text text-4xl font-black text-transparent">{s.n}</span>
                <h3 className="mt-3 text-base font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA finale */}
        <section className="pb-20">
          <div className="tv-shine relative overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-[#0c1a38] to-[#0a0f22] px-6 py-14 text-center sm:px-10">
            <RadarIcon className="mx-auto size-10 text-sky-400" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
              Il tuo settore sta parlando. Radar sta già ascoltando.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
              Accedi con le tue credenziali e apri la dashboard: i dati sono già lì.
            </p>
            <Link href="/login"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-8 py-3 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:bg-sky-400">
              Accedi a Radar <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--border)]/60 py-8 text-center text-xs text-slate-600">
        Radar · By Scognamiglio 2026, media intelligence costruita da una persona, orchestrando l&apos;AI.
      </footer>
    </div>
  );
}
