import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import {
  deleteFile, deriveMentions, listFiles, purgeRaw, registerFile, updateMapping,
} from '@/lib/import-store';

export const runtime = 'nodejs';
// Un file grande va letto, profilato, proposto all'AI e archiviato riga per
// riga: sono minuti, non secondi.
export const maxDuration = 300;

async function guard(projectId: number) {
  if (!isAdmin(await getCurrentUser())) return 'Solo gli amministratori possono importare';
  if (!projectId) return 'Progetto mancante';
  const db = await getDb();
  const [p] = await db.select({ id: projects.id, mode: projects.mode }).from(projects).where(eq(projects.id, projectId));
  if (!p) return 'Progetto non trovato';
  if (p.mode !== 'upload') return 'Questo progetto non è di tipo import';
  return null;
}

/** Elenco dei file del progetto, con stato e mappatura correnti. */
export async function GET(req: Request) {
  const projectId = Number(new URL(req.url).searchParams.get('project'));
  const err = await guard(projectId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });
  return NextResponse.json({ files: await listFiles(projectId) });
}

/** Carica un nuovo file: lo legge, lo profila e chiede la proposta all'AI. */
export async function POST(req: Request) {
  const form = await req.formData();
  const projectId = Number(form.get('projectId'));
  const err = await guard(projectId);
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Nessun file' }, { status: 400 });
  if (!/\.(xlsx|csv)$/i.test(file.name)) return NextResponse.json({ error: 'Carica un file .xlsx o .csv' }, { status: 400 });

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await registerFile(projectId, buf, file.name));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Azioni sul singolo file: rimappa, (ri)deriva, elimina, libera spazio. */
export async function PATCH(req: Request) {
  const body = await req.json() as {
    projectId: number; fileId: number;
    action: 'map' | 'derive' | 'delete' | 'purge';
    mapping?: Record<string, string>;
  };
  const err = await guard(Number(body.projectId));
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    switch (body.action) {
      case 'map':
        await updateMapping(body.fileId, body.projectId, body.mapping ?? {});
        return NextResponse.json({ ok: true });
      case 'derive':
        return NextResponse.json({ report: await deriveMentions(body.fileId, body.projectId) });
      case 'delete':
        await deleteFile(body.fileId, body.projectId);
        return NextResponse.json({ ok: true });
      case 'purge':
        await purgeRaw(body.fileId, body.projectId);
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: 'Azione sconosciuta' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
