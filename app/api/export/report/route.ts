import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { collectExportData, slugify, todayStamp } from '@/lib/export-data';
import { getReport } from '@/lib/custom-report';
import { buildReportPdf } from '@/lib/report-pdf';
import { resolveStudioBlocks } from '@/lib/studio';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** PDF di un report personalizzato: stessa grafica del report completo. */
export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });

  const id = Number(new URL(req.url).searchParams.get('id'));
  const report = id ? await getReport(id, project.id) : null;
  if (!report) return NextResponse.json({ error: 'report non trovato' }, { status: 404 });

  const pages = report.pages.filter((p) => p.blocks.length > 0);
  if (!pages.length) return NextResponse.json({ error: 'il report non ha ancora contenuti' }, { status: 400 });

  // I grafici di Studio Graph citati dalla scaletta si eseguono ora, con i
  // dati di oggi: il report salva la domanda, non la risposta.
  const studioIds = pages.flatMap((p) => p.blocks
    .filter((b): b is { type: 'studio'; chartId: number } => b.type === 'studio')
    .map((b) => b.chartId));

  const [data, studio] = await Promise.all([
    collectExportData(project, report.days),
    resolveStudioBlocks(project.id, studioIds),
  ]);
  const buffer = await buildReportPdf({
    project, data, days: report.days, pages, studio, subtitle: report.title,
  });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="radar-${slugify(project.name)}-${slugify(report.title)}-${todayStamp()}.pdf"`,
    },
  });
}
