import {
  Radar, LayoutDashboard, Ear, Newspaper, BarChart3, Users,
  Star, Bell, FileText, Settings, MessageSquareText, GitBranch,
  Diff, PenLine, MonitorPlay, Network, History, LayoutGrid, Lightbulb,
  MessageSquareQuote, Euro, Award, Trophy, FileClock, BookOpen, LineChart,
  UserRound, Shapes, UploadCloud,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Le destinazioni di Radar, in un posto solo.
//
// Le usano il menù laterale e la ricerca rapida (⌘K): due modi di arrivare
// nello stesso posto, e nessuno dei due deve poter dimenticare una pagina.
//
// Due cose che il menù non riusciva a dire da solo:
//
//   PESO — quattro voci si aprono ogni giorno, le altre una volta al mese.
//   Un elenco dove "Dashboard" e "Stakeholder map" hanno la stessa dimensione
//   costringe a leggerle tutte per trovarne una. `primary` le distingue: si
//   legge per peso, non per posizione, e non serve un clic in più.
//
//   PARENTELA — pagine che rispondono alla stessa domanda erano quattro voci
//   diverse. Ora sono schede dentro una pagina sola: le voci del menù calano,
//   ma non si nasconde niente — le schede sono lì, visibili.
// ---------------------------------------------------------------------------

export type NavLink = {
  href: string;
  label: string;
  /** Chiave di traduzione. */
  key: string;
  icon: typeof Radar;
  /** Aperta ogni giorno: nel menù pesa di più. */
  primary?: boolean;
  accent?: 'reviews' | 'sport' | 'wikipedia';
  /** Parole con cui la si cerca ma che non compaiono nell'etichetta. */
  also?: string[];
};

export type NavItem = NavLink | { section: string; key: string };

export const NAV: NavItem[] = [
  { section: 'Monitor', key: 'nav.monitor' },
  { href: '/', label: 'Dashboard', key: 'nav.dashboard', icon: LayoutDashboard, primary: true },
  { href: '/listening', label: 'Listening', key: 'nav.listening', icon: Ear, primary: true, also: ['mentions', 'post', 'stream'] },
  { href: '/media', label: 'Media', key: 'nav.media', icon: Newspaper, also: ['news', 'stories', 'press'] },
  { href: '/alerts', label: 'Alerts', key: 'nav.alerts', icon: Bell, primary: true, also: ['spike', 'warning'] },
  { href: '/changes', label: 'What changed', key: 'nav.changes', icon: Diff, also: ['diff', 'since'] },

  { section: 'Analyze', key: 'nav.analyze' },
  { href: '/insights', label: 'Explore insights', key: 'nav.insights', icon: LayoutGrid, primary: true, also: ['charts', 'galaxy', 'map', 'emotions', 'flow'] },
  { href: '/audience', label: 'Audience', key: 'nav.audience', icon: Users, also: ['authors', 'communities'] },
  { href: '/benchmark', label: 'Benchmark', key: 'nav.benchmark', icon: BarChart3, also: ['competitors', 'share of voice', 'sov', 'trends'] },
  { href: '/content', label: 'Top content', key: 'nav.content', icon: Star, also: ['best posts', 'quality'] },
  { href: '/emv', label: 'Media value', key: 'nav.emv', icon: Euro, also: ['emv', 'earned'] },
  { href: '/measures', label: 'Measures & people', key: 'nav.measures', icon: LineChart, also: ['people', 'personal branding', 'followers', 'metrics', 'spreadsheet'] },
  { href: '/graph', label: 'Studio Graph', key: 'nav.graph', icon: Shapes, also: ['chart builder', 'axes'] },

  { section: 'Interpret', key: 'nav.interpret' },
  { href: '/pov', label: 'Point of View', key: 'nav.pov', icon: Lightbulb, also: ['thesis', 'pov'] },
  { href: '/story', label: 'Story & stakeholders', key: 'nav.story', icon: GitBranch, also: ['narratives', 'timeline', 'stakeholders', 'messages', 'pull-through'] },
  { href: '/ask', label: 'Ask the data', key: 'nav.ask', icon: MessageSquareText, also: ['question', 'chat'] },

  { section: 'Create', key: 'nav.create' },
  { href: '/report', label: 'Custom report', key: 'nav.report', icon: BookOpen, also: ['pdf', 'export', 'pages'] },
  { href: '/studio', label: 'Content Studio', key: 'nav.studio', icon: PenLine, also: ['ideas', 'hooks', 'copy'] },
  { href: '/brief', label: 'Daily brief', key: 'nav.brief', icon: FileText },
  { href: '/tv', label: 'War Room', key: 'nav.tv', icon: MonitorPlay, also: ['wall', 'screen'] },

  { section: 'Setup', key: 'nav.setup' },
  { href: '/settings', label: 'Projects', key: 'nav.settings', icon: Settings, also: ['sources', 'keys', 'budget', 'delete'] },
  { href: '/import', label: 'Import a file', key: 'nav.import', icon: UploadCloud, also: ['excel', 'csv', 'upload', 'sheet'] },

  { section: '', key: '' },
  { section: 'Beyond mentions', key: 'nav.beyondSection' },
  { href: '/reviews', label: 'Reviews', key: 'nav.reviews', icon: Award, accent: 'reviews', also: ['stars', 'app store', 'yelp'] },
  { href: '/sport', label: 'Sport', key: 'nav.sport', icon: Trophy, accent: 'sport', also: ['matches', 'club'] },
  { href: '/wikipedia', label: 'Wikipedia', key: 'nav.wikipedia', icon: FileClock, accent: 'wikipedia', also: ['edits', 'revert'] },
];

/** Le sole destinazioni, senza le intestazioni di sezione. */
export const NAV_LINKS = NAV.filter((i): i is NavLink => 'href' in i);

/**
 * Le pagine che ora vivono come schede dentro un'altra.
 *
 * Restano raggiungibili al loro indirizzo — un link salvato non deve morire
 * per una riorganizzazione del menù — e la ricerca continua a trovarle.
 */
export const NAV_TABS: NavLink[] = [
  { href: '/narratives', label: 'Narratives', key: 'nav.narratives', icon: GitBranch },
  { href: '/timeline', label: 'Timeline', key: 'nav.timeline', icon: History },
  { href: '/stakeholders', label: 'Stakeholder map', key: 'nav.stakeholders', icon: Network },
  { href: '/messages', label: 'Message pull-through', key: 'nav.messages', icon: MessageSquareQuote },
  { href: '/people', label: 'People', key: 'nav.people', icon: UserRound },
];

/** Tutto ciò che la ricerca rapida può aprire. */
export const SEARCHABLE: NavLink[] = [...NAV_LINKS, ...NAV_TABS];
