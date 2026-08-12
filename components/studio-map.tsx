'use client';

import { useMemo, useState } from 'react';
import { WORLD, WORLD_VIEWBOX } from '@/lib/world-geo';
import { A2_TO_NUM, countryFlag, countryName } from '@/lib/country-codes';
import { paletteColor, type PaletteId } from '@/lib/entity-colors';

// ---------------------------------------------------------------------------
// La mappa come lente.
//
// Un vincolo del mezzo, prima di tutto: un confine può portare UN valore, non
// una distribuzione. Sei post in inglese e quattro in spagnolo dagli Stati
// Uniti non stanno dentro la stessa macchia di colore senza mentire — e le
// torte dentro i paesi, oltre a essere illeggibili, sono impossibili per il
// Lussemburgo. Quindi:
//
//   il COLORE dice una misura sola (quella scelta sull'asse Y);
//   la SCOMPOSIZIONE (l'asse Z) sta accanto: passando sopra un paese, e in
//   tabella sotto, dove sei righe di lingue si leggono davvero.
//
// Un paese su cui abbiamo un dato è sempre ACCESO: la scala parte da un colore
// visibile, non da zero, perché "poco" e "niente" devono restare due cose
// diverse a colpo d'occhio.
// ---------------------------------------------------------------------------

export type MapRow = { x: string; y: number; z?: string; code?: string };

type Country = {
  code: string; name: string; value: number;
  parts: { label: string; value: number }[];
};

const NO_DATA = '#141d33';
const STROKE = '#0a1122';

const fmt = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace('.0', '')}M`;
  if (a >= 1_000) return `${(n / 1_000).toFixed(1).replace('.0', '')}k`;
  if (a > 0 && a < 1) return n.toFixed(2);
  return String(Math.round(n * 100) / 100);
};

/**
 * Il colore di un paese.
 *
 * Due scale diverse, perché due domande diverse: una misura che cresce vuole
 * un'intensità (dal chiaro allo scuro); una che ha due versi attorno allo zero
 * — il sentiment — vuole due poli, altrimenti "molto negativo" e "molto
 * positivo" finiscono nella stessa tinta scura.
 */
function shade(value: number, min: number, max: number, diverging: boolean, palette: PaletteId): string {
  if (diverging) {
    const span = Math.max(Math.abs(min), Math.abs(max), 0.001);
    const t = Math.max(-1, Math.min(1, value / span));
    // 0 = polo negativo, 1 = polo positivo; il centro resta grigio.
    return paletteColor('diverging', Math.round(((t + 1) / 2) * 4), 5);
  }
  const span = max - min || 1;
  // Radice quadrata: senza, un paese con dieci volte meno dati sparisce.
  const t = Math.sqrt(Math.max(0, (value - min) / span));
  const ramp = palette === 'categorical' ? 'sequential' : palette;
  // Si parte dal secondo gradino: il primo è troppo vicino allo sfondo, e un
  // paese con un dato solo deve comunque vedersi.
  return paletteColor(ramp, Math.round(1 + t * 4), 6);
}

export function StudioMap({ rows, yLabel, zLabel, palette, diverging, unplaced }: {
  rows: MapRow[];
  yLabel: string;
  zLabel?: string;
  palette: PaletteId;
  /** La misura ha due versi attorno allo zero (sentiment): due poli. */
  diverging?: boolean;
  /** Mention del periodo di cui non si conosce il paese. */
  unplaced?: number;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const { byCode, byNum, min, max, total } = useMemo(() => {
    const acc = new Map<string, Country>();
    for (const r of rows) {
      const code = (r.code ?? '').toLowerCase();
      if (!code) continue;
      const c = acc.get(code) ?? { code, name: r.x || countryName(code), value: 0, parts: [] };
      c.value += r.y;
      if (r.z) c.parts.push({ label: r.z, value: r.y });
      acc.set(code, c);
    }
    for (const c of acc.values()) c.parts.sort((a, b) => b.value - a.value);

    const list = [...acc.values()];
    const vals = list.map((c) => c.value);
    const num = new Map<string, Country>();
    for (const c of list) {
      const n = A2_TO_NUM.get(c.code);
      if (n) num.set(n, c);
    }
    return {
      byCode: list.sort((a, b) => b.value - a.value),
      byNum: num,
      min: Math.min(0, ...vals),
      max: Math.max(...vals, 0.001),
      total: vals.reduce((s, v) => s + v, 0),
    };
  }, [rows]);

  const shown = pinned ?? hover;
  const focus = shown ? byCode.find((c) => c.code === shown) ?? null : null;
  // Paesi che hanno un dato ma che la mappa non sa disegnare: vanno detti,
  // non fatti sparire.
  const undrawn = byCode.filter((c) => !A2_TO_NUM.get(c.code));

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <svg viewBox={WORLD_VIEWBOX} className="w-full" style={{ maxHeight: 520 }}>
          <defs>
            <radialGradient id="mapGlow" cx="50%" cy="45%" r="70%">
              <stop offset="0%" stopColor="#0d1730" />
              <stop offset="100%" stopColor="#080c18" />
            </radialGradient>
          </defs>
          <rect x="0" y="0" width="1000" height="500" rx="14" fill="url(#mapGlow)" />

          {WORLD.map((geo) => {
            const c = byNum.get(geo.id);
            if (!c) {
              return (
                <path key={geo.id} d={geo.d} fill={NO_DATA} stroke={STROKE} strokeWidth={0.4}>
                  <title>{`${geo.name} — nessun dato`}</title>
                </path>
              );
            }
            const on = shown === c.code;
            const top = c.parts.slice(0, 6)
              .map((p) => `  ${p.label}: ${fmt(p.value)}`).join('\n');
            return (
              <path
                key={geo.id} d={geo.d}
                fill={shade(c.value, min, max, Boolean(diverging), palette)}
                stroke={on ? '#e2e8f0' : STROKE}
                strokeWidth={on ? 1.2 : 0.4}
                className="cursor-pointer transition-[stroke-width]"
                onMouseEnter={() => setHover(c.code)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setPinned(pinned === c.code ? null : c.code)}
              >
                <title>
                  {`${countryFlag(c.code)} ${c.name}\n${yLabel}: ${fmt(c.value)}`
                    + (c.parts.length ? `\n\n${zLabel ?? 'Composizione'}:\n${top}` : '')}
                </title>
              </path>
            );
          })}
        </svg>

        {/* La scomposizione: fuori dal confine, dove si legge. */}
        {focus && (
          <div className="pointer-events-none absolute right-3 top-3 w-60 rounded-xl border border-[var(--border)] bg-[#0c1226]/95 px-3.5 py-3 shadow-2xl backdrop-blur">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">
              <span aria-hidden>{countryFlag(focus.code)}</span> {focus.name}
            </p>
            <p className="mb-2 text-[11px] text-slate-500">
              {yLabel}: <span className="text-slate-300">{fmt(focus.value)}</span>
              {total > 0 && !diverging && <> · {Math.round((focus.value / total) * 100)}% del totale</>}
            </p>
            {focus.parts.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {focus.parts.slice(0, 7).map((p, i) => {
                  const share = focus.value ? Math.abs(p.value / focus.value) : 0;
                  return (
                    <li key={p.label} className="text-[11px]">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-slate-300">{p.label}</span>
                        <span className="shrink-0 tabular-nums text-slate-500">{fmt(p.value)}</span>
                      </div>
                      <div className="mt-0.5 h-1 overflow-hidden rounded bg-white/5">
                        <div className="h-full rounded" style={{
                          width: `${Math.max(2, share * 100)}%`,
                          backgroundColor: paletteColor(palette, i, Math.max(1, focus.parts.length)),
                        }} />
                      </div>
                    </li>
                  );
                })}
                {focus.parts.length > 7 && (
                  <li className="text-[10px] text-slate-600">e altre {focus.parts.length - 7} voci</li>
                )}
              </ul>
            ) : (
              <p className="text-[11px] leading-snug text-slate-600">
                Scegli un campo sull’asse Z per vedere di che cosa è fatto questo numero.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: NO_DATA }} /> nessun dato
        </span>
        <span className="flex items-center gap-1">
          {diverging ? 'negativo' : 'meno'}
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="inline-block size-2.5 rounded-sm"
              style={{ backgroundColor: shade(min + ((max - min) * i) / 4, min, max, Boolean(diverging), palette) }} />
          ))}
          {diverging ? 'positivo' : 'più'}
        </span>
        <span>{byCode.length} paesi con dati</span>
        {unplaced ? (
          <span title="Il paese si sa quando la fonte lo dichiara o quando l'indirizzo ha un dominio nazionale. Un .com non dice da dove viene, e la lingua non è il paese.">
            {unplaced} mention senza paese, fuori dalla mappa
          </span>
        ) : null}
        {pinned && (
          <button onClick={() => setPinned(null)} className="pointer-events-auto text-sky-400 hover:text-sky-300">
            libera la selezione
          </button>
        )}
      </div>

      {undrawn.length > 0 && (
        <p className="px-1 text-[11px] text-amber-300/80">
          {undrawn.length} {undrawn.length === 1 ? 'paese non è' : 'paesi non sono'} sulla mappa
          ({undrawn.slice(0, 4).map((c) => c.name).join(', ')}
          {undrawn.length > 4 ? '…' : ''}): {undrawn.length === 1 ? 'resta' : 'restano'} in tabella qui sotto.
        </p>
      )}

      <MapTable rows={byCode} yLabel={yLabel} zLabel={zLabel} total={total} diverging={diverging}
        onHover={setHover} selected={shown} />
    </div>
  );
}

/**
 * La tabella sotto la mappa.
 *
 * Non è un ripiego: una macchia di colore non si legge in cifre, e la
 * scomposizione di ogni paese qui c'è tutta insieme invece che un paese per
 * volta. È anche la forma in cui la mappa arriva negli export, dove un file
 * Word o un foglio Excel di confini colorati non saprebbe che farsene.
 */
function MapTable({ rows, yLabel, zLabel, total, diverging, onHover, selected }: {
  rows: Country[]; yLabel: string; zLabel?: string; total: number;
  diverging?: boolean; onHover: (c: string | null) => void; selected: string | null;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, 12);
  if (!rows.length) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
      <table className="w-full min-w-[32rem] text-left text-xs">
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-slate-600">
            <th className="px-3 py-2 font-semibold">Paese</th>
            <th className="px-3 py-2 text-right font-semibold">{yLabel}</th>
            {!diverging && <th className="px-3 py-2 text-right font-semibold">quota</th>}
            {zLabel && <th className="px-3 py-2 font-semibold">{zLabel}</th>}
          </tr>
        </thead>
        <tbody>
          {shown.map((c) => (
            <tr key={c.code}
              onMouseEnter={() => onHover(c.code)} onMouseLeave={() => onHover(null)}
              className={`border-b border-[var(--border)]/60 last:border-0 ${selected === c.code ? 'bg-sky-500/10' : 'hover:bg-white/[0.03]'}`}>
              <td className="px-3 py-1.5 text-slate-300">
                <span className="mr-1.5" aria-hidden>{countryFlag(c.code)}</span>{c.name}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">{fmt(c.value)}</td>
              {!diverging && (
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {total > 0 ? `${Math.round((c.value / total) * 1000) / 10}%` : '—'}
                </td>
              )}
              {zLabel && (
                <td className="px-3 py-1.5 text-slate-500">
                  {c.parts.length
                    ? c.parts.slice(0, 4).map((p) => `${p.label} ${fmt(p.value)}`).join(' · ')
                      + (c.parts.length > 4 ? ` · +${c.parts.length - 4}` : '')
                    : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 12 && (
        <button onClick={() => setAll(!all)}
          className="w-full border-t border-[var(--border)] px-3 py-1.5 text-[11px] text-sky-400 hover:bg-white/5">
          {all ? 'mostra solo i primi 12' : `mostra tutti i ${rows.length} paesi`}
        </button>
      )}
    </div>
  );
}
