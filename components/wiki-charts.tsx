'use client';

import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import type { WikiWeekPoint } from '@/lib/wikipedia';

const TOOLTIP = { backgroundColor: '#16203c', border: '1px solid #1e2a4a', borderRadius: 8, fontSize: 12, color: '#e2e8f0' };
const C = { normal: '#38bdf8', revert: '#f87171', grid: '#1e2a4a', axis: '#7c8cab' };

const shortWeek = (w: string) => new Date(`${w}T00:00:00Z`).toLocaleDateString('en-US', { day: '2-digit', month: 'short', timeZone: 'UTC' });

/**
 * Modifiche per settimana, con la quota di revert impilata sopra in rosso.
 * Una barra alta e rossa è la firma visiva di una edit war: tanta attività,
 * e la maggior parte è gente che si annulla a vicenda, non chi scrive.
 */
export function WeeklyEditsChart({ data }: { data: WikiWeekPoint[] }) {
  if (data.length < 2) return <p className="py-6 text-center text-xs text-slate-600">Not enough weeks of history yet.</p>;
  const rows = data.map((d) => ({ ...d, normal: d.total - d.reverts }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
        <CartesianGrid stroke={C.grid} vertical={false} />
        <XAxis dataKey="week" tickFormatter={shortWeek} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} minTickGap={20} />
        <YAxis allowDecimals={false} tick={{ fill: C.axis, fontSize: 11 }} tickLine={false} width={28} />
        <Tooltip
          cursor={{ fill: '#ffffff08' }}
          content={({ payload, label }) => {
            const p = payload?.[0]?.payload as (WikiWeekPoint & { normal: number }) | undefined;
            if (!p) return null;
            return (
              <div style={TOOLTIP} className="px-3 py-2">
                <p className="mb-1 font-semibold text-slate-100">week of {shortWeek(String(label))}</p>
                <p className="text-slate-300">{p.total} edit{p.total === 1 ? '' : 's'}</p>
                {p.reverts > 0 && <p style={{ color: C.revert }}>{p.reverts} reverted</p>}
              </div>
            );
          }} />
        <Bar dataKey="normal" stackId="a" fill={C.normal} radius={[0, 0, 0, 0]} />
        <Bar dataKey="reverts" stackId="a" fill={C.revert} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
