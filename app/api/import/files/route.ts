import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { projects } from '@/lib/db/schema';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import {
  deleteFile, deriveMentions, deriveMetricPoints, listFiles, purgeRaw, registerFile,
  updateExtras, updateKind, updateMapping, updateMetricMap,
} from '@/lib/import-store';
import { listSheets, loadWorkbook } from '@/lib/import';

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
    const chosen = String(form.get('sheets') ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

    // Un file può contenere decine di fogli, ognuno con una forma diversa.
    // Al primo caricamento se ne restituisce l'INVENTARIO invece di indovinare
    // quale importare: sceglie l'utente, e ogni foglio scelto diventa un
    // elemento a sé con la sua mappatura.
    if (!chosen.length) {
      const sheets = await listSheets(buf, file.name);
      const withData = sheets.filter((s) => s.rows > 0);
      if (withData.length > 1) return NextResponse.json({ sheets, needsChoice: true });
      const only = withData[0]?.name;
      return NextResponse.json(await registerFile(projectId, buf, file.name, only));
    }

    // Un foglio alla volta significava rileggere l'intero file per ognuno: su
    // una cartella da 56 fogli la richiesta moriva prima di finire, e al
    // browser arrivava una risposta che JSON non era. Ora si legge una volta
    // sola, e il client manda i fogli a piccoli gruppi.
    const isCsv = /\.csv$/i.test(file.name);
    const workbook = isCsv ? undefined : await loadWorkbook(buf);

    const results = [];
    const failed: { sheet: string; reason: string }[] = [];
    for (const sheet of chosen) {
      try {
        results.push(await registerFile(projectId, buf, `${file.name} › ${sheet}`, sheet, workbook));
      } catch (e) {
        // Un foglio illeggibile non deve far fallire gli altri quaranta: si
        // annota e si va avanti, e alla fine si dice quali non sono entrati.
        failed.push({ sheet, reason: (e as Error).message });
      }
    }
    return NextResponse.json({
      imported: results.length, fileId: results[0]?.fileId,
      ...(failed.length ? { failed } : {}),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

/** Azioni sul singolo file: rimappa, (ri)deriva, elimina, libera spazio. */
export async function PATCH(req: Request) {
  const body = await req.json() as {
    projectId: number; fileId: number;
    action: 'map' | 'derive' | 'delete' | 'purge' | 'map-metrics' | 'extras' | 'kind';
    mapping?: Record<string, string>;
    metricMap?: Record<string, unknown>;
    extras?: Record<string, string>;
    kind?: 'mentions' | 'metrics';
  };
  const err = await guard(Number(body.projectId));
  if (err) return NextResponse.json({ error: err }, { status: 400 });

  try {
    switch (body.action) {
      case 'map':
        await updateMapping(body.fileId, body.projectId, body.mapping ?? {});
        if (body.extras) await updateExtras(body.fileId, body.projectId, body.extras);
        return NextResponse.json({ ok: true });
      case 'map-metrics':
        await updateMetricMap(body.fileId, body.projectId, body.metricMap ?? {});
        return NextResponse.json({ ok: true });
      case 'kind':
        await updateKind(body.fileId, body.projectId, body.kind === 'metrics' ? 'metrics' : 'mentions');
        return NextResponse.json({ ok: true });
      case 'extras':
        await updateExtras(body.fileId, body.projectId, body.extras ?? {});
        return NextResponse.json({ ok: true });
      case 'derive':
        // Un foglio di misure e un foglio di post si derivano in modo diverso:
        // il tipo è già stato deciso alla lettura, qui si applica soltanto.
        return NextResponse.json(body.kind === 'metrics'
          ? { metricReport: await deriveMetricPoints(body.fileId, body.projectId) }
          : { report: await deriveMentions(body.fileId, body.projectId) });
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
