import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getCurrentProject } from '@/lib/data';
import { collectExportData, parseExportOptions, slugify, sourceLabel, todayStamp } from '@/lib/export-data';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const HEADER_STYLE: Partial<ExcelJS.Style> = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16203C' } },
};

function sheet(wb: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width?: number }[]) {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ ...c, width: c.width ?? 18 }));
  ws.getRow(1).eachCell((cell) => Object.assign(cell, { style: HEADER_STYLE }));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

export async function GET(req: Request) {
  const project = await getCurrentProject();
  if (!project) return NextResponse.json({ error: 'no project' }, { status: 404 });
  const { sections, days } = parseExportOptions(new URL(req.url));
  const has = (s: string) => sections.has(s as never);
  const data = await collectExportData(project, days);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Radar By Scognamiglio 2026';
  wb.created = new Date();

  // 1. Mention
  if (has('mentions')) {
  const wsM = sheet(wb, 'Mentions', [
    { header: 'Date', key: 'data', width: 17 },
    { header: 'Source', key: 'fonte', width: 13 },
    { header: 'Title', key: 'titolo', width: 45 },
    { header: 'Text', key: 'testo', width: 60 },
    { header: 'Author', key: 'autore', width: 20 },
    { header: 'Community', key: 'community', width: 20 },
    { header: 'Language', key: 'lingua', width: 8 },
    { header: 'Sentiment', key: 'sentiment', width: 11 },
    { header: 'Score', key: 'score', width: 8 },
    { header: 'Like', key: 'like', width: 8 },
    { header: 'Comments', key: 'commenti', width: 10 },
    { header: 'Shares', key: 'condivisioni', width: 12 },
    { header: 'Engagement', key: 'engagement', width: 12 },
    { header: 'Topics', key: 'temi', width: 30 },
    { header: 'URL', key: 'url', width: 45 },
  ]);
  for (const m of data.allMentions) {
    wsM.addRow({
      data: m.publishedAt, fonte: sourceLabel(m.source), titolo: m.title ?? '',
      testo: m.content.slice(0, 500), autore: m.authorHandle ?? m.author ?? '',
      community: m.community ?? '', lingua: m.language ?? '',
      sentiment: m.sentiment ?? 'awaiting', score: m.sentimentScore,
      like: m.engagement?.likes, commenti: m.engagement?.comments,
      condivisioni: m.engagement?.shares, engagement: Math.round(m.engagementScore),
      temi: (m.topics ?? []).join(', '), url: m.url ?? '',
    });
  }
  }

  // 2. Volume giornaliero per fonte
  if (has('volume')) {
  const wsV = sheet(wb, 'Daily volume', [
    { header: 'Day', key: 'g', width: 12 },
    { header: 'Source', key: 'f', width: 15 },
    { header: 'Mentions', key: 'n', width: 10 },
  ]);
  for (const r of data.dashboard.volumeByDay) {
    wsV.addRow({ g: r.day, f: sourceLabel(r.source), n: Number(r.n) });
  }
  }

  // 3. Sentiment
  if (has('sentiment')) {
  const wsS = sheet(wb, 'Sentiment', [
    { header: 'Sentiment', key: 's', width: 14 },
    { header: 'Mentions (7 days)', key: 'n', width: 18 },
  ]);
  for (const r of data.dashboard.sentimentDist) wsS.addRow({ s: r.sentiment, n: r.n });
  }

  // 3a. Health Index (market + brand + confronto)
  if (has('health') && data.health.theme.total > 0) {
  const wsH = sheet(wb, 'Health Index', [
    { header: 'Scope', key: 'sc', width: 20 },
    { header: 'Metric', key: 'm', width: 20 },
    { header: 'Value (0-100)', key: 'v', width: 14 },
    { header: 'Weight', key: 'w', width: 10 },
  ]);
  wsH.addRow({ sc: 'Market', m: `OVERALL — ${data.health.theme.grade}`, v: data.health.theme.score, w: '100%' });
  for (const c of data.health.theme.components) wsH.addRow({ sc: 'Market', m: c.label, v: c.value, w: `${Math.round(c.weight * 100)}%` });
  if (data.health.brand) {
    wsH.addRow({ sc: `Brand: ${data.health.brand.name}`, m: `OVERALL — ${data.health.brand.health.grade}`, v: data.health.brand.health.score, w: '100%' });
    for (const c of data.health.brand.health.components) wsH.addRow({ sc: `Brand: ${data.health.brand.name}`, m: c.label, v: c.value, w: `${Math.round(c.weight * 100)}%` });
  }
  if (data.health.compare.length > 1) {
    const wsC = sheet(wb, 'Health ranking', [
      { header: 'Entity', key: 'e', width: 26 },
      { header: 'Health score', key: 's', width: 14 },
      { header: 'Mentions', key: 'n', width: 10 },
      { header: 'Your brand', key: 'b', width: 12 },
    ]);
    for (const c of data.health.compare) wsC.addRow({ e: c.name, s: c.score, n: c.total, b: c.isBrand ? 'yes' : '' });
  }
  }

  // 3b. Emotion radar
  if (has('emotions') && data.emotions.length) {
  const wsE = sheet(wb, 'Emotion radar', [
    { header: 'Emotion', key: 'e', width: 14 },
    { header: 'Mentions', key: 'n', width: 10 },
    { header: 'Share %', key: 'sh', width: 10 },
  ]);
  for (const e of data.emotions) wsE.addRow({ e: e.emotion, n: e.value, sh: e.share });
  }

  // 4. Temi
  if (has('topics')) {
  const wsT = sheet(wb, 'Topics', [
    { header: 'Topic', key: 't', width: 30 },
    { header: 'Mentions', key: 'n', width: 10 },
  ]);
  for (const r of data.dashboard.topTopics) wsT.addRow({ t: r.topic, n: Number(r.n) });
  }

  // 4·pyramid. Author influence pyramid
  if (has('pyramid') && data.pyramid.tiers.length) {
  const wsPy = sheet(wb, 'Author pyramid', [
    { header: 'Tier', key: 't', width: 16 },
    { header: 'Authors', key: 'a', width: 10 },
    { header: 'Reach', key: 'r', width: 12 },
    { header: 'Share of reach %', key: 's', width: 16 },
    { header: 'Examples', key: 'e', width: 40 },
  ]);
  for (const t of data.pyramid.tiers) {
    wsPy.addRow({ t: t.label, a: t.authors, r: Math.round(t.reach), s: t.sharePct, e: t.examples.join(', ') });
  }
  }

  // 4·network. Influencer network (top autori per community)
  if (has('network') && data.network.nodes.length) {
  const wsNet = sheet(wb, 'Influencer network', [
    { header: 'Author', key: 'a', width: 24 },
    { header: 'Community', key: 'c', width: 22 },
    { header: 'Source', key: 'f', width: 14 },
    { header: 'Posts', key: 'p', width: 8 },
    { header: 'Engagement', key: 'e', width: 12 },
  ]);
  for (const n of [...data.network.nodes].sort((a, b) => b.engagement - a.engagement)) {
    wsNet.addRow({ a: n.label, c: n.community, f: sourceLabel(n.source), p: n.posts, e: n.engagement });
  }
  }

  // 4·flow. Conversation flow (Source → Topic → Sentiment)
  if (has('flow') && data.flow.links.length) {
  const lbl = new Map(data.flow.nodes.map((n) => [n.key, n.label]));
  const wsF = sheet(wb, 'Conversation flow', [
    { header: 'From', key: 'a', width: 24 },
    { header: 'To', key: 'b', width: 24 },
    { header: 'Mentions', key: 'n', width: 10 },
  ]);
  for (const l of [...data.flow.links].sort((a, b) => b.value - a.value)) {
    wsF.addRow({ a: lbl.get(l.source) ?? l.source, b: lbl.get(l.target) ?? l.target, n: l.value });
  }
  }

  // 4·constellation. Semantic constellation (termini + co-occorrenze)
  if (has('constellation') && data.constellation.nodes.length) {
  const wsN = sheet(wb, 'Key terms', [
    { header: 'Term', key: 't', width: 26 },
    { header: 'Frequency', key: 'f', width: 12 },
    { header: 'Avg sentiment', key: 's', width: 16 },
  ]);
  for (const n of data.constellation.nodes) wsN.addRow({ t: n.term, f: n.freq, s: n.sentiment });
  if (data.constellation.edges.length) {
    const wsE = sheet(wb, 'Term co-occurrence', [
      { header: 'Term A', key: 'a', width: 24 },
      { header: 'Term B', key: 'b', width: 24 },
      { header: 'Together (n)', key: 'w', width: 12 },
    ]);
    for (const e of data.constellation.edges) wsE.addRow({ a: e.a, b: e.b, w: e.weight });
  }
  }

  // 4a. Momentum quadrant
  if (has('momentum') && data.momentum.length) {
  const wsQ = sheet(wb, 'Momentum quadrant', [
    { header: 'Topic', key: 't', width: 26 },
    { header: 'Volume', key: 'v', width: 10 },
    { header: 'Acceleration %', key: 'a', width: 15 },
    { header: 'Quadrant', key: 'q', width: 16 },
    { header: 'Avg sentiment', key: 's', width: 16 },
  ]);
  for (const p of data.momentum) wsQ.addRow({ t: p.topic, v: p.volume, a: p.acceleration, q: p.quadrant, s: p.sentiment });
  }

  // 4b. Geographic map (per lingua/area)
  if (has('geo') && data.geo.length) {
  const wsG = sheet(wb, 'Geographic map', [
    { header: 'Area / language', key: 'c', width: 24 },
    { header: 'Lang', key: 'l', width: 8 },
    { header: 'Mentions', key: 'n', width: 10 },
    { header: 'Share %', key: 'sh', width: 10 },
    { header: 'Avg sentiment', key: 's', width: 16 },
  ]);
  for (const g of data.geo) {
    wsG.addRow({ c: g.country, l: g.lang, n: g.volume, sh: g.share, s: g.sentiment });
  }
  }

  // 4c. Share of Voice over time (giorno × entità)
  if (has('sov') && data.sov.entities.length) {
  const wsSov = sheet(wb, 'Share of Voice', [
    { header: 'Day', key: 'day', width: 12 },
    ...data.sov.entities.map((e) => ({ header: e, key: e, width: 16 })),
  ]);
  for (const row of data.sov.days) {
    const r: Record<string, string | number> = { day: String(row.day) };
    for (const e of data.sov.entities) r[e] = Number(row[e] ?? 0);
    wsSov.addRow(r);
  }
  }

  // 5. Benchmark
  if (has('benchmark')) {
  const total = data.benchmark.reduce((s, r) => s + r.total, 0);
  const wsB = sheet(wb, 'Benchmark', [
    { header: 'Entity', key: 'e', width: 20 },
    { header: 'Keyword', key: 'k', width: 35 },
    { header: 'Mentions (14 days)', key: 'n', width: 18 },
    { header: 'Share of voice %', key: 'sov', width: 16 },
    { header: 'Avg sentiment', key: 's', width: 16 },
  ]);
  for (const r of data.benchmark) {
    wsB.addRow({
      e: r.entity.name, k: r.entity.keywords.join(', '), n: r.total,
      sov: total ? Number(((r.total / total) * 100).toFixed(1)) : null,
      s: r.avgSentiment === null ? null : Number(r.avgSentiment.toFixed(2)),
    });
  }
  }

  // 6. Audience
  if (has('audience')) {
  const wsC = sheet(wb, 'Community', [
    { header: 'Community', key: 'c', width: 28 },
    { header: 'Source', key: 'f', width: 15 },
    { header: 'Mentions', key: 'n', width: 10 },
    { header: 'Avg sentiment', key: 's', width: 16 },
  ]);
  for (const r of data.audience.communities) {
    wsC.addRow({
      c: r.community, f: sourceLabel(r.source), n: r.n,
      s: r.avgSentiment === null ? null : Number(r.avgSentiment.toFixed(2)),
    });
  }
  const wsA = sheet(wb, 'Authors', [
    { header: 'Author', key: 'a', width: 25 },
    { header: 'Handle', key: 'h', width: 22 },
    { header: 'Source', key: 'f', width: 15 },
    { header: 'Post', key: 'n', width: 8 },
    { header: 'Total engagement', key: 'e', width: 18 },
  ]);
  for (const r of data.audience.authors) {
    wsA.addRow({ a: r.author, h: r.authorHandle ?? '', f: sourceLabel(r.source), n: r.n, e: Math.round(r.engagement) });
  }
  }

  // 6b. Trend / Narrazioni / Timeline
  if (has('trends') && data.trends.length) {
    const ws = sheet(wb, 'Trend', [
      { header: 'Topic', key: 't', width: 26 }, { header: 'Score (×norm)', key: 's', width: 14 },
      { header: 'Mentions 24h', key: 'n', width: 12 }, { header: 'Explanation', key: 'e', width: 70 },
    ]);
    for (const t of data.trends) ws.addRow({ t: t.topic, s: Number(t.score.toFixed(1)), n: t.n24, e: t.explanation ?? '' });
  }
  if (has('narratives') && data.narratives.length) {
    const ws = sheet(wb, 'Narratives', [
      { header: 'Title', key: 't', width: 40 }, { header: 'Stance', key: 's', width: 14 },
      { header: 'Coordinated', key: 'c', width: 12 }, { header: 'Post', key: 'n', width: 8 },
      { header: 'Description', key: 'd', width: 70 },
    ]);
    for (const n of data.narratives) ws.addRow({ t: n.title, s: n.stance ?? '', c: n.coordinated ? 'yes' : 'no', n: n.mentionCount, d: n.description ?? '' });
  }
  if (has('timeline') && data.timeline.length) {
    const ws = sheet(wb, 'Timeline', [
      { header: 'Date', key: 'd', width: 12 }, { header: 'Event', key: 't', width: 45 },
      { header: 'Importance', key: 'i', width: 12 }, { header: 'Description', key: 'de', width: 70 },
    ]);
    for (const e of data.timeline) ws.addRow({ d: e.eventDate, t: e.title, i: e.importance, de: e.description ?? '' });
  }

  // 7. Content ratings
  if (has('content')) {
  const wsR = sheet(wb, 'Content ratings', [
    { header: 'Title/Text', key: 't', width: 55 },
    { header: 'Source', key: 'f', width: 13 },
    { header: 'Engagement', key: 'e', width: 12 },
    { header: 'Percentile', key: 'p', width: 11 },
    { header: 'AI score', key: 'q', width: 9 },
    { header: 'Relevance', key: 'rel', width: 10 },
    { header: 'Virality', key: 'vir', width: 9 },
    { header: 'Risk', key: 'risk', width: 9 },
    { header: 'AI note', key: 'nota', width: 45 },
    { header: 'URL', key: 'u', width: 45 },
  ]);
  for (const r of data.ratings) {
    wsR.addRow({
      t: r.title || r.content.slice(0, 120), f: sourceLabel(r.source),
      e: Math.round(r.engagementScore), p: r.percentile,
      q: r.quality?.score, rel: r.quality?.relevance, vir: r.quality?.virality,
      risk: r.quality?.risk, nota: r.quality?.note ?? '', u: r.url ?? '',
    });
  }
  }

  // 7b. Crisis radar & peak
  if (has('crisis') && data.crisis.peak) {
  const wsCr = sheet(wb, 'Crisis radar', [
    { header: 'Metric', key: 'm', width: 26 },
    { header: 'Value', key: 'v', width: 40 },
  ]);
  wsCr.addRow({ m: 'Risk index (0-100)', v: `${data.crisis.risk} — ${data.crisis.level}` });
  for (const d of data.crisis.drivers) wsCr.addRow({ m: d.label, v: `+${d.value}` });
  wsCr.addRow({ m: 'Peak day', v: data.crisis.peak.day });
  wsCr.addRow({ m: 'Peak volume', v: data.crisis.peak.volume });
  wsCr.addRow({ m: 'Peak negative %', v: `${data.crisis.peak.negShare}%` });
  wsCr.addRow({ m: 'Peak topics', v: data.crisis.peak.topics.map((t) => `${t.topic} (${t.n})`).join(', ') });
  for (const c of data.crisis.peak.content) wsCr.addRow({ m: `Content [${sourceLabel(c.source)}]`, v: c.title });
  }

  // 8. Alert e Brief
  if (has('alerts')) {
  const wsAl = sheet(wb, 'Alert', [
    { header: 'Date', key: 'd', width: 17 },
    { header: 'Type', key: 't', width: 18 },
    { header: 'Severity', key: 's', width: 10 },
    { header: 'Message', key: 'm', width: 70 },
    { header: 'Explanation', key: 'e', width: 70 },
  ]);
  for (const a of data.alerts) wsAl.addRow({
    d: a.createdAt, t: a.type, s: a.severity, m: a.message,
    e: (a.data as { explanation?: string } | null)?.explanation ?? '',
  });
  }

  if (has('brief')) {
  const wsBr = sheet(wb, 'Brief', [
    { header: 'Date', key: 'd', width: 12 },
    { header: 'Brief', key: 'b', width: 120 },
  ]);
  for (const b of data.briefs) {
    const row = wsBr.addRow({ d: b.briefDate, b: b.content });
    row.getCell('b').alignment = { wrapText: true, vertical: 'top' };
  }
  }

  // Se nessun foglio è stato aggiunto, evita un file corrotto
  if (wb.worksheets.length === 0) sheet(wb, 'Empty', [{ header: 'No section selected', key: 'x', width: 40 }]);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="radar-${slugify(project.name)}-${todayStamp()}.xlsx"`,
    },
  });
}
