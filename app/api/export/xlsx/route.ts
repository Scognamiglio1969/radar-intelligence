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
  if (!project) return NextResponse.json({ error: 'nessun progetto' }, { status: 404 });
  const { sections, days } = parseExportOptions(new URL(req.url));
  const has = (s: string) => sections.has(s as never);
  const data = await collectExportData(project, days);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Radar By Scognamiglio 2026';
  wb.created = new Date();

  // 1. Mention
  if (has('mentions')) {
  const wsM = sheet(wb, 'Mention', [
    { header: 'Data', key: 'data', width: 17 },
    { header: 'Fonte', key: 'fonte', width: 13 },
    { header: 'Titolo', key: 'titolo', width: 45 },
    { header: 'Testo', key: 'testo', width: 60 },
    { header: 'Autore', key: 'autore', width: 20 },
    { header: 'Community', key: 'community', width: 20 },
    { header: 'Lingua', key: 'lingua', width: 8 },
    { header: 'Sentiment', key: 'sentiment', width: 11 },
    { header: 'Score', key: 'score', width: 8 },
    { header: 'Like', key: 'like', width: 8 },
    { header: 'Commenti', key: 'commenti', width: 10 },
    { header: 'Condivisioni', key: 'condivisioni', width: 12 },
    { header: 'Engagement', key: 'engagement', width: 12 },
    { header: 'Temi', key: 'temi', width: 30 },
    { header: 'URL', key: 'url', width: 45 },
  ]);
  for (const m of data.allMentions) {
    wsM.addRow({
      data: m.publishedAt, fonte: sourceLabel(m.source), titolo: m.title ?? '',
      testo: m.content.slice(0, 500), autore: m.authorHandle ?? m.author ?? '',
      community: m.community ?? '', lingua: m.language ?? '',
      sentiment: m.sentiment ?? 'in attesa', score: m.sentimentScore,
      like: m.engagement?.likes, commenti: m.engagement?.comments,
      condivisioni: m.engagement?.shares, engagement: Math.round(m.engagementScore),
      temi: (m.topics ?? []).join(', '), url: m.url ?? '',
    });
  }
  }

  // 2. Volume giornaliero per fonte
  if (has('volume')) {
  const wsV = sheet(wb, 'Volume giornaliero', [
    { header: 'Giorno', key: 'g', width: 12 },
    { header: 'Fonte', key: 'f', width: 15 },
    { header: 'Mention', key: 'n', width: 10 },
  ]);
  for (const r of data.dashboard.volumeByDay) {
    wsV.addRow({ g: r.day, f: sourceLabel(r.source), n: Number(r.n) });
  }
  }

  // 3. Sentiment
  if (has('sentiment')) {
  const wsS = sheet(wb, 'Sentiment', [
    { header: 'Sentiment', key: 's', width: 14 },
    { header: 'Mention (7 giorni)', key: 'n', width: 18 },
  ]);
  for (const r of data.dashboard.sentimentDist) wsS.addRow({ s: r.sentiment, n: r.n });
  }

  // 4. Temi
  if (has('topics')) {
  const wsT = sheet(wb, 'Temi', [
    { header: 'Tema', key: 't', width: 30 },
    { header: 'Mention', key: 'n', width: 10 },
  ]);
  for (const r of data.dashboard.topTopics) wsT.addRow({ t: r.topic, n: Number(r.n) });
  }

  // 5. Benchmark
  if (has('benchmark')) {
  const total = data.benchmark.reduce((s, r) => s + r.total, 0);
  const wsB = sheet(wb, 'Benchmark', [
    { header: 'Entità', key: 'e', width: 20 },
    { header: 'Keyword', key: 'k', width: 35 },
    { header: 'Mention (14 giorni)', key: 'n', width: 18 },
    { header: 'Share of voice %', key: 'sov', width: 16 },
    { header: 'Sentiment medio', key: 's', width: 16 },
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
    { header: 'Fonte', key: 'f', width: 15 },
    { header: 'Mention', key: 'n', width: 10 },
    { header: 'Sentiment medio', key: 's', width: 16 },
  ]);
  for (const r of data.audience.communities) {
    wsC.addRow({
      c: r.community, f: sourceLabel(r.source), n: r.n,
      s: r.avgSentiment === null ? null : Number(r.avgSentiment.toFixed(2)),
    });
  }
  const wsA = sheet(wb, 'Autori', [
    { header: 'Autore', key: 'a', width: 25 },
    { header: 'Handle', key: 'h', width: 22 },
    { header: 'Fonte', key: 'f', width: 15 },
    { header: 'Post', key: 'n', width: 8 },
    { header: 'Engagement totale', key: 'e', width: 18 },
  ]);
  for (const r of data.audience.authors) {
    wsA.addRow({ a: r.author, h: r.authorHandle ?? '', f: sourceLabel(r.source), n: r.n, e: Math.round(r.engagement) });
  }
  }

  // 6b. Trend / Narrazioni / Timeline
  if (has('trends') && data.trends.length) {
    const ws = sheet(wb, 'Trend', [
      { header: 'Tema', key: 't', width: 26 }, { header: 'Score (×norma)', key: 's', width: 14 },
      { header: 'Mention 24h', key: 'n', width: 12 }, { header: 'Spiegazione', key: 'e', width: 70 },
    ]);
    for (const t of data.trends) ws.addRow({ t: t.topic, s: Number(t.score.toFixed(1)), n: t.n24, e: t.explanation ?? '' });
  }
  if (has('narratives') && data.narratives.length) {
    const ws = sheet(wb, 'Narrazioni', [
      { header: 'Titolo', key: 't', width: 40 }, { header: 'Stance', key: 's', width: 14 },
      { header: 'Coordinata', key: 'c', width: 12 }, { header: 'Post', key: 'n', width: 8 },
      { header: 'Descrizione', key: 'd', width: 70 },
    ]);
    for (const n of data.narratives) ws.addRow({ t: n.title, s: n.stance ?? '', c: n.coordinated ? 'sì' : 'no', n: n.mentionCount, d: n.description ?? '' });
  }
  if (has('timeline') && data.timeline.length) {
    const ws = sheet(wb, 'Timeline', [
      { header: 'Data', key: 'd', width: 12 }, { header: 'Evento', key: 't', width: 45 },
      { header: 'Importanza', key: 'i', width: 12 }, { header: 'Descrizione', key: 'de', width: 70 },
    ]);
    for (const e of data.timeline) ws.addRow({ d: e.eventDate, t: e.title, i: e.importance, de: e.description ?? '' });
  }

  // 7. Content ratings
  if (has('content')) {
  const wsR = sheet(wb, 'Content ratings', [
    { header: 'Titolo/Testo', key: 't', width: 55 },
    { header: 'Fonte', key: 'f', width: 13 },
    { header: 'Engagement', key: 'e', width: 12 },
    { header: 'Percentile', key: 'p', width: 11 },
    { header: 'AI score', key: 'q', width: 9 },
    { header: 'Rilevanza', key: 'rel', width: 10 },
    { header: 'Viralità', key: 'vir', width: 9 },
    { header: 'Rischio', key: 'risk', width: 9 },
    { header: 'Nota AI', key: 'nota', width: 45 },
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

  // 8. Alert e Brief
  if (has('alerts')) {
  const wsAl = sheet(wb, 'Alert', [
    { header: 'Data', key: 'd', width: 17 },
    { header: 'Tipo', key: 't', width: 18 },
    { header: 'Severità', key: 's', width: 10 },
    { header: 'Messaggio', key: 'm', width: 70 },
    { header: 'Spiegazione', key: 'e', width: 70 },
  ]);
  for (const a of data.alerts) wsAl.addRow({
    d: a.createdAt, t: a.type, s: a.severity, m: a.message,
    e: (a.data as { explanation?: string } | null)?.explanation ?? '',
  });
  }

  if (has('brief')) {
  const wsBr = sheet(wb, 'Brief', [
    { header: 'Data', key: 'd', width: 12 },
    { header: 'Brief', key: 'b', width: 120 },
  ]);
  for (const b of data.briefs) {
    const row = wsBr.addRow({ d: b.briefDate, b: b.content });
    row.getCell('b').alignment = { wrapText: true, vertical: 'top' };
  }
  }

  // Se nessun foglio è stato aggiunto, evita un file corrotto
  if (wb.worksheets.length === 0) sheet(wb, 'Vuoto', [{ header: 'Nessuna sezione selezionata', key: 'x', width: 40 }]);

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="radar-${slugify(project.name)}-${todayStamp()}.xlsx"`,
    },
  });
}
