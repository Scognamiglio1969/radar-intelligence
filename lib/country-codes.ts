// ---------------------------------------------------------------------------
// I codici dei paesi.
//
// Tre alfabeti che devono parlarsi:
//
//   ISO numerico — è quello con cui sono disegnati i confini (lib/world-geo);
//   ISO alpha-2  — è quello con cui conserviamo il paese di una mention;
//   il NOME       — è quello che arriva dai dati (GDELT scrive "Italy", un
//                   foglio Excel scrive "Italia" o "IT").
//
// Qui vivono le conversioni, in un posto solo, perché un paese scritto in due
// modi diversi diventa due paesi sulla mappa — ed è il modo più rapido per
// rendere una mappa inutile.
// ---------------------------------------------------------------------------

/** numerico → alpha-2, per tutti e soli i paesi che la mappa sa disegnare. */
const NUM_A2 = '242fj 834tz 732eh 124ca 840us 398kz 860uz 598pg 360id 032ar 152cl 180cd 706so 404ke 729sd 148td 332ht 214do 643ru 044bs 238fk 578no 304gl 260tf 626tl 710za 426ls 484mx 858uy 076br 068bo 604pe 170co 591pa 188cr 558ni 340hn 222sv 320gt 084bz 862ve 328gy 740sr 250fr 218ec 630pr 388jm 192cu 716zw 072bw 516na 686sn 466ml 478mr 204bj 562ne 566ng 120cm 768tg 288gh 384ci 324gn 624gw 430lr 694sl 854bf 140cf 178cg 266ga 226gq 894zm 454mw 508mz 748sz 024ao 108bi 376il 422lb 450mg 275ps 270gm 788tn 012dz 400jo 784ae 634qa 414kw 368iq 512om 548vu 116kh 764th 418la 104mm 704vn 408kp 410kr 496mn 356in 050bd 064bt 524np 586pk 004af 762tj 417kg 795tm 364ir 760sy 051am 752se 112by 804ua 616pl 040at 348hu 498md 642ro 440lt 428lv 233ee 276de 100bg 300gr 792tr 008al 191hr 756ch 442lu 056be 528nl 620pt 724es 372ie 540nc 090sb 554nz 036au 144lk 156cn 158tw 380it 208dk 826gb 352is 031az 268ge 608ph 458my 096bn 705si 246fi 703sk 203cz 232er 392jp 600py 887ye 682sa 196cy 504ma 818eg 434ly 231et 262dj 800ug 646rw 070ba 807mk 688rs 499me 780tt 728ss';

export const NUM_TO_A2 = new Map<string, string>();
export const A2_TO_NUM = new Map<string, string>();
for (const pair of NUM_A2.split(' ')) {
  const num = pair.slice(0, 3);
  const a2 = pair.slice(3);
  NUM_TO_A2.set(num, a2);
  A2_TO_NUM.set(a2, num);
}

/** alpha-2 → nome leggibile. Popolato dai nomi con cui i confini sono disegnati. */
export const A2_NAME: Record<string, string> = {
  af: 'Afghanistan', al: 'Albania', dz: 'Algeria', ao: 'Angola', ar: 'Argentina',
  am: 'Armenia', au: 'Australia', at: 'Austria', az: 'Azerbaijan', bs: 'Bahamas',
  bd: 'Bangladesh', by: 'Belarus', be: 'Belgium', bz: 'Belize', bj: 'Benin',
  bt: 'Bhutan', bo: 'Bolivia', ba: 'Bosnia and Herzegovina', bw: 'Botswana', br: 'Brazil',
  bn: 'Brunei', bg: 'Bulgaria', bf: 'Burkina Faso', bi: 'Burundi', kh: 'Cambodia',
  cm: 'Cameroon', ca: 'Canada', cf: 'Central African Republic', td: 'Chad', cl: 'Chile',
  cn: 'China', co: 'Colombia', cg: 'Congo', cd: 'DR Congo', cr: 'Costa Rica',
  ci: 'Côte d’Ivoire', hr: 'Croatia', cu: 'Cuba', cy: 'Cyprus', cz: 'Czechia',
  dk: 'Denmark', dj: 'Djibouti', do: 'Dominican Republic', ec: 'Ecuador', eg: 'Egypt',
  sv: 'El Salvador', gq: 'Equatorial Guinea', er: 'Eritrea', ee: 'Estonia', sz: 'Eswatini',
  et: 'Ethiopia', fk: 'Falkland Islands', fj: 'Fiji', fi: 'Finland', fr: 'France',
  tf: 'French Southern Lands', ga: 'Gabon', gm: 'Gambia', ge: 'Georgia', de: 'Germany',
  gh: 'Ghana', gr: 'Greece', gl: 'Greenland', gt: 'Guatemala', gn: 'Guinea',
  gw: 'Guinea-Bissau', gy: 'Guyana', ht: 'Haiti', hn: 'Honduras', hu: 'Hungary',
  is: 'Iceland', in: 'India', id: 'Indonesia', ir: 'Iran', iq: 'Iraq',
  ie: 'Ireland', il: 'Israel', it: 'Italy', jm: 'Jamaica', jp: 'Japan',
  jo: 'Jordan', kz: 'Kazakhstan', ke: 'Kenya', kp: 'North Korea', kr: 'South Korea',
  kw: 'Kuwait', kg: 'Kyrgyzstan', la: 'Laos', lv: 'Latvia', lb: 'Lebanon',
  ls: 'Lesotho', lr: 'Liberia', ly: 'Libya', lt: 'Lithuania', lu: 'Luxembourg',
  mk: 'North Macedonia', mg: 'Madagascar', mw: 'Malawi', my: 'Malaysia', ml: 'Mali',
  mr: 'Mauritania', mx: 'Mexico', md: 'Moldova', mn: 'Mongolia', me: 'Montenegro',
  ma: 'Morocco', mz: 'Mozambique', mm: 'Myanmar', na: 'Namibia', np: 'Nepal',
  nl: 'Netherlands', nc: 'New Caledonia', nz: 'New Zealand', ni: 'Nicaragua', ne: 'Niger',
  ng: 'Nigeria', no: 'Norway', om: 'Oman', pk: 'Pakistan', ps: 'Palestine',
  pa: 'Panama', pg: 'Papua New Guinea', py: 'Paraguay', pe: 'Peru', ph: 'Philippines',
  pl: 'Poland', pt: 'Portugal', pr: 'Puerto Rico', qa: 'Qatar', ro: 'Romania',
  ru: 'Russia', rw: 'Rwanda', sa: 'Saudi Arabia', sn: 'Senegal', rs: 'Serbia',
  sl: 'Sierra Leone', sk: 'Slovakia', si: 'Slovenia', sb: 'Solomon Islands', so: 'Somalia',
  za: 'South Africa', ss: 'South Sudan', es: 'Spain', lk: 'Sri Lanka', sd: 'Sudan',
  sr: 'Suriname', se: 'Sweden', ch: 'Switzerland', sy: 'Syria', tw: 'Taiwan',
  tj: 'Tajikistan', tz: 'Tanzania', th: 'Thailand', tl: 'Timor-Leste', tg: 'Togo',
  tt: 'Trinidad and Tobago', tn: 'Tunisia', tr: 'Türkiye', tm: 'Turkmenistan', ug: 'Uganda',
  ua: 'Ukraine', ae: 'United Arab Emirates', gb: 'United Kingdom', us: 'United States',
  uy: 'Uruguay', uz: 'Uzbekistan', vu: 'Vanuatu', ve: 'Venezuela', vn: 'Vietnam',
  eh: 'Western Sahara', ye: 'Yemen', zm: 'Zambia', zw: 'Zimbabwe',
};

export const countryName = (a2: string): string => A2_NAME[a2] ?? a2.toUpperCase();

/** La bandiera, dai due caratteri del codice: nessuna tabella da mantenere. */
export function countryFlag(a2: string): string {
  if (!/^[a-z]{2}$/i.test(a2)) return '🏳️';
  return String.fromCodePoint(...[...a2.toLowerCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 97));
}

// --- Dai dati al codice ----------------------------------------------------

/**
 * Domini di primo livello che NON coincidono con il codice del paese, o che
 * un paese non lo indicano affatto.
 */
const TLD_EXCEPTIONS: Record<string, string> = { uk: 'gb', su: 'ru', tp: 'tl', an: 'nl' };
const TLD_NOT_A_COUNTRY = new Set([
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int', 'info', 'biz', 'io', 'co', 'me',
  'tv', 'app', 'dev', 'ai', 'news', 'blog', 'online', 'site', 'xyz', 'cc', 'ws',
  'to', 'ly', 'gl', 'fm', 'am', 'sh', 'st', 'la', 'nu', 'is', 'so', 'im', 'ag',
]);

/**
 * Il paese di un indirizzo web, dal suo dominio nazionale.
 *
 * Vale solo dove il dominio è davvero nazionale: "repubblica.it" è italiano,
 * "bbc.co.uk" britannico. Un ".com" non dice niente e resta senza paese —
 * meglio nessun dato che un dato inventato, perché su una mappa un colore
 * sbagliato è indistinguibile da uno giusto.
 */
export function countryFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let host: string;
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const parts = host.split('.');
  const tld = parts[parts.length - 1];
  if (!/^[a-z]{2}$/.test(tld)) return null;
  if (TLD_NOT_A_COUNTRY.has(tld)) return null;
  const a2 = TLD_EXCEPTIONS[tld] ?? tld;
  return A2_NAME[a2] ? a2 : null;
}

/** Nomi con cui i dati chiamano un paese, oltre a quello canonico. */
const ALIASES: Record<string, string> = {
  'united states of america': 'us', usa: 'us', 'u.s.': 'us', 'u.s.a.': 'us', america: 'us',
  'united kingdom': 'gb', uk: 'gb', britain: 'gb', 'great britain': 'gb', england: 'gb',
  scotland: 'gb', wales: 'gb', 'northern ireland': 'gb',
  'south korea': 'kr', 'korea, south': 'kr', 'republic of korea': 'kr',
  'north korea': 'kp', 'korea, north': 'kp',
  'dem. rep. congo': 'cd', 'democratic republic of the congo': 'cd', 'congo (kinshasa)': 'cd',
  'republic of the congo': 'cg', 'congo (brazzaville)': 'cg',
  'w. sahara': 'eh', 'western sahara': 'eh',
  'dominican rep.': 'do', 'central african rep.': 'cf', 'eq. guinea': 'gq',
  'bosnia and herz.': 'ba', 'bosnia and herzegovina': 'ba',
  'solomon is.': 'sb', 'falkland is.': 'fk', 's. sudan': 'ss',
  macedonia: 'mk', 'north macedonia': 'mk', eswatini: 'sz', swaziland: 'sz',
  'czech republic': 'cz', czechia: 'cz', turkey: 'tr', türkiye: 'tr',
  'cote d\'ivoire': 'ci', 'côte d’ivoire': 'ci', 'ivory coast': 'ci',
  'fr. s. antarctic lands': 'tf', 'timor-leste': 'tl', 'east timor': 'tl',
  burma: 'mm', myanmar: 'mm', holland: 'nl', 'the netherlands': 'nl',
  // Italiano: i fogli di calcolo arrivano scritti nella lingua di chi li ha fatti.
  italia: 'it', francia: 'fr', germania: 'de', spagna: 'es', 'regno unito': 'gb',
  'stati uniti': 'us', 'stati uniti d\'america': 'us', svizzera: 'ch', austria: 'at',
  belgio: 'be', 'paesi bassi': 'nl', olanda: 'nl', grecia: 'gr', turchia: 'tr',
  polonia: 'pl', romania: 'ro', svezia: 'se', danimarca: 'dk', norvegia: 'no',
  finlandia: 'fi', irlanda: 'ie', portogallo: 'pt', croazia: 'hr', slovenia: 'si',
  ungheria: 'hu', giappone: 'jp', cina: 'cn', india: 'in', brasile: 'br',
  messico: 'mx', argentina: 'ar', 'sudafrica': 'za', egitto: 'eg', marocco: 'ma',
  russia: 'ru', ucraina: 'ua', 'arabia saudita': 'sa', 'emirati arabi uniti': 'ae',
};

const BY_NAME = new Map<string, string>();
for (const [a2, name] of Object.entries(A2_NAME)) BY_NAME.set(name.toLowerCase(), a2);
for (const [name, a2] of Object.entries(ALIASES)) BY_NAME.set(name, a2);

/**
 * Da qualunque cosa scritta in una colonna "paese" al codice: un nome in
 * inglese o in italiano, un alpha-2, un alpha-3, un numerico.
 */
export function toCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim().toLowerCase().replace(/\s+/g, ' ');
  if (!s) return null;
  if (/^\d{1,3}$/.test(s)) return NUM_TO_A2.get(s.padStart(3, '0')) ?? null;
  if (/^[a-z]{2}$/.test(s)) return A2_NAME[s] ? s : null;
  return BY_NAME.get(s) ?? BY_NAME.get(s.replace(/[.]/g, '')) ?? null;
}

// ---------------------------------------------------------------------------
// Il recupero dello storico.
//
// Il paese è arrivato dopo: in archivio ci sono mention raccolte quando non lo
// si conservava. Il loro indirizzo però è ancora lì, e un dominio nazionale
// dice da dove viene una testata. Si ripassa a piccoli blocchi, così ogni
// raccolta ne recupera un pezzo senza pesare, finché non ne restano.
// ---------------------------------------------------------------------------

export async function backfillCountries(projectId: number, limit = 3000): Promise<number> {
  const { getDb } = await import('@/lib/db');
  const { sql } = await import('drizzle-orm');
  const db = await getDb();

  const rows = (await db.execute(sql`
    SELECT id, url FROM mentions
    WHERE project_id = ${projectId} AND country IS NULL AND url IS NOT NULL AND url <> ''
    LIMIT ${limit}
  `)).rows as { id: number; url: string }[];
  if (!rows.length) return 0;

  // Un solo UPDATE per paese: con duemila righe e venti paesi sono venti
  // istruzioni, non duemila.
  const byCountry = new Map<string, number[]>();
  for (const r of rows) {
    const a2 = countryFromUrl(r.url);
    if (!a2) continue;
    (byCountry.get(a2) ?? byCountry.set(a2, []).get(a2)!).push(r.id);
  }

  let done = 0;
  for (const [a2, ids] of byCountry) {
    for (let i = 0; i < ids.length; i += 500) {
      const chunk = ids.slice(i, i + 500);
      await db.execute(sql`
        UPDATE mentions SET country = ${a2}
        WHERE id IN (${sql.join(chunk.map((id) => sql`${id}`), sql`, `)})
      `);
      done += chunk.length;
    }
  }
  return done;
}
