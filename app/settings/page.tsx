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
  ['it', 'Italiano'], ['en', 'Inglese'], ['es', 'Spagnolo'],
  ['fr', 'Francese'], ['de', 'Tedesco'], ['pt', 'Portoghese'],
] as const;

const COUNTRIES = [
  ['IT', 'Italia'], ['US', 'Stati Uniti'], ['GB', 'Regno Unito'], ['FR', 'Francia'],
  ['DE', 'Germania'], ['ES', 'Spagna'], ['BR', 'Brasile'], ['MX', 'Messico'],
  ['CA', 'Canada'], ['AU', 'Australia'], ['IN', 'India'], ['NL', 'Paesi Bassi'],
  ['PL', 'Polonia'], ['JP', 'Giappone'],
] as const;

const inputCls ='w-full rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-sm outline-none placeholder:text-slate-600';
const btnCls = 'rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400';

export const metadata = { title: 'Gestione progetti' };

export default async function SettingsPage({ searchParams }: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const [allProjects, current] = await Promise.all([getProjects(), getCurrentProject()]);
  if (allProjects.length === 0) return <EmptyState message="Nessun progetto." />;

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
        title="Gestione progetti"
        subtitle="Ogni progetto è un ascolto indipendente: query, lingue, aree geografiche ed entità da confrontare"
      />

      {/* Tab dei progetti */}
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
          <Plus className="size-4" /> Nuovo progetto
        </Link>
      </div>

      <div className="mx-auto max-w-3xl">
        <div>
          <section className="panel rounded-t-none border-t-0 px-5 py-5">
            {isNew ? (
              <form action={createProject} className="flex flex-col gap-4">
                <h2 className="text-sm font-semibold text-slate-300">Nuovo progetto di ascolto</h2>
                <ProjectFields project={null} />
                <div className="mt-2 border-t border-[var(--border)] pt-4">
                  <SubmitButton className={btnCls} pendingLabel="Creo il progetto…">Crea progetto</SubmitButton>
                </div>
              </form>
            ) : selected && (
              <>
                <form action={updateProject} className="flex flex-col gap-4">
                  <input type="hidden" name="id" value={selected.id} />
                  <ProjectFields project={selected} />
                  <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-4">
                    <SubmitButton className={btnCls} pendingLabel="Salvo…">Salva modifiche</SubmitButton>
                    <SubmitButton formAction={saveAndExpandProject} pendingLabel="Genero i termini…"
                      className="rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 py-2 text-sm font-medium text-violet-300 transition hover:bg-violet-500/20">
                      ✨ Salva e genera termini dall&apos;area semantica
                    </SubmitButton>
                  </div>
                </form>

                <hr className="my-5 border-[var(--border)]" />

                <h3 className="mb-1 text-sm font-semibold text-slate-300">Entità benchmark</h3>
                <p className="mb-3 text-xs text-slate-500">
                  Brand o competitor da confrontare nella pagina Benchmark: le mention che citano queste keyword vengono attribuite all&apos;entità.
                </p>
                <div className="flex flex-col gap-2">
                  {entities.map((e) => (
                    <div key={e.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm">
                      <span className="font-medium">{e.name}</span>
                      <span className="truncate text-xs text-slate-500">{e.keywords.join(', ')}</span>
                      <form action={deleteEntity} className="ml-auto">
                        <input type="hidden" name="id" value={e.id} />
                        <button type="submit" className="text-slate-600 hover:text-red-400" aria-label={`Elimina ${e.name}`}>
                          <Trash2 className="size-4" />
                        </button>
                      </form>
                    </div>
                  ))}
                  {entities.length === 0 && (
                    <p className="text-xs text-slate-600">Nessuna entità: aggiungine una per usare il Benchmark.</p>
                  )}
                </div>
                <form action={addEntity} className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input type="hidden" name="projectId" value={selected.id} />
                  <input name="name" placeholder="Nome entità" className={inputCls} required />
                  <input name="keywords" placeholder="keyword associate (opzionale)" className={inputCls} />
                  <SubmitButton pendingLabel="Aggiungo…"
                    className="shrink-0 rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                    Aggiungi
                  </SubmitButton>
                </form>

                <hr className="my-5 border-[var(--border)]" />

                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-300">
                  <Link2 className="size-4 text-sky-400" /> Condivisione
                </h3>
                <p className="mb-3 text-xs text-slate-500">
                  Crea un link di sola lettura per mostrare il report a capi o clienti senza dare la password. Scade da solo.
                </p>
                <div className="flex flex-col gap-2">
                  {activeShares.map((s) => (
                    <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs">
                      <code className="truncate text-sky-300">{shareBase ? `${shareBase}/share/${s.token}` : `/share/${s.token}`}</code>
                      <span className="text-slate-500">scade il {s.expiresAt.toLocaleDateString('it-IT')}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <CopyButton text={shareBase ? `${shareBase}/share/${s.token}` : `/share/${s.token}`} />
                        <form action={revokeShareLink}>
                          <input type="hidden" name="id" value={s.id} />
                          <button type="submit" className="rounded-md px-2 py-1 text-red-400/80 hover:bg-red-500/10">revoca</button>
                        </form>
                      </span>
                    </div>
                  ))}
                  {activeShares.length === 0 && (
                    <p className="text-xs text-slate-600">Nessun link attivo.</p>
                  )}
                </div>
                <form action={createShareLink} className="mt-3 flex items-center gap-2">
                  <input type="hidden" name="projectId" value={selected.id} />
                  <select name="days" defaultValue="7"
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-2 py-2 text-sm outline-none">
                    <option value="1">1 giorno</option>
                    <option value="7">7 giorni</option>
                    <option value="30">30 giorni</option>
                  </select>
                  <SubmitButton pendingLabel="Creo il link…"
                    className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-slate-300 hover:bg-white/5">
                    Crea link condivisibile
                  </SubmitButton>
                </form>

                {allProjects.length > 1 && (
                  <div className="mt-6 border-t border-red-500/20 pt-4">
                    <form action={deleteProject}>
                      <input type="hidden" name="id" value={selected.id} />
                      <button type="submit" className="flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-400/90 transition hover:bg-red-500/10">
                        <Trash2 className="size-4" />
                        Elimina «{selected.name}» e tutti i suoi dati
                      </button>
                    </form>
                  </div>
                )}
              </>
            )}
          </section>
          <p className="mt-2 px-1 text-[11px] text-slate-600">
            Nota: ogni progetto attivo consuma quota API a ogni aggiornamento — con il budget attuale conviene tenerne pochi.
            Stato fonti e budget si trovano ora in <span className="text-slate-400">Impostazioni → Fonti e budget</span>.
          </p>
        </div>
      </div>
    </>
  );
}

/** Campi del progetto, condivisi tra creazione e modifica. */
function ProjectFields({ project }: { project: Project | null }) {
  return (
    <>
      <label className="text-xs text-slate-400">
        Nome del progetto
        <input name="name" defaultValue={project?.name} className={`${inputCls} mt-1`}
          placeholder="es. Energia rinnovabile" required />
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" name="shared" defaultChecked={project?.visibility === 'shared'} className="accent-sky-500" />
        Condividi questo progetto con tutto il team (in sola lettura per gli altri)
      </label>
      <label className="text-xs text-slate-400">
        <span className="text-violet-300">✨ Area semantica del tema</span> — descrivi in linguaggio naturale cosa vuoi monitorare:
        genera i termini di ricerca via AI e guida le stelle di rilevanza
        <textarea name="semanticContext" defaultValue={project?.semanticContext ?? ''} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="es. Il mercato delle auto elettriche in Europa: incentivi, colonnine, batterie, prezzi e concorrenza cinese" />
      </label>
      <div className="rounded-lg border border-[var(--border)] bg-[var(--panel-2)]/40 px-4 py-3">
        <p className="mb-3 text-xs text-slate-500">
          Query di ricerca — combina i tre campi: (almeno uno) E (tutti) E (nessuno degli esclusi)
        </p>
        <div className="flex flex-col gap-3">
          <label className="text-xs text-slate-400">
            Termini — <span className="text-sky-300">almeno uno (OR)</span>, separati da virgola
            <input name="keywords" defaultValue={project?.keywords.join(', ')} className={`${inputCls} mt-1`}
              placeholder="es. auto elettrica, electric vehicle, EV" required />
          </label>
          <label className="text-xs text-slate-400">
            Termini — <span className="text-emerald-300">tutti obbligatori (AND)</span>
            <input name="allTerms" defaultValue={(project?.allTerms ?? []).join(', ')} className={`${inputCls} mt-1`}
              placeholder="es. batteria (facoltativo)" />
          </label>
          <label className="text-xs text-slate-400">
            Termini — <span className="text-red-300">da escludere (NOT)</span>
            <input name="excludeTerms" defaultValue={(project?.excludeTerms ?? []).join(', ')} className={`${inputCls} mt-1`}
              placeholder="es. usato, noleggio (facoltativo)" />
          </label>
        </div>
      </div>
      <fieldset className="text-xs text-slate-400">
        Lingue (edizioni news e ricerca)
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
        Aree geografiche (si applica alle fonti news; nessuna selezione = mondo)
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
        Canali Telegram da sorvegliare (username separati da virgola, es. @ansa_official)
        <input name="telegramChannels" defaultValue={(project?.telegramChannels ?? []).map((c) => `@${c}`).join(', ')}
          className={`${inputCls} mt-1`} placeholder="es. @canale1, @canale2 (facoltativo)" />
      </label>
      <label className="text-xs text-slate-400">
        Feed RSS/Atom da seguire (URL separati da virgola o a capo) — testate, blog, Google Alerts…
        <textarea name="rssFeeds" defaultValue={(project?.rssFeeds ?? []).join('\n')} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="es. https://www.ansa.it/sito/ansait_rss.xml (facoltativo, max 15)" />
      </label>
      <label className="text-xs text-slate-400">
        Tono di voce del brand — usato dal Content Studio per scrivere le bozze
        <textarea name="brandVoice" defaultValue={project?.brandVoice ?? ''} rows={2}
          className={`${inputCls} mt-1 resize-y`}
          placeholder="es. Professionale ma diretto, diamo del tu, evitiamo anglicismi inutili (facoltativo)" />
      </label>
    </>
  );
}

