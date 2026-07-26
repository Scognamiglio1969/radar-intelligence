'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { reviewSources } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { ingestReviews } from '@/lib/reviews';

const TYPES = new Set(['appstore', 'googleplaces']);

/** Aggiunge una fonte e la interroga subito: aggiungerla non deve significare
 *  aspettare il ciclo notturno per vedere se funziona. */
export async function addReviewSourceAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;

  const type = String(formData.get('type') ?? '');
  const identifier = String(formData.get('identifier') ?? '').trim();
  const label = String(formData.get('label') ?? '').trim();
  const country = String(formData.get('country') ?? '').trim().toLowerCase();
  if (!TYPES.has(type) || !identifier) return;

  const db = await getDb();
  const [src] = await db.insert(reviewSources).values({
    projectId: project.id,
    type,
    identifier,
    label: label || identifier,
    country: type === 'appstore' ? (country || 'us') : null,
  }).returning({ id: reviewSources.id });

  if (src) await ingestReviews(project.id).catch((e) => console.error('[reviews] primo fetch fallito:', e));
  revalidatePath('/reviews');
}

export async function removeReviewSourceAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;
  const id = Number(formData.get('id'));
  if (!id) return;
  const db = await getDb();
  // Il project_id nella WHERE non è ridondante: impedisce di cancellare una
  // fonte di un altro progetto passando un id a mano.
  await db.delete(reviewSources).where(and(eq(reviewSources.id, id), eq(reviewSources.projectId, project.id)));
  revalidatePath('/reviews');
}
