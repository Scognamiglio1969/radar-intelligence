'use client';

import { Star } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

const TOOLTIP = { backgroundColor: '#16203c', border: '1px solid #1e2a4a', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };
const STAR_COLOR = '#fbbf24';

/** Stelle piene proporzionalmente al voto (anche frazionario, es. 4.3). */
export function RatingStars({ rating, size = 'md' }: { rating: number | null; size?: 'sm' | 'md' | 'lg' }) {
  const px = size === 'lg' ? 20 : size === 'sm' ? 12 : 15;
  const r = rating ?? 0;
  return (
    <span className="inline-flex items-center gap-0.5" title={rating !== null ? `${rating.toFixed(2)} / 5` : 'no rating yet'}>
      {Array.from({ length: 5 }, (_, i) => {
        const fill = Math.max(0, Math.min(1, r - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: px, height: px }}>
            <Star className="absolute inset-0 text-slate-700" style={{ width: px, height: px }} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className="text-amber-400" style={{ width: px, height: px, fill: STAR_COLOR }} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Distribuzione dei voti: barre orizzontali da 5 a 1 stelle. */
export function RatingDistribution({ distribution }: { distribution: number[] }) {
  const max = Math.max(1, ...distribution);
  const total = distribution.reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-col gap-1.5">
      {[5, 4, 3, 2, 1].map((star) => {
        const n = distribution[star - 1] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={star} className="flex items-center gap-2 text-xs">
            <span className="flex w-8 shrink-0 items-center justify-end gap-0.5 text-slate-400">
              {star}<Star className="size-3" style={{ fill: STAR_COLOR, color: STAR_COLOR }} />
            </span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/5">
              <span className="block h-full rounded-full bg-amber-400/70" style={{ width: `${(n / max) * 100}%`, transition: 'width 1s ease-out' }} />
            </span>
            <span className="w-16 shrink-0 text-right tabular-nums text-slate-500">{n} · {pct}%</span>
          </div>
        );
      })}
    </div>
  );
}

/** Voto medio settimana per settimana: la tendenza, non solo lo stato attuale. */
export function RatingTrend({ trend }: { trend: { week: string; avgRating: number | null; n: number }[] }) {
  const data = trend.filter((t) => t.avgRating !== null);
  if (data.length < 2) return <p className="py-6 text-center text-xs text-slate-600">Not enough weeks of data yet for a trend line.</p>;
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -18 }}>
        <CartesianGrid stroke="#1e2a4a" vertical={false} />
        <XAxis dataKey="week" tickFormatter={(d: string) => d.slice(5)} minTickGap={28}
          tick={{ fill: '#7c8cab', fontSize: 11 }} tickLine={false} />
        <YAxis domain={[1, 5]} ticks={[1, 2, 3, 4, 5]} tick={{ fill: '#7c8cab', fontSize: 11 }} tickLine={false} width={28} />
        <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: '#334155' }}
          content={({ payload, label }) => {
            const p = payload?.[0]?.payload as (typeof data)[number] | undefined;
            if (!p) return null;
            return (
              <div style={TOOLTIP} className="px-3 py-2">
                <p className="font-semibold text-slate-100">week of {new Date(String(label)).toLocaleDateString('en-US')}</p>
                <p className="text-amber-300">avg {p.avgRating?.toFixed(2)} ★ · {p.n} review{p.n === 1 ? '' : 's'}</p>
              </div>
            );
          }} />
        <Line type="monotone" dataKey="avgRating" stroke={STAR_COLOR} strokeWidth={2.2}
          dot={{ r: 3.5, fill: STAR_COLOR, strokeWidth: 0 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
