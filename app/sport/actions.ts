'use server';

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { sportSources } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { ingestSport } from '@/lib/sport';

const COMPETITIONS = new Set(['SA', 'PL', 'CL', 'BL1', 'PD', 'FL1']);

/** Aggiunge una squadra e interroga subito le sue partite (e il prezzo, se
 *  quotata) — stesso principio delle Recensioni: aggiungerla non deve
 *  significare aspettare il ciclo notturno per vedere se funziona. */
export async function addSportSourceAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;

  const competition = String(formData.get('competition') ?? '');
  const teamId = String(formData.get('teamId') ?? '').trim();
  const teamName = String(formData.get('teamName') ?? '').trim();
  const ticker = String(formData.get('ticker') ?? '').trim();
  if (!COMPETITIONS.has(competition) || !teamId || !teamName) return;

  const db = await getDb();
  const [src] = await db.insert(sportSources).values({
    projectId: project.id, competition, teamId, teamName, ticker: ticker || null,
  }).returning({ id: sportSources.id });

  if (src) await ingestSport(project.id).catch((e) => console.error('[sport] primo fetch fallito:', e));
  revalidatePath('/sport');
}

export async function removeSportSourceAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;
  const id = Number(formData.get('id'));
  if (!id) return;
  const db = await getDb();
  await db.delete(sportSources).where(and(eq(sportSources.id, id), eq(sportSources.projectId, project.id)));
  revalidatePath('/sport');
}
