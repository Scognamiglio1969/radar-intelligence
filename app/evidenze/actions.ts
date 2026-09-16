'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb, setMeta } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { ingestTrials, resolveTrialTerms } from '@/lib/trials';

/**
 * Salva che cosa seguire negli studi clinici e fa subito la prima raccolta:
 * scegliere i termini non deve voler dire aspettare il giro notturno per
 * scoprire se trovano qualcosa.
 */
export async function saveEvidenceTermsAction(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;
  const inputs = [...new Set(String(formData.get('terms') ?? '')
    .split(/[,\n]/).map((t) => t.trim()).filter((t) => t.length >= 2))].slice(0, 5);
  // Si salva quello che il registro capisce, non quello che si è scritto: una
  // frase in italiano trova zero studi e lascerebbe la sezione vuota senza
  // spiegazione. La traduzione si registra per mostrarla.
  const { terms, notes } = await resolveTrialTerms(inputs).catch(() => ({ terms: inputs, notes: [] }));
  await setMeta(`evidence_terms_note_${project.id}`, { notes, at: new Date().toISOString() });
  const db = await getDb();
  await db.update(projects).set({ evidenceTerms: terms }).where(eq(projects.id, project.id));
  if (terms.length) await ingestTrials(project.id).catch((e) => console.error('[trials] prima raccolta fallita:', e));
  revalidatePath('/evidenze');
  revalidatePath('/riscontri');
}
