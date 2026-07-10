import Link from 'next/link';
import { Plus, Trash2, Link2 } from 'lucide-react';
import { and, eq, gte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { shareLinks } from '@/lib/db/schema';
import { CopyButton } from '@/components/copy-button';
import { SubmitButton } from '@/components/submit-button';
import { getBenchmarkEntities, getCurrentProject, getProjects } from '@/lib/data';
import { PageHeader, EmptyState } from '@/components/ui';
import type { projects as projectsTable } from '@/lib/db/schema';
import {
  addEntity, createProject, createShareLink, deleteEntity, deleteProject,
  revokeShareLink, saveAndExpandProject, updateProject,
} from './actions';

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
  const sp = await searchParams;
  const [allProjects, current] = await Promise.all([getProjects(), getCurrentProject()]);
  if (allProjects.length === 0) return <EmptyState message="No project." />;

  const isNew = sp.p === 'new';
  const selected = isNew
    ? null
    : allProjects.find((p) => p.id === Number(sp.p)) ?? current ?? allProjects[0];
  const entities = selected ? await getBenchmarkEntities(selected.id) : [];
  const db = await getDb();
  const activeShares = selected
    ? await db.select().from(shareLinks)
      .where(and(eq(shareLinks.projectId, selected.id), gte(shareLinks.expiresAt, new Date())))
    : [];
  const shareBase = process.env.APP_URL ?? '';

  return (
    <>
      <PageHeader
        title="Projects"
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
          <section className="panel rounded-t-none border-t-0 px-5 py-5">
            {isNew ? (
              <form action={createProject} className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-slate-300">New listening project</h2>
                <ProjectFields project={null} />
                <div className="mt-2 border-t border-[var(--border)] pt-4">
                  <SubmitButton className={btnCls} pendingLabel="Creating project…">Create project</SubmitButton>
                </div>
              </form>
            ) : selected && (
              <>
                <form action={updateProject} className="flex flex-col gap-4">
                  <input type="hidden" name="id" value={selected.id} />
                  <ProjectFields project={selected} />
                  <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Saving…">Save changes</SubmitButton>
                    <SubmitButton formAction={saveAndExpandProject} pendingLabel="Generating terms…"
                      className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20">
                      ✨ Save and generate terms from the topic description
                    </SubmitButton>
                  </div>
                </form>

                <hr className="my-5 border-[var(--border)]" />

                <h3 className="mb-1 text-sm font-semibold text-slate-300">Benchmark entities</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Brands or competitors to compare on the Benchmark page: mentions citing these keywords are attributed to the entity.
                </p>
                <div className="flex flex-col gap-2">
                  {entities.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                      <span className="font-medium">{e.name}</span>
                      <span className="truncate text-xs text-slate-500">{e.keywords.join(', ')}</span>
                      <form action={deleteEntity} className="ml-auto">
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="text-slate-600 hover:text-red-400" aria-label={`Delete ${e.name}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </form>
                    </div>
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
                    <form action={deleteProject}>
                      <input type="hidden" name="id" value={selected.id} />
                      <button type="submit" className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400/90 transition hover:bg-red-500/10">
                        <Trash2 className="size-4" />
                        Delete “{selected.name}” and all its data
                      </button>
                    </form>
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
      <label className="text-xs text-slate-400">
        <span className="text-violet-300">✨ Topic description</span> — describe in plain language what you want to monitor:
        it generates search terms via AI and guides the relevance stars
        <textarea name="semanticContext" defaultValue={project?.semanticContext ?? ''} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="e.g. The electric-car market in Europe: incentives, charging stations, batteries, prices and Chinese competition" />
      </label>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 px-4 py-3">
        <p className="mb-3 text-xs text-slate-500">
          Search query — combines the three fields: (at least one) AND (all) AND (none of the excluded)
        </p>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-slate-400">
            Terms — <span className="text-sky-300">at least one (OR)</span>, comma-separated
            <input name="keywords" defaultValue={project?.keywords.join(', ')} className={`${inputCls} mt-1`}
              placeholder="e.g. electric car, electric vehicle, EV" required />
          </label>
          <label className="text-xs text-slate-400">
            Terms — <span className="text-emerald-300">all required (AND)</span>
            <input name="allTerms" defaultValue={(project?.allTerms ?? []).join(', ')} className={`${inputCls} mt-1`}
              placeholder="e.g. battery (optional)" />
          </label>
          <label className="text-xs text-slate-400">
            Terms — <span className="text-red-300">to exclude (NOT)</span>
            <input name="excludeTerms" defaultValue={(project?.excludeTerms ?? []).join(', ')} className={`${inputCls} mt-1`}
              placeholder="e.g. used, rental (optional)" />
          </label>
        </div>
      </div>
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
