'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Users, CalendarClock, Sparkles, Trophy } from 'lucide-react';
import { entityColor } from '@/lib/entity-colors';

// ---------------------------------------------------------------------------
// Le schede persona.
//
// Ogni numero risponde a una domanda che si fa chi cura il personal branding:
// sta crescendo? pubblica abbastanza? che formato rende? chi la segue?
//
// Due scelte di lettura che valgono più di qualsiasi grafico:
//  - la CRESCITA si mostra accanto al totale. Quarantaduemila follower non
//    dicono niente da soli: ventisettemila guadagnati in tre anni sì.
//  - il RITMO porta con sé la tendenza. "2,5 post al mese" con "-47%" è una
//    storia completamente diversa da "2,5 al mese" e basta.
// ---------------------------------------------------------------------------

type Card = {
  name: string;
  followers: { latest: number; gained: number; from: string; to: string } | null;
  rhythm: { perMonth: number; total: number; months: number; trend: number | null } | null;
  averages: { metric: string; value: number }[];
  formats: { name: string; posts: number; avgEngagement: number }[];
  audience: { dimension: string; rows: { name: string; share: number }[] }[];
  best: { title: string; engagement: number; date: string } | null;
  worst: { title: string; engagement: number; date: string } | null;
};

const num = (n: number) => n.toLocaleString('it-IT');
const pct = (n: number) => `${n >= 0 ? '+' : ''}${n}%`;

/** La classifica del team: una riga per persona, tre numeri confrontabili. */
export function PeopleLeaderboard({ rows }: {
  rows: { name: string; followers: number | null; perMonth: number | null; engagement: number | null }[];
}) {
  const withData = rows.filter((r) => r.followers !== null || r.perMonth !== null);
  if (withData.length < 2) return null;
  const maxF = Math.max(...withData.map((r) => r.followers ?? 0), 1);

  return (
    <section className="panel px-5 py-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Trophy className="size-4 text-amber-400" /> Il quadro del team
      </h2>
      <p className="mb-3 text-[11px] text-slate-600">
        Follower all&rsquo;ultima rilevazione, ritmo di pubblicazione ed engagement medio.
        Tre misure diverse: chi ha più pubblico non è per forza chi lo coinvolge di più.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-slate-600">
              <th className="pb-1.5 pr-3">Persona</th>
              <th className="pb-1.5 pr-3">Pubblico</th>
              <th className="pb-1.5 pr-3 text-right">Post/mese</th>
              <th className="pb-1.5 text-right">Engagement medio</th>
            </tr>
          </thead>
          <tbody>
            {withData.map((r, i) => (
              <tr key={r.name} className="border-t border-[var(--border)]/40">
                <td className="py-1.5 pr-3 font-medium text-slate-300">{r.name}</td>
                <td className="py-1.5 pr-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-24 overflow-hidden rounded-full bg-white/[0.04]">
                      <span className="block h-full rounded-full"
                        style={{ width: `${((r.followers ?? 0) / maxF) * 100}%`, backgroundColor: entityColor(i) }} />
                    </span>
                    <span className="tabular-nums text-slate-400">{r.followers === null ? '—' : num(r.followers)}</span>
                  </div>
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-400">{r.perMonth ?? '—'}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-400">
                  {r.engagement === null ? '—' : num(Math.round(r.engagement))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PersonCards({ cards }: { cards: Card[] }) {
  const [open, setOpen] = useState<string | null>(cards[0]?.name ?? null);
  return (
    <div className="flex flex-col gap-3">
      {cards.map((c, i) => (
        <PersonPanel key={c.name} card={c} color={entityColor(i)}
          open={open === c.name} onToggle={() => setOpen(open === c.name ? null : c.name)} />
      ))}
    </div>
  );
}

function PersonPanel({ card, color, open, onToggle }: {
  card: Card; color: string; open: boolean; onToggle: () => void;
}) {
  const growth = card.followers && card.followers.latest > 0
    ? Math.round((card.followers.gained / Math.max(1, card.followers.latest - card.followers.gained)) * 100)
    : null;

  return (
    <section className="panel px-5 py-4">
      <button onClick={onToggle} className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 text-left">
        <span className="flex items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-slate-200">{card.name}</span>
        </span>

        {card.followers && (
          <span className="flex items-baseline gap-1.5">
            <span className="text-lg font-semibold tabular-nums text-slate-100">{num(card.followers.latest)}</span>
            <span className="text-[11px] text-slate-600">follower</span>
            {growth !== null && (
              <span className={`inline-flex items-center gap-0.5 text-[11px] ${card.followers.gained >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {card.followers.gained >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
                {num(card.followers.gained)} ({pct(growth)})
              </span>
            )}
          </span>
        )}

        {card.rhythm && (
          <span className="flex items-baseline gap-1.5">
            <CalendarClock className="size-3.5 self-center text-slate-600" />
            <span className="text-sm font-medium tabular-nums text-slate-200">{card.rhythm.perMonth}</span>
            <span className="text-[11px] text-slate-600">post/mese</span>
            {card.rhythm.trend !== null && (
              <span className={`text-[11px] ${card.rhythm.trend >= 0 ? 'text-emerald-300' : 'text-amber-300'}`}>
                {pct(card.rhythm.trend)}
              </span>
            )}
          </span>
        )}

        {card.averages[0] && (
          <span className="flex items-baseline gap-1.5">
            <Sparkles className="size-3.5 self-center text-slate-600" />
            <span className="text-sm font-medium tabular-nums text-slate-200">{num(Math.round(card.averages[0].value))}</span>
            <span className="text-[11px] text-slate-600">{card.averages[0].metric.toLowerCase()}</span>
          </span>
        )}

        <span className="ml-auto text-[11px] text-slate-600">{open ? 'chiudi' : 'dettaglio'}</span>
      </button>

      {open && (
        <div className="mt-4 grid gap-4 border-t border-[var(--border)] pt-4 lg:grid-cols-2">
          {card.averages.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">Le medie</p>
              <ul className="flex flex-col gap-1">
                {card.averages.map((a) => (
                  <li key={a.metric} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-slate-400">{a.metric}</span>
                    <span className="tabular-nums text-slate-200">{num(a.value)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-slate-600">
                Medie del periodo: un tasso non si somma.
              </p>
            </div>
          )}

          {card.formats.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Che formato rende
              </p>
              <ul className="flex flex-col gap-1.5">
                {card.formats.map((f, i) => {
                  const max = Math.max(...card.formats.map((x) => x.avgEngagement), 1);
                  return (
                    <li key={f.name} className="flex items-center gap-2 text-xs">
                      <span className="w-24 shrink-0 truncate text-slate-400">{f.name}</span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                        <span className="block h-full rounded-full"
                          style={{ width: `${(f.avgEngagement / max) * 100}%`, backgroundColor: entityColor(i) }} />
                      </span>
                      <span className="w-14 shrink-0 text-right tabular-nums text-slate-400">{num(f.avgEngagement)}</span>
                      <span className="w-10 shrink-0 text-right text-[10px] text-slate-600">{f.posts} post</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {card.audience.map((a) => (
            <div key={a.dimension}>
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                <Users className="size-3" /> Pubblico per {a.dimension}
              </p>
              <ul className="flex flex-col gap-1">
                {a.rows.slice(0, 6).map((r, i) => (
                  <li key={r.name} className="flex items-center gap-2 text-xs">
                    <span className="w-32 shrink-0 truncate text-slate-400" title={r.name}>{r.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.04]">
                      <span className="block h-full rounded-full"
                        style={{ width: `${Math.min(100, r.share * 100)}%`, backgroundColor: entityColor(i) }} />
                    </span>
                    <span className="w-12 shrink-0 text-right tabular-nums text-slate-500">
                      {(r.share * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {(card.best || card.worst) && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                Il migliore e il peggiore
              </p>
              {card.best && (
                <p className="mb-1 text-xs">
                  <span className="text-emerald-300">↑ {num(card.best.engagement)}</span>
                  <span className="text-slate-600"> · {card.best.date} · </span>
                  <span className="text-slate-400">{card.best.title}</span>
                </p>
              )}
              {card.worst && card.worst.title !== card.best?.title && (
                <p className="text-xs">
                  <span className="text-slate-500">↓ {num(card.worst.engagement)}</span>
                  <span className="text-slate-600"> · {card.worst.date} · </span>
                  <span className="text-slate-500">{card.worst.title}</span>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
