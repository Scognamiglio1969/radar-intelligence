import { Info } from 'lucide-react';
import { getMeta } from '@/lib/db';
import { monthCost } from '@/lib/data';
import { CONNECTORS } from '@/lib/connectors';
import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ConnectorKeys } from '@/components/connector-keys';
import { claudeAvailable, monthlyBudgetUsd } from '@/lib/claude';
import { PageHeader, fmtDate } from '@/components/ui';
import type { SourceStatus } from '@/lib/ingest';

export const metadata = { title: 'Fonti' };

// Cosa è ogni fonte e quali dati Radar ne raccoglie: mostrato nel tooltip in hover.
const SOURCE_INFO: Record<string, string> = {
  googlenews: 'Aggregatore notizie di Google. Raccoglie articoli pubblici da migliaia di testate cercando le tue parole chiave, con titolo, testata e data. Ideale per la copertura stampa mainstream.',
  gdelt: 'Indice globale di news in 65+ lingue (oltre 100.000 testate nel mondo). Raccoglie articoli internazionali per parola chiave: perfetto per monitoraggio multilingua e cross-country.',
  reddit: 'Discussioni pubbliche dai subreddit. Raccoglie post e commenti che citano i tuoi termini, con voti e community di appartenenza. Utile per opinioni e sentiment grezzo.',
  bluesky: 'Social aperto (rete AT Protocol). Raccoglie post pubblici per parola chiave, con autore e interazioni. Buono per conversazioni tech ed early adopter.',
  mastodon: 'Rete social federata. Raccoglie i post pubblici (toot) dalle istanze che citano i tuoi termini, con autore ed engagement.',
  hackernews: 'Community tech di Y Combinator. Raccoglie storie e commenti che citano i tuoi termini, con punteggio e discussione. Ottimo per topic tecnologici e startup.',
  youtube: 'Video pubblici di YouTube. Raccoglie video per parola chiave con titolo, canale, data e visualizzazioni. Richiede una chiave Google gratuita.',
  telegram: 'Solo sui canali pubblici che scegli tu (li imposti nel progetto): Radar legge i messaggi di quei canali. Non effettua una ricerca su tutto Telegram.',
  rss: 'Qualunque sito, blog o testata che offra un feed RSS/Atom. Aggiungi gli URL nel progetto e Radar ne raccoglie automaticamente gli articoli. Numero di feed illimitato.',
  x: 'Post pubblici di X (Twitter) in tempo reale per parola chiave, con autore, hashtag ed engagement (like, repost, reply). Richiede API a pagamento (piano Basic).',
  instagram: 'Ricerca per hashtag via Meta Graph API: raccoglie i post pubblici che usano gli hashtag legati alle tue keyword, con autore e interazioni. Serve un account Business + app Meta.',
  facebook: 'Post delle pagine che colleghi al tuo token (modello watchlist), non tutto Facebook. Raccoglie i post di quelle pagine con reazioni, commenti e condivisioni.',
  tiktok: 'Video pubblici via Research API (accesso su approvazione TikTok). Raccoglie video per parola chiave con descrizione, hashtag e metriche (like, commenti, view).',
  linkedin: 'Post della tua pagina aziendale (LinkedIn non consente la ricerca pubblica di terzi). Raccoglie i contenuti pubblicati dalla tua organizzazione.',
  newsapi: 'Aggregatore di ~150.000 testate con ricerca full-text booleana. Raccoglie articoli per query avanzata: alternativa premium a GDELT/Google News. Richiede una API key.',
};

export default async function FontiPage() {
  // Idrata le chiavi salvate prima di leggere lo stato "attivo" dei connettori.
  await hydrateConnectorCredentials();
  const [cost, sourceStatus, credStatuses, currentUser] = await Promise.all([
    monthCost(), getMeta<SourceStatus>('source_status'), getConnectorCredStatuses(), getCurrentUser(),
  ]);
  const canEditKeys = isAdmin(currentUser);
  const budget = monthlyBudgetUsd();
  const budgetPct = Math.min(100, (cost.cost / budget) * 100);

  return (
    <>
      <PageHeader
        title="Fonti e budget"
        subtitle="Stato delle fonti di ascolto e consumo delle API di Claude"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Stato fonti</h2>

          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/80">Gratuite</p>
          <div className="flex flex-col gap-2">
            {CONNECTORS.filter((c) => c.tier === 'free').map((c) => <SourceRow key={c.id} c={c} st={sourceStatus?.[c.id]} />)}
          </div>

          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">
            Gratuite · serve una chiave gratuita
          </p>
          <p className="mb-2 text-[11px] text-slate-600">
            Gratis, ma serve registrare una chiave API gratuita presso il servizio. Inseriscila qui: si attiva subito.
          </p>
          <div className="flex flex-col gap-3">
            {CONNECTORS.filter((c) => c.tier === 'freekey').map((c) => (
              <div key={c.id}>
                <SourceRow c={c} st={sourceStatus?.[c.id]} />
                {canEditKeys && credStatuses[c.id] && (
                  <ConnectorKeys connectorId={c.id} fields={credStatuses[c.id].fields} />
                )}
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">
            Premium — a pagamento
          </p>
          <p className="mb-2 text-[11px] text-slate-600">
            Connettori già pronti: inserisci qui le tue chiavi API, senza toccare codice. Si attivano subito e valgono per tutto l&apos;account.
          </p>
          <div className="flex flex-col gap-3">
            {CONNECTORS.filter((c) => c.tier === 'premium').map((c) => (
              <div key={c.id}>
                <SourceRow c={c} st={sourceStatus?.[c.id]} />
                {canEditKeys && credStatuses[c.id] && (
                  <ConnectorKeys connectorId={c.id} fields={credStatuses[c.id].fields} />
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="panel h-fit px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Budget API Claude (mese corrente)</h2>
          {claudeAvailable() ? (
            <>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold">${cost.cost.toFixed(2)}</p>
                <p className="text-sm text-slate-500">di ${budget.toFixed(2)} disponibili</p>
              </div>
              <div className="mt-2 h-2 rounded bg-white/5">
                <div
                  className={`h-2 rounded ${budgetPct > 85 ? 'bg-red-400' : budgetPct > 60 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {cost.calls.toLocaleString('it-IT')} chiamate · {(cost.inTok / 1000).toFixed(0)}k token input · {(cost.outTok / 1000).toFixed(0)}k output.
                Raggiunto il tetto, l&apos;app smette di chiamare Claude fino al mese successivo (i dati continuano a essere raccolti).
              </p>
              <div className="mt-3 flex flex-col gap-1.5">
                {cost.byPurpose.map((p) => (
                  <div key={p.purpose} className="flex justify-between text-xs">
                    <span className="text-slate-400">{p.purpose.replace(/_/g, ' ')}</span>
                    <span className="text-slate-500">${p.cost.toFixed(3)} · {p.calls} chiamate</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-amber-400/90">
              ANTHROPIC_API_KEY non configurata: la raccolta dati funziona, ma sentiment, brief e ratings restano in attesa.
            </p>
          )}
        </section>
      </div>
    </>
  );
}

/** Riga di stato di una fonte: pallino, nome, esito ultima raccolta. */
function SourceRow({ c, st }: {
  c: (typeof CONNECTORS)[number];
  st?: SourceStatus[string];
}) {
  const enabled = c.enabled();
  // Ambra = singhiozzo momentaneo (ultimo giro fallito ma ha raccolto nelle
  // ultime 24h, tipico del rate limit condiviso di GDELT); rosso = ferma davvero.
  const recentOk = st?.lastOkAt && Date.now() - new Date(st.lastOkAt).getTime() < 24 * 3600_000;
  const dot = !enabled
    ? 'bg-red-400/70'
    : st?.ok === false
      ? (recentOk ? 'bg-amber-400' : 'bg-red-400')
      : 'bg-emerald-400';
  const info = SOURCE_INFO[c.id];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
      <span className="group relative flex w-32 shrink-0 items-center gap-1">
        <span className="truncate">{c.label}</span>
        {info && (
          <>
            <Info className="size-3 shrink-0 cursor-help text-slate-600 transition group-hover:text-sky-400" />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-64 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px] font-normal leading-relaxed text-slate-300 shadow-xl group-hover:block"
            >
              <span className="mb-1 block font-semibold text-slate-100">{c.label}</span>
              {info}
            </span>
          </>
        )}
      </span>
      <span className="truncate text-xs text-slate-500" title={!enabled ? c.disabledReason : st?.ok === false ? st.error : undefined}>
        {!enabled
          ? c.disabledReason
          : st
            ? st.ok
              ? `${st.count} nuove · ${fmtDate(st.at)}`
              : recentOk
                ? `momentaneamente non disponibile · ultima raccolta ok ${fmtDate(st.lastOkAt!)}`
                : `errore: ${st.error}`
            : 'in attesa della prima raccolta'}
      </span>
    </div>
  );
}
