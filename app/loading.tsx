import { Loader2 } from 'lucide-react';

// Fallback globale: appare all'istante quando si naviga verso una pagina
// che sta ancora caricando i dati (Suspense a livello di root).
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center gap-3">
        <Loader2 className="size-5 animate-spin text-sky-400" />
        <div className="h-7 w-56 rounded-lg bg-white/5" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-white/5" />)}
      </div>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="h-72 rounded-xl bg-white/5 lg:col-span-2" />
        <div className="h-72 rounded-xl bg-white/5" />
      </div>
      <div className="mt-4 flex flex-col gap-2">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 rounded-xl bg-white/5" />)}
      </div>
    </div>
  );
}
