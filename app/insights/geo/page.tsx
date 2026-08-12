import { redirect } from 'next/navigation';

// La mappa non è più una pagina a sé: è un tipo di grafico di Studio Graph, con
// il paese sull'asse X. Chi arriva qui da un link salvato ci finisce dentro,
// già configurato.
export default function GeoPage() {
  redirect('/graph?preset=map');
}
