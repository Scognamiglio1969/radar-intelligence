const RESULT_STYLE: Record<'W' | 'D' | 'L', string> = {
  W: 'bg-emerald-500/20 text-emerald-300',
  D: 'bg-slate-500/20 text-slate-300',
  L: 'bg-red-500/20 text-red-300',
};
const RESULT_LABEL: Record<'W' | 'D' | 'L', string> = { W: 'Win', D: 'Draw', L: 'Loss' };

export function ResultBadge({ result }: { result: 'W' | 'D' | 'L' }) {
  return (
    <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${RESULT_STYLE[result]}`}
      title={RESULT_LABEL[result]}>
      {result}
    </span>
  );
}

/** Barra bidirezionale centrata sullo zero: verde a destra (positivo), rosso a
 *  sinistra (negativo). Usata sia per la variazione di sentiment sia per quella
 *  del titolo, così le due si leggono con lo stesso linguaggio visivo. */
export function ShiftBar({ value, max, suffix = '' }: { value: number | null; max: number; suffix?: string }) {
  if (value === null) return <span className="text-xs text-slate-600">—</span>;
  const pct = Math.min(100, (Math.abs(value) / max) * 100);
  const positive = value >= 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-white/5">
        <div className="absolute inset-y-0 left-1/2 w-px bg-white/20" />
        <div
          className={`absolute inset-y-0 ${positive ? 'left-1/2 rounded-r-full bg-emerald-400/80' : 'right-1/2 rounded-l-full bg-red-400/80'}`}
          style={{ width: `${pct / 2}%` }}
        />
      </div>
      <span className={`w-14 shrink-0 text-xs tabular-nums ${positive ? 'text-emerald-300' : 'text-red-300'}`}>
        {positive ? '+' : ''}{value}{suffix}
      </span>
    </div>
  );
}
