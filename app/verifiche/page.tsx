import { ExternalLink } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { factCheckData } from '@/lib/factcheck';
import { fmtNumber, type Lang } from '@/lib/kpi-standard';
import { sourceLabel } from '@/lib/source-label';
import { PageHeader, EmptyState } from '@/components/ui';
import { SectionTabs } from '@/components/section-tabs';
import { ConnectorKeys } from '@/components/connector-keys';
import { GenerateRefresh } from '@/components/generate-refresh';
import {
  Bars, L, MentionsLink, Section, SignalText, Tile, VerdictBadge, verdictLabel,
} from '@/components/facts-ui';

// ---------------------------------------------------------------------------
// Verifiche: che cosa hanno già controllato i fact-checker, e che cosa di
// smentito continua a girare.
// ---------------------------------------------------------------------------

export const metadata = { title: 'Fact checks' };

const VERDICT_COLOR: Record<string, string> = {
  false: 'bg-red-500/70', misleading: 'bg-orange-500/70', mixed: 'bg-amber-400/70',
  true: 'bg-emerald-500/70', unverifiable: 'bg-slate-400/60', contested: 'bg-violet-500/70', other: 'bg-slate-600/60',
};

export default async function FactChecksPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={L(lang, 'Nessun progetto selezionato.', 'No project selected.')} />;

  await hydrateConnectorCredentials();
  const [d, user, creds] = await Promise.all([factCheckData(project.id), getCurrentUser(), getConnectorCredStatuses()]);
  const admin = isAdmin(user);
  const date = (s?: string | Date | null) => (s ? new Date(s).toLocaleDateString(lang === 'it' ? 'it-IT' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
  const hot = d.claims.filter((c) => c.signal === 'debunked-growing' || c.signal === 'debunked-circulating');

  return (
    <>
      <SectionTabs group="facts" lang={lang} />
      <PageHeader
        title={L(lang, 'Verifiche', 'Fact checks')}
        subtitle={L(lang,
          'Le affermazioni sul tema già controllate dai fact-checker, e quanto circolano ancora nelle conversazioni.',
          'Claims on the topic already checked by fact-checkers, and how much they still circulate in the conversation.')}
        info={L(lang,
          'Le verifiche vengono da Google Fact Check Tools, che raccoglie il markup ClaimReview di oltre cento testate di fact-checking. I verdetti si leggono dalle parole dei fact-checker, senza AI. La circolazione si misura cercando nelle menzioni degli ultimi 90 giorni le parole distintive di ogni affermazione: è una corrispondenza per parole, quindi una verifica in inglese trova le menzioni in inglese.',
          'Checks come from Google Fact Check Tools, which gathers the ClaimReview markup of 100+ fact-checking outlets. Verdicts are read from the fact-checkers’ own words, with no AI. Circulation is measured by looking for each claim’s distinctive words in the last 90 days of mentions: a word match, so an English check finds English mentions.')}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {d.enabled && <GenerateRefresh endpoint="/api/facts/refresh" label={L(lang, 'Cerca verifiche adesso', 'Look for checks now')} busyLabel={L(lang, 'Cerco…', 'Searching…')} />}
        {admin && creds.factcheck && (
          <div className="rounded-lg border border-[var(--border)] px-4 py-2">
            <ConnectorKeys connectorId="factcheck" fields={creds.factcheck.fields} />
          </div>
        )}
      </div>

      {d.enabled && d.status && !d.status.ok && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-4 py-2.5 text-xs text-amber-200">
          {L(lang, 'Ultima ricerca non riuscita:', 'Last search failed:')} {d.status.error}
        </p>
      )}

      {!d.enabled && (
        <EmptyState message={L(lang,
          'Per attivare le verifiche serve una chiave Google con la “Fact Check Tools API” abilitata (gratuita). Inseriscila qui sopra: anche la chiave YouTube va bene, se aggiungi quella API alle sue restrizioni.',
          'Fact checks need a Google key with the “Fact Check Tools API” enabled (free). Add it above: the YouTube key works too if you add that API to its restrictions.')} />
      )}

      {d.enabled && d.total === 0 && (
        <EmptyState message={L(lang,
          'Nessuna verifica trovata per i termini del progetto. I fact-checker lavorano sulle affermazioni che circolano di più: su temi di nicchia è normale che non ce ne siano.',
          'No fact checks found for the project terms. Fact-checkers work on the most viral claims: on niche topics it is normal to find none.')} />
      )}

      {d.total > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={L(lang, 'Affermazioni verificate', 'Checked claims')} value={fmtNumber(d.total, lang)} />
            <Tile label={L(lang, 'Smentite che circolano ancora', 'Debunked, still circulating')} value={fmtNumber(d.stillCirculating, lang)}
              tone={d.stillCirculating ? 'danger' : 'ok'}
              hint={L(lang, 'almeno una menzione negli ultimi 7 giorni', 'at least one mention in the last 7 days')} />
            <Tile label={L(lang, 'Verdetti discordi', 'Conflicting verdicts')} value={fmtNumber(d.claims.filter((c) => c.verdict === 'contested').length, lang)}
              hint={L(lang, 'un fact-checker dice vero, un altro falso', 'one fact-checker says true, another false')} />
            <Tile label={L(lang, 'Testate di fact-checking', 'Fact-checking outlets')} value={fmtNumber(d.publishers.length, lang)} />
          </div>

          {hot.length > 0 && (
            <Section className="mb-4 border-red-500/30"
              title={L(lang, 'Smentite che circolano ancora', 'Debunked claims still circulating')}
              hint={L(lang,
                'Affermazioni giudicate false o fuorvianti che compaiono ancora nelle menzioni dell’ultima settimana. Sono il punto da cui partire per una risposta o una correzione.',
                'Claims rated false or misleading that still appear in last week’s mentions. The place to start for a response or a correction.')}>
              <ClaimList claims={hot.slice(0, 10)} lang={lang} date={date} />
            </Section>
          )}

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Section title={L(lang, 'Verdetti', 'Verdicts')}>
              <Bars lang={lang} items={d.byVerdict.map((v) => ({ label: verdictLabel(v.verdict, lang), value: v.n, color: VERDICT_COLOR[v.verdict] }))} />
            </Section>
            <Section title={L(lang, 'Chi ha verificato', 'Who checked')}>
              <Bars lang={lang} items={d.publishers.map((p) => ({ label: p.name, value: p.n }))} color="bg-violet-500/60" />
            </Section>
            <Section title={L(lang, 'Verifiche nel tempo', 'Checks over time')} hint={L(lang, 'per mese di pubblicazione della verifica', 'by month the check was published')}>
              <Bars lang={lang} items={d.months.map((m) => ({ label: m.month, value: m.n }))} color="bg-slate-400/50" />
            </Section>
          </div>

          <Section title={L(lang, 'Tutte le affermazioni', 'All claims')}
            hint={L(lang, 'Prima quelle che richiedono attenzione, poi le altre.', 'Those needing attention first, then the rest.')}>
            <ClaimList claims={d.claims.slice(0, 80)} lang={lang} date={date} />
          </Section>
        </>
      )}
    </>
  );
}

function ClaimList({ claims, lang, date }: {
  claims: Awaited<ReturnType<typeof factCheckData>>['claims'];
  lang: Lang;
  date: (s?: string | Date | null) => string;
}) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--border)]">
      {claims.map((c) => {
        const circ = c.circulation;
        return (
          <li key={c.id} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={c.verdict} lang={lang} />
              <SignalText signal={c.signal} lang={lang} />
            </div>
            <p className="mt-1.5 text-sm leading-snug text-slate-200">“{c.claim}”</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {c.claimant && <>{L(lang, 'Attribuita a', 'Attributed to')} {c.claimant} · </>}
              {c.claimDate && <>{date(c.claimDate)} · </>}
              {L(lang, 'termine', 'term')} “{c.query}”
            </p>
            <ul className="mt-1.5 flex flex-col gap-0.5">
              {c.reviews.slice(0, 4).map((r) => (
                <li key={r.url} className="text-[11px] text-slate-400">
                  <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-sky-300">
                    <span className="font-medium text-slate-300">{r.publisher}</span>: “{r.rating}”
                    {r.reviewDate && <span className="text-slate-600">· {date(r.reviewDate)}</span>}
                    <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
            {circ && (
              <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span>
                  {L(lang, 'In circolazione:', 'Circulating:')}{' '}
                  <b className="text-slate-200">{fmtNumber(circ.total, lang)}</b> {L(lang, 'menzioni in 90 giorni', 'mentions in 90 days')}
                  {' · '}{fmtNumber(circ.last7, lang)} {L(lang, 'ultima settimana', 'last week')}
                  {' · '}{fmtNumber(circ.prev7, lang)} {L(lang, 'quella prima', 'week before')}
                </span>
                {Object.keys(circ.sources).length > 0 && (
                  <span className="text-slate-500">
                    {Object.entries(circ.sources).sort((a, b) => b[1] - a[1]).slice(0, 4)
                      .map(([s, n]) => `${sourceLabel(s)} ${n}`).join(' · ')}
                  </span>
                )}
                <MentionsLink ids={circ.sampleIds} count={circ.total} lang={lang} />
                <span className="text-slate-600" title={L(lang, 'parole cercate nelle menzioni', 'words searched in mentions')}>
                  [{circ.terms.join(' + ')}]
                </span>
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
