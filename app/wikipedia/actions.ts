'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { wikiPages } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { ingestWikiEdits } from '@/lib/wikipedia';

/** Aggiunge una pagina e ne scarica subito lo storico recente — stesso principio di Reviews e Sport. */
export async function addWikiPageAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;

  const title = String(formData.get('title') ?? '').trim();
  if (!title) return;

  const db = await getDb();
  const [src] = await db.insert(wikiPages).values({ projectId: project.id, title }).returning({ id: wikiPages.id });

  if (src) await ingestWikiEdits(project.id).catch((e) => console.error('[wikipedia] primo fetch fallito:', e));
  revalidatePath('/wikipedia');
}

export async function removeWikiPageAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;
  const id = Number(formData.get('id'));
  if (!id) return;
  const db = await getDb();
  await db.delete(wikiPages).where(and(eq(wikiPages.id, id), eq(wikiPages.projectId, project.id)));
  revalidatePath('/wikipedia');
}
