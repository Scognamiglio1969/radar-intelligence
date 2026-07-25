'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getDb } from '@/lib/db';
import { projects, type KeyMessage } from '@/lib/db/schema';
import { getCurrentProject } from '@/lib/data';
import { callClaude, claudeAvailable, MODELS } from '@/lib/claude';

/**
 * Espande un messaggio nei modi in cui la stampa lo riscriverebbe davvero.
 * Una sola chiamata per messaggio, al salvataggio: da lì in poi il conteggio
 * è SQL puro e non costa nulla.
 */
async function expandTerms(message: string): Promise<string[]> {
  if (!await claudeAvailable()) return [];
  const text = await callClaude(
    MODELS.haiku, 'espansione_messaggio',
    `You turn a PR key message into the words and short phrases that journalists and users would actually write when they pick it up.
Return 5-9 SHORT terms (1-4 words), concrete and searchable, no full sentences, no punctuation.
Include the distinctive words of the message, common paraphrases and obvious synonyms, in the same language as the message.
Respond ONLY with a JSON array of strings.`,
    message, 300,
  );
  if (!text) return [];
  try {
    const start = text.indexOf('[');
    const arr = JSON.parse(text.slice(start, text.lastIndexOf(']') + 1)) as string[];
    return arr.filter((t) => typeof t === 'string' && t.trim().length > 1)
      .map((t) => t.trim().slice(0, 60)).slice(0, 9);
  } catch {
    return [];
  }
}

/** Termini di ripiego senza AI: le parole significative del messaggio stesso. */
function fallbackTerms(message: string): string[] {
  return message.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 4)
    .slice(0, 6);
}

export async function saveKeyMessages(formData: FormData) {
  const project = await getCurrentProject();
  if (!project) return;
  const raw = String(formData.get('messages') ?? '');
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 8);

  const existing = new Map((project.keyMessages ?? []).map((m) => [m.text, m]));
  const out: KeyMessage[] = [];
  for (const text of lines) {
    const prev = existing.get(text);
    // Riespando solo i messaggi nuovi: modificare la lista non ricalcola tutto.
    if (prev && prev.terms.length) { out.push(prev); continue; }
    const terms = await expandTerms(text);
    out.push({
      id: prev?.id ?? Math.random().toString(36).slice(2, 10),
      text,
      terms: terms.length ? terms : fallbackTerms(text),
    });
  }

  const db = await getDb();
  await db.update(projects).set({ keyMessages: out }).where(eq(projects.id, project.id));
  revalidatePath('/messages');
}
