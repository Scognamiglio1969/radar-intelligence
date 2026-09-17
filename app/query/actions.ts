'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { buildPlan, probePlan, retagMentions, savePlan, type BuildResult, type PlanProbe } from '@/lib/query-builder';
import { planFromRules, validatePlan, type QueryPlan } from '@/lib/query-plan';

// Le azioni della pagina Query. Tutte controllano che l'utente possa
// modificare il progetto: il piano decide che cosa Radar raccoglie.

async function editable(projectId: number) {
  const user = await getCurrentUser();
  if (!user) return null;
  const db = await getDb();
  const [p] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) return null;
  if (!isAdmin(user) && p.ownerId !== user.id) return null;
  return p;
}

/** Dalla richiesta scritta alla proposta di piano (AI, o regole se l'AI manca). */
export async function buildPlanAction(projectId: number, brief: string): Promise<BuildResult | { error: string }> {
  const p = await editable(projectId);
  if (!p) return { error: 'Non puoi modificare questo progetto.' };
  if (brief.trim().length < 8) return { error: 'Scrivi che cosa vuoi monitorare, anche in poche parole.' };
  try {
    return await buildPlan(brief, { name: p.name, languages: p.languages, countries: p.countries ?? [] });
  } catch (e) {
    return { plan: planFromRules(brief), warnings: [`Proposta non riuscita (${(e as Error).message}): lettura a regole.`] };
  }
}

/** La prova sul campo di un piano non ancora salvato. */
export async function probePlanAction(projectId: number, plan: QueryPlan): Promise<PlanProbe | { error: string }> {
  const p = await editable(projectId);
  if (!p) return { error: 'Non puoi modificare questo progetto.' };
  try {
    return await probePlan(validatePlan(plan).plan, { name: p.name, languages: p.languages, countries: p.countries ?? [] });
  } catch (e) {
    return { error: `Prova non riuscita: ${(e as Error).message}` };
  }
}

/**
 * Salva il piano: da questo momento la raccolta segue le sue query.
 * Le menzioni dell'ultimo mese si rietichettano dopo la risposta, così una
 * query nuova ha subito i suoi numeri.
 */
export async function savePlanAction(projectId: number, plan: QueryPlan): Promise<{ ok: true; warnings: string[]; plan: QueryPlan } | { error: string }> {
  const p = await editable(projectId);
  if (!p) return { error: 'Non puoi modificare questo progetto.' };
  if (p.mode === 'upload') return { error: 'Un progetto che importa file non ha query.' };
  if (process.env.DEMO_MODE === '1') return { error: 'Public demo: saving is off. Self-host Radar to activate your own queries.' };
  try {
    const saved = await savePlan(projectId, plan);
    after(async () => {
      const n = await retagMentions(projectId, saved.plan).catch((e) => {
        console.error('[query] rietichettatura non riuscita:', e);
        return 0;
      });
      console.log(`[query] progetto ${projectId}: ${n} etichette assegnate alle menzioni dell'ultimo mese`);
    });
    revalidatePath('/', 'layout');
    return { ok: true, warnings: saved.warnings, plan: saved.plan };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
