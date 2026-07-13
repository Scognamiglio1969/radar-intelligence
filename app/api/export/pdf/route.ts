import { NextResponse } from 'next/server';
import PDFDocument from 'pdfkit';
import { getCurrentProject } from '@/lib/data';
import {
  collectExportData, parseExportOptions, slugify, sourceLabel, todayStamp, briefToBlocks,
} from '@/lib/export-data';
import { SOURCE_META } from '@/lib/connectors';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ACCENT = '#0284c7';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const PANEL = '#f1f5f9';
const SENT: Record<string, string> = { positive: '#16a34a', neutral: '#64748b', negative: '#dc2626' };
const ENTITY = ['#0284c7', '#7c3aed', '#059669', '#d97706', '#dc2626', '#db2777', '#0891b2'];

// pdfkit con font standard (Helvetica) codifica in WinAnsi: rimuovo i caratteri
// fuori da Latin-1 (emoji, CJK, arabo) per evitare crash di rendering.
function sanitize(s: string | null | undefined): string {
  return (s ?? '').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '').replace(/\s+/g, ' ').trim();
}

export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const { sections, days } = parseExportOptions(new URL(req.url));
  const data = await collectExportData(project, days);
  const has = (s: string) => sections.has(s as never);

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    info: { Title: `Radar — ${sanitize(project.name)}`, Author: 'Radar By Scognamiglio 2026' },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const M = doc.page.margins;
  const left = M.left;
  const right = doc.page.width - M.right;
  const contentW = right - left;
  const bottomLimit = () => doc.page.height - M.bottom;

  const ensure = (h: number) => { if (doc.y + h > bottomLimit()) doc.addPage(); };

  const heading = (text: string) => {
    ensure(40);
    doc.moveDown(0.6);
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(15).text(sanitize(text), left, doc.y);
    const y = doc.y + 3;
    doc.moveTo(left, y).lineTo(right, y).lineWidth(1).strokeColor(BORDER).stroke();
    doc.moveDown(0.5);
    doc.fillColor(TEXT);
  };

  const para = (text: string, opts: { size?: number; color?: string; bold?: boolean; gap?: number } = {}) => {
    ensure(20);
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 10)
      .fillColor(opts.color ?? TEXT).text(sanitize(text), left, doc.y, { width: contentW });
    doc.moveDown(opts.gap ?? 0.3);
  };

  // Barre orizzontali con etichetta e valore
  const hbars = (items: { label: string; value: number; color?: string; sub?: string }[], color = ACCENT) => {
    const max = Math.max(1, ...items.map((i) => i.value));
    for (const it of items) {
      ensure(20);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(sanitize(it.label), left, y, { width: contentW * 0.42, ellipsis: true });
      doc.fillColor(MUTED).text(`${it.value.toLocaleString('en-US')}${it.sub ? ` · ${it.sub}` : ''}`, right - 120, y, { width: 120, align: 'right' });
      const barY = y + 12;
      const barW = contentW * 0.42;
      const trackX = left + contentW * 0.44;
      const trackW = contentW - contentW * 0.44 - 130;
      doc.roundedRect(trackX, barY, trackW, 5, 2.5).fill(PANEL);
      doc.roundedRect(trackX, barY, Math.max(2, (it.value / max) * trackW), 5, 2.5).fill(it.color ?? color);
      doc.fillColor(TEXT);
      doc.y = barY + 12;
    }
  };

  // Tabella con intestazione
  const table = (headers: string[], rows: string[][], widths: number[], align: ('left' | 'right' | 'center')[] = []) => {
    const colX = (i: number) => left + widths.slice(0, i).reduce((s, w) => s + w * contentW, 0);
    const drawHeader = () => {
      ensure(24);
      const y = doc.y;
      doc.rect(left, y, contentW, 18).fill(PANEL);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(MUTED);
      headers.forEach((h, i) => doc.text(sanitize(h).toUpperCase(), colX(i) + 4, y + 5, { width: widths[i] * contentW - 8, align: align[i] ?? 'left' }));
      doc.y = y + 18;
      doc.fillColor(TEXT);
    };
    drawHeader();
    doc.font('Helvetica').fontSize(9);
    for (const r of rows) {
      const cellH = Math.max(...r.map((c, i) => doc.heightOfString(sanitize(c), { width: widths[i] * contentW - 8 }))) + 8;
      if (doc.y + cellH > bottomLimit()) { doc.addPage(); drawHeader(); doc.font('Helvetica').fontSize(9); }
      const y = doc.y;
      r.forEach((c, i) => doc.fillColor(TEXT).text(sanitize(c), colX(i) + 4, y + 4, { width: widths[i] * contentW - 8, align: align[i] ?? 'left' }));
      doc.moveTo(left, y + cellH).lineTo(right, y + cellH).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.y = y + cellH;
    }
    doc.moveDown(0.5);
  };

  // Grafico a barre impilate (volume per fonte nel tempo)
  const stackedBars = (rows: { day: string; source: string; n: number }[]) => {
    const days = [...new Set(rows.map((r) => r.day))].sort();
    const sources = [...new Set(rows.map((r) => r.source))];
    const totals = days.map((d) => rows.filter((r) => r.day === d).reduce((s, r) => s + r.n, 0));
    const max = Math.max(1, ...totals);
    const chartH = 150;
    ensure(chartH + 40);
    const top = doc.y;
    const baseY = top + chartH;
    const slot = contentW / days.length;
    const barW = Math.min(26, slot * 0.6);
    days.forEach((d, di) => {
      const cx = left + slot * di + slot / 2;
      let y = baseY;
      for (const src of sources) {
        const n = rows.find((r) => r.day === d && r.source === src)?.n ?? 0;
        if (!n) continue;
        const h = (n / max) * chartH;
        y -= h;
        doc.rect(cx - barW / 2, y, barW, h).fill((SOURCE_META[src]?.color ?? '#94a3b8'));
      }
      if (di % Math.ceil(days.length / 8) === 0) {
        doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
          .text(d.slice(5), cx - slot / 2, baseY + 4, { width: slot, align: 'center' });
      }
    });
    doc.moveTo(left, baseY).lineTo(right, baseY).lineWidth(0.5).strokeColor(BORDER).stroke();
    doc.y = baseY + 16;
    // Legenda
    let lx = left;
    doc.fontSize(7.5);
    for (const src of sources) {
      const label = sourceLabel(src);
      const w = doc.widthOfString(label) + 16;
      if (lx + w > right) { lx = left; doc.moveDown(0.8); }
      doc.roundedRect(lx, doc.y + 1, 7, 7, 1.5).fill(SOURCE_META[src]?.color ?? '#94a3b8');
      doc.fillColor(MUTED).text(label, lx + 10, doc.y, { continued: false });
      lx += w + 4;
      doc.y -= doc.currentLineHeight();
    }
    doc.moveDown(1.4);
    doc.fillColor(TEXT);
  };

  // ---- Copertina ----
  doc.moveDown(6);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text('RADAR', { align: 'center', characterSpacing: 3 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('BY SCOGNAMIGLIO 2026', { align: 'center', characterSpacing: 2 });
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(30).fillColor(TEXT).text(sanitize(project.name), { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(13).fillColor(MUTED).text('Media intelligence report', { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(new Date().toLocaleDateString('en-US', { dateStyle: 'full' }), { align: 'center' });
  doc.fontSize(9).text(`Data from the last ${days} days · Query: ${sanitize(project.keywords.join(', '))}`, { align: 'center' });
  doc.addPage();

  const kpi = data.dashboard.kpi;
  const sentimentLabel = kpi.avgSentiment === null ? 'analyzing'
    : kpi.avgSentiment > 0.15 ? 'positive' : kpi.avgSentiment < -0.15 ? 'negative' : 'neutral';

  // ---- KPI ----
  if (has('kpi')) {
    heading('Summary');
    const cards: [string, string][] = [
      ['Mentions (7 days)', kpi.total7.toLocaleString('en-US')],
      ['Avg sentiment', sentimentLabel],
      ['Active sources', String(kpi.sources)],
      ['Topics detected', String(data.dashboard.topTopics.length)],
    ];
    ensure(70);
    const cw = (contentW - 24) / 4;
    const y0 = doc.y;
    cards.forEach(([label, value], i) => {
      const x = left + i * (cw + 8);
      doc.roundedRect(x, y0, cw, 60, 6).fillAndStroke(PANEL, BORDER);
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x + 8, y0 + 10, { width: cw - 16 });
      doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT).text(value, x + 8, y0 + 26, { width: cw - 16 });
    });
    doc.y = y0 + 72;
  }

  // ---- Health Index (market + brand + confronto) ----
  if (has('health') && data.health.theme.total > 0) {
    heading(`Market Health Index — ${data.health.theme.score}/100 (${data.health.theme.grade})`);
    hbars(data.health.theme.components.map((c) => ({ label: c.label, value: c.value })));
    if (data.health.brand) {
      const b = data.health.brand;
      para(`Brand health — ${b.name}: ${b.health.score}/100 (${b.health.grade}), ${b.health.score - data.health.theme.score >= 0 ? '+' : ''}${b.health.score - data.health.theme.score} vs market`, { bold: true, size: 10, gap: 0.2 });
      hbars(b.health.components.map((c) => ({ label: c.label, value: c.value })));
    }
    if (data.health.compare.length > 1) {
      para('Health ranking — your brand vs competitors:', { bold: true, size: 10, gap: 0.2 });
      hbars(data.health.compare.map((c) => ({ label: `${c.isBrand ? '★ ' : ''}${c.name}`, value: c.score })));
    }
  }

  // ---- Trend ----
  if (has('trends') && data.trends.length) {
    heading('Emerging trends (ultime 24 ore)');
    for (const t of data.trends.slice(0, 6)) {
      para(`x${t.score.toFixed(0)}  ${t.topic}  —  ${t.n24} mentions/24h`, { bold: true, size: 10, gap: 0.1 });
      if (t.explanation) para(t.explanation, { size: 9, color: MUTED, gap: 0.4 });
    }
  }

  // ---- Volume ----
  if (has('volume') && data.dashboard.volumeByDay.length) {
    heading('Volume by source');
    stackedBars(data.dashboard.volumeByDay.map((r) => ({ ...r, n: Number(r.n) })));
  }

  // ---- Sentiment ----
  if (has('sentiment') && data.dashboard.sentimentDist.length) {
    heading('Sentiment');
    const tot = data.dashboard.sentimentDist.reduce((s, r) => s + r.n, 0) || 1;
    hbars(data.dashboard.sentimentDist.map((r) => ({
      label: r.sentiment, value: r.n, color: SENT[r.sentiment] ?? MUTED,
      sub: `${Math.round((r.n / tot) * 100)}%`,
    })));
  }

  // ---- Temi ----
  if (has('topics') && data.dashboard.topTopics.length) {
    heading('Top topics');
    hbars(data.dashboard.topTopics.slice(0, 12).map((t) => ({ label: t.topic, value: Number(t.n) })));
  }

  // ---- Semantic constellation ----
  if (has('constellation') && data.constellation.nodes.length) {
    heading('Semantic constellation — key terms');
    hbars(data.constellation.nodes.slice(0, 14).map((n) => ({ label: n.term, value: n.freq })));
    if (data.constellation.edges.length) {
      para('Strongest co-occurrences:', { bold: true, size: 10, gap: 0.2 });
      for (const e of data.constellation.edges.slice(0, 10)) {
        para(`${e.a} + ${e.b} — ${e.weight}x`, { size: 9, color: MUTED, gap: 0.15 });
      }
    }
  }

  // ---- Author pyramid ----
  if (has('pyramid') && data.pyramid.tiers.length) {
    heading(`Author influence pyramid — top tier holds ${data.pyramid.topConcentration}% of reach`);
    hbars(data.pyramid.tiers.map((t) => ({ label: `${t.label} (${t.authors})`, value: t.sharePct })));
  }

  // ---- Influencer network ----
  if (has('network') && data.network.nodes.length) {
    heading('Influencer network — top voices by community');
    table(
      ['Author', 'Community', 'Posts', 'Engagement'],
      [...data.network.nodes].sort((a, b) => b.engagement - a.engagement).slice(0, 20)
        .map((n) => [n.label, n.community, String(n.posts), n.engagement.toLocaleString('en-US')]),
      [0.36, 0.34, 0.14, 0.16], ['left', 'left', 'right', 'right'],
    );
  }

  // ---- Conversation flow ----
  if (has('flow') && data.flow.links.length) {
    const lbl = new Map(data.flow.nodes.map((n) => [n.key, n.label]));
    heading('Conversation flow — Source → Topic → Sentiment');
    table(
      ['From', 'To', 'Mentions'],
      [...data.flow.links].sort((a, b) => b.value - a.value).slice(0, 22)
        .map((l) => [String(lbl.get(l.source) ?? l.source), String(lbl.get(l.target) ?? l.target), String(l.value)]),
      [0.44, 0.44, 0.12], ['left', 'left', 'right'],
    );
  }

  // ---- Momentum quadrant ----
  if (has('momentum') && data.momentum.length) {
    heading('Momentum quadrant — volume × acceleration');
    table(
      ['Topic', 'Volume', 'Acceleration', 'Quadrant'],
      [...data.momentum].sort((a, b) => b.volume - a.volume).map((p) => [
        p.topic, String(p.volume), `${p.acceleration > 0 ? '+' : ''}${p.acceleration}%`, p.quadrant,
      ]),
      [0.4, 0.18, 0.22, 0.2], ['left', 'right', 'right', 'left'],
    );
  }

  // ---- Emotion radar ----
  if (has('emotions') && data.emotions.length) {
    heading('Emotion radar — emotional fingerprint');
    hbars(data.emotions.map((e) => ({ label: e.emotion, value: e.value })));
  }

  // ---- Geographic map ----
  if (has('geo') && data.geo.length) {
    heading('Geographic map — by area (language-inferred)');
    table(
      ['Area / language', 'Mentions', 'Share', 'Sentiment'],
      data.geo.map((g) => [
        g.country, String(g.volume), `${g.share}%`,
        g.sentiment === null ? '—' : g.sentiment.toFixed(2),
      ]),
      [0.42, 0.2, 0.19, 0.19], ['left', 'right', 'right', 'right'],
    );
  }

  // ---- Share of Voice over time ----
  if (has('sov') && data.sov.entities.length) {
    const totals = data.sov.entities.map((e) => ({ e, n: data.sov.days.reduce((s, d) => s + Number(d[e] ?? 0), 0) }));
    const grand = totals.reduce((s, t) => s + t.n, 0) || 1;
    heading('Share of Voice over time (30 days)');
    hbars(totals.sort((a, b) => b.n - a.n).map((t) => ({ label: `${t.e} (${((t.n / grand) * 100).toFixed(0)}%)`, value: t.n })));
  }

  // ---- Benchmark ----
  if (has('benchmark') && data.benchmark.length) {
    heading('Benchmark — share of voice');
    const tot = data.benchmark.reduce((s, r) => s + r.total, 0) || 1;
    table(
      ['Entity', 'Mentions', 'Share of voice', 'Sentiment'],
      data.benchmark.map((r) => [
        r.entity.name, String(r.total), `${((r.total / tot) * 100).toFixed(1)}%`,
        r.avgSentiment === null ? '—' : r.avgSentiment.toFixed(2),
      ]),
      [0.4, 0.2, 0.22, 0.18], ['left', 'right', 'right', 'right'],
    );
  }

  // ---- Audience ----
  if (has('audience') && data.audience.communities.length) {
    heading('Audience — dove si discute');
    hbars(data.audience.communities.slice(0, 10).map((c) => ({
      label: `${c.community ?? '—'} (${sourceLabel(c.source)})`, value: c.n,
    })), '#7c3aed');
    if (data.audience.languages.length) {
      doc.moveDown(0.3);
      para('Lingue: ' + data.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join('  ·  '), { size: 9, color: MUTED });
    }
  }

  // ---- Contenuti top ----
  if (has('content') && data.ratings.length) {
    heading('Top content by engagement');
    table(
      ['Contenuto', 'Source', 'Engagement', 'AI', 'Risk'],
      data.ratings.slice(0, 15).map((r) => [
        (r.title || r.content).slice(0, 110), sourceLabel(r.source),
        String(Math.round(r.engagementScore)), r.quality ? String(r.quality.score) : '—', r.quality?.risk ?? '—',
      ]),
      [0.46, 0.16, 0.16, 0.1, 0.12], ['left', 'left', 'right', 'right', 'left'],
    );
  }

  // ---- Narrazioni ----
  if (has('narratives') && data.narratives.length) {
    heading('Narratives');
    for (const n of data.narratives) {
      para(`${n.title}  [${n.stance ?? 'neutral'}${n.coordinated ? ', coordinated' : ''}]  · ${n.mentionCount} posts`, { bold: true, size: 10, gap: 0.1 });
      if (n.description) para(n.description, { size: 9, color: MUTED, gap: 0.4 });
    }
  }

  // ---- Timeline ----
  if (has('timeline') && data.timeline.length) {
    heading('Sector timeline');
    for (const e of data.timeline.slice(0, 25)) {
      para(`${new Date(e.eventDate).toLocaleDateString('en-US')} — ${e.title}${e.importance === 3 ? '  (svolta)' : ''}`, { bold: true, size: 9.5, gap: 0.1 });
      if (e.description) para(e.description, { size: 9, color: MUTED, gap: 0.4 });
    }
  }

  // ---- Alert ----
  if (has('crisis') && data.crisis.peak) {
    const pk = data.crisis.peak;
    heading(`Crisis radar — risk ${data.crisis.risk}/100 (${data.crisis.level})`);
    para(`Risk drivers: ${data.crisis.drivers.map((d) => `${d.label} +${d.value}`).join('  ·  ')}`, { size: 9, color: MUTED, gap: 0.3 });
    para(`Peak day: ${pk.day} — ${pk.volume} mentions, ${pk.negShare}% negative, avg sentiment ${pk.sentiment}`, { bold: true, size: 10, gap: 0.2 });
    if (pk.topics.length) para(`Topics: ${pk.topics.map((t) => `${t.topic} (${t.n})`).join(', ')}`, { size: 9, color: MUTED, gap: 0.3 });
    for (const c of pk.content) para(`• [${sourceLabel(c.source)}] ${c.title}`, { size: 9, gap: 0.15 });
  }

  if (has('alerts') && data.alerts.length) {
    heading('Alert recenti');
    for (const a of data.alerts.slice(0, 12)) {
      para(`[${new Date(a.createdAt).toLocaleDateString('en-US')}] ${a.message}`, { size: 9.5, bold: true, gap: 0.1 });
      const ex = (a.data as { explanation?: string } | null)?.explanation;
      if (ex) para(ex, { size: 9, color: MUTED, gap: 0.4 });
    }
  }

  // ---- Brief ----
  if (has('brief') && data.briefs[0]) {
    heading(`Daily brief — ${new Date(data.briefs[0].briefDate).toLocaleDateString('en-US')}`);
    for (const b of briefToBlocks(data.briefs[0].content)) {
      if (b.type === 'h2') para(b.text, { bold: true, size: 11, color: ACCENT, gap: 0.2 });
      else if (b.type === 'bullet') para(`•  ${b.text}`, { size: 9.5, gap: 0.2 });
      else para(b.text, { size: 9.5, gap: 0.3 });
    }
  }

  // ---- Mentions list ----
  if (has('mentions') && data.allMentions.length) {
    heading(`Mentions list (${Math.min(data.allMentions.length, 150)} most recent)`);
    table(
      ['Date', 'Source', 'Title / text', 'Sent.'],
      data.allMentions.slice(0, 150).map((m) => {
        const txt = sanitize(m.title ?? m.content);
        return [
          new Date(m.publishedAt).toLocaleDateString('en-US'), sourceLabel(m.source),
          txt || '[contenuto in lingua non latina — vedi originale]', m.sentiment ?? '—',
        ];
      }),
      [0.13, 0.15, 0.58, 0.14], ['left', 'left', 'left', 'left'],
    );
  }

  // ---- Piè di pagina con numeri di pagina ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Azzerare il margine inferiore evita che il testo nel margine faccia
    // credere a pdfkit di dover impaginare, generando pagine vuote.
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 40;
    doc.font('Helvetica').fontSize(8).fillColor(MUTED);
    doc.text(`Radar · By Scognamiglio 2026 — ${sanitize(project.name)}`, left, fy, { width: contentW * 0.7, lineBreak: false });
    doc.text(`pag. ${i + 1} / ${range.count}`, right - 120, fy, { width: 120, align: 'right', lineBreak: false });
  }

  doc.end();
  const buffer = await done;

  const parts = [...sections].join('') === '' ? 'completo' : (sections.size >= 13 ? 'completo' : 'selezione');
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="radar-${slugify(project.name)}-${parts}-${todayStamp()}.pdf"`,
    },
  });
}
