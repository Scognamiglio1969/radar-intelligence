'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { ingestTrials } from '@/lib/trials';

/**
 * Salva che cosa seguire negli studi clinici e fa subito la prima raccolta:
 * scegliere i termini non deve voler dire aspettare il giro notturno per
 * scoprire se trovano qualcosa.
 */
export async function saveEvidenceTermsAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;
  const terms = [...new Set(String(formData.get('terms') ?? '')
    .split(/[,\n]/).map((t) => t.trim()).filter((t) => t.length >= 3))].slice(0, 5);
  const db = await getDb();
  await db.update(projects).set({ evidenceTerms: terms }).where(eq(projects.id, project.id));
  if (terms.length) await ingestTrials(project.id).catch((e) => console.error('[trials] prima raccolta fallita:', e));
  revalidatePath('/evidenze');
  revalidatePath('/riscontri');
}
