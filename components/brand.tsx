import { Radar } from 'lucide-react';

// Nome e sottotitolo del brand. Personalizzabili senza toccare il codice tramite
// le variabili d'ambiente NEXT_PUBLIC_BRAND_NAME e NEXT_PUBLIC_BRAND_BYLINE.
export const APP_NAME = process.env.NEXT_PUBLIC_BRAND_NAME || 'Radar';
export const APP_BYLINE = process.env.NEXT_PUBLIC_BRAND_BYLINE || 'By Scognamiglio 2026';

export function Brand({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const icon = size === 'lg' ? 'size-8' : size === 'sm' ? 'size-5' : 'size-6';
  const title = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-lg';
  const byline = size === 'lg' ? 'text-[11px]' : 'text-[9px]';
  return (
    <span className="flex items-center gap-2">
      <Radar className={`${icon} shrink-0 text-sky-400`} />
      <span className="flex flex-col leading-none">
        <span className={`${title} font-bold tracking-tight`}>{APP_NAME}</span>
        <span className={`${byline} mt-0.5 font-medium uppercase tracking-[0.14em] text-slate-500`}>
          {APP_BYLINE}
        </span>
      </span>
    </span>
  );
}
