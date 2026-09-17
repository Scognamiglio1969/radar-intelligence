import Link from 'next/link';
import { Plus, Trash2, Link2, Star, Radar, UploadCloud, Antenna } from 'lucide-react';
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { shareLinks } from '@/lib/db/schema';
import { CopyButton } from '@/components/copy-button';
import { DeleteProject } from '@/components/delete-project';
import { SubmitButton } from '@/components/submit-button';
import { getBenchmarkEntities, getCurrentProject, getProjects } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import { getT } from '@/lib/i18n';
import type { projects as projectsTable } from '@/lib/db/schema';
import { EditableEntity } from '@/components/editable-entity';
import {
  addEntity, createProject, createImportProject, createTalkwalkerProject, createShareLink, deleteEntity,
  revokeShareLink, setOwnBrand, updateEntity, updateProject, updateImportProject,
  updateTalkwalkerProject,
} from './actions';
import { listTalkwalkerTopics } from '@/lib/connectors/talkwalker';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';

type Project = typeof projectsTable.$inferSelect;

const LANGS = [
  ['it', 'Italian'], ['en', 'English'], ['es', 'Spanish'],
  ['fr', 'French'], ['de', 'German'], ['pt', 'Portuguese'],
] as const;

const COUNTRIES = [
  ['IT', 'Italy'], ['US', 'United States'], ['GB', 'United Kingdom'], ['FR', 'France'],
  ['DE', 'Germany'], ['ES', 'Spain'], ['BR', 'Brazil'], ['MX', 'Mexico'],
  ['CA', 'Canada'], ['AU', 'Australia'], ['IN', 'India'], ['NL', 'Netherlands'],
  ['PL', 'Poland'], ['JP', 'Japan'],
] as const;

const inputCls = 'w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none placeholder:text-slate-600';
const btnCls = 'rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400';

export const metadata = { title: 'Projects' };

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const sp = await searchParams;
  const [allProjects, current] = await Promise.all([getProjects(), getCurrentProject()]);
  if (allProjects.length === 0) return <EmptyState message="No project." />;

  const isNew = sp.p === 'new';
  const newType = sp.type; // 'listening' | 'import' | 'talkwalker' | undefined (chooser)
  const selected = isNew
    ? null
    : allProjects.find((p) => p.id === Number(sp.p)) ?? current ?? allProjects[0];
  const entities = selected ? await getBenchmarkEntities(selected.id) : [];

  // I topic si leggono da Talkwalker solo quando servono davvero: chiamata
  // gratuita ma con rate limit stretto (20/min), e un errore qui non deve
  // impedire di aprire le impostazioni — si mostra il motivo e si va avanti.
  let twTopics: { id: string; label: string }[] = [];
  let twTopicsError: string | null = null;
  if (selected?.mode === 'talkwalker' && selected.talkwalkerProject) {
    try {
      await hydrateConnectorCredentials();
      twTopics = await listTalkwalkerTopics(selected.talkwalkerProject);
    } catch (e) {
      twTopicsError = (e as Error).message;
    }
  }
  const db = await getDb();
  const activeShares = selected
    ? await db.select().from(shareLinks)
      .where(and(eq(shareLinks.projectId, selected.id), gte(shareLinks.expiresAt, new Date())))
    : [];
  const shareBase = process.env.APP_URL ?? '';

  return (
    <>
      <PageHeader
        title={t('page.settings.title', 'Projects')}
        subtitle="Each project is an independent listening scope: query, languages, geographies and entities to compare"
      />

      {/* Project tabs */}
      <div className="mb-0 flex flex-wrap items-end gap-1 border-b border-[var(--border)]">
        {allProjects.map((p) => {
          const active = !isNew && selected?.id === p.id;
          return (
            <Link
              key={p.id}
              href={`/settings?p=${p.id}`}
              className={`rounded-t-lg border border-b-0 px-4 py-2 text-sm transition ${
                active
                  ? 'border-[var(--border)] bg-[var(--panel)] font-medium text-sky-300'
                  : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              {p.name}
            </Link>
          );
        })}
        <Link
          href="/settings?p=new"
          className={`flex items-center gap-1.5 rounded-t-lg border border-b-0 px-4 py-2 text-sm transition ${
            isNew
              ? 'border-[var(--border)] bg-[var(--panel)] font-medium text-sky-300'
              : 'border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <Plus className="size-4" /> New project
        </Link>
      </div>

      <div className="mx-auto max-w-3xl">
        <div>
          {/* key legata al progetto: forza il remount dei campi (defaultValue) quando
              si cambia scheda, altrimenti gli input non controllati restano coi valori vecchi. */}
          <section key={isNew ? `new-${newType ?? 'choose'}` : selected?.id ?? 'none'} className="panel rounded-t-none border-t-0 px-5 py-5">
            {isNew ? (
              !newType ? (
                /* Passo 0: che tipo di progetto? */
                <div>
                  <h2 className="mb-3 text-sm font-semibold text-slate-300">What kind of project?</h2>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Link href="/settings?p=new&type=listening"
                      className="group flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-4 transition hover:border-sky-500/50 hover:bg-sky-500/[0.05]">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Radar className="size-4 text-sky-400" /> Listening</span>
                      <span className="text-xs leading-snug text-slate-400">Radar collects mentions automatically from the web — news, social, RSS. You set the keywords and sources.</span>
                    </Link>
                    <Link href="/settings?p=new&type=import"
                      className="group flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-4 transition hover:border-sky-500/50 hover:bg-sky-500/[0.05]">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100"><UploadCloud className="size-4 text-sky-400" /> Import file</span>
                      <span className="text-xs leading-snug text-slate-400">Bring your own data from an Excel or CSV file — surveys, exports. Radar analyzes it the same way. No scraping.</span>
                    </Link>
                    <Link href="/settings?p=new&type=talkwalker"
                      className="group flex flex-col gap-1.5 rounded-xl border border-[var(--border)] bg-white/[0.02] px-4 py-4 transition hover:border-teal-500/50 hover:bg-teal-500/[0.05]">
                      <span className="flex items-center gap-2 text-sm font-semibold text-slate-100"><Antenna className="size-4 text-teal-400" /> Talkwalker</span>
                      <span className="text-xs leading-snug text-slate-400">Read mentions live from your corporate Talkwalker account through its API. No scraping, no files — and it spends Talkwalker credits.</span>
                    </Link>
                  </div>
                </div>
              ) : newType === 'talkwalker' ? (
                <form action={createTalkwalkerProject} className="flex flex-col gap-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300"><Antenna className="size-4 text-teal-400" /> New Talkwalker project</h2>
                  <p className="text-xs leading-relaxed text-slate-400">
                    No keywords here: the search is already written in Talkwalker. Point at the project, and Radar takes what it collects — including the tags and corrections made over there.
                  </p>
                  <TalkwalkerFields project={null} topics={[]} topicsError={null} />
                  <TalkwalkerNotice />
                  <p className="text-xs text-slate-500">Once created, you can narrow it down to specific topics of that Talkwalker project.</p>
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Creating project…">Create and build the queries →</SubmitButton>
                    <Link href="/settings?p=new" className="text-xs text-slate-500 hover:text-slate-300">← back</Link>
                  </div>
                </form>
              ) : newType === 'import' ? (
                <form action={createImportProject} className="flex flex-col gap-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300"><UploadCloud className="size-4 text-sky-400" /> New import project</h2>
                  <label className="text-xs text-slate-400">
                    Project name
                    <input name="name" className={`${inputCls} mt-1`} placeholder="e.g. Q2 survey exports" required />
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input type="checkbox" name="shared" className="accent-sky-500" />
                    Share this project with the whole team (read-only for others)
                  </label>
                  <p className="text-xs text-slate-500">Next you’ll upload an Excel/CSV file and map its columns to Radar’s fields.</p>
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Creating…">Create &amp; upload file</SubmitButton>
                    <Link href="/settings?p=new" className="text-xs text-slate-500 hover:text-slate-300">← back</Link>
                  </div>
                </form>
              ) : (
                <form action={createProject} className="flex flex-col gap-4">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-300"><Radar className="size-4 text-sky-400" /> New listening project</h2>
                  <ProjectFields project={null} />
                  <div className="mt-2 flex items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Creating project…">Create and build the queries →</SubmitButton>
                    <Link href="/settings?p=new" className="text-xs text-slate-500 hover:text-slate-300">← back</Link>
                  </div>
                </form>
              )
            ) : selected && (
              <>
                {selected.mode === 'talkwalker' ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-teal-500/25 bg-teal-500/[0.05] px-4 py-3">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-teal-200"><Antenna className="size-4" /> Talkwalker project</span>
                      <span className="text-xs text-slate-400">— mentions come from the corporate Talkwalker API. No other source is queried.</span>
                    </div>
                    <form action={updateTalkwalkerProject} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={selected.id} />
                      <TalkwalkerFields project={selected} topics={twTopics} topicsError={twTopicsError} />
                      <TalkwalkerNotice />
                      <div className="mt-2 border-t border-[var(--border)] pt-4">
                        <SubmitButton className={btnCls} pendingLabel="Saving…">Save changes</SubmitButton>
                      </div>
                    </form>
                  </>
                ) : selected.mode === 'upload' ? (
                  <>
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] px-4 py-3">
                      <span className="flex items-center gap-1.5 text-sm font-medium text-sky-200"><UploadCloud className="size-4" /> Import project</span>
                      <span className="text-xs text-slate-400">— data comes from files you upload, not scraping.</span>
                      <Link href={`/import?project=${selected.id}`}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-sky-400">
                        <UploadCloud className="size-3.5" /> Import a file
                      </Link>
                    </div>
                    <form action={updateImportProject} className="flex flex-col gap-4">
                      <input type="hidden" name="id" value={selected.id} />
                      <label className="text-xs text-slate-400">
                        Project name
                        <input name="name" defaultValue={selected.name} className={`${inputCls} mt-1`} required />
                      </label>
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <input type="checkbox" name="shared" defaultChecked={selected.visibility === 'shared'} className="accent-sky-500" />
                        Share this project with the whole team (read-only for others)
                      </label>
                      <div className="mt-2 border-t border-[var(--border)] pt-4">
                        <SubmitButton className={btnCls} pendingLabel="Saving…">Save changes</SubmitButton>
                      </div>
                    </form>
                  </>
                ) : (
                  <form action={updateProject} className="flex flex-col gap-4">
                    <input type="hidden" name="id" value={selected.id} />
                    <ProjectFields project={selected} />
                    <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
                      <SubmitButton className={btnCls} pendingLabel="Saving…">Save changes</SubmitButton>
                    </div>
                  </form>
                )}

                <hr className="my-5 border-[var(--border)]" />

                <h3 className="mb-1 text-sm font-semibold text-slate-300">Benchmark entities</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Brands or competitors to compare on the Benchmark page: mentions citing these keywords are attributed to the entity.
                  Saving a query plan updates the subject and the competitors here automatically; the others stay as they are.
                  Mark one with the <Star className="inline size-3 -translate-y-px text-amber-400" /> to set it as <span className="text-amber-300">your brand</span> —
                  this unlocks the Brand Health Index (your brand vs the market and the competitors).
                </p>
                <div className="flex flex-col gap-2">
                  {entities.map((e) => (
                    <EditableEntity
                      key={e.id} entity={e} projectId={selected.id} inputCls={inputCls}
                      updateEntity={updateEntity} setOwnBrand={setOwnBrand} deleteEntity={deleteEntity}
                    />
                  ))}
                  {entities.length === 0 && (
                    <p className="text-xs text-slate-600">No entities: add one to use Benchmark.</p>
                  )}
                </div>
                <form action={addEntity} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="projectId" value={selected.id} />
                  <input name="name" placeholder="Entity name" className={inputCls} required />
                  <input name="keywords" placeholder="associated keywords (optional)" className={inputCls} />
                  <SubmitButton pendingLabel="Adding…"
                    className="shrink-0 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                    Add
                  </SubmitButton>
                </form>

                <hr className="my-5 border-[var(--border)]" />

                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Link2 className="size-4 text-sky-400" /> Sharing
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  Create a read-only link to show the report to managers or clients without sharing the password. It expires on its own.
                </p>
                <div className="flex flex-col gap-2">
                  {activeShares.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <code className="truncate text-sky-300">{shareBase ? `${shareBase}/share/${s.token}` : `/share/${s.token}`}</code>
                      <span className="text-slate-500">expires {s.expiresAt.toLocaleDateString('en-US')}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <CopyButton text={shareBase ? `${shareBase}/share/${s.token}` : `/share/${s.token}`} />
                        <form action={revokeShareLink}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="rounded-md px-2 py-1 text-red-400/80 hover:bg-red-500/10">revoke</button>
                        </form>
                      </span>
                    </div>
                  ))}
                  {activeShares.length === 0 && (
                    <p className="text-xs text-slate-600">No active link.</p>
                  )}
                </div>
                <form action={createShareLink} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="projectId" value={selected.id} />
                  <select name="days" defaultValue="7"
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm outline-none">
                    <option value="1">1 day</option>
                    <option value="7">7 days</option>
                    <option value="30">30 days</option>
                  </select>
                  <SubmitButton pendingLabel="Creating link…"
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                    Create shareable link
                  </SubmitButton>
                </form>

                {allProjects.length > 1 && (
                  <div className="mt-6 border-t border-red-500/20 pt-4">
                    <DeleteProject id={selected.id} name={selected.name} />
                  </div>
                )}
              </>
            )}
          </section>
          <p className="mt-2 px-1 text-[11px] text-slate-600">
            Note: every active project consumes API quota on each update — with the current budget, keep few of them.
            Source status and budget are now in <span className="text-slate-400">Settings → Sources &amp; budget</span>.
          </p>
        </div>
      </div>
    </>
  );
}

/** Project fields, shared between create and edit. */
/**
 * I campi di un progetto Talkwalker: da dove prendere i dati, non cosa cercare.
 *
 * I topic sono quelli già configurati in Talkwalker, letti dalla sua Resources
 * API: si spuntano, non si scrivono. Nessuna spunta = tutto quello che il
 * progetto raccoglie, che è il caso di chi vuole i dati prima delle domande.
 */
function TalkwalkerFields({ project, topics, topicsError }: {
  project: Project | null;
  topics: { id: string; label: string }[];
  topicsError: string | null;
}) {
  const chosen = new Set(project?.talkwalkerTopics ?? []);
  return (
    <>
      <label className="text-xs text-slate-400">
        Project name (in Radar)
        <input name="name" defaultValue={project?.name} className={`${inputCls} mt-1`}
          placeholder="e.g. Corporate reputation" required />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="shared" defaultChecked={project?.visibility === 'shared'} className="accent-sky-500" />
        Share this project with the whole team (read-only for others)
      </label>
      <label className="text-xs text-slate-400">
        Talkwalker project id
        <input name="talkwalkerProject" defaultValue={project?.talkwalkerProject ?? ''}
          className={`${inputCls} mt-1`} placeholder="e.g. kpnutesu_123456" required />
        <span className="mt-1 block text-[11px] text-slate-500">
          Ask your CSM, or read it from the URL of the project inside Talkwalker.
        </span>
      </label>

      {project && (
      <fieldset className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 px-4 py-3">
        <legend className="px-1 text-xs text-slate-400">Where the data comes from</legend>
        {topics.length > 0 ? (
          <>
            <p className="mb-2 text-[11px] text-slate-500">
              Topics configured in that Talkwalker project. <strong>Tick none to take everything</strong> it collects — you can always narrow later.
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {topics.map((t) => (
                <label key={t.id} className="flex items-center gap-1.5 text-sm text-slate-300">
                  <input type="checkbox" name="talkwalkerTopics" value={t.id}
                    defaultChecked={chosen.has(t.id)} className="accent-teal-500" />
                  <span className="truncate" title={t.label}>{t.label}</span>
                </label>
              ))}
            </div>
          </>
        ) : (
          <p className="text-[11px] leading-relaxed text-slate-500">
            {topicsError
              ? `Topics could not be read from Talkwalker: ${topicsError}. Radar will take everything the project collects.`
              : 'Once the token is set, the topics configured in this Talkwalker project appear here to tick. Until then Radar takes everything the project collects.'}
          </p>
        )}
      </fieldset>
      )}

      <label className="text-xs text-slate-400">
        <span className="text-violet-300">✨ Topic description</span> — optional: it doesn’t change what is fetched, it guides the AI relevance stars
        <textarea name="semanticContext" defaultValue={project?.semanticContext ?? ''} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="e.g. Reputation of the group across insurance and mobility" />
      </label>
    </>
  );
}

/** Il costo non è un dettaglio da nascondere: si spendono soldi del contratto. */
function TalkwalkerNotice() {
  return (
    <p className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
      Each refresh runs one Talkwalker search per block of 40 keywords: <strong>10 credits per call plus 1 per result</strong>, taken from your Talkwalker contract. The token goes in Settings → Sources.
    </p>
  );
}

function ProjectFields({ project }: { project: Project | null }) {
  return (
    <>
      <label className="text-xs text-slate-400">
        Project name
        <input name="name" defaultValue={project?.name} className={`${inputCls} mt-1`}
          placeholder="e.g. Renewable energy" required />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="shared" defaultChecked={project?.visibility === 'shared'} className="accent-sky-500" />
        Share this project with the whole team (read-only for others)
      </label>
      {project ? (
        // La query non si scrive più qui: ha una pagina sua, dove si
        // costruisce a parole, si prova e si modifica.
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/25 bg-sky-500/[0.05] px-4 py-3">
          <div className="min-w-0 flex-1 text-xs text-slate-300">
            <p className="font-medium text-sky-200">What this project listens to</p>
            <p className="mt-0.5 text-slate-400">
              {project.queryPlan
                ? `${project.queryPlan.queries.filter((q) => q.enabled).length} active queries built from: “${project.queryPlan.brief.slice(0, 140)}${project.queryPlan.brief.length > 140 ? '…' : ''}”`
                : project.keywords.length
                  ? `Old-style query (${project.keywords.slice(0, 4).join(', ')}${project.keywords.length > 4 ? '…' : ''}). Open the query builder to turn it into building blocks.`
                  : 'No query yet: the project collects nothing until you build one.'}
            </p>
          </div>
          <Link href={`/query?project=${project.id}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-sky-400">
            Open the query builder
          </Link>
        </div>
      ) : (
        <label className="text-xs text-slate-400">
          <span className="text-sky-300">What do you want to monitor?</span> — in plain words; next step, Radar turns it into queries you can test and edit
          <textarea name="semanticContext" rows={3}
            className={`${inputCls} mt-1 resize-y`}
            placeholder="e.g. The company Acme in relation to worker protests, and its competitors Alfa, Beta and Gamma" />
        </label>
      )}
      <fieldset className="text-xs text-slate-400">
        Languages (news editions and search)
        <div className="mt-1.5 flex flex-wrap gap-3">
          {LANGS.map(([code, label]) => (
            <label key={code} className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" name="languages" value={code}
                defaultChecked={project ? project.languages.includes(code) : code === 'it' || code === 'en'}
                className="accent-sky-500" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="text-xs text-slate-400">
        Geographies (applies to news sources; no selection = worldwide)
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-4">
          {COUNTRIES.map(([code, label]) => (
            <label key={code} className="flex items-center gap-1.5 text-sm text-slate-300">
              <input type="checkbox" name="countries" value={code}
                defaultChecked={(project?.countries ?? []).includes(code)} className="accent-sky-500" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-xs text-slate-400">
        Telegram channels to watch (comma-separated usernames, e.g. @reuters)
        <input name="telegramChannels" defaultValue={(project?.telegramChannels ?? []).map((c) => `@${c}`).join(', ')}
          className={`${inputCls} mt-1`} placeholder="e.g. @channel1, @channel2 (optional)" />
      </label>
      <label className="text-xs text-slate-400">
        RSS/Atom feeds to follow (URLs comma- or newline-separated) — outlets, blogs, Google Alerts…
        <textarea name="rssFeeds" defaultValue={(project?.rssFeeds ?? []).join('\n')} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="e.g. https://example.com/feed.xml (optional, max 15)" />
      </label>
      <label className="text-xs text-slate-400">
        Brand tone of voice — used by Content Studio to write drafts
        <textarea name="brandVoice" defaultValue={project?.brandVoice ?? ''} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="e.g. Professional but direct, informal, avoid unnecessary jargon (optional)" />
      </label>
    </>
  );
}
