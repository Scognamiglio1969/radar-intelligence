'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { benchmarkEntities, projects, shareLinks } from '@/lib/db/schema';

function parseKeywords(raw: string): string[] {
  return [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))].slice(0, 10);
}

function parseProjectForm(formData: FormData) {
  return {
    name: String(formData.get('name') ?? '').trim(),
    keywords: parseKeywords(String(formData.get('keywords') ?? '')),
    allTerms: parseKeywords(String(formData.get('allTerms') ?? '')),
    excludeTerms: parseKeywords(String(formData.get('excludeTerms') ?? '')),
    languages: formData.getAll('languages').map(String),
    countries: formData.getAll('countries').map(String),
    telegramChannels: parseKeywords(String(formData.get('telegramChannels') ?? ''))
      .map((c) => c.replace(/^@/, '').replace(/^https?:\/\/t\.me\/(s\/)?/, '')),
    rssFeeds: [...new Set(String(formData.get('rssFeeds') ?? '')
      .split(/[\s,]+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s)))].slice(0, 15),
    brandVoice: String(formData.get('brandVoice') ?? '').trim().slice(0, 500) || null,
    semanticContext: String(formData.get('semanticContext') ?? '').trim().slice(0, 600) || null,
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

/**
 * Salva il progetto e genera i termini di ricerca (OR) dall'area semantica:
 * l'AI traduce la descrizione in keyword multilingua, unite a quelle esistenti.
 */
export async function saveAndExpandProject(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  const data = parseProjectForm(formData);
  if (!id || !data.name) return;
  if (!(await assertCanEdit(id))) return;
  await db.update(projects)
    .set({ ...data, languages: data.languages.length ? data.languages : ['it', 'en'] })
    .where(eq(projects.id, id));

  if (data.semanticContext) {
    const { callClaude, claudeAvailable, MODELS } = await import('@/lib/claude');
    if (await claudeAvailable()) {
      const langs = (data.languages.length ? data.languages : ['it', 'en']).join(', ');
      const text = await callClaude(
        MODELS.haiku, 'espansione_progetto',
        `Turn the description of a topic to monitor into EFFECTIVE search terms for news and social, in these languages: ${langs}.
Short terms (1-3 words), concrete, the way people actually write. Respond ONLY with a JSON array of 6-10 strings.`,
        `Topic: ${data.semanticContext}`,
        400,
      );
      if (text) {
        try {
          const start = text.indexOf('[');
          const generated = (JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as string[])
            .map((t) => String(t).trim()).filter((t) => t.length >= 3);
          const merged = [...new Set([...data.keywords, ...generated])].slice(0, 10);
          await db.update(projects).set({ keywords: merged }).where(eq(projects.id, id));
        } catch { /* risposta non parsabile: restano i termini manuali */ }
      }
    }
  }
  revalidatePath('/', 'layout');
}

export async function updateProject(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  const data = parseProjectForm(formData);
  if (!id || !data.name || data.keywords.length === 0) return;
  if (!(await assertCanEdit(id))) return;
  await db.update(projects)
    .set({ ...data, languages: data.languages.length ? data.languages : ['it', 'en'] })
    .where(eq(projects.id, id));
  revalidatePath('/', 'layout');
}

export async function createProject(formData: FormData) {
  const { getCurrentUser } = await import('@/lib/auth');
  const db = await getDb();
  const user = await getCurrentUser();
  if (!user) return;
  const data = parseProjectForm(formData);
  if (!data.name || data.keywords.length === 0) return;
  const [created] = await db.insert(projects)
    .values({ ...data, ownerId: user.id, languages: data.languages.length ? data.languages : ['it', 'en'] })
    .returning();
  revalidatePath('/', 'layout');
  redirect(`/settings?p=${created.id}`);
}

export async function deleteProject(formData: FormData) {
  const db = await getDb();
  const id = Number(formData.get('id'));
  if (id && !(await assertCanEdit(id))) return;
  if (!id) return;
  const all = await db.select({ id: projects.id }).from(projects);
  if (all.length <= 1) return; // mai lasciare l'app senza progetti
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
