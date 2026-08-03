import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { collectExportData, slugify } from '@/lib/export-data';
import { CADENCE, getEdition } from '@/lib/periodic-report';
import { buildReportPdf } from '@/lib/report-pdf';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/**
 * PDF di un'edizione archiviata. La SCALETTA è quella congelata al momento
 * della generazione — è un numero uscito, non un modello da ricalcolare — ma
 * i grafici vanno comunque ridisegnati, e vanno ridisegnati sulla finestra
 * della cadenza, non su quella di oggi.
 */
export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });

  const id = Number(new URL(req.url).searchParams.get('id'));
  const edition = id ? await getEdition(id, project.id) : null;
  if (!edition) return NextResponse.json({ error: 'edizione non trovata' }, { status: 404 });

  const spec = CADENCE.get(edition.cadence);
  const days = spec?.days ?? 30;
  const fresh = await collectExportData(project, days);
  // La tesi è quella congelata nell'edizione, non quella corrente: altrimenti
  // il PDF stamperebbe un Point of View diverso da quello che la nota di
  // provenienza, stampata due centimetri sotto, dichiara.
  const data = { ...fresh, pov: { facts: fresh.pov.facts, pov: edition.pov } };
  const buffer = await buildReportPdf({
    project, data, days, pages: edition.pages,
    subtitle: `Report ${spec?.label.toLowerCase() ?? edition.cadence} — ${edition.periodStart} / ${edition.periodEnd}`,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="radar-${slugify(project.name)}-${edition.cadence}-${edition.periodEnd}.pdf"`,
    },
  });
}
