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
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const { sections, days } = parseExportOptions(new URL(req.url));
  const has = (s: string) => sections.has(s as never);
  const data = await collectExportData(project, days);
  const today = new Date().toLocaleDateString('en-US', { dateStyle: 'full' });

  const kpi = data.dashboard.kpi;
  const sentimentLabel = kpi.avgSentiment === null ? 'in attesa di analisi'
    : kpi.avgSentiment > 0.15 ? 'positive' : kpi.avgSentiment < -0.15 ? 'negative' : 'neutral';
  const totalBench = data.benchmark.reduce((s, r) => s + r.total, 0);

  const children: (Paragraph | Table)[] = [
    // Copertina
    new Paragraph({ spacing: { before: 2400, after: 200 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'RADAR', bold: true, size: 28, color: ACCENT }), new TextRun({ text: '  ·  By Scognamiglio 2026', size: 18, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: project.name, bold: true, size: 56 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: 'Media intelligence report', size: 26, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: today, size: 22, color: '64748B' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 2400 }, children: [new TextRun({ text: `Data from the last ${days} days · Query: ${project.keywords.join(', ')}`, size: 20, color: '64748B' })] }),
  ];

  if (has('kpi')) {
    children.push(
      h1('At a glance'),
      bullet(`${kpi.total7.toLocaleString('en-US')}  mentions in the last 7 days from ${kpi.sources} active sources`),
      bullet(`Sentiment complessivo: ${sentimentLabel}${kpi.avgSentiment !== null ? ` (score ${kpi.avgSentiment.toFixed(2)})` : ''}`),
      bullet(`${data.dashboard.topTopics.length} temi rilevati, ${data.alerts.length} alert recenti`),
    );
  }

  // Health Index (market + brand + confronto)
  if (has('health') && data.health.theme.total > 0) {
    children.push(h1(`Market Health Index — ${data.health.theme.score}/100 (${data.health.theme.grade})`));
    children.push(table(
      ['Metric', 'Value (0-100)', 'Weight'],
      data.health.theme.components.map((c) => [c.label, String(c.value), `${Math.round(c.weight * 100)}%`]),
    ));
    if (data.health.brand) {
      const b = data.health.brand;
      children.push(h2(`Brand health — ${b.name}: ${b.health.score}/100 (${b.health.grade}), ${b.health.score - data.health.theme.score >= 0 ? '+' : ''}${b.health.score - data.health.theme.score} vs market`));
      children.push(table(
        ['Metric', 'Value (0-100)', 'Weight'],
        b.health.components.map((c) => [c.label, String(c.value), `${Math.round(c.weight * 100)}%`]),
      ));
    }
    if (data.health.compare.length > 1) {
      children.push(h2('Health ranking — your brand vs competitors'));
      children.push(table(
        ['Entity', 'Health score', 'Mentions', 'Your brand'],
        data.health.compare.map((c) => [c.name, String(c.score), String(c.total), c.isBrand ? 'yes' : '']),
      ));
    }
  }

  // Emerging trends
  if (has('trends') && data.trends.length) {
    children.push(h1('Emerging trends (ultime 24 ore)'));
    for (const t of data.trends.slice(0, 6)) {
      children.push(bullet(`×${t.score.toFixed(0)} ${t.topic} — ${t.n24} mentions/24h${t.explanation ? `: ${t.explanation}` : ''}`));
    }
  }

  // Brief più recente
  if (has('brief') && data.briefs[0]) {
    children.push(h1(`Daily brief — ${new Date(data.briefs[0].briefDate).toLocaleDateString('en-US')}`));
    for (const b of briefToBlocks(data.briefs[0].content)) {
      if (b.type === 'h2') children.push(h2(b.text));
      else if (b.type === 'bullet') children.push(bullet(b.text));
      else children.push(p(b.text));
    }
  }

  // Temi
  if (has('topics') && data.dashboard.topTopics.length) {
    children.push(h1('Top topics (7 days)'));
    children.push(table(['Tema', 'Mentions'], data.dashboard.topTopics.map((t) => [t.topic, String(t.n)])));
  }

  // Semantic constellation
  if (has('constellation') && data.constellation.nodes.length) {
    children.push(h1('Semantic constellation — key terms'));
    children.push(table(
      ['Term', 'Frequency', 'Avg sentiment'],
      data.constellation.nodes.map((n) => [n.term, String(n.freq), n.sentiment.toFixed(2)]),
    ));
    if (data.constellation.edges.length) {
      children.push(h2('Strongest co-occurrences'));
      for (const e of data.constellation.edges.slice(0, 15)) {
        children.push(bullet(`${e.a} + ${e.b} — appear together ${e.weight}×`));
      }
    }
  }

  // Influencer network
  if (has('network') && data.network.nodes.length) {
    children.push(h1('Influencer network — top voices by community'));
    children.push(table(
      ['Author', 'Community', 'Posts', 'Engagement'],
      [...data.network.nodes].sort((a, b) => b.engagement - a.engagement).slice(0, 25)
        .map((n) => [n.label, n.community, String(n.posts), n.engagement.toLocaleString('en-US')]),
    ));
  }

  // Conversation flow
  if (has('flow') && data.flow.links.length) {
    const lbl = new Map(data.flow.nodes.map((n) => [n.key, n.label]));
    children.push(h1('Conversation flow — Source → Topic → Sentiment'));
    children.push(table(
      ['From', 'To', 'Mentions'],
      [...data.flow.links].sort((a, b) => b.value - a.value).slice(0, 25)
        .map((l) => [String(lbl.get(l.source) ?? l.source), String(lbl.get(l.target) ?? l.target), String(l.value)]),
    ));
  }

  // Momentum quadrant
  if (has('momentum') && data.momentum.length) {
    children.push(h1('Momentum quadrant — topics by volume × acceleration'));
    children.push(table(
      ['Topic', 'Volume', 'Acceleration', 'Quadrant'],
      [...data.momentum].sort((a, b) => b.volume - a.volume).map((p) => [
        p.topic, String(p.volume), `${p.acceleration > 0 ? '+' : ''}${p.acceleration}%`, p.quadrant,
      ]),
    ));
  }

  // Emotion radar
  if (has('emotions') && data.emotions.length) {
    children.push(h1('Emotion radar — emotional fingerprint (30 days)'));
    children.push(table(
      ['Emotion', 'Mentions', 'Share'],
      data.emotions.map((e) => [e.emotion, String(e.value), `${e.share}%`]),
    ));
  }

  // Geographic map
  if (has('geo') && data.geo.length) {
    children.push(h1('Geographic map — conversation by area (language-inferred)'));
    children.push(table(
      ['Area / language', 'Mentions', 'Share', 'Avg sentiment'],
      data.geo.map((g) => [
        g.country, String(g.volume), `${g.share}%`,
        g.sentiment === null ? '—' : g.sentiment.toFixed(2),
      ]),
    ));
  }

  // Share of Voice over time (riassunto per entità)
  if (has('sov') && data.sov.entities.length) {
    const totals = data.sov.entities.map((e) => ({ e, n: data.sov.days.reduce((s, d) => s + Number(d[e] ?? 0), 0) }));
    const grand = totals.reduce((s, t) => s + t.n, 0) || 1;
    children.push(h1('Share of Voice over time (30 days)'));
    children.push(table(
      ['Entity', 'Mentions', 'Share of voice'],
      totals.sort((a, b) => b.n - a.n).map((t) => [t.e, String(t.n), `${((t.n / grand) * 100).toFixed(1)}%`]),
    ));
  }

  // Benchmark
  if (has('benchmark') && data.benchmark.length) {
    children.push(h1('Benchmark — share of voice (14 days)'));
    children.push(table(
      ['Entity', 'Mentions', 'Share of voice', 'Avg sentiment'],
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
      ['Community', 'Source', 'Mentions'],
      data.audience.communities.slice(0, 10).map((c) => [c.community ?? '—', sourceLabel(c.source), String(c.n)]),
    ));
    children.push(h2('Lingue delle conversazioni'));
    const langs = data.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join(' · ');
    children.push(p(langs || '—'));
  }

  // Top contenuti
  if (has('content') && data.ratings.length) {
    children.push(h1('Top content by engagement (7 days)'));
    children.push(table(
      ['Contenuto', 'Source', 'Engagement', 'AI score', 'Risk'],
      data.ratings.slice(0, 12).map((r) => [
        (r.title || r.content).slice(0, 90), sourceLabel(r.source),
        String(Math.round(r.engagementScore)),
        r.quality ? String(r.quality.score) : '—', r.quality?.risk ?? '—',
      ]),
    ));
  }

  // Narrazioni
  if (has('narratives') && data.narratives.length) {
    children.push(h1('Narratives'));
    for (const n of data.narratives) {
      children.push(bullet(`${n.title} [${n.stance ?? 'neutral'}${n.coordinated ? ', coordinated' : ''}] · ${n.mentionCount} posts${n.description ? ` — ${n.description}` : ''}`));
    }
  }

  // Timeline
  if (has('timeline') && data.timeline.length) {
    children.push(h1('Sector timeline'));
    for (const e of data.timeline.slice(0, 25)) {
      children.push(bullet(`${new Date(e.eventDate).toLocaleDateString('en-US')} — ${e.title}${e.description ? `: ${e.description}` : ''}`));
    }
  }

  // Alert
  if (has('alerts') && data.alerts.length) {
    children.push(h1('Alert recenti'));
    for (const a of data.alerts.slice(0, 8)) {
      const ex = (a.data as { explanation?: string } | null)?.explanation;
      children.push(bullet(`[${new Date(a.createdAt).toLocaleDateString('en-US')}] ${a.message}${ex ? ` — ${ex}` : ''}`));
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
