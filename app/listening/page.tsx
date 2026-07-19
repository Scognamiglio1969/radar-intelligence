import Link from 'next/link';
import { cookies } from 'next/headers';
import { getCurrentProject, listeningData } from '@/lib/data';
import { PageHeader, MentionCard, EmptyState, fmtNum } from '@/components/ui';
import { SOURCE_META } from '@/lib/connectors';
import { SearchBox } from '@/components/search-box';
import { TranslateBar } from '@/components/translate-bar';
import { translateMentions, TRANSLATE_LANGS, type Translated } from '@/lib/translate';

const SENTIMENTS = ['positive', 'neutral', 'negative'];
const PERIODS = [{ v: 1, l: '24 hours' }, { v: 7, l: '7 days' }, { v: 30, l: '30 days' }, { v: 90, l: '90 days' }];

function buildQS(params: Record<string, string | number | undefined>) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const metadata = { title: 'Listening' };

export default async function ListeningPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const project = await getCurrentProject();
  if (!project) return <EmptyState message="No project configured." />;
  const sp = await searchParams;
  const semanticTerms = sp.st ? sp.st.split('|').filter(Boolean) : undefined;
  const filters = {
    source: sp.fonte, sentiment: sp.sentiment, language: sp.lingua,
    q: sp.q, days: sp.giorni ? Number(sp.giorni) : undefined,
    page: sp.pagina ? Number(sp.pagina) : 1,
    semanticTerms,
    minRelevance: sp.rilevanza ? Number(sp.rilevanza) : undefined,
    author: sp.autore,
    authors: sp.autori ? sp.autori.split('|').filter(Boolean) : undefined,
    ids: sp.ids ? sp.ids.split(',').map(Number).filter((n) => Number.isFinite(n) && n > 0) : undefined,
    sortBy: (sp.ordina as 'data' | 'engagement' | 'rilevanza' | undefined) ?? 'data',
  };
  const data = await listeningData(project.id, filters);

  // Reading language chosen by the user: translates the current page (cached in DB)
  const readLang = (await cookies()).get('sr_translate')?.value ?? null;
  const translations: Map<number, Translated> = readLang
    ? await translateMentions(data.rows, readLang)
    : new Map();

  const current = {
    fonte: sp.fonte, sentiment: sp.sentiment, lingua: sp.lingua, q: sp.q, st: sp.st,
    giorni: sp.giorni, rilevanza: sp.rilevanza, autore: sp.autore, autori: sp.autori, ids: sp.ids,
    ordina: sp.ordina,
  };
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <>
      <PageHeader title="Listening" subtitle={`${fmtNum(data.total)} mentions found`} />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <div className="mr-2"><SearchBox /></div>
        <TranslateBar current={readLang} langs={TRANSLATE_LANGS} />
        {semanticTerms && (
          <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-1 text-violet-300"
            title={semanticTerms.join(', ')}>
            ✨ semantic search: {semanticTerms.length} terms
          </span>
        )}

        <FilterGroup label="Source" items={Object.entries(SOURCE_META).map(([id, m]) => ({ value: id, label: m.label }))}
          param="fonte" current={current} />
        <FilterGroup label="Sentiment" items={SENTIMENTS.map((s) => ({ value: s, label: s }))}
          param="sentiment" current={current} />
        <FilterGroup label="Period" items={PERIODS.map((p) => ({ value: String(p.v), label: p.l }))}
          param="giorni" current={current} />
        <FilterGroup label="Language" items={data.languages.map((l) => ({ value: l.language!, label: l.language!.toUpperCase() }))}
          param="lingua" current={current} />
        <FilterGroup label="Relevance" items={[{ value: '4', label: '★ ≥ 4' }, { value: '5', label: '★ 5' }]}
          param="rilevanza" current={current} />
        <FilterGroup label="Sort" items={[
          { value: 'engagement', label: 'engagement' }, { value: 'rilevanza', label: 'relevance' },
        ]} param="ordina" current={current} />
        {sp.fonte && SOURCE_META[sp.fonte] && (
          <Link href={`/source/${sp.fonte}`}
            className="flex items-center gap-1 rounded-full border border-sky-500/40 bg-sky-500/10 px-2.5 py-1 font-semibold text-sky-300 transition hover:bg-sky-500/25"
            title={`Full channel analysis of ${SOURCE_META[sp.fonte].label}: volume, sentiment, topics and authors compared with the whole project`}>
            🔬 Deep-dive {SOURCE_META[sp.fonte].label} →
          </Link>
        )}
        {sp.autore && (
          <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-1 text-sky-300">
            author: {sp.autore}
          </span>
        )}
        {sp.ids && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
            a specific set of {filters.ids?.length ?? 0} posts (from a narrative)
          </span>
        )}
        {sp.autori && (
          <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-amber-300">
            posts from {filters.authors?.length ?? 0} accounts (from a narrative)
          </span>
        )}

        {(sp.fonte || sp.sentiment || sp.lingua || sp.q || sp.st || sp.giorni || sp.rilevanza || sp.autore || sp.autori || sp.ids || sp.ordina) && (
          <Link href="/listening"
            className="flex items-center gap-1.5 rounded-full border border-sky-500/40 bg-sky-500/10 px-3.5 py-1.5 font-semibold text-sky-300 transition hover:bg-sky-500/25">
            ↺ Show all
          </Link>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {data.rows.length
          ? data.rows.map((m) => <MentionCard key={m.id} m={m} translated={translations.get(m.id)} />)
          : <EmptyState message="No mentions with these filters." />}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm">
          {data.page > 1 && (
            <Link className="text-sky-400 hover:text-sky-300" href={`/listening${buildQS({ ...current, pagina: data.page - 1 })}`}>← previous</Link>
          )}
          <span className="text-slate-500">page {data.page} of {totalPages}</span>
          {data.page < totalPages && (
            <Link className="text-sky-400 hover:text-sky-300" href={`/listening${buildQS({ ...current, pagina: data.page + 1 })}`}>next →</Link>
          )}
        </div>
      )}
    </>
  );
}

function FilterGroup({ label, items, param, current }: {
  label: string;
  items: { value: string; label: string }[];
  param: string;
  current: Record<string, string | undefined>;
}) {
  const active = current[param];
  return (
    <span className="flex items-center gap-1">
      <span className="text-slate-500">{label}:</span>
      {items.map((it) => {
        const isActive = active === it.value;
        const next = { ...current, [param]: isActive ? undefined : it.value };
        return (
          <Link
            key={it.value}
            href={`/listening${buildQS(next)}`}
            className={`rounded-full px-2.5 py-1 transition ${
              isActive ? 'bg-sky-500/20 text-sky-300' : 'bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </span>
  );
}
