import { collect, fetchJson, truncate } from './util';
import type { Connector, RawMention } from './types';

// SEC EDGAR full-text search: comunicati, bilanci e relazioni di ogni società
// quotata USA. Gratis, ufficiale, governativo, nessuna chiave — ma richiede
// per policy un User-Agent che identifichi chi chiama: verificato dal vivo
// che senza (nessun header, o uno generico) risponde 403 "Undeclared
// Automated Tool". Limite dichiarato: 10 richieste/secondo.
//
// Solo i moduli con vero testo discorsivo (8-K comunicati, 10-K/10-Q bilanci,
// DEF 14A proxy statement) — esclusi i moduli ad altissimo volume e zero
// narrativa come il Form 4 (transazioni interne), che sarebbero solo rumore
// numerico. La ricerca per frase esatta è tra virgolette: verificato dal vivo
// che senza corrispondenza restituisce zero risultati (non un OR di parole).
//
// Nessun estratto del testo nella risposta di ricerca (solo metadati del
// documento) — il contenuto si costruisce da azienda + tipo di modulo +
// descrizione dell'allegato, quando presente. Leggere il documento intero
// per un estratto vero richiederebbe scaricare e interpretare HTML/XBRL
// spesso enormi: fuori scopo, stesso limite già accettato per Stack Exchange.

const FORMS = '8-K,10-K,10-Q,DEF 14A';
const UA = 'RadarOSS admin@example.com'; // richiesto da SEC: nome + contatto

type EdgarHit = {
  _id: string;
  _source: {
    ciks: string[]; adsh: string; form: string; file_date: string;
    display_names: string[]; file_description?: string;
  };
};

async function search(term: string): Promise<RawMention[]> {
  const params = new URLSearchParams({ q: `"${term}"`, forms: FORMS });
  const data = await fetchJson<{ hits?: { hits?: EdgarHit[] } }>(
    `https://efts.sec.gov/LATEST/search-index?${params}`,
    { headers: { 'User-Agent': UA } },
  );
  return (data.hits?.hits ?? []).map((h) => {
    const s = h._source;
    const cik = String(Number(s.ciks[0]));           // toglie gli zeri iniziali
    const accession = s.adsh.replace(/-/g, '');
    const filename = h._id.split(':')[1] ?? '';
    const company = (s.display_names[0] ?? 'Unknown filer').replace(/\s+\(CIK \d+\)\s*$/, '');
    const label = `${company} filed a ${s.form}${s.file_description ? `: ${s.file_description}` : ''}`;
    return {
      source: 'sec-edgar',
      externalId: h._id,
      url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession}/${filename}`,
      title: truncate(label, 300),
      content: truncate(label, 300),
      author: company,
      community: s.form,
      publishedAt: new Date(s.file_date),
      language: 'en',
    } satisfies RawMention;
  });
}

export const secEdgar: Connector = {
  id: 'sec-edgar',
  label: 'SEC EDGAR',
  tier: 'free',
  enabled: () => true,
  async fetchMentions(q) {
    const terms = q.anyTerms.slice(0, 3);
    if (terms.length === 0) return [];
    return collect(terms.map(search));
  },
};
