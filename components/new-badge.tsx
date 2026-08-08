'use client';

import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';

// ---------------------------------------------------------------------------
// "Dati nuovi".
//
// Un grafico che è cambiato dall'ultima volta ha qualcosa da dire, ma sembra
// identico a uno fermo da mesi. Il badge segna la differenza — e si spegne da
// solo appena l'hai visto, perché un avviso che resta acceso per sempre smette
// di significare qualcosa.
//
// Il "già visto" vive nel browser: è una preferenza di lettura personale, non
// un dato del progetto, e non ha senso condividerla fra utenti diversi né
// farla viaggiare fino al server.
// ---------------------------------------------------------------------------

const KEY = 'radar:seen:';

/**
 * Vero se questo riquadro ha dati più recenti dell'ultima volta che lo hai
 * guardato. `latest` è la data del dato più recente, non quella di oggi:
 * ricaricare la pagina non deve far comparire un "nuovo" che non c'è.
 */
export function useIsNew(id: string, latest: string | null | undefined): boolean {
  const [isNew, setNew] = useState(false);

  useEffect(() => {
    if (!latest) return;
    let seen: string | null = null;
    try { seen = window.localStorage.getItem(KEY + id); } catch { /* privato o pieno */ }
    if (!seen || seen < latest) {
      setNew(true);
      // Si marca come visto SUBITO: il badge resta per questa visita e non
      // ricompare alla prossima, che è il comportamento che ci si aspetta.
      try { window.localStorage.setItem(KEY + id, latest); } catch { /* ignora */ }
    }
  }, [id, latest]);

  return isNew;
}

export function NewBadge({ id, latest, label = 'dati nuovi' }: {
  id: string; latest: string | null | undefined; label?: string;
}) {
  const isNew = useIsNew(id, latest);
  if (!isNew) return null;
  return (
    <span
      title={`Aggiornato al ${latest ? new Date(latest).toLocaleDateString('it-IT') : ''}: non c'era l'ultima volta che hai guardato`}
      className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
      <Sparkles className="size-2.5" /> {label}
    </span>
  );
}
