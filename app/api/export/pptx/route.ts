import { NextResponse } from 'next/server';
import PptxGenJS from 'pptxgenjs';
import { getCurrentProject } from '@/lib/data';
import { briefToBlocks, collectExportData, parseExportOptions, slugify, sourceLabel, todayStamp } from '@/lib/export-data';
import { SOURCE_META } from '@/lib/connectors';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const BG = '0A0F1F';
const PANEL = '10172E';
const TEXT = 'E2E8F0';
const MUTED = '7C8CAB';
const ACCENT = '38BDF8';
const ENTITY_COLORS = ['38BDF8', 'A78BFA', '34D399', 'FBBF24', 'F87171', 'F472B6', '22D3EE'];
const SENTIMENT_COLORS: Record<string, string> = {
  positive: '34D399', neutral: '94A3B8', negative: 'F87171', 'analyzing': '475569',
};

export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const { sections, days: rangeDays } = parseExportOptions(new URL(req.url));
  const has = (s: string) => sections.has(s as never);
  const data = await collectExportData(project, rangeDays);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'Radar By Scognamiglio 2026';
  pptx.defineSlideMaster({
    title: 'DARK',
    background: { color: BG },
    objects: [
      { text: { text: 'Radar · By Scognamiglio 2026', options: { x: 0.4, y: 7.05, fontSize: 10, color: MUTED } } },
      {
        text: {
          text: new Date().toLocaleDateString('en-US'),
          options: { x: 11.9, y: 7.05, fontSize: 10, color: MUTED, align: 'right', w: 1.1 },
        },
      },
    ],
  });

  const titleOpts = { x: 0.5, y: 0.35, w: 12.3, h: 0.7, fontSize: 26, bold: true, color: TEXT } as const;

  // ── 1. Copertina
  const s1 = pptx.addSlide({ masterName: 'DARK' });
  s1.addText('RADAR', { x: 0.5, y: 2.1, w: 12.3, h: 0.5, fontSize: 20, color: ACCENT, align: 'center', charSpacing: 8 });
  s1.addText('BY SCOGNAMIGLIO 2026', { x: 0.5, y: 2.55, w: 12.3, h: 0.3, fontSize: 10, color: MUTED, align: 'center', charSpacing: 4 });
  s1.addText(project.name, { x: 0.5, y: 2.8, w: 12.3, h: 1.1, fontSize: 48, bold: true, color: TEXT, align: 'center' });
  s1.addText('Media intelligence report', { x: 0.5, y: 4.0, w: 12.3, h: 0.5, fontSize: 20, color: MUTED, align: 'center' });
  s1.addText(
    `${new Date().toLocaleDateString('en-US', { dateStyle: 'full' })}  ·  Query: ${project.keywords.join(', ')}`,
    { x: 0.5, y: 4.6, w: 12.3, h: 0.5, fontSize: 14, color: MUTED, align: 'center' },
  );

  // ── 2. KPI
  const kpi = data.dashboard.kpi;
  const sentimentLabel = kpi.avgSentiment === null ? 'analyzing'
    : kpi.avgSentiment > 0.15 ? 'positive' : kpi.avgSentiment < -0.15 ? 'negative' : 'neutral';
  if (has('kpi')) {
  const s2 = pptx.addSlide({ masterName: 'DARK' });
  s2.addText('At a glance', titleOpts);
  const kpis: [string, string][] = [
    ['Mentions (7 days)', kpi.total7.toLocaleString('en-US')],
    ['Avg sentiment', sentimentLabel],
    ['Active sources', String(kpi.sources)],
    ['Topics detected', String(data.dashboard.topTopics.length)],
  ];
  kpis.forEach(([label, value], i) => {
    const x = 0.5 + i * 3.15;
    s2.addShape('roundRect', { x, y: 1.6, w: 2.9, h: 2, fill: { color: PANEL }, line: { color: '1E2A4A' }, rectRadius: 0.08 });
    s2.addText(label.toUpperCase(), { x: x + 0.2, y: 1.85, w: 2.5, h: 0.4, fontSize: 11, color: MUTED });
    s2.addText(value, { x: x + 0.2, y: 2.35, w: 2.5, h: 0.9, fontSize: 30, bold: true, color: TEXT });
  });
  if (data.dashboard.topTopics.length) {
    s2.addText('Top topics', { x: 0.5, y: 4.1, w: 6, h: 0.4, fontSize: 14, bold: true, color: MUTED });
    s2.addText(
      data.dashboard.topTopics.slice(0, 10).map((t) => `${t.topic} (${t.n})`).join('   ·   '),
      { x: 0.5, y: 4.55, w: 12.3, h: 1.4, fontSize: 15, color: ACCENT },
    );
  }
  }

  // ── Brand Health Index
  if (has('health') && data.health.total > 0) {
    const hCol = data.health.score >= 80 ? '34D399' : data.health.score >= 65 ? '38BDF8' : data.health.score >= 50 ? 'FBBF24' : 'F87171';
    const sh = pptx.addSlide({ masterName: 'DARK' });
    sh.addText('Brand Health Index', titleOpts);
    sh.addShape('roundRect', { x: 0.5, y: 1.6, w: 4.2, h: 4.6, fill: { color: PANEL }, line: { color: '1E2A4A' }, rectRadius: 0.1 });
    sh.addText(String(data.health.score), { x: 0.5, y: 2.4, w: 4.2, h: 1.7, fontSize: 96, bold: true, color: hCol, align: 'center' });
    sh.addText(data.health.grade.toUpperCase(), { x: 0.5, y: 4.1, w: 4.2, h: 0.5, fontSize: 20, bold: true, color: hCol, align: 'center', charSpacing: 2 });
    sh.addText(`${data.health.total.toLocaleString('en-US')} mentions · 14 days`, { x: 0.5, y: 4.7, w: 4.2, h: 0.4, fontSize: 12, color: MUTED, align: 'center' });
    sh.addChart('bar', [{
      name: 'Score',
      labels: data.health.components.map((c) => c.label),
      values: data.health.components.map((c) => c.value),
    }], {
      x: 5.1, y: 1.6, w: 7.7, h: 4.6, barDir: 'bar',
      chartColors: data.health.components.map((c) => c.value >= 80 ? '34D399' : c.value >= 65 ? '38BDF8' : c.value >= 50 ? 'FBBF24' : 'F87171'),
      catAxisLabelColor: TEXT, valAxisLabelColor: MUTED, showLegend: false,
      valAxisMinVal: 0, valAxisMaxVal: 100, valGridLine: { color: '1E2A4A' }, catGridLine: { style: 'none' },
    });
  }

  // ── Emerging trends
  if (has('trends') && data.trends.length) {
    const st = pptx.addSlide({ masterName: 'DARK' });
    st.addText('Radar — emerging trends', titleOpts);
    st.addText(
      data.trends.slice(0, 6).map((t) => ({
        text: `×${t.score.toFixed(0)}  ${t.topic}${t.explanation ? ` — ${t.explanation}` : ''}`,
        options: { fontSize: 14, color: TEXT, bullet: { code: '2022' }, breakLine: true },
      })),
      { x: 0.5, y: 1.3, w: 12.3, h: 5.6, lineSpacing: 22, valign: 'top' },
    );
  }

  // ── 3. Volume per fonte (barre impilate, grafico nativo)
  const days = [...new Set(data.dashboard.volumeByDay.map((r) => r.day))].sort();
  const sources = [...new Set(data.dashboard.volumeByDay.map((r) => r.source))];
  if (has('volume') && days.length) {
    const s3 = pptx.addSlide({ masterName: 'DARK' });
    s3.addText('Volume by source (14 days)', titleOpts);
    s3.addChart('bar', sources.map((src) => ({
      name: sourceLabel(src),
      labels: days.map((d) => d.slice(5)),
      values: days.map((d) => Number(data.dashboard.volumeByDay.find((r) => r.day === d && r.source === src)?.n ?? 0)),
    })), {
      x: 0.5, y: 1.3, w: 12.3, h: 5.6,
      barGrouping: 'stacked', chartColors: sources.map((s) => (SOURCE_META[s]?.color ?? '#64748b').replace('#', '')),
      catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, legendPos: 'b',
      showLegend: true, legendColor: MUTED, valGridLine: { color: '1E2A4A' }, catGridLine: { style: 'none' },
    });
  }

  // ── 4. Sentiment (torta nativa)
  if (has('sentiment') && data.dashboard.sentimentDist.length) {
    const s4 = pptx.addSlide({ masterName: 'DARK' });
    s4.addText('Sentiment (7 days)', titleOpts);
    s4.addChart('doughnut', [{
      name: 'Sentiment',
      labels: data.dashboard.sentimentDist.map((r) => r.sentiment),
      values: data.dashboard.sentimentDist.map((r) => r.n),
    }], {
      x: 3.2, y: 1.3, w: 7, h: 5.6, holeSize: 60,
      chartColors: data.dashboard.sentimentDist.map((r) => SENTIMENT_COLORS[r.sentiment] ?? '64748B'),
      showLegend: true, legendPos: 'b', legendColor: MUTED, dataLabelColor: TEXT, showValue: true,
    });
  }

  // ── 4a. Emotion radar
  if (has('emotions') && data.emotions.length) {
    const se = pptx.addSlide({ masterName: 'DARK' });
    se.addText('Emotion radar — emotional fingerprint (30 days)', titleOpts);
    se.addChart('radar', [{
      name: 'Share %',
      labels: data.emotions.map((e) => e.emotion),
      values: data.emotions.map((e) => e.share),
    }], {
      x: 1.5, y: 1.3, w: 10.3, h: 5.4,
      chartColors: ['A78BFA'], radarStyle: 'standard',
      catAxisLabelColor: TEXT, valAxisLabelColor: MUTED, showLegend: false,
      lineSize: 2,
    });
  }

  // ── 4b. Geographic map (per area/lingua)
  if (has('geo') && data.geo.length) {
    const s4b = pptx.addSlide({ masterName: 'DARK' });
    s4b.addText('Geographic map — conversation by area (language-inferred)', titleOpts);
    const geo = data.geo.slice(0, 12);
    s4b.addChart('bar', [{
      name: 'Mentions',
      labels: geo.map((g) => g.country),
      values: geo.map((g) => g.volume),
    }], {
      x: 0.5, y: 1.3, w: 7.5, h: 5.4, barDir: 'bar',
      chartColors: geo.map((g) => (g.sentiment === null ? '64748B' : g.sentiment > 0.15 ? '34D399' : g.sentiment < -0.15 ? 'F87171' : '94A3B8')),
      catAxisLabelColor: MUTED, valAxisLabelColor: MUTED, showLegend: false,
      valGridLine: { color: '1E2A4A' }, catGridLine: { style: 'none' },
    });
    s4b.addTable([
      ['Area', 'Mentions', 'Share', 'Sentiment'].map((t) => ({
        text: t, options: { bold: true, color: TEXT, fill: { color: PANEL }, fontSize: 12 },
      })),
      ...geo.map((g) => [g.country, String(g.volume), `${g.share}%`, g.sentiment === null ? 'n/a' : g.sentiment.toFixed(2)]
        .map((t) => ({ text: t, options: { color: TEXT, fontSize: 11 } }))),
    ], { x: 8.2, y: 1.3, w: 4.6, colW: [2.2, 0.9, 0.7, 0.8], border: { type: 'solid', color: '1E2A4A', pt: 1 } });
  }

  // ── 5. Share of voice
  const totalBench = data.benchmark.reduce((s, r) => s + r.total, 0);
  if (has('benchmark') && totalBench > 0) {
    const s5 = pptx.addSlide({ masterName: 'DARK' });
    s5.addText('Benchmark — share of voice (14 days)', titleOpts);
    s5.addChart('pie', [{
      name: 'Share of voice',
      labels: data.benchmark.map((r) => r.entity.name),
      values: data.benchmark.map((r) => r.total),
    }], {
      x: 0.5, y: 1.4, w: 6.2, h: 5.3,
      chartColors: data.benchmark.map((_, i) => ENTITY_COLORS[i % ENTITY_COLORS.length]),
      showLegend: true, legendPos: 'b', legendColor: MUTED, dataLabelColor: TEXT, showPercent: true,
    });
    s5.addTable([
      ['Entity', 'Mentions', 'SOV', 'Sentiment'].map((t) => ({
        text: t, options: { bold: true, color: TEXT, fill: { color: PANEL }, fontSize: 13 },
      })),
      ...data.benchmark.map((r) => [
        { text: r.entity.name, options: { color: TEXT, fontSize: 12 } },
        { text: String(r.total), options: { color: TEXT, fontSize: 12 } },
        { text: `${((r.total / totalBench) * 100).toFixed(1)}%`, options: { color: TEXT, fontSize: 12 } },
        { text: r.avgSentiment === null ? '—' : r.avgSentiment.toFixed(2), options: { color: TEXT, fontSize: 12 } },
      ]),
    ], { x: 7.2, y: 1.8, w: 5.6, colW: [2.2, 1.1, 1.1, 1.2], border: { color: '1E2A4A' }, fill: { color: BG } });
  }

  // ── 6. Audience
  if (has('audience') && data.audience.communities.length) {
    const s6 = pptx.addSlide({ masterName: 'DARK' });
    s6.addText('Audience — dove si discute', titleOpts);
    s6.addChart('bar', [{
      name: 'Mentions',
      labels: data.audience.communities.slice(0, 8).map((c) => c.community ?? '—'),
      values: data.audience.communities.slice(0, 8).map((c) => c.n),
    }], {
      x: 0.5, y: 1.3, w: 6.4, h: 5.6, barDir: 'bar',
      chartColors: [ACCENT], catAxisLabelColor: MUTED, valAxisLabelColor: MUTED,
      showLegend: false, valGridLine: { color: '1E2A4A' }, catGridLine: { style: 'none' },
    });
    s6.addText('Lingue', { x: 7.3, y: 1.4, w: 5.5, h: 0.4, fontSize: 14, bold: true, color: MUTED });
    s6.addText(
      data.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join('  ·  ') || '—',
      { x: 7.3, y: 1.85, w: 5.5, h: 1.2, fontSize: 13, color: TEXT },
    );
    s6.addText('Most influential authors', { x: 7.3, y: 3.2, w: 5.5, h: 0.4, fontSize: 14, bold: true, color: MUTED });
    s6.addText(
      data.audience.authors.slice(0, 8).map((a) => `${a.author} — ${sourceLabel(a.source)}`).join('\n') || '—',
      { x: 7.3, y: 3.65, w: 5.5, h: 3, fontSize: 12, color: TEXT, lineSpacing: 18 },
    );
  }

  // ── 7. Contenuti top
  if (has('content') && data.ratings.length) {
    const s7 = pptx.addSlide({ masterName: 'DARK' });
    s7.addText('Top content by engagement', titleOpts);
    s7.addTable([
      ['Contenuto', 'Source', 'Engagement', 'AI score', 'Risk'].map((t) => ({
        text: t, options: { bold: true, color: TEXT, fill: { color: PANEL }, fontSize: 12 },
      })),
      ...data.ratings.slice(0, 9).map((r) => [
        { text: (r.title || r.content).slice(0, 80), options: { color: TEXT, fontSize: 11 } },
        { text: sourceLabel(r.source), options: { color: TEXT, fontSize: 11 } },
        { text: String(Math.round(r.engagementScore)), options: { color: TEXT, fontSize: 11 } },
        { text: r.quality ? String(r.quality.score) : '—', options: { color: TEXT, fontSize: 11 } },
        { text: r.quality?.risk ?? '—', options: { color: r.quality?.risk === 'high' ? 'F87171' : TEXT, fontSize: 11 } },
      ]),
    ], { x: 0.5, y: 1.3, w: 12.3, colW: [7.1, 1.6, 1.4, 1.1, 1.1], border: { color: '1E2A4A' }, autoPage: false });
  }

  // ── Narrazioni
  if (has('narratives') && data.narratives.length) {
    const sn = pptx.addSlide({ masterName: 'DARK' });
    sn.addText('Narratives', titleOpts);
    sn.addText(
      data.narratives.slice(0, 6).map((n) => ({
        text: `${n.title}  [${n.stance ?? 'neutral'}${n.coordinated ? ', coordinated' : ''}] · ${n.mentionCount} posts`,
        options: { fontSize: 14, color: TEXT, bullet: { code: '2022' }, breakLine: true },
      })),
      { x: 0.5, y: 1.3, w: 12.3, h: 5.6, lineSpacing: 22, valign: 'top' },
    );
  }

  // ── Timeline
  if (has('timeline') && data.timeline.length) {
    const stl = pptx.addSlide({ masterName: 'DARK' });
    stl.addText('Sector timeline', titleOpts);
    stl.addText(
      data.timeline.slice(0, 12).map((e) => ({
        text: `${new Date(e.eventDate).toLocaleDateString('en-US')} — ${e.title}`,
        options: { fontSize: 13, color: TEXT, bullet: { code: '2022' }, breakLine: true },
      })),
      { x: 0.5, y: 1.3, w: 12.3, h: 5.6, lineSpacing: 20, valign: 'top' },
    );
  }

  // ── 8. Brief
  if (has('brief') && data.briefs[0]) {
    const s8 = pptx.addSlide({ masterName: 'DARK' });
    s8.addText(`Daily brief — ${new Date(data.briefs[0].briefDate).toLocaleDateString('en-US')}`, titleOpts);
    const lines = briefToBlocks(data.briefs[0].content).slice(0, 18).map((b) => ({
      text: b.text,
      options: {
        fontSize: b.type === 'h2' ? 15 : 12,
        bold: b.type === 'h2',
        color: b.type === 'h2' ? ACCENT : TEXT,
        bullet: b.type === 'bullet' ? { code: '2022' } : false,
        breakLine: true,
      },
    }));
    s8.addText(lines, { x: 0.5, y: 1.3, w: 12.3, h: 5.7, lineSpacing: 16, valign: 'top' });
  }

  const buffer = (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="social-radar-${slugify(project.name)}-${todayStamp()}.pptx"`,
    },
  });
}
