'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, setMeta } from '@/lib/db';
import { benchmarkEntities, projects, shareLinks } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { verifyPasswordHash } from '@/lib/password';

export type ActionResult = { ok: boolean; msg: string };

/** Admin: set the API spend budget (USD). */
export async function updateApiBudget(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, msg: 'Admins only.' };
  const amount = Number(formData.get('budget'));
  if (!Number.isFinite(amount) || amount <= 0) return { ok: false, msg: 'Enter a positive amount.' };
  await setMeta('api_budget_usd', Math.round(amount * 100) / 100);
  revalidatePath('/impostazioni/fonti');
  return { ok: true, msg: `Budget set to $${amount.toFixed(2)}.` };
}

/** Admin: choose the AI engine (Anthropic / OpenAI / Grok) that powers every AI feature. */
export async function updateAiProvider(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, msg: 'Admins only.' };
  const provider = String(formData.get('provider') ?? '').trim();
  const { AI_PROVIDERS } = await import('@/lib/ai-provider');
  if (!(provider in AI_PROVIDERS)) return { ok: false, msg: 'Unknown provider.' };
  await setMeta('ai_provider', provider);
  revalidatePath('/impostazioni/budget');
  return { ok: true, msg: `AI engine set to ${AI_PROVIDERS[provider as keyof typeof AI_PROVIDERS].label}.` };
}

/** Admin: override the fast/smart model ids for one provider (blank = default). */
export async function updateAiModels(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user)) return { ok: false, msg: 'Admins only.' };
  const provider = String(formData.get('provider') ?? '').trim();
  const { AI_PROVIDERS } = await import('@/lib/ai-provider');
  if (!(provider in AI_PROVIDERS)) return { ok: false, msg: 'Unknown provider.' };
  const fast = String(formData.get('fast') ?? '').trim();
  const smart = String(formData.get('smart') ?? '').trim();
  await setMeta(`ai_models_${provider}`, { fast, smart });
  revalidatePath('/impostazioni/budget');
  return { ok: true, msg: 'Models saved.' };
}

/** Admin: reset the spend counter (starts a new window). Requires the admin's own password. */
export async function resetApiSpend(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!isAdmin(user) || !user) return { ok: false, msg: 'Admins only.' };
  const password = String(formData.get('password') ?? '');
  if (!password) return { ok: false, msg: 'Enter your account password.' };
  if (!verifyPasswordHash(password, user.passwordHash)) return { ok: false, msg: 'Incorrect password.' };
  await setMeta('spend_reset_at', new Date().toISOString());
  revalidatePath('/impostazioni/fonti');
  return { ok: true, msg: 'Spend counter reset. The all-time total is unchanged.' };
}

function parseKeywords(raw: string): string[] {
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 10);
}

function parseProjectForm(formData: FormData) {
  return {
    // La query non passa più da qui: la costruisce la pagina Query. Se questi
    // campi restassero, salvare il progetto azzererebbe le parole chiave.
    name: String(formData.get('name') ?? '').trim(),
    languages: formData.getAll('languages').map(String),
    countries: formData.getAll('countries').map(String),
    telegramChannels: parseKeywords(String(formData.get('telegramChannels') ?? ''))
      .map((c) => c.replace(/^@/, '').replace(/^https?:\/\/t\.me\/(s\/)?/, '')),
    rssFeeds: [...new Set(String(formData.get('rssFeeds') ?? '')
      .split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)))].slice(0, 15),
    brandVoice: String(formData.get('brandVoice') ?? '').trim().slice(0, 500) || null,
    visibility: formData.get('shared') ? 'shared' : 'private',
  };
}

/** Verifica che l'utente possa modificare il progetto (proprietario o admin). */
async function assertCanEdit(projectId: number): Promise<boolean> {
  const { getCurrentUser, isAdmin } = await import('@/lib/auth');
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user) return false;
  if (isAdmin(user)) return true;
  const [p] = await db.select({ ownerId: projects.ownerId }).from(projects).where(eq(projects.id, projectId));
  return p?.ownerId === user.id;
}

export async function updateProject(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  const data = parseProjectForm(formData);
  if (!id || !data.name) return;
  if (!(await assertCanEdit(id))) return;
  await db.update(projects)
    .set({ ...data, languages: data.languages.length ? data.languages : ['it', 'en'] })
    .where(eq(projects.id, id));
  revalidatePath('/', 'layout');
}

/**
 * Crea un progetto di ascolto e porta alla costruzione delle query.
 *
 * Il progetto nasce senza query: la richiesta scritta qui diventa il punto
 * di partenza della pagina Query, dove si trasforma in query da provare.
 */
export async function createProject(formData: FormData) {
  const { getCurrentUser } = await import('@/lib/auth');
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user) return;
  const data = parseProjectForm(formData);
  if (!data.name) return;
  const brief = String(formData.get('semanticContext') ?? '').trim().slice(0, 600) || null;
  const [created] = await db.insert(projects)
    .values({
      ...data, semanticContext: brief, keywords: [],
      ownerId: user.id, languages: data.languages.length ? data.languages : ['it', 'en'],
    })
    .returning();
  // Il progetto nuovo diventa quello attivo: la pagina Query e il resto
  // dell'app devono parlare di lui, non di quello aperto prima.
  (await cookies()).set('sr_project', String(created.id), { path: '/', maxAge: 31536000 });
  revalidatePath('/', 'layout');
  redirect(`/query?project=${created.id}&new=1`);
}

/**
 * Crea un progetto in modalità "talkwalker": le mention non si raccolgono dal
 * web né si caricano da file, si leggono dall'API Talkwalker aziendale. La
 * query booleana del progetto diventa la query Talkwalker, così il resto di
 * Radar (sentiment, trend, narrazioni, export) lavora come su ogni altro.
 */
function parseTalkwalkerForm(formData: FormData) {
  return {
    name: String(formData.get('name') ?? '').trim().slice(0, 80),
    talkwalkerProject: String(formData.get('talkwalkerProject') ?? '').trim().slice(0, 120) || null,
    // Nessun topic selezionato = tutto quello che il progetto Talkwalker
    // raccoglie: è il caso normale di chi vuole i dati prima delle domande.
    talkwalkerTopics: formData.getAll('talkwalkerTopics').map(String).filter(Boolean).slice(0, 50),
    semanticContext: String(formData.get('semanticContext') ?? '').trim().slice(0, 600) || null,
    visibility: formData.get('shared') ? 'shared' : 'private',
  };
}

/**
 * Crea un progetto "talkwalker". Non chiede parole chiave: la ricerca è già
 * scritta in Talkwalker, qui si sceglie solo da quale topic prendere i
 * documenti (o da tutti). Duplicare la query sarebbe duplicare Talkwalker.
 */
export async function createTalkwalkerProject(formData: FormData) {
  const { getCurrentUser } = await import('@/lib/auth');
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user) return;
  const data = parseTalkwalkerForm(formData);
  if (!data.name || !data.talkwalkerProject) return;
  const [created] = await db.insert(projects)
    .values({ ...data, mode: 'talkwalker', ownerId: user.id, keywords: [], languages: [] })
    .returning();
  revalidatePath('/', 'layout');
  redirect(`/settings?p=${created.id}`);
}

/** Modifica di un progetto talkwalker: nome, progetto/topic di origine, contesto. */
export async function updateTalkwalkerProject(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  if (!id || !(await assertCanEdit(id))) return;
  const data = parseTalkwalkerForm(formData);
  if (!data.name || !data.talkwalkerProject) return;
  await db.update(projects).set(data).where(eq(projects.id, id));
  revalidatePath('/', 'layout');
}

/** Crea un progetto in modalità "upload" (nessuno scraping) e va al caricamento file. */
export async function createImportProject(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  if (!name) return;
  const db = await getDb();
  const [created] = await db.insert(projects).values({
    name, mode: 'upload', ownerId: user.id,
    visibility: formData.get('shared') ? 'shared' : 'private',
    keywords: [], languages: ['en'],
  }).returning({ id: projects.id });
  revalidatePath('/', 'layout');
  redirect(`/import?project=${created.id}`);
}

/** Modifica di un progetto upload: solo nome e visibilità (niente query/fonti). */
export async function updateImportProject(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  if (!id || !(await assertCanEdit(id))) return;
  const name = String(formData.get('name') ?? '').trim().slice(0, 80);
  if (!name) return;
  await db.update(projects).set({
    name, visibility: formData.get('shared') ? 'shared' : 'private',
  }).where(eq(projects.id, id));
  revalidatePath('/', 'layout');
}

/**
 * Cancella un progetto e tutto quello che ci sta dentro.
 *
 * Chiede la password dell'account, come il reset della spesa: è l'unica azione
 * dell'app che non si può annullare — mention, misure, file caricati, report e
 * grafici se ne vanno insieme al progetto. Una conferma a clic si dà per
 * distrazione; una password no.
 */
export async function deleteProject(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, msg: 'Not signed in.' };
  const db = await getDb();
  const id = Number(formData.get('id'));
  if (!id) return { ok: false, msg: 'No project selected.' };
  if (!(await assertCanEdit(id))) return { ok: false, msg: 'You cannot edit this project.' };

  const password = String(formData.get('password') ?? '');
  if (!password) return { ok: false, msg: 'Enter your account password to confirm.' };
  if (!verifyPasswordHash(password, user.passwordHash)) return { ok: false, msg: 'Incorrect password. Nothing was deleted.' };

  const all = await db.select({ id: projects.id }).from(projects);
  if (all.length <= 1) return { ok: false, msg: 'This is the only project: Radar needs at least one.' };

  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath('/', 'layout');
  redirect('/settings');
}

export async function addEntity(formData: FormData) {
  const db = await getDb();
  const projectId = Number(formData.get('projectId'));
  const name = String(formData.get('name') ?? '').trim();
  const keywords = parseKeywords(String(formData.get('keywords') ?? ''));
  if (!projectId || !name) return;
  await db.insert(benchmarkEntities).values({
    projectId, name, keywords: keywords.length ? keywords : [name],
  });
  revalidatePath('/settings');
  revalidatePath('/benchmark');
}

export async function updateEntity(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  const name = String(formData.get('name') ?? '').trim();
  const keywords = parseKeywords(String(formData.get('keywords') ?? ''));
  if (!id || !name) return;
  await db.update(benchmarkEntities).set({ name, keywords: keywords.length ? keywords : [name] })
    .where(eq(benchmarkEntities.id, id));
  revalidatePath('/settings');
  revalidatePath('/benchmark');
}

export async function setOwnBrand(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  const projectId = Number(formData.get('projectId'));
  if (!id || !projectId) return;
  const makeBrand = String(formData.get('makeBrand') ?? '1') === '1';
  // Un solo brand per progetto: azzero gli altri, poi imposto (o tolgo) questo.
  await db.update(benchmarkEntities).set({ isOwnBrand: 0 }).where(eq(benchmarkEntities.projectId, projectId));
  if (makeBrand) {
    await db.update(benchmarkEntities).set({ isOwnBrand: 1 }).where(eq(benchmarkEntities.id, id));
  }
  revalidatePath('/settings');
  revalidatePath('/insights/health');
  revalidatePath('/benchmark');
}

export async function deleteEntity(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  if (!id) return;
  await db.delete(benchmarkEntities).where(eq(benchmarkEntities.id, id));
  revalidatePath('/settings');
  revalidatePath('/benchmark');
}

export async function createShareLink(formData: FormData) {
  const db = await getDb();
  const projectId = Number(formData.get('projectId'));
  const days = Math.max(1, Math.min(30, Number(formData.get('days')) || 7));
  if (!projectId) return;
  await db.insert(shareLinks).values({
    projectId,
    token: randomBytes(16).toString('hex'),
    expiresAt: new Date(Date.now() + days * 86400_000),
  });
  revalidatePath('/settings');
}

export async function revokeShareLink(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  if (!id) return;
  await db.delete(shareLinks).where(eq(shareLinks.id, id));
  revalidatePath('/settings');
}

/**
 * Salva le chiavi API di un connettore premium (solo admin). Le credenziali
 * sono globali per l'account e conservate cifrate; da qui l'utente attiva le
 * fonti a pagamento senza toccare variabili d'ambiente né codice.
 */
export async function saveConnectorKeysAction(connectorId: string, formData: FormData) {
  const { getCurrentUser, isAdmin } = await import('@/lib/auth');
  const user = await getCurrentUser();
  if (!isAdmin(user)) return;

  const { CREDENTIAL_FIELDS, saveConnectorCredentials } = await import('@/lib/connector-credentials');
  const fields = CREDENTIAL_FIELDS[connectorId];
  if (!fields) return;

  const values: Record<string, string> = {};
  for (const f of fields) values[f.env] = String(formData.get(f.env) ?? '');
  await saveConnectorCredentials(connectorId, values);
  revalidatePath('/settings');
}
