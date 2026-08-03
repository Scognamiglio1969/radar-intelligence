import { NextResponse } from 'next/server';
import { getCurrentProject } from '@/lib/data';
import { collectExportData, parseExportOptions, slugify, todayStamp } from '@/lib/export-data';
import { buildReportPdf } from '@/lib/report-pdf';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const { sections, days } = parseExportOptions(new URL(req.url));
  const data = await collectExportData(project, days);

  const buffer = await buildReportPdf({ project, data, days, sections });

  const parts = sections.size >= 20 ? 'complete' : 'selection';
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="radar-${slugify(project.name)}-${parts}-${todayStamp()}.pdf"`,
    },
  });
}
