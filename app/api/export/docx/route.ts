import { NextResponse } from 'next/server';
import {
  AlignmentType, BorderStyle, Document, Footer, HeadingLevel, PageNumber, Packer,
  Paragraph, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import { getCurrentProject } from '@/lib/data';
import { briefToBlocks, collectExportData, parseExportOptions, parseStudioIds, slugify, sourceLabel, todayStamp } from '@/lib/export-data';
import { resolveStudioBlocks } from '@/lib/studio';
import { AI_DISCLOSURE_LONG, AI_DISCLOSURE_META, AI_DISCLOSURE_SHORT } from '@/lib/ai-disclosure';

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
  const url = new URL(req.url);
  const { sections, days } = parseExportOptions(url);
  const has = (s: string) => sections.has(s as never);
  const [data, studio] = await Promise.all([
    collectExportData(project, days),
    resolveStudioBlocks(project.id, parseStudioIds(url)),
  ]);
  const today = new Date().toLocaleDateString('en-US', { dateStyle: 'full' });

  const kpi = data.dashboard.kpi;
  const sentimentLabel = kpi.avgSentiment === null ? 'awaiting analysis'
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
      bullet(`Overall sentiment: ${sentimentLabel}${kpi.avgSentiment !== null ? ` (score ${kpi.avgSentiment.toFixed(2)})` : ''}`),
      bullet(`${data.dashboard.topTopics.length} topics detected, ${data.alerts.length} recent alerts`),
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
    children.push(h1('Emerging trends (last 24 hours)'));
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
    children.push(table(['Topic', 'Mentions'], data.dashboard.topTopics.map((t) => [t.topic, String(t.n)])));
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

  // Author pyramid
  if (has('pyramid') && data.pyramid.tiers.length) {
    children.push(h1(`Author influence pyramid — top tier holds ${data.pyramid.topConcentration}% of reach`));
    children.push(table(
      ['Tier', 'Authors', 'Share of reach', 'Examples'],
      data.pyramid.tiers.map((t) => [t.label, String(t.authors), `${t.sharePct}%`, t.examples.join(', ')]),
    ));
  }

  // Influencer network
  if (has('network') && data.network.nodes.length) {
    children.push(h1('Influencer network — top voices by community'));
    children.push(table(
      ['Author', 'Focus topic', 'Posts', 'Engagement'],
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
    children.push(h1('Audience — where the conversation happens'));
    children.push(table(
      ['Community', 'Source', 'Mentions'],
      data.audience.communities.slice(0, 10).map((c) => [c.community ?? '—', sourceLabel(c.source), String(c.n)]),
    ));
    children.push(h2('Conversation languages'));
    const langs = data.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join(' · ');
    children.push(p(langs || '—'));
  }

  // Top contenuti
  if (has('content') && data.ratings.length) {
    children.push(h1('Top content by engagement (7 days)'));
    children.push(table(
      ['Content', 'Source', 'Engagement', 'AI score', 'Risk'],
      data.ratings.slice(0, 12).map((r) => [
        (r.title || r.content).slice(0, 90), sourceLabel(r.source),
        String(Math.round(r.engagementScore)),
        r.quality ? String(r.quality.score) : '—', r.quality?.risk ?? '—',
      ]),
    ));
  }

  // Point of View
  if (has('pov') && data.pov.pov) {
    const pv = data.pov.pov;
    children.push(h1('Point of View'));
    children.push(p(pv.headline, { bold: true, size: 26 }));
    for (const par of pv.intro ?? []) children.push(p(par.text));
    for (const [i, b] of pv.blocks.entries()) {
      children.push(h2(`${i + 1}. ${b.title}`));
      children.push(p(`${b.kind} · ${b.confidence} confidence`, { muted: true, size: 18 }));
      if (b.stats.length) {
        children.push(table(['Figure', 'What it measures'], b.stats.map((s) => [s.value, s.label])));
      }
      children.push(p(b.body));
    }
    if (pv.counterSignals.length) {
      children.push(h2('Counter-signals'));
      for (const c of pv.counterSignals) children.push(bullet(c.point));
    }
    if (pv.implications.length) {
      children.push(h2('So what'));
      for (const t of pv.implications) children.push(bullet(t));
    }
    if (pv.watch.length) {
      children.push(h2('What to watch'));
      for (const t of pv.watch) children.push(bullet(t));
    }
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
    children.push(h1('Recent alerts'));
    for (const a of data.alerts.slice(0, 8)) {
      const ex = (a.data as { explanation?: string } | null)?.explanation;
      children.push(bullet(`[${new Date(a.createdAt).toLocaleDateString('en-US')}] ${a.message}${ex ? ` — ${ex}` : ''}`));
    }
  }

  // Crisis radar & peak
  if (has('crisis') && data.crisis.peak) {
    const pk = data.crisis.peak;
    children.push(h1(`Crisis radar — risk ${data.crisis.risk}/100 (${data.crisis.level})`));
    children.push(p(`Risk drivers: ${data.crisis.drivers.map((d) => `${d.label} +${d.value}`).join(' · ')}`));
    children.push(h2(`Peak day: ${pk.day} — ${pk.volume} mentions, ${pk.negShare}% negative`));
    if (pk.topics.length) children.push(p(`Topics: ${pk.topics.map((t) => `${t.topic} (${t.n})`).join(', ')}`));
    for (const c of pk.content) children.push(bullet(`[${sourceLabel(c.source)}] ${c.title}`));
  }

  // Note finali: informativa art. 50 in forma estesa.
  // ── Persone (personal branding). Erano solo nel PDF: chi le sceglieva e
  // poi esportava in Word non trovava niente, senza che nulla lo avvisasse.
  const ppl = data.people;
  if (has('people') && ppl.ranking.length > 1) {
    children.push(h1('People — the team at a glance'));
    children.push(table(
      ['Person', 'Audience', 'Posts / month', 'Avg engagement'],
      ppl.ranking.map((r) => [
        r.name,
        r.followers === null ? '—' : r.followers.toLocaleString('en-US'),
        r.perMonth === null ? '—' : String(r.perMonth),
        r.engagement === null ? '—' : String(Math.round(r.engagement)),
      ]),
    ));
    children.push(p('Three different measures: whoever has the largest audience is not necessarily the one engaging it most.', { muted: true, size: 16 }));
  }
  if (has('peopleGrowth') && ppl.cards.some((x) => x.followers)) {
    children.push(h1('Audience growth per person'));
    const rows = ppl.cards.filter((x) => x.followers)
      .sort((a, b) => b.followers!.gained - a.followers!.gained);
    children.push(table(['Person', 'Gained', 'Now'], rows.map((x) => [
      x.name,
      `${x.followers!.gained >= 0 ? '+' : ''}${x.followers!.gained.toLocaleString('en-US')}`,
      x.followers!.latest.toLocaleString('en-US'),
    ])));
    const span = rows[0]?.followers;
    if (span) children.push(p(`Gained between ${span.from} and ${span.to}.`, { muted: true, size: 16 }));
  }
  if (has('peopleDetail') && ppl.cards.length) {
    children.push(h1('Person cards'));
    for (const c of ppl.cards) {
      if (!c.followers && !c.rhythm && !c.averages.length) continue;
      children.push(h2(c.name));
      const bits: string[] = [];
      if (c.followers) bits.push(`${c.followers.latest.toLocaleString('en-US')} followers (${c.followers.gained >= 0 ? '+' : ''}${c.followers.gained.toLocaleString('en-US')} since ${c.followers.from})`);
      if (c.rhythm) bits.push(`${c.rhythm.perMonth} posts/month over ${c.rhythm.months} months${c.rhythm.trend !== null ? ` (${c.rhythm.trend >= 0 ? '+' : ''}${c.rhythm.trend}%)` : ''}`);
      for (const a of c.averages.slice(0, 3)) bits.push(`${a.metric}: ${a.value}`);
      if (bits.length) children.push(p(bits.join('  ·  '), { muted: true, size: 16 }));
      if (c.formats.length) children.push(bullet(`Best format: ${c.formats[0].name} (avg engagement ${c.formats[0].avgEngagement} over ${c.formats[0].posts} posts)`));
      if (c.audience.length) {
        const a = c.audience[0];
        children.push(bullet(`Audience by ${a.dimension}: ${a.rows.slice(0, 4).map((r) => `${r.name} ${(r.share * 100).toFixed(0)}%`).join(', ')}`));
      }
    }
  }

  // I grafici costruiti in Studio Graph: una tabella per ciascuno, con il
  // proprio periodo dichiarato — è il suo, non quello del report.
  for (const chart of studio.values()) {
    children.push(h1(chart.title));
    children.push(p(
      `${chart.yLabel} per ${chart.xLabel}${chart.zLabel ? `, diviso per ${chart.zLabel}` : ''} · ultimi ${chart.days} giorni`,
      { muted: true, size: 16 },
    ));
    if (!chart.rows.length) {
      children.push(p('Nessun dato con questi campi nel periodo del grafico.', { muted: true }));
      continue;
    }
    const num = (v: number) => (Number.isInteger(v) ? v.toLocaleString('en-US')
      : v.toLocaleString('en-US', { maximumFractionDigits: 2 }));
    const series = [...new Set(chart.rows.map((r) => r.z).filter(Boolean))] as string[];
    if (series.length > 1) {
      const cols = series.slice(0, 6);
      const xs = [...new Set(chart.rows.map((r) => r.x))].slice(0, 40);
      children.push(table([chart.xLabel, ...cols], xs.map((x) => [x, ...cols.map((z) => {
        const v = chart.rows.filter((r) => r.x === x && r.z === z).reduce((a, r) => a + r.y, 0);
        return v ? num(v) : '—';
      })])));
    } else {
      children.push(table([chart.xLabel, chart.yLabel],
        chart.rows.slice(0, 60).map((r) => [r.x, num(r.y)])));
    }
  }

  children.push(new Paragraph({
    spacing: { before: 400, after: 80 },
    children: [new TextRun({ text: 'NOTE', bold: true, size: 16, color: '94A3B8' })],
  }));
  children.push(new Paragraph({
    spacing: { after: 100 },
    children: [new TextRun({ text: AI_DISCLOSURE_LONG, size: 15, color: '64748B' })],
  }));

  const doc = new Document({
    creator: 'Radar By Scognamiglio 2026',
    // Marcatura leggibile da una macchina (AI Act art. 50, par. 2).
    subject: AI_DISCLOSURE_META.subject,
    keywords: AI_DISCLOSURE_META.keywords,
    description: AI_DISCLOSURE_META.description,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    sections: [{
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: AI_DISCLOSURE_SHORT, size: 13, color: '94A3B8' })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new TextRun({ text: `Radar By Scognamiglio 2026 — ${project.name} — pag. `, size: 16, color: '94A3B8' }),
                new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8' }),
              ],
            }),
          ],
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
