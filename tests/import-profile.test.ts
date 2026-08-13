import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heuristicMapping, profileColumns } from '../lib/import-profile';

// Il riconoscimento delle colonne è deterministico e deve restarlo: è la rete
// di sicurezza che tiene in piedi l'import quando la chiamata all'AI non
// risponde. Ogni caso qui sotto è un errore che si è verificato davvero su un
// export reale.

/** Un export di listening realistico, con le sue trappole. */
function realisticExport() {
  const columns = [
    'Date', 'Time', 'Social Network', 'Source', 'Post Text', 'Author Name',
    'Handle', 'Followers', 'Reach', 'Likes', 'Comments', 'Shares',
    'Engagement Rate %', 'Sentiment', 'Language', 'URL',
  ];
  const rows = Array.from({ length: 40 }, (_, i) => ({
    'Date': `0${(i % 9) + 1}/03/2024`,
    'Time': '14:30',
    'Social Network': ['Twitter', 'Facebook', 'Instagram', 'TikTok'][i % 4],
    'Source': i % 2 ? 'Organic' : 'Sponsored',
    'Post Text': `Un contenuto abbastanza lungo da sembrare un post numero ${i}, con qualche parola in più.`,
    'Author Name': `Autore ${i}`,
    'Handle': `@utente${i}`,
    'Followers': 1000 + i * 7,
    'Reach': 5000 + i * 31,
    'Likes': i * 3,
    'Comments': i,
    'Shares': i % 5,
    'Engagement Rate %': 1.5 + (i % 10) / 10,
    'Sentiment': ['Positive', 'Neutral', 'Negative'][i % 3],
    'Language': ['it', 'en'][i % 2],
    'URL': `https://example.com/post/${i}`,
  }));
  return { columns, rows };
}

function mapOf(profiles: ReturnType<typeof profileColumns>, rowCount: number) {
  const out: Record<string, string> = {};
  for (const p of heuristicMapping(profiles, rowCount)) {
    if (p.field && p.confidence !== 'bassa') out[p.field] = p.column;
  }
  return out;
}

test('riconosce i campi di un export di listening reale', () => {
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.content, 'Post Text');
  assert.equal(map.date, 'Date');
  assert.equal(map.time, 'Time');
  assert.equal(map.author, 'Author Name');
  assert.equal(map.authorHandle, 'Handle');
  assert.equal(map.url, 'URL');
  assert.equal(map.sentiment, 'Sentiment');
  assert.equal(map.language, 'Language');
  assert.equal(map.likes, 'Likes');
  assert.equal(map.comments, 'Comments');
  assert.equal(map.shares, 'Shares');
});

test('la fonte si riconosce dai VALORI, non dal nome della colonna', () => {
  // "Source" contiene Organic/Sponsored: è il tipo di acquisizione, non la
  // piattaforma. La fonte vera è "Social Network", che contiene i nomi delle
  // piattaforme. Fidarsi del nome della colonna qui sbaglia.
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.source, 'Social Network');
  assert.notEqual(map.source, 'Source');
});

test('reach non viene confuso con followers', () => {
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);
  assert.equal(map.reach, 'Reach');
});

test('un tasso percentuale non viene preso per un totale', () => {
  // "Engagement Rate %" vale 1,5: usarlo come engagement totale falserebbe
  // ogni classifica di contenuti.
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);
  assert.notEqual(map.engagement, 'Engagement Rate %');
});

test('nessuna colonna viene assegnata a due campi diversi', () => {
  const { columns, rows } = realisticExport();
  const map = mapOf(profileColumns(columns, rows), rows.length);
  const used = Object.values(map);
  assert.equal(new Set(used).size, used.length, `colonna assegnata due volte: ${used.join(', ')}`);
});

test('intestazioni in italiano', () => {
  const columns = ['Data', 'Testo', 'Autore', 'Piattaforma', 'Mi piace', 'Commenti', 'Link'];
  const rows = Array.from({ length: 30 }, (_, i) => ({
    'Data': `1${i % 9}/04/2024`,
    'Testo': `Un contenuto italiano abbastanza lungo per sembrare un post, numero ${i}.`,
    'Autore': `Autore ${i}`,
    'Piattaforma': ['Twitter', 'Facebook', 'LinkedIn'][i % 3],
    'Mi piace': i * 2,
    'Commenti': i,
    'Link': `https://example.com/${i}`,
  }));
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.content, 'Testo');
  assert.equal(map.date, 'Data');
  assert.equal(map.author, 'Autore');
  assert.equal(map.source, 'Piattaforma');
  assert.equal(map.url, 'Link');
});

test('gli URL non vengono scambiati per date', () => {
  // Gli URL contengono "/" e ":" e Date.parse li accetta: senza escluderli
  // prima, una colonna di link veniva profilata come colonna di date.
  const columns = ['Testo', 'Link'];
  const rows = Array.from({ length: 20 }, (_, i) => ({
    'Testo': `Contenuto numero ${i} lungo quanto basta per essere un post.`,
    'Link': `https://example.com/2024/03/12/articolo-${i}`,
  }));
  const map = mapOf(profileColumns(columns, rows), rows.length);

  assert.equal(map.url, 'Link');
  assert.notEqual(map.date, 'Link');
});

test('un file senza colonna di testo non ne inventa una', () => {
  const columns = ['Data', 'Like', 'Commenti'];
  const rows = Array.from({ length: 15 }, (_, i) => ({
    'Data': `0${(i % 9) + 1}/05/2024`, 'Like': i, 'Commenti': i % 3,
  }));
  const map = mapOf(profileColumns(columns, rows), rows.length);
  assert.equal(map.content, undefined);
});

test("i dati hanno l'ultima parola sulla proposta dell'AI", async () => {
  // Un file reale intesta "Testo del post" la colonna degli id numerici e
  // "ID post" quella che contiene il testo. Il modello legge i nomi e si
  // convince; il profilo dei valori dice il contrario. Senza questo controllo
  // nel testo delle mention finiva un numero.
  const { validateAgainstProfiles } = await import('../lib/import-profile');
  const profiles = profileColumns(['ID post', 'Testo del post', 'Data'], Array.from({ length: 20 }, (_, i) => ({
    'ID post': `Un testo di post abbastanza lungo, numero ${i}, con parole vere dentro.`,
    'Testo del post': 1742141175148995021 + i,
    'Data': `0${(i % 9) + 1}/03/2024`,
  })));
  const aiSaid = [
    { column: 'Testo del post', field: 'content' as const, confidence: 'alta' as const, reason: 'si chiama così' },
    { column: 'ID post', field: null, confidence: null, reason: 'sembra un id' },
    { column: 'Data', field: 'date' as const, confidence: 'alta' as const, reason: 'date' },
  ];
  const checked = validateAgainstProfiles(aiSaid, profiles);
  const content = checked.find((c) => c.field === 'content');
  assert.equal(content, undefined, 'una colonna di numeri non può essere il testo del post');
  assert.equal(checked.find((c) => c.column === 'Data')?.field, 'date', 'le proposte compatibili restano');
});

test('una colonna di soli ID non diventa il contenuto, anche se si chiama così', () => {
  // Il caso vero: nel foglio X di un export social le intestazioni sono
  // sfalsate di uno. "Testo del post" contiene gli ID dei tweet e "ID post"
  // contiene il testo. Se vince il nome, in archivio finiscono righe di numeri.
  const profiles = profileColumns(
    ['Canale', 'ID post', 'Testo del post', 'Link post', 'Mi piace'],
    Array.from({ length: 20 }, (_, i) => ({
      'Canale': 'X',
      'ID post': `📰 Un post vero con hashtag #GruppoFS e una frase abbastanza lunga da sembrare quello che è, cioè il contenuto pubblicato numero ${i}.`,
      'Testo del post': `17421411751489950${String(i).padStart(2, '0')}`,
      'Link post': `https://twitter.com/tale/status/17421411751489950${i}`,
      'Mi piace': String(3 + i),
    })),
  );

  const map = mapOf(profiles, 20);

  assert.equal(map.content, 'ID post',
    `il contenuto deve venire dalla colonna che contiene testo, non da quella che si chiama così (ricevuto: ${map.content})`);
  assert.notEqual(map.title, 'Testo del post', 'nemmeno come titolo');
  assert.equal(map.url, 'Link post');
});

// ---------------------------------------------------------------------------
// La fonte non è quello che c'è scritto nell'intestazione.
//
// In un file vero la colonna si chiamava "FONTE" e conteneva i pilastri
// editoriali. Ogni contenuto è finito in archivio con "Strategia e vision
// generale" come piattaforma di provenienza, e la pagina Ascolto offriva
// quindici fonti che non erano fonti. Il nome propone, i valori decidono.
// ---------------------------------------------------------------------------

test('una colonna "FONTE" piena di temi non diventa la fonte', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    DATA: `2025-0${(i % 9) + 1}-01`,
    TESTO: `Un contenuto abbastanza lungo da sembrare il testo del post numero ${i}, con parole vere.`,
    FONTE: ['Strategia e vision generale', 'Rete agenziale e momenti', 'Sostenibilità e le tenute',
      'Le tenute del leone alato', 'Integrazione Cattolica', 'Eventi università', 'Certificazioni'][i % 7],
  }));
  const profiles = profileColumns(['DATA', 'TESTO', 'FONTE'], rows);
  const proposal = heuristicMapping(profiles, rows.length);
  const fonte = proposal.find((p) => p.column === 'FONTE');
  assert.notEqual(fonte?.field, 'source',
    'i pilastri editoriali non sono piattaforme di provenienza');
});

test('una colonna di piattaforme vere resta la fonte', () => {
  const rows = Array.from({ length: 40 }, (_, i) => ({
    DATA: `2025-0${(i % 9) + 1}-01`,
    TESTO: `Un contenuto abbastanza lungo da sembrare il testo del post numero ${i}, con parole vere.`,
    FONTE: ['LinkedIn', 'Instagram', 'X', 'Facebook'][i % 4],
  }));
  const profiles = profileColumns(['DATA', 'TESTO', 'FONTE'], rows);
  const proposal = heuristicMapping(profiles, rows.length);
  assert.equal(proposal.find((p) => p.column === 'FONTE')?.field, 'source');
});

test('una colonna di testate resta la fonte', () => {
  // Il monitoraggio stampa è il caso opposto: lì la fonte non è una
  // piattaforma ma un giornale, e toglierle la mappatura automatica
  // costerebbe un clic per ogni file.
  const rows = Array.from({ length: 40 }, (_, i) => ({
    DATA: `2025-0${(i % 9) + 1}-01`,
    TESTO: `Un articolo abbastanza lungo da sembrare il corpo della notizia numero ${i}, con parole vere.`,
    FONTE: ['Corriere della Sera', 'La Stampa', 'Il Sole 24 Ore', 'Ansa', 'repubblica.it'][i % 5],
  }));
  const profiles = profileColumns(['DATA', 'TESTO', 'FONTE'], rows);
  const proposal = heuristicMapping(profiles, rows.length);
  assert.equal(proposal.find((p) => p.column === 'FONTE')?.field, 'source');
});
