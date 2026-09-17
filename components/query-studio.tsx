'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle, Check, FlaskConical, Loader2, Plus, Save, Sparkles, Trash2, X,
} from 'lucide-react';
import { CopyButton } from './copy-button';
import {
  compilePlan, describeQuery, LIMITS, ROLE_LABEL, slugId, toBoolean, validatePlan,
  type Concept, type ConceptRole, type QueryDef, type QueryPlan,
} from '@/lib/query-plan';
import type { PlanProbe, QueryStats } from '@/lib/query-builder';
import { buildPlanAction, probePlanAction, savePlanAction } from '@/app/query/actions';

// ---------------------------------------------------------------------------
// Lo studio delle query.
//
// Tre momenti, nell'ordine in cui servono: scrivere che cosa si vuole
// seguire, guardare e correggere i mattoncini e le query che ne escono,
// provarle sui risultati veri prima di attivarle. Nessuna query si salva
// senza che l'utente l'abbia vista.
// ---------------------------------------------------------------------------

type Lang = 'it' | 'en';

const ROLE_STYLE: Record<ConceptRole, string> = {
  subject: 'border-sky-500/40 bg-sky-500/[0.06]',
  context: 'border-violet-500/40 bg-violet-500/[0.06]',
  competitor: 'border-amber-500/40 bg-amber-500/[0.06]',
  noise: 'border-red-500/40 bg-red-500/[0.05]',
};
const ROLE_DOT: Record<ConceptRole, string> = {
  subject: 'bg-sky-400', context: 'bg-violet-400', competitor: 'bg-amber-400', noise: 'bg-red-400',
};

const EXAMPLE_IT = "Voglio monitorare l'azienda Acme in relazione alle proteste dei lavoratori (es. sciopero, presidio) e in relazione ai competitor Alfa, Beta e Gamma";
const EXAMPLE_EN = 'I want to monitor the company Acme in relation to worker protests (e.g. strike, picket) and in relation to its competitors Alfa, Beta and Gamma';

export function QueryStudio({ projectId, initialPlan, saved, stats, aiAvailable, lang, initialBrief }: {
  projectId: number;
  initialPlan: QueryPlan | null;
  saved: boolean;
  stats: QueryStats[];
  aiAvailable: boolean;
  lang: Lang;
  initialBrief?: string;
}) {
  const L = (it: string, en: string) => (lang === 'it' ? it : en);
  const [brief, setBrief] = useState(initialPlan?.brief || initialBrief || '');
  const [plan, setPlan] = useState<QueryPlan | null>(initialPlan);
  const [isSaved, setIsSaved] = useState(saved);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'' | 'build' | 'probe' | 'save'>('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [probe, setProbe] = useState<PlanProbe | null>(null);

  const statsById = useMemo(() => new Map(stats.map((s) => [s.queryId, s])), [stats]);
  const termHits = useMemo(() => new Map((probe?.terms ?? []).map((t) => [`${t.conceptId}|${t.term}`, t])), [probe]);
  const queryHits = useMemo(() => new Map((probe?.queries ?? []).map((q) => [q.queryId, q])), [probe]);
  const compiled = useMemo(() => (plan ? new Map(compilePlan(plan).map((c) => [c.id, c])) : new Map()), [plan]);
  const enabledCount = plan?.queries.filter((q) => q.enabled).length ?? 0;

  const change = (fn: (p: QueryPlan) => QueryPlan) => {
    setPlan((p) => (p ? { ...fn(p), origin: p.origin === 'legacy' ? 'manual' : p.origin } : p));
    setDirty(true);
    setNotice('');
    // Una prova vale per il piano che è stato provato.
    setProbe(null);
  };

  const build = async () => {
    setBusy('build'); setError(''); setWarnings([]); setNotice(''); setProbe(null);
    const r = await buildPlanAction(projectId, brief);
    setBusy('');
    if ('error' in r) { setError(r.error); return; }
    setPlan(r.plan);
    setDirty(true);
    setWarnings([
      ...(r.aiFailure ? [L(`AI non disponibile (${r.aiFailure.message}): questa è una lettura a regole, controllala.`, `AI not available (${r.aiFailure.message}): this is a rule-based reading, check it.`)] : []),
      ...r.warnings.filter((w) => !r.aiFailure || !w.startsWith('L’AI non ha risposto')),
    ]);
  };

  const runProbe = async () => {
    if (!plan) return;
    setBusy('probe'); setError('');
    const r = await probePlanAction(projectId, plan);
    setBusy('');
    if ('error' in r) setError(r.error);
    else setProbe(r);
  };

  const save = async () => {
    if (!plan) return;
    setBusy('save'); setError('');
    const r = await savePlanAction(projectId, { ...plan, brief });
    setBusy('');
    if ('error' in r) { setError(r.error); return; }
    setPlan(r.plan);
    setIsSaved(true);
    setDirty(false);
    setWarnings(r.warnings);
    setNotice(L(
      'Piano salvato: dalla prossima raccolta Radar segue queste query. Le menzioni dell’ultimo mese si stanno rietichettando.',
      'Plan saved: from the next collection Radar follows these queries. Last month’s mentions are being re-tagged.',
    ));
  };

  // --- modifiche ai concetti ---
  const updateConcept = (id: string, patch: Partial<Concept>) => change((p) => ({
    ...p, concepts: p.concepts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
  }));
  const removeConcept = (id: string) => change((p) => ({
    ...p,
    concepts: p.concepts.filter((c) => c.id !== id),
    queries: p.queries
      .map((q) => ({ ...q, all: q.all.filter((x) => x !== id), none: q.none.filter((x) => x !== id) }))
      .filter((q) => q.all.length),
  }));
  const addConcept = (role: ConceptRole) => change((p) => {
    const taken = new Set(p.concepts.map((c) => c.id));
    const label = L(`Nuovo ${ROLE_LABEL[role].it.toLowerCase()}`, `New ${ROLE_LABEL[role].en.toLowerCase()}`);
    return { ...p, concepts: [...p.concepts, { id: slugId(`${role}-${label}`, taken), label, role, terms: [] }] };
  });

  // --- modifiche alle query ---
  const updateQuery = (id: string, patch: Partial<QueryDef>) => change((p) => ({
    ...p, queries: p.queries.map((q) => (q.id === id ? { ...q, ...patch } : q)),
  }));
  const toggleIn = (q: QueryDef, key: 'all' | 'none', conceptId: string) => {
    const has = q[key].includes(conceptId);
    const other = key === 'all' ? 'none' : 'all';
    updateQuery(q.id, {
      [key]: has ? q[key].filter((x) => x !== conceptId) : [...q[key], conceptId],
      [other]: q[other].filter((x) => x !== conceptId),
    } as Partial<QueryDef>);
  };
  const addQuery = () => change((p) => {
    const taken = new Set(p.queries.map((q) => q.id));
    const subject = p.concepts.find((c) => c.role === 'subject') ?? p.concepts[0];
    const name = L('Nuova query', 'New query');
    return {
      ...p,
      queries: [...p.queries, {
        id: slugId(name, taken), name, kind: 'custom',
        all: subject ? [subject.id] : [], none: [], enabled: p.queries.filter((q) => q.enabled).length < LIMITS.enabledQueries,
      }],
    };
  });

  const startEmpty = () => {
    setPlan({ version: 1, brief, concepts: [], queries: [], origin: 'manual', updatedAt: new Date().toISOString() });
    setDirty(true);
  };

  const validation = plan ? validatePlan(plan) : null;
  const invalidQueries = plan ? plan.queries.filter((q) => !validation!.plan.queries.some((v) => v.name === q.name)) : [];

  // --- consigli dalla prova ---
  const advice: { tone: 'warn' | 'ok'; text: string }[] = [];
  if (probe && plan) {
    for (const t of probe.terms.filter((x) => x.hits === 0)) {
      const c = plan.concepts.find((x) => x.id === t.conceptId);
      advice.push({ tone: 'warn', text: L(`“${t.term}” (${c?.label}) non trova niente in una settimana: scritto male, troppo specifico, o in un’altra lingua?`, `“${t.term}” (${c?.label}) finds nothing in a week: misspelled, too specific, or another language?`) });
    }
    for (const q of probe.queries) {
      const def = plan.queries.find((x) => x.id === q.queryId);
      if (!def) continue;
      if (q.hits === 0) advice.push({ tone: 'warn', text: L(`“${def.name}” non trova niente in una settimana: la combinazione è stretta. Aggiungi sinonimi al contesto, o accetta che sia una query “sentinella” che si accende solo quando succede qualcosa.`, `“${def.name}” finds nothing in a week: the combination is narrow. Add synonyms to the context, or keep it as a “sentinel” query that only lights up when something happens.`) });
      if (q.dominant) advice.push({ tone: 'warn', text: L(`In “${def.name}” il termine “${q.dominant.term}” porta da solo il ${q.dominant.share}% dei risultati: controlla che non sia troppo generico o ambiguo.`, `In “${def.name}” the term “${q.dominant.term}” alone brings ${q.dominant.share}% of results: check it is not too generic or ambiguous.`) });
    }
    if (!advice.length) advice.push({ tone: 'ok', text: L('Tutti i termini e tutte le query trovano risultati. Controlla i titoli di esempio: sono quello che ti aspetti?', 'Every term and query finds results. Check the sample headlines: are they what you expect?') });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 1. La richiesta */}
      <section className="panel px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <span className="flex size-5 items-center justify-center rounded-full bg-sky-500 text-[11px] font-bold text-slate-950">1</span>
          {L('Che cosa vuoi monitorare?', 'What do you want to monitor?')}
        </h2>
        <p className="mb-2 mt-1 text-[11px] text-slate-500">
          {L('Scrivilo come lo diresti a un collega: il soggetto, i fatti o i temi a cui legarlo, i competitor. Radar ne ricava i mattoncini e le query.',
            'Write it as you would tell a colleague: the subject, the facts or themes to relate it to, the competitors. Radar turns it into building blocks and queries.')}
        </p>
        <textarea value={brief} onChange={(e) => { setBrief(e.target.value); if (plan) setDirty(true); }} rows={3}
          placeholder={L(EXAMPLE_IT, EXAMPLE_EN)}
          className="w-full resize-y rounded-lg border border-[var(--border)] bg-transparent px-3 py-2 text-sm outline-none focus:border-sky-500/50" />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button onClick={build} disabled={busy !== '' || brief.trim().length < 8}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-sky-400 disabled:opacity-50">
            {busy === 'build' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {plan ? L('Ricostruisci dalla richiesta', 'Rebuild from the request') : L('Costruisci le query', 'Build the queries')}
          </button>
          {!plan && (
            <button onClick={startEmpty} className="text-xs text-slate-400 hover:text-slate-200">
              {L('oppure parti da zero, a mano', 'or start from scratch, by hand')}
            </button>
          )}
          {!aiAvailable && (
            <span className="text-[11px] text-amber-300/80">
              {L('AI non configurata: la richiesta verrà letta con regole semplici.', 'AI not configured: the request will be read with simple rules.')}
            </span>
          )}
          {plan && dirty && isSaved && (
            <span className="text-[11px] text-slate-500">{L('Ricostruire sostituisce il piano attuale solo quando salvi.', 'Rebuilding replaces the current plan only when you save.')}</span>
          )}
        </div>
      </section>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-4 py-2 text-xs text-red-200">{error}</p>}
      {warnings.length > 0 && (
        <ul className="rounded-lg border border-amber-500/30 bg-amber-500/[0.05] px-4 py-2 text-[11px] text-amber-100">
          {warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
      {notice && <p className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.05] px-4 py-2 text-xs text-emerald-200"><Check className="size-3.5" /> {notice}</p>}

      {plan && (
        <>
          {plan.origin === 'legacy' && !dirty && (
            <p className="rounded-lg border border-[var(--border)] px-4 py-2 text-[11px] text-slate-400">
              {L('Questa è la query attuale del progetto, trasformata in mattoncini. La raccolta non cambia finché non salvi.',
                'This is the project’s current query, turned into building blocks. Collection does not change until you save.')}
            </p>
          )}

          {/* 2. I mattoncini */}
          <section className="panel px-5 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <span className="flex size-5 items-center justify-center rounded-full bg-sky-500 text-[11px] font-bold text-slate-950">2</span>
              {L('I mattoncini', 'The building blocks')}
              <span className="text-[11px] font-normal text-slate-500">
                {L('— ogni concetto è un OR dei suoi termini; se lo correggi, cambiano tutte le query che lo usano.',
                  '— each concept is an OR of its terms; edit it and every query using it changes.')}
              </span>
            </h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {plan.concepts.map((c) => (
                <ConceptCard key={c.id} concept={c} lang={lang}
                  hits={(t) => termHits.get(`${c.id}|${t}`)}
                  onChange={(patch) => updateConcept(c.id, patch)}
                  onRemove={() => removeConcept(c.id)} />
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {(['subject', 'context', 'competitor', 'noise'] as ConceptRole[]).map((r) => (
                <button key={r} onClick={() => addConcept(r)} disabled={plan.concepts.length >= LIMITS.concepts}
                  className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/5 disabled:opacity-40">
                  <Plus className="size-3" /> {ROLE_LABEL[r][lang]}
                </button>
              ))}
            </div>
          </section>

          {/* 3. Le query */}
          <section className="panel px-5 py-4">
            <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-200">
              <span className="flex size-5 items-center justify-center rounded-full bg-sky-500 text-[11px] font-bold text-slate-950">3</span>
              {L(`Le query (${enabledCount} attive su ${LIMITS.enabledQueries})`, `The queries (${enabledCount} active of ${LIMITS.enabledQueries})`)}
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {plan.queries.map((q) => {
                const cq = compiled.get(q.id);
                const pr = queryHits.get(q.id);
                const st = statsById.get(q.id);
                const invalid = invalidQueries.some((x) => x.id === q.id);
                return (
                  <article key={q.id} className={`rounded-xl border px-4 py-3 ${q.enabled ? 'border-[var(--border)]' : 'border-dashed border-[var(--border)] opacity-60'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <input type="checkbox" checked={q.enabled} className="accent-sky-500"
                          disabled={!q.enabled && enabledCount >= LIMITS.enabledQueries}
                          onChange={(e) => updateQuery(q.id, { enabled: e.target.checked })} />
                        {q.enabled ? L('attiva', 'active') : L('spenta', 'off')}
                      </label>
                      <input value={q.name} onChange={(e) => updateQuery(q.id, { name: e.target.value })}
                        className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-medium text-slate-100 hover:border-[var(--border)] focus:border-sky-500/50 focus:outline-none" />
                      {st && (
                        <span className="text-[11px] text-slate-400" title={L('menzioni già in archivio con questa query', 'mentions already archived by this query')}>
                          {L('in archivio:', 'archived:')} <b className="text-slate-200">{st.last7}</b> {L('in 7 gg', 'in 7d')} · {st.last30} {L('in 30 gg', 'in 30d')}
                        </span>
                      )}
                      <button onClick={() => change((p) => ({ ...p, queries: p.queries.filter((x) => x.id !== q.id) }))}
                        className="rounded p-1 text-slate-600 hover:text-red-300" title={L('Elimina la query', 'Delete query')}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">{describeQuery(plan, q, lang)}</p>
                    {invalid && <p className="mt-1 text-[11px] text-amber-300">{L('Serve almeno un concetto richiesto (non “da escludere”).', 'Needs at least one required concept (not “exclude”).')}</p>}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {plan.concepts.map((c) => {
                        const inAll = q.all.includes(c.id);
                        const inNone = q.none.includes(c.id);
                        const key = c.role === 'noise' ? 'none' : 'all';
                        const on = key === 'all' ? inAll : inNone;
                        return (
                          <button key={c.id} onClick={() => toggleIn(q, key, c.id)}
                            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition ${on
                              ? (c.role === 'noise' ? 'border-red-500/50 bg-red-500/15 text-red-200' : 'border-sky-500/50 bg-sky-500/15 text-sky-100')
                              : 'border-[var(--border)] text-slate-500 hover:text-slate-300'}`}
                            title={c.role === 'noise' ? L('escludi', 'exclude') : L('richiedi', 'require')}>
                            <span className={`size-1.5 rounded-full ${ROLE_DOT[c.role]}`} />
                            {c.role === 'noise' ? '−' : ''}{c.label}
                          </button>
                        );
                      })}
                    </div>

                    {cq && (
                      <div className="mt-2 flex items-start gap-1 rounded-lg bg-black/25 px-2 py-1.5">
                        <code className="min-w-0 flex-1 break-words text-[10.5px] leading-relaxed text-slate-300">{toBoolean(cq)}</code>
                        <CopyButton text={toBoolean(cq)} />
                      </div>
                    )}

                    {pr && (
                      <div className="mt-2 text-[11px]">
                        <p className={pr.hits === 0 ? 'text-amber-300' : 'text-slate-300'}>
                          {pr.hits < 0
                            ? L('Prova non riuscita per questa query.', 'Test failed for this query.')
                            : L(`Google News, ultimi ${probe!.days} giorni: ${pr.hits}${pr.capped ? '+' : ''} notizie`, `Google News, last ${probe!.days} days: ${pr.hits}${pr.capped ? '+' : ''} stories`)}
                          {pr.dominant && <span className="text-amber-300"> · {L(`“${pr.dominant.term}” pesa il ${pr.dominant.share}%`, `“${pr.dominant.term}” weighs ${pr.dominant.share}%`)}</span>}
                        </p>
                        <ul className="mt-1 flex flex-col gap-0.5">
                          {pr.samples.map((s) => (
                            <li key={`${s.url}${s.title}`} className="truncate text-slate-500">
                              · <a href={s.url} target="_blank" rel="noopener noreferrer" className="hover:text-sky-300">{s.title}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
            <button onClick={addQuery} disabled={plan.queries.length >= LIMITS.queries || !plan.concepts.length}
              className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-slate-400 hover:bg-white/5 disabled:opacity-40">
              <Plus className="size-3" /> {L('Aggiungi una query', 'Add a query')}
            </button>
          </section>

          {/* 4. Prova e salvataggio */}
          <section className="panel sticky bottom-2 z-10 px-5 py-3 shadow-lg shadow-black/30">
            {advice.length > 0 && (
              <ul className="mb-2 flex flex-col gap-1 text-[11px]">
                {advice.slice(0, 6).map((a) => (
                  <li key={a.text} className={`flex items-start gap-1.5 ${a.tone === 'warn' ? 'text-amber-200' : 'text-emerald-300'}`}>
                    {a.tone === 'warn' ? <AlertTriangle className="mt-0.5 size-3 shrink-0" /> : <Check className="mt-0.5 size-3 shrink-0" />}
                    {a.text}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={runProbe} disabled={busy !== '' || !plan.queries.length}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 px-3 py-1.5 text-xs text-sky-200 hover:bg-sky-500/10 disabled:opacity-50">
                {busy === 'probe' ? <Loader2 className="size-3.5 animate-spin" /> : <FlaskConical className="size-3.5" />}
                {L('Prova sul campo', 'Test on real news')}
              </button>
              <button onClick={save} disabled={busy !== '' || !dirty || !enabledCount || invalidQueries.length > 0}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
                {busy === 'save' ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {isSaved ? L('Salva le modifiche', 'Save changes') : L('Salva e attiva', 'Save and activate')}
              </button>
              <span className="text-[11px] text-slate-500">
                {dirty
                  ? L('Modifiche non salvate.', 'Unsaved changes.')
                  : isSaved ? L('La raccolta segue questo piano.', 'Collection follows this plan.') : ''}
                {!probe && dirty && L(' Consiglio: prova prima di salvare.', ' Tip: test before saving.')}
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ConceptCard({ concept, lang, hits, onChange, onRemove }: {
  concept: Concept;
  lang: Lang;
  hits: (term: string) => { hits: number; capped: boolean; samples: { title: string }[] } | undefined;
  onChange: (patch: Partial<Concept>) => void;
  onRemove: () => void;
}) {
  const L = (it: string, en: string) => (lang === 'it' ? it : en);
  const [draft, setDraft] = useState('');
  const add = () => {
    const parts = draft.split(',').map((t) => t.trim()).filter(Boolean);
    if (!parts.length) return;
    const seen = new Set(concept.terms.map((t) => t.toLowerCase()));
    onChange({ terms: [...concept.terms, ...parts.filter((t) => !seen.has(t.toLowerCase()))].slice(0, LIMITS.termsPerConcept) });
    setDraft('');
  };
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${ROLE_STYLE[concept.role]}`}>
      <div className="flex items-center gap-2">
        <input value={concept.label} onChange={(e) => onChange({ label: e.target.value })}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-sm font-semibold text-slate-100 hover:border-[var(--border)] focus:outline-none" />
        <select value={concept.role} onChange={(e) => onChange({ role: e.target.value as ConceptRole })}
          className="rounded border border-[var(--border)] bg-[var(--panel-2)] px-1 py-0.5 text-[11px] text-slate-300">
          {(['subject', 'context', 'competitor', 'noise'] as ConceptRole[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r][lang]}</option>)}
        </select>
        <button onClick={onRemove} className="rounded p-0.5 text-slate-600 hover:text-red-300" title={L('Elimina', 'Delete')}>
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {concept.note && <p className="mt-0.5 px-1 text-[10px] text-slate-500">{concept.note}</p>}
      <div className="mt-2 flex flex-wrap gap-1">
        {concept.terms.map((t) => {
          const h = hits(t);
          const tone = !h ? 'text-slate-300' : h.hits === 0 ? 'text-amber-300' : h.hits < 0 ? 'text-slate-500' : 'text-slate-200';
          return (
            <span key={t} className={`inline-flex items-center gap-1 rounded-md bg-black/25 px-1.5 py-0.5 text-[11px] ${tone}`}
              title={h?.samples.map((s) => s.title).join('\n')}>
              {t}
              {h && h.hits >= 0 && (
                <span className={`rounded px-1 text-[9px] ${h.hits === 0 ? 'bg-amber-500/20' : 'bg-white/10 text-slate-400'}`}>
                  {h.hits}{h.capped ? '+' : ''}
                </span>
              )}
              <button onClick={() => onChange({ terms: concept.terms.filter((x) => x !== t) })} className="text-slate-500 hover:text-red-300">
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
          onBlur={add}
          placeholder={L('+ termine, invio', '+ term, enter')}
          className="w-28 rounded-md border border-dashed border-[var(--border)] bg-transparent px-1.5 py-0.5 text-[11px] outline-none focus:border-sky-500/50" />
      </div>
      {!concept.terms.length && <p className="mt-1 px-1 text-[10px] text-amber-300">{L('Senza termini questo concetto non conta.', 'With no terms this concept does not count.')}</p>}
    </div>
  );
}
