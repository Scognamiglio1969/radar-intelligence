import { ExternalLink } from 'lucide-react';
import { getCurrentProject } from '@/lib/data';
import { getLocale } from '@/lib/i18n';
import { getMeta } from '@/lib/db';
import type { TermResolution } from '@/lib/trials';
import { phaseLabel, STATUS_LABEL, trialsData } from '@/lib/trials';
import { fmtNumber, type Lang } from '@/lib/kpi-standard';
import { PageHeader, EmptyState } from '@/components/ui';
import { SectionTabs } from '@/components/section-tabs';
import { GenerateRefresh } from '@/components/generate-refresh';
import { SubmitButton } from '@/components/submit-button';
import { Bars, GapBadge, L, MentionsLink, Section, Tile } from '@/components/facts-ui';
import { saveEvidenceTermsAction } from './actions';

// ---------------------------------------------------------------------------
// Studi clinici: le evidenze dietro le notizie, e dove le due cose divergono.
// ---------------------------------------------------------------------------

export const metadata = { title: 'Clinical trials' };

const STATUS_EN: Record<string, string> = {
  RECRUITING: 'recruiting', NOT_YET_RECRUITING: 'not yet recruiting', ACTIVE_NOT_RECRUITING: 'active',
  ENROLLING_BY_INVITATION: 'by invitation', COMPLETED: 'completed', TERMINATED: 'terminated',
  SUSPENDED: 'suspended', WITHDRAWN: 'withdrawn', UNKNOWN: 'unknown status',
};
const statusLabel = (s: string, lang: Lang) => (lang === 'it' ? STATUS_LABEL[s] : STATUS_EN[s]) ?? s.toLowerCase().replace(/_/g, ' ');
const phaseText = (n: number, lang: Lang) => (n === 0 ? L(lang, 'senza fase', 'no phase') : n === 0.5 ? L(lang, 'fase 1 precoce', 'early phase 1') : `${L(lang, 'fase', 'phase')} ${n}`);

export default async function TrialsPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  const project = await getCurrentProject();
  if (!project) return <EmptyState message={L(lang, 'Nessun progetto selezionato.', 'No project selected.')} />;
  const d = await trialsData(project.id);
  const termNote = await getMeta<{ notes: TermResolution[]; at: string }>(`evidence_terms_note_${project.id}`);
  const recruiting = d.trials.filter((t) => t.status === 'RECRUITING').length;
  const withResults = d.trials.filter((t) => t.hasResults === 1).length;
  const hype = d.interventions.filter((i) => i.gap === 'hype');
  const untold = d.interventions.filter((i) => i.gap === 'untold');

  return (
    <>
      <SectionTabs group="facts" lang={lang} />
      <PageHeader
        title={L(lang, 'Studi clinici', 'Clinical trials')}
        subtitle={L(lang,
          'Le evidenze dietro le notizie di salute: a che punto sono gli studi, e dove il racconto corre più dei dati.',
          'The evidence behind health news: where the trials stand, and where the story runs ahead of the data.')}
        info={L(lang,
          'Gli studi vengono da ClinicalTrials.gov (National Library of Medicine), gratuito e senza chiave. Un trattamento si collega alle notizie cercandone il nome o il codice NCT nelle menzioni degli ultimi 90 giorni; placebo, procedure e controlli generici non contano. “Notizie più avanti dell’evidenza” = almeno 10 menzioni e studi al massimo in fase 2 senza risultati. “Evidenza che nessuno racconta” = fase 3 o risultati pubblicati, e al massimo 2 menzioni.',
          'Trials come from ClinicalTrials.gov (National Library of Medicine), free and keyless. A treatment is linked to the news by looking for its name or NCT code in the last 90 days of mentions; placebo, procedures and generic controls do not count. “News ahead of the evidence” = at least 10 mentions and trials at most in phase 2 with no results. “Evidence nobody covers” = phase 3 or posted results, and at most 2 mentions.')}
      />

      <Section className="mb-4" title={L(lang, 'Che cosa seguire', 'What to follow')}
        hint={L(lang,
          'Farmaci, condizioni o sponsor, separati da virgola (massimo 5). Sono diversi dalle parole chiave del progetto: in un registro di studi clinici servono termini medici.',
          'Drugs, conditions or sponsors, comma-separated (up to 5). They differ from the project keywords: a clinical trial registry needs medical terms.')}>
        <form action={saveEvidenceTermsAction} className="flex flex-wrap items-center gap-2">
          <input name="terms" defaultValue={d.terms.join(', ')} placeholder={L(lang, 'es. semaglutide, obesità, Novo Nordisk', 'e.g. semaglutide, obesity, Novo Nordisk')}
            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm" />
          <SubmitButton pendingLabel={L(lang, 'Cerco gli studi…', 'Searching trials…')}
            className="rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400">
            {L(lang, 'Salva e cerca', 'Save and search')}
          </SubmitButton>
        </form>
        {termNote?.notes.map((n) => (
          <p key={n.input} className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-3 py-2 text-[11px] text-amber-100">
            {L(lang, `“${n.input}” non trova studi così com’è: il registro è in inglese e cerca per parole.`,
              `“${n.input}” finds no trials as written: the registry is in English and searches by keyword.`)}{' '}
            {n.kept.length
              ? <>{L(lang, 'Seguo invece: ', 'Following instead: ')}{n.kept.map((k) => `${k.term} (${fmtNumber(k.studies, lang)} ${L(lang, 'studi', 'trials')})`).join(', ')}.</>
              : L(lang, 'Nessuna delle sue parole trova studi: prova con il nome di un farmaco o di una condizione in inglese.', 'None of its words finds trials: try a drug or condition name in English.')}
            {n.dropped.length > 0 && <span className="text-amber-200/60"> {L(lang, 'Scartati:', 'Dropped:')} {n.dropped.join(', ')}.</span>}
          </p>
        ))}
        {/* Fuori dal form: un bottone dentro un form lo invierebbe. */}
        {d.terms.length > 0 && (
          <div className="mt-2">
            <GenerateRefresh endpoint="/api/trials/refresh" label={L(lang, 'Aggiorna gli studi', 'Refresh trials')} busyLabel={L(lang, 'Aggiorno…', 'Refreshing…')} />
          </div>
        )}
      </Section>

      {d.terms.length === 0 && (
        <EmptyState message={L(lang,
          'La sezione è spenta finché non scegli che cosa seguire: le parole chiave del progetto in un registro di studi clinici troverebbero solo rumore.',
          'This section stays off until you choose what to follow: the project keywords would only find noise in a clinical trial registry.')} />
      )}

      {d.total > 0 && (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile label={L(lang, 'Studi trovati', 'Trials found')} value={fmtNumber(d.total, lang)} />
            <Tile label={L(lang, 'Reclutano adesso', 'Recruiting now')} value={fmtNumber(recruiting, lang)} />
            <Tile label={L(lang, 'Con risultati pubblicati', 'With posted results')} value={fmtNumber(withResults, lang)} />
            <Tile label={L(lang, 'Citati nelle notizie', 'Cited in the news')} value={fmtNumber(d.withNews, lang)}
              hint={L(lang, 'per nome del trattamento o codice NCT, ultimi 90 giorni', 'by treatment name or NCT code, last 90 days')} />
          </div>

          {(hype.length > 0 || untold.length > 0) && (
            <div className="mb-4 grid gap-4 lg:grid-cols-2">
              <Section title={L(lang, 'Notizie più avanti dell’evidenza', 'News ahead of the evidence')}
                hint={L(lang, 'Se ne parla molto, ma gli studi sono ancora precoci e senza risultati.', 'Widely discussed, but the trials are still early and without results.')}>
                {hype.length ? <GapList rows={hype} lang={lang} /> : <p className="text-xs text-slate-500">{L(lang, 'Nessun caso.', 'None.')}</p>}
              </Section>
              <Section title={L(lang, 'Evidenza che nessuno racconta', 'Evidence nobody covers')}
                hint={L(lang, 'Studi maturi, in fase 3 o con risultati, quasi assenti dalle conversazioni.', 'Mature trials, phase 3 or with results, almost absent from the conversation.')}>
                {untold.length ? <GapList rows={untold.slice(0, 10)} lang={lang} /> : <p className="text-xs text-slate-500">{L(lang, 'Nessun caso.', 'None.')}</p>}
              </Section>
            </div>
          )}

          <Section className="mb-4 overflow-x-auto" title={L(lang, 'Trattamenti: rumore contro evidenza', 'Treatments: noise versus evidence')}>
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3 font-semibold">{L(lang, 'Trattamento', 'Treatment')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{L(lang, 'Studi', 'Trials')}</th>
                  <th className="px-2 py-2 font-semibold">{L(lang, 'Fase più avanzata', 'Most advanced phase')}</th>
                  <th className="px-2 py-2 font-semibold">{L(lang, 'Risultati', 'Results')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{L(lang, 'Menzioni 90 gg', 'Mentions 90d')}</th>
                  <th className="px-2 py-2 text-right font-semibold">{L(lang, 'ultimi 30', 'last 30')}</th>
                  <th className="px-2 py-2 font-semibold">{L(lang, 'Lettura', 'Reading')}</th>
                </tr>
              </thead>
              <tbody>
                {d.interventions.map((i) => (
                  <tr key={i.name} className="border-b border-[var(--border)]/60 last:border-0">
                    <td className="py-1.5 pr-3 text-slate-200">
                      {i.name}
                      <span className="block text-[10px] text-slate-600">{i.sponsors.slice(0, 2).join(', ')}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(i.trials, lang)}</td>
                    <td className="px-2 py-1.5 text-slate-300">{phaseText(i.maxPhase, lang)}</td>
                    <td className="px-2 py-1.5 text-slate-300">{i.anyResults ? L(lang, 'sì', 'yes') : '—'}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(i.mentions, lang)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtNumber(i.last30, lang)}</td>
                    <td className="px-2 py-1.5"><GapBadge gap={i.gap} lang={lang} /> <MentionsLink ids={i.sampleIds} count={i.mentions} lang={lang} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          <div className="mb-4 grid gap-4 lg:grid-cols-3">
            <Section title={L(lang, 'Stato degli studi', 'Trial status')}>
              <Bars lang={lang} items={d.byStatus.map((s) => ({ label: statusLabel(s.status, lang), value: s.n }))} />
            </Section>
            <Section title={L(lang, 'Fasi', 'Phases')}>
              <Bars lang={lang} items={d.byPhase.map((p) => ({ label: p.phase, value: p.n }))} color="bg-violet-500/60" />
            </Section>
            <Section title={L(lang, 'Sponsor principali', 'Lead sponsors')}
              hint={L(lang, 'industria, università, enti pubblici', 'industry, universities, public bodies')}>
              <Bars lang={lang} items={d.sponsors.map((s) => ({ label: s.name, value: s.n, color: s.cls === 'INDUSTRY' ? 'bg-amber-500/60' : 'bg-emerald-500/50' }))} />
            </Section>
          </div>

          {d.upcoming.length > 0 && (
            <Section className="mb-4" title={L(lang, 'In arrivo nei prossimi 12 mesi', 'Due in the next 12 months')}
              hint={L(lang, 'Studi ancora aperti la cui conclusione principale è prevista entro un anno: le notizie di domani, con la data.', 'Open trials whose primary completion is expected within a year: tomorrow’s news, with a date.')}>
              <TrialList rows={d.upcoming} lang={lang} />
            </Section>
          )}

          <Section title={L(lang, 'Studi aggiornati di recente', 'Recently updated trials')}>
            <TrialList rows={d.trials.slice(0, 40)} lang={lang} />
          </Section>
        </>
      )}
    </>
  );
}

function GapList({ rows, lang }: { rows: Awaited<ReturnType<typeof trialsData>>['interventions']; lang: Lang }) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((i) => (
        <li key={i.name} className="text-xs">
          <p className="text-slate-200">
            <b>{i.name}</b>{' '}
            <span className="text-slate-500">
              · {fmtNumber(i.mentions, lang)} {L(lang, 'menzioni', 'mentions')} · {fmtNumber(i.trials, lang)} {L(lang, 'studi', 'trials')}, {phaseText(i.maxPhase, lang)}
              {i.anyResults ? L(lang, ', con risultati', ', with results') : L(lang, ', senza risultati', ', no results')}
            </span>
          </p>
          <MentionsLink ids={i.sampleIds} count={i.mentions} lang={lang} />
        </li>
      ))}
    </ul>
  );
}

function TrialList({ rows, lang }: { rows: Awaited<ReturnType<typeof trialsData>>['trials']; lang: Lang }) {
  return (
    <ul className="flex flex-col divide-y divide-[var(--border)]">
      {rows.map((t) => (
        <li key={t.nctId} className="py-2 text-xs first:pt-0 last:pb-0">
          <a href={`https://clinicaltrials.gov/study/${t.nctId}`} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-start gap-1 text-slate-200 hover:text-sky-300">
            {t.title} <ExternalLink className="mt-0.5 size-3 shrink-0" />
          </a>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {t.nctId} · {statusLabel(t.status, lang)} · {phaseLabel(t.phases, lang)}
            {t.sponsor && <> · {t.sponsor}</>}
            {t.enrollment ? <> · {fmtNumber(t.enrollment, lang)} {L(lang, 'partecipanti', 'participants')}</> : null}
            {t.completionDate && <> · {L(lang, 'conclusione', 'completion')} {t.completionDate}</>}
            {t.hasResults === 1 && <> · <span className="text-emerald-300">{L(lang, 'risultati pubblicati', 'results posted')}</span></>}
            {(t.news?.total ?? 0) > 0 && <> · <span className="text-sky-300">{fmtNumber(t.news!.total, lang)} {L(lang, 'menzioni', 'mentions')}</span></>}
          </p>
        </li>
      ))}
    </ul>
  );
}
