import PDFDocument from 'pdfkit';
import { SOURCE_META } from '@/lib/connectors';
import { AI_DISCLOSURE_LONG, AI_DISCLOSURE_META, AI_DISCLOSURE_SHORT } from '@/lib/ai-disclosure';
import { briefToBlocks, sourceLabel, type ExportData, type Project } from '@/lib/export-data';
import type { SectionId } from '@/lib/export-sections';

// ---------------------------------------------------------------------------
// Motore PDF condiviso.
//
// Le sezioni sono funzioni indipendenti in una mappa, non un blocco di if
// dentro la route: così lo STESSO renderer serve sia il report completo (tutte
// le sezioni nell'ordine canonico) sia il report personalizzato (le sezioni
// scelte dall'utente, nel suo ordine, alternate ai suoi commenti). Senza questa
// separazione i due report divergerebbero al primo ritocco grafico.
//
// L'ordine di inserzione delle chiavi in SECTION_RENDERERS È l'ordine del
// report completo: JavaScript conserva l'ordine delle chiavi stringa.
// ---------------------------------------------------------------------------

const ACCENT = '#0284c7';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const PANEL = '#f1f5f9';
const SENT: Record<string, string> = { positive: '#16a34a', neutral: '#64748b', negative: '#dc2626' };

// pdfkit con font standard (Helvetica) codifica in WinAnsi: rimuovo i caratteri
// fuori da Latin-1 (emoji, CJK, arabo) per evitare crash di rendering.
export function sanitize(s: string | null | undefined): string {
  return (s ?? '')
    // La punteggiatura tipografica sta fuori da Latin-1: senza questa
    // traslitterazione verrebbe cancellata e "dell'intelligenza" diventerebbe
    // "dellintelligenza". Va fatta PRIMA del filtro, non dopo.
    .replace(/[‘’‛]/g, "'").replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '').replace(/\s+/g, ' ').trim();
}

type Doc = InstanceType<typeof PDFDocument>;

/** Le primitive di disegno, legate a un documento e alla sua area utile. */
export type Ctx = {
  doc: Doc;
  left: number; right: number; contentW: number;
  ensure: (h: number) => void;
  heading: (text: string) => void;
  para: (text: string, opts?: { size?: number; color?: string; bold?: boolean; gap?: number }) => void;
  hbars: (items: { label: string; value: number; color?: string; sub?: string }[], color?: string) => void;
  table: (headers: string[], rows: string[][], widths: number[], align?: ('left' | 'right' | 'center')[]) => void;
  stackedBars: (rows: { day: string; source: string; n: number }[]) => void;
};

function makeCtx(doc: Doc): Ctx {
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

  const para: Ctx['para'] = (text, opts = {}) => {
    ensure(20);
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.size ?? 10)
      .fillColor(opts.color ?? TEXT).text(sanitize(text), left, doc.y, { width: contentW });
    doc.moveDown(opts.gap ?? 0.3);
  };

  // Barre orizzontali con etichetta e valore
  const hbars: Ctx['hbars'] = (items, color = ACCENT) => {
    const max = Math.max(1, ...items.map((i) => i.value));
    for (const it of items) {
      ensure(20);
      const y = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(TEXT).text(sanitize(it.label), left, y, { width: contentW * 0.42, ellipsis: true });
      doc.fillColor(MUTED).text(`${it.value.toLocaleString('en-US')}${it.sub ? ` · ${it.sub}` : ''}`, right - 120, y, { width: 120, align: 'right' });
      const barY = y + 12;
      const trackX = left + contentW * 0.44;
      const trackW = contentW - contentW * 0.44 - 130;
      doc.roundedRect(trackX, barY, trackW, 5, 2.5).fill(PANEL);
      doc.roundedRect(trackX, barY, Math.max(2, (it.value / max) * trackW), 5, 2.5).fill(it.color ?? color);
      doc.fillColor(TEXT);
      doc.y = barY + 12;
    }
  };

  // Tabella con intestazione
  const table: Ctx['table'] = (headers, rows, widths, align = []) => {
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
  const stackedBars: Ctx['stackedBars'] = (rows) => {
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

  return { doc, left, right, contentW, ensure, heading, para, hbars, table, stackedBars };
}

// --- Le sezioni ------------------------------------------------------------
// Ognuna sa dire se ha dati da mostrare: il report personalizzato deve poter
// avvisare l'utente che un grafico scelto uscirà vuoto, prima di generarlo.

type Section = {
  has: (d: ExportData) => boolean;
  render: (c: Ctx, d: ExportData, meta: { days: number }) => void;
};

export const SECTION_RENDERERS: Record<SectionId, Section> = {
  kpi: {
    has: () => true,
    render: (c, d) => {
      const kpi = d.dashboard.kpi;
      const sentimentLabel = kpi.avgSentiment === null ? 'analyzing'
        : kpi.avgSentiment > 0.15 ? 'positive' : kpi.avgSentiment < -0.15 ? 'negative' : 'neutral';
      c.heading('Summary');
      const cards: [string, string][] = [
        ['Mentions (7 days)', kpi.total7.toLocaleString('en-US')],
        ['Avg sentiment', sentimentLabel],
        ['Active sources', String(kpi.sources)],
        ['Topics detected', String(d.dashboard.topTopics.length)],
      ];
      c.ensure(70);
      const cw = (c.contentW - 24) / 4;
      const y0 = c.doc.y;
      cards.forEach(([label, value], i) => {
        const x = c.left + i * (cw + 8);
        c.doc.roundedRect(x, y0, cw, 60, 6).fillAndStroke(PANEL, BORDER);
        c.doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x + 8, y0 + 10, { width: cw - 16 });
        c.doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT).text(value, x + 8, y0 + 26, { width: cw - 16 });
      });
      c.doc.y = y0 + 72;
    },
  },

  health: {
    has: (d) => d.health.theme.total > 0,
    render: (c, d) => {
      c.heading(`Market Health Index — ${d.health.theme.score}/100 (${d.health.theme.grade})`);
      c.hbars(d.health.theme.components.map((x) => ({ label: x.label, value: x.value })));
      if (d.health.brand) {
        const b = d.health.brand;
        c.para(`Brand health — ${b.name}: ${b.health.score}/100 (${b.health.grade}), ${b.health.score - d.health.theme.score >= 0 ? '+' : ''}${b.health.score - d.health.theme.score} vs market`, { bold: true, size: 10, gap: 0.2 });
        c.hbars(b.health.components.map((x) => ({ label: x.label, value: x.value })));
      }
      if (d.health.compare.length > 1) {
        c.para('Health ranking — your brand vs competitors:', { bold: true, size: 10, gap: 0.2 });
        c.hbars(d.health.compare.map((x) => ({ label: `${x.isBrand ? '★ ' : ''}${x.name}`, value: x.score })));
      }
    },
  },

  trends: {
    has: (d) => d.trends.length > 0,
    render: (c, d) => {
      c.heading('Emerging trends (last 24 hours)');
      for (const t of d.trends.slice(0, 6)) {
        c.para(`x${t.score.toFixed(0)}  ${t.topic}  —  ${t.n24} mentions/24h`, { bold: true, size: 10, gap: 0.1 });
        if (t.explanation) c.para(t.explanation, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  volume: {
    has: (d) => d.dashboard.volumeByDay.length > 0,
    render: (c, d) => {
      c.heading('Volume by source');
      c.stackedBars(d.dashboard.volumeByDay.map((r) => ({ ...r, n: Number(r.n) })));
    },
  },

  sentiment: {
    has: (d) => d.dashboard.sentimentDist.length > 0,
    render: (c, d) => {
      c.heading('Sentiment');
      const tot = d.dashboard.sentimentDist.reduce((s, r) => s + r.n, 0) || 1;
      c.hbars(d.dashboard.sentimentDist.map((r) => ({
        label: r.sentiment, value: r.n, color: SENT[r.sentiment] ?? MUTED,
        sub: `${Math.round((r.n / tot) * 100)}%`,
      })));
    },
  },

  topics: {
    has: (d) => d.dashboard.topTopics.length > 0,
    render: (c, d) => {
      c.heading('Top topics');
      c.hbars(d.dashboard.topTopics.slice(0, 12).map((t) => ({ label: t.topic, value: Number(t.n) })));
    },
  },

  constellation: {
    has: (d) => d.constellation.nodes.length > 0,
    render: (c, d) => {
      c.heading('Semantic constellation — key terms');
      c.hbars(d.constellation.nodes.slice(0, 14).map((n) => ({ label: n.term, value: n.freq })));
      if (d.constellation.edges.length) {
        c.para('Strongest co-occurrences:', { bold: true, size: 10, gap: 0.2 });
        for (const e of d.constellation.edges.slice(0, 10)) {
          c.para(`${e.a} + ${e.b} — ${e.weight}x`, { size: 9, color: MUTED, gap: 0.15 });
        }
      }
    },
  },

  pyramid: {
    has: (d) => d.pyramid.tiers.length > 0,
    render: (c, d) => {
      c.heading(`Author influence pyramid — top tier holds ${d.pyramid.topConcentration}% of reach`);
      c.hbars(d.pyramid.tiers.map((t) => ({ label: `${t.label} (${t.authors})`, value: t.sharePct })));
    },
  },

  network: {
    has: (d) => d.network.nodes.length > 0,
    render: (c, d) => {
      c.heading('Influencer network — top voices by community');
      c.table(
        ['Author', 'Focus topic', 'Posts', 'Engagement'],
        [...d.network.nodes].sort((a, b) => b.engagement - a.engagement).slice(0, 20)
          .map((n) => [n.label, n.community, String(n.posts), n.engagement.toLocaleString('en-US')]),
        [0.36, 0.34, 0.14, 0.16], ['left', 'left', 'right', 'right'],
      );
    },
  },

  flow: {
    has: (d) => d.flow.links.length > 0,
    render: (c, d) => {
      const lbl = new Map(d.flow.nodes.map((n) => [n.key, n.label]));
      c.heading('Conversation flow — Source → Topic → Sentiment');
      c.table(
        ['From', 'To', 'Mentions'],
        [...d.flow.links].sort((a, b) => b.value - a.value).slice(0, 22)
          .map((l) => [String(lbl.get(l.source) ?? l.source), String(lbl.get(l.target) ?? l.target), String(l.value)]),
        [0.44, 0.44, 0.12], ['left', 'left', 'right'],
      );
    },
  },

  momentum: {
    has: (d) => d.momentum.length > 0,
    render: (c, d) => {
      c.heading('Momentum quadrant — volume × acceleration');
      c.table(
        ['Topic', 'Volume', 'Acceleration', 'Quadrant'],
        [...d.momentum].sort((a, b) => b.volume - a.volume).map((p) => [
          p.topic, String(p.volume), `${p.acceleration > 0 ? '+' : ''}${p.acceleration}%`, p.quadrant,
        ]),
        [0.4, 0.18, 0.22, 0.2], ['left', 'right', 'right', 'left'],
      );
    },
  },

  emotions: {
    has: (d) => d.emotions.length > 0,
    render: (c, d) => {
      c.heading('Emotion radar — emotional fingerprint');
      c.hbars(d.emotions.map((e) => ({ label: e.emotion, value: e.value })));
    },
  },

  geo: {
    has: (d) => d.geo.length > 0,
    render: (c, d) => {
      c.heading('Geographic map — by area (language-inferred)');
      c.table(
        ['Area / language', 'Mentions', 'Share', 'Sentiment'],
        d.geo.map((g) => [
          g.country, String(g.volume), `${g.share}%`,
          g.sentiment === null ? '—' : g.sentiment.toFixed(2),
        ]),
        [0.42, 0.2, 0.19, 0.19], ['left', 'right', 'right', 'right'],
      );
    },
  },

  sov: {
    has: (d) => d.sov.entities.length > 0,
    render: (c, d) => {
      const totals = d.sov.entities.map((e) => ({ e, n: d.sov.days.reduce((s, x) => s + Number(x[e] ?? 0), 0) }));
      const grand = totals.reduce((s, t) => s + t.n, 0) || 1;
      c.heading('Share of Voice over time (30 days)');
      c.hbars(totals.sort((a, b) => b.n - a.n).map((t) => ({ label: `${t.e} (${((t.n / grand) * 100).toFixed(0)}%)`, value: t.n })));
    },
  },

  benchmark: {
    has: (d) => d.benchmark.length > 0,
    render: (c, d) => {
      c.heading('Benchmark — share of voice');
      const tot = d.benchmark.reduce((s, r) => s + r.total, 0) || 1;
      c.table(
        ['Entity', 'Mentions', 'Share of voice', 'Sentiment'],
        d.benchmark.map((r) => [
          r.entity.name, String(r.total), `${((r.total / tot) * 100).toFixed(1)}%`,
          r.avgSentiment === null ? '—' : r.avgSentiment.toFixed(2),
        ]),
        [0.4, 0.2, 0.22, 0.18], ['left', 'right', 'right', 'right'],
      );
    },
  },

  audience: {
    has: (d) => d.audience.communities.length > 0,
    render: (c, d) => {
      c.heading('Audience — where the conversation happens');
      c.hbars(d.audience.communities.slice(0, 10).map((x) => ({
        label: `${x.community ?? '—'} (${sourceLabel(x.source)})`, value: x.n,
      })), '#7c3aed');
      if (d.audience.languages.length) {
        c.doc.moveDown(0.3);
        c.para('Lingue: ' + d.audience.languages.map((l) => `${l.language.toUpperCase()} (${l.n})`).join('  ·  '), { size: 9, color: MUTED });
      }
    },
  },

  content: {
    has: (d) => d.ratings.length > 0,
    render: (c, d) => {
      c.heading('Top content by engagement');
      c.table(
        ['Content', 'Source', 'Engagement', 'AI', 'Risk'],
        d.ratings.slice(0, 15).map((r) => [
          (r.title || r.content).slice(0, 110), sourceLabel(r.source),
          String(Math.round(r.engagementScore)), r.quality ? String(r.quality.score) : '—', r.quality?.risk ?? '—',
        ]),
        [0.46, 0.16, 0.16, 0.1, 0.12], ['left', 'left', 'right', 'right', 'left'],
      );
    },
  },

  pov: {
    has: (d) => Boolean(d.pov.pov),
    render: (c, d) => {
      const p = d.pov.pov;
      if (!p) return;
      c.heading('Point of View');
      c.para(p.headline, { bold: true, size: 12, gap: 0.4 });
      for (const par of p.intro ?? []) c.para(par.text, { size: 10, gap: 0.35 });
      if ((p.intro ?? []).length) c.doc.moveDown(0.2);
      for (const [i, b] of p.blocks.entries()) {
        c.para(`${i + 1}. ${b.title}  [${b.kind} · ${b.confidence} confidence]`, { bold: true, size: 10.5, gap: 0.2 });
        if (b.stats.length) {
          c.para(b.stats.map((s) => `${s.value} — ${s.label}`).join('   ·   '), { size: 9, color: ACCENT, gap: 0.2 });
        }
        c.para(b.body, { size: 9.5, gap: 0.45 });
      }
      if (p.counterSignals.length) {
        c.para('Counter-signals', { bold: true, size: 10.5, gap: 0.2 });
        for (const x of p.counterSignals) c.para(`•  ${x.point}`, { size: 9.5, color: MUTED, gap: 0.2 });
      }
      if (p.implications.length) {
        c.para('So what', { bold: true, size: 10.5, gap: 0.2 });
        for (const t of p.implications) c.para(`→  ${t}`, { size: 9.5, gap: 0.2 });
      }
      if (p.watch.length) {
        c.para('What to watch', { bold: true, size: 10.5, gap: 0.2 });
        for (const t of p.watch) c.para(`◦  ${t}`, { size: 9.5, gap: 0.2 });
      }
    },
  },

  narratives: {
    has: (d) => d.narratives.length > 0,
    render: (c, d) => {
      c.heading('Narratives');
      for (const n of d.narratives) {
        c.para(`${n.title}  [${n.stance ?? 'neutral'}${n.coordinated ? ', coordinated' : ''}]  · ${n.mentionCount} posts`, { bold: true, size: 10, gap: 0.1 });
        if (n.description) c.para(n.description, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  timeline: {
    has: (d) => d.timeline.length > 0,
    render: (c, d) => {
      c.heading('Sector timeline');
      for (const e of d.timeline.slice(0, 25)) {
        c.para(`${new Date(e.eventDate).toLocaleDateString('en-US')} — ${e.title}${e.importance === 3 ? '  (turning point)' : ''}`, { bold: true, size: 9.5, gap: 0.1 });
        if (e.description) c.para(e.description, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  crisis: {
    has: (d) => Boolean(d.crisis.peak),
    render: (c, d) => {
      const pk = d.crisis.peak;
      if (!pk) return;
      c.heading(`Crisis radar — risk ${d.crisis.risk}/100 (${d.crisis.level})`);
      c.para(`Risk drivers: ${d.crisis.drivers.map((x) => `${x.label} +${x.value}`).join('  ·  ')}`, { size: 9, color: MUTED, gap: 0.3 });
      c.para(`Peak day: ${pk.day} — ${pk.volume} mentions, ${pk.negShare}% negative, avg sentiment ${pk.sentiment}`, { bold: true, size: 10, gap: 0.2 });
      if (pk.topics.length) c.para(`Topics: ${pk.topics.map((t) => `${t.topic} (${t.n})`).join(', ')}`, { size: 9, color: MUTED, gap: 0.3 });
      for (const x of pk.content) c.para(`• [${sourceLabel(x.source)}] ${x.title}`, { size: 9, gap: 0.15 });
    },
  },

  alerts: {
    has: (d) => d.alerts.length > 0,
    render: (c, d) => {
      c.heading('Recent alerts');
      for (const a of d.alerts.slice(0, 12)) {
        c.para(`[${new Date(a.createdAt).toLocaleDateString('en-US')}] ${a.message}`, { size: 9.5, bold: true, gap: 0.1 });
        const ex = (a.data as { explanation?: string } | null)?.explanation;
        if (ex) c.para(ex, { size: 9, color: MUTED, gap: 0.4 });
      }
    },
  },

  brief: {
    has: (d) => Boolean(d.briefs[0]),
    render: (c, d) => {
      const b0 = d.briefs[0];
      if (!b0) return;
      c.heading(`Daily brief — ${new Date(b0.briefDate).toLocaleDateString('en-US')}`);
      for (const b of briefToBlocks(b0.content)) {
        if (b.type === 'h2') c.para(b.text, { bold: true, size: 11, color: ACCENT, gap: 0.2 });
        else if (b.type === 'bullet') c.para(`•  ${b.text}`, { size: 9.5, gap: 0.2 });
        else c.para(b.text, { size: 9.5, gap: 0.3 });
      }
    },
  },

  mentions: {
    has: (d) => d.allMentions.length > 0,
    render: (c, d) => {
      c.heading(`Mentions list (${Math.min(d.allMentions.length, 150)} most recent)`);
      c.table(
        ['Date', 'Source', 'Title / text', 'Sent.'],
        d.allMentions.slice(0, 150).map((m) => {
          const txt = sanitize(m.title ?? m.content);
          return [
            new Date(m.publishedAt).toLocaleDateString('en-US'), sourceLabel(m.source),
            txt || '[non-Latin content — see original]', m.sentiment ?? '—',
          ];
        }),
        [0.13, 0.15, 0.58, 0.14], ['left', 'left', 'left', 'left'],
      );
    },
  },
};

/**
 * Che lavoro fa un commento nella pagina. Non è decorazione: cambia dove il
 * blocco viene inserito, cosa viene chiesto al modello e come si presenta
 * nel PDF stampato.
 */
export type CommentRole = 'intro' | 'comment' | 'synthesis' | 'free';

/**
 * A schermo il ruolo si riconosce da un'icona; sulla carta le icone non
 * esistono, quindi diventa un'etichetta e un filetto colorato. Il suffisso
 * "· AI" resta separato dal ruolo: sono due informazioni diverse.
 */
export const ROLE_STYLE: Record<CommentRole, { label: string; color: string }> = {
  intro: { label: 'PRESENTAZIONE', color: '#0284c7' },
  comment: { label: 'COMMENTO', color: '#7c3aed' },
  synthesis: { label: 'SINTESI DELLA PAGINA', color: '#0d9488' },
  free: { label: 'NOTA', color: '#64748b' },
};

/** Un blocco di report personalizzato: un grafico oppure un commento. */
export type ReportBlock =
  | { type: 'chart'; section: SectionId }
  | { type: 'text'; text: string; ai?: boolean; role?: CommentRole };

export type ReportPage = { title?: string; blocks: ReportBlock[] };

type BuildOptions = {
  project: Project;
  data: ExportData;
  days: number;
  /** Report completo: sezioni da includere, nell'ordine canonico. */
  sections?: Set<string>;
  /** Report personalizzato: pagine composte dall'utente. Vince su `sections`. */
  pages?: ReportPage[];
  subtitle?: string;
};

export async function buildReportPdf(opts: BuildOptions): Promise<Buffer> {
  const { project, data, days, sections, pages, subtitle } = opts;

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    info: {
      Title: `Radar — ${sanitize(project.name)}`,
      Author: 'Radar By Scognamiglio 2026',
      // Marcatura leggibile da una macchina (AI Act art. 50, par. 2).
      Subject: sanitize(AI_DISCLOSURE_META.subject),
      Keywords: sanitize(AI_DISCLOSURE_META.keywords),
    },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const c = makeCtx(doc);

  // ---- Copertina ----
  doc.moveDown(6);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(ACCENT).text('RADAR', { align: 'center', characterSpacing: 3 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('BY SCOGNAMIGLIO 2026', { align: 'center', characterSpacing: 2 });
  doc.moveDown(2);
  doc.font('Helvetica-Bold').fontSize(30).fillColor(TEXT).text(sanitize(project.name), { align: 'center' });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(13).fillColor(MUTED).text(sanitize(subtitle ?? 'Media intelligence report'), { align: 'center' });
  doc.moveDown(0.5);
  doc.fontSize(10).text(new Date().toLocaleDateString('en-US', { dateStyle: 'full' }), { align: 'center' });
  doc.fontSize(9).text(`Data from the last ${days} days · Query: ${sanitize(project.keywords.join(', '))}`, { align: 'center' });
  doc.addPage();

  if (pages) {
    // ---- Report personalizzato: una pagina PDF per pagina composta ----
    pages.forEach((page, pi) => {
      if (pi > 0) doc.addPage();
      if (page.title?.trim()) {
        doc.font('Helvetica-Bold').fontSize(18).fillColor(TEXT).text(sanitize(page.title), c.left, doc.y, { width: c.contentW });
        doc.moveDown(0.6);
      }
      for (const block of page.blocks) {
        if (block.type === 'text') {
          if (!block.text.trim()) continue;
          // Il commento resta distinguibile dal dato: etichetta di ruolo e
          // filetto colorato a sinistra. L'etichetta dice anche quando il
          // testo è stato generato dall'AI, come chiede l'art. 50.
          const style = ROLE_STYLE[block.role ?? (block.ai ? 'comment' : 'free')];
          c.ensure(48);
          const y0 = doc.y;
          doc.font('Helvetica-Bold').fontSize(6.5).fillColor(style.color)
            .text(`${style.label}${block.ai ? ' · AI' : ''}`, c.left + 12, y0, { characterSpacing: 1 });
          doc.moveDown(0.15);
          doc.font('Helvetica').fontSize(10).fillColor(TEXT)
            .text(sanitize(block.text), c.left + 12, doc.y, { width: c.contentW - 12, align: 'justify' });
          const y1 = doc.y;
          doc.rect(c.left, y0, 3, Math.max(10, y1 - y0)).fill(style.color);
          doc.fillColor(TEXT);
          doc.y = y1;
          doc.moveDown(0.6);
        } else {
          const s = SECTION_RENDERERS[block.section];
          if (!s) continue;
          if (!s.has(data)) { c.para('Nessun dato disponibile per questa sezione nel periodo scelto.', { size: 9, color: MUTED }); continue; }
          s.render(c, data, { days });
        }
      }
    });
  } else {
    // ---- Report completo: ordine canonico ----
    for (const [id, s] of Object.entries(SECTION_RENDERERS)) {
      if (sections && !sections.has(id)) continue;
      if (!s.has(data)) continue;
      s.render(c, data, { days });
    }
  }

  // ---- Note (informativa AI Act) ----
  c.ensure(120);
  doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text('NOTE', c.left, doc.y, { characterSpacing: 1.5 });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(8).fillColor(MUTED)
    .text(sanitize(AI_DISCLOSURE_LONG), c.left, doc.y, { width: c.contentW, align: 'justify' });

  // ---- Piè di pagina con numeri di pagina ----
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    // Azzerare il margine inferiore evita che il testo nel margine faccia
    // credere a pdfkit di dover impaginare, generando pagine vuote.
    doc.page.margins.bottom = 0;
    const fy = doc.page.height - 40;
    // Informativa art. 50 ripetuta su ogni pagina: leggibile, non nascosta.
    doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
      .text(sanitize(AI_DISCLOSURE_SHORT), c.left, fy - 11, { width: c.contentW, lineBreak: false });
    doc.fontSize(8);
    doc.text(`Radar · By Scognamiglio 2026 — ${sanitize(project.name)}`, c.left, fy, { width: c.contentW * 0.7, lineBreak: false });
    doc.text(`pag. ${i + 1} / ${range.count}`, c.right - 120, fy, { width: 120, align: 'right', lineBreak: false });
  }

  doc.end();
  return done;
}
