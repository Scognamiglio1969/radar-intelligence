import { NextResponse } from 'next/server';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer,
  Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { getCurrentProject } from '@/lib/data';
import { briefToBlocks, collectExportData, parseExportOptions, slugify, sourceLabel, todayStamp } from '@/lib/export-data';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ACCENT = '0284C7';

function h1(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 160 }, children: [new TextRun({ text, color: ACCENT })] });
}
function h2(text: string) {
  return new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 }, children: [new TextRun({ text })] });
}
function p(text: string, opts: { bold?: boolean; size?: number; muted?: boolean } = {}) {
  return new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size, color: opts.muted ? '64748B' : undefined })],
  });
}
function bullet(text: string) {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 60 } });
}

function table(headers: string[], rows: string[][]) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'D8DEE9' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((t) => new TableCell({
          shading: { fill: '16203C' },
          borders: { top: border, bottom: border, left: border, right: border },
          children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, color: 'FFFFFF', size: 18 })] })],
        })),
      }),
      ...rows.map((r) => new TableRow({
        children: r.map((t) => new TableCell({
          borders: { top: border, bottom: border, left: border, right: border },
          children: [new Paragraph({ children: [new TextRun({ text: t, size: 18 })] })],
        })),
      })),
    ],
  });
}

export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  const { sections, days } = parseExportOptions(new URL(req.url));
  const has = (s: string) => sections.has(s as never);
  const data = await collectExportData(project, days);
  const today = new Date().toLocaleDateString('it-IT', { dateStyle: 'full' });

  const kpi = data.dashboard.kpi;
  const sentimentLabel = kpi.avgSentiment === null ? 'in attesa di analisi'
    : kpi.avgSentiment > 0.15 ? 'positivo' : kpi.avgSentiment < -0.15 ? 'negativo' : 'neutro';
  const totalBench = data.benchmark.reduce((s, r) => s + r.total, 0);

  const children: (Paragraph | Table)[] = [
    // Copertina
    new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'RADAR', bold: true, size: 28, color: ACCENT }), new TextRun({ text: '  ·  By Scognamiglio 2026', size: 18, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: project.name, bold: true, size: 56 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Report di media intelligence', size: 26, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: today, size: 22, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 2400 }, children: [new TextRun({ text: `Dati ultimi ${days} giorni · Query: ${project.keywords.join(', ')}`, size: 20, color: '64748B' })] }),
  ];

  if (has('kpi')) {
    children.push(
      h1('In sintesi'),
      bullet(`${kpi.total7.toLocaleString('it-IT')} mention negli ultimi 7 giorni da ${kpi.sources} fonti attive`),
      bullet(`Sentiment complessivo: ${sentimentLabel}${kpi.avgSentiment !== null ? ` (score ${kpi.avgSentiment.toFixed(2)})` : ''}`),
      bullet(`${data.dashboard.topTopics.length} temi rilevati, ${data.alerts.length} alert recenti`),
    );
  }

  // Trend emergenti
  if (has('trends') && data.trends.length) {
    children.push(h1('Trend emergenti (ultime 24 ore)'));
    for (const t of data.trends.slice(0, 6)) {
      children.push(bullet(`×${t.score.toFixed(0)} ${t.topic} — ${t.n24} mention/24h${t.explanation ? `: ${t.explanation}` : ''}`));
    }
  }

  // Brief più recente
  if (has('brief') && data.briefs[0]) {
    children.push(h1(`Daily brief — ${new Date(data.briefs[0].briefDate).toLocaleDateString('it-IT')}`));
    for (const b of briefToBlocks(data.briefs[0].content)) {
      if (b.type === 'h2') children.push(h2(b.text));
      else if (b.type === 'bullet') children.push(bullet(b.text));
      else children.push(p(b.text));
    }
  }

  // Temi
  if (has('topics') && data.dashboard.topTopics.length) {
    children.push(h1('Temi principali (7 giorni)'));
    children.push(table(['Tema', 'Mention'], data.dashboard.topTopics.map((t) => [t.topic, String(t.n)])));
  }

  // Benchmark
  if (has('benchmark') && data.benchmark.length) {
    children.push(h1('Benchmark — share of voice (14 giorni)'));
    children.push(table(
      ['Entità', 'Mention', 'Share of voice', 'Sentiment medio'],
      data.benchmark.map((r) => [
        r.entity.name, String(r.total),
        totalBench ? `${((r.total / totalBench) * 100).toFixed(1)}%` : '—',
        r.avgSentiment === null ? '—' : r.avgSentiment.toFixed(2),
      ]),
    ));
  }

  // Audience
  if (has('audience') && data.audience.communities.length) {
    children.push(h1('Audience — dove si discute'));
    children.push(table(
      ['Community', 'Fonte', 'Mention'],
      data.audience.communities.slice(0, 10).map((c) => [c.community ?? '—', sourceLabel(c.source), String(c.n)]),
    ));
    children.push(h2('Lingue delle conversazioni'));
    const langs = data.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join(' · ');
    children.push(p(langs || '—'));
  }

  // Top contenuti
  if (has('content') && data.ratings.length) {
    children.push(h1('Contenuti top per engagement (7 giorni)'));
    children.push(table(
      ['Contenuto', 'Fonte', 'Engagement', 'AI score', 'Rischio'],
      data.ratings.slice(0, 12).map((r) => [
        (r.title || r.content).slice(0, 90), sourceLabel(r.source),
        String(Math.round(r.engagementScore)),
        r.quality ? String(r.quality.score) : '—', r.quality?.risk ?? '—',
      ]),
    ));
  }

  // Narrazioni
  if (has('narratives') && data.narratives.length) {
    children.push(h1('Narrazioni'));
    for (const n of data.narratives) {
      children.push(bullet(`${n.title} [${n.stance ?? 'neutra'}${n.coordinated ? ', coordinata' : ''}] · ${n.mentionCount} post${n.description ? ` — ${n.description}` : ''}`));
    }
  }

  // Timeline
  if (has('timeline') && data.timeline.length) {
    children.push(h1('Timeline del settore'));
    for (const e of data.timeline.slice(0, 25)) {
      children.push(bullet(`${new Date(e.eventDate).toLocaleDateString('it-IT')} — ${e.title}${e.description ? `: ${e.description}` : ''}`));
    }
  }

  // Alert
  if (has('alerts') && data.alerts.length) {
    children.push(h1('Alert recenti'));
    for (const a of data.alerts.slice(0, 8)) {
      const ex = (a.data as { explanation?: string } | null)?.explanation;
      children.push(bullet(`[${new Date(a.createdAt).toLocaleDateString('it-IT')}] ${a.message}${ex ? ` — ${ex}` : ''}`));
    }
  }

  const doc = new Document({
    creator: 'Radar By Scognamiglio 2026',
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: `Radar By Scognamiglio 2026 — ${project.name} — pag. `, size: 16, color: '94A3B8' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8' }),
            ],
          })],
        }),
      },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="social-radar-${slugify(project.name)}-${todayStamp()}.docx"`,
    },
  });
}
