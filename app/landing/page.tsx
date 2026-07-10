import Link from 'next/link';
import {
  Ear, Star, Flame, FileText, MonitorPlay, GitBranch, MessageSquareText,
  PenLine, Share2, Radar as RadarIcon, ArrowRight, Sparkles, Globe2,
  Database, Wallet, Check, X as XMark, Minus, ScatterChart,
} from 'lucide-react';
import { ParticleField } from '@/components/particle-field';
import { Brand } from '@/components/brand';

export const metadata = { title: 'Radar — open-source media intelligence' };

const FEATURES = [
  {
    icon: Ear, color: 'text-sky-400',
    title: 'Multi-channel listening',
    text: '9 free public sources: worldwide news via GDELT (100,000+ outlets in 65+ languages) and Google News, plus Reddit, Bluesky, Mastodon, YouTube, Telegram and unlimited RSS feeds. Plus 6 ready premium connectors: X, Instagram, Facebook, TikTok, LinkedIn and NewsAPI (150,000 outlets).',
  },
  {
    icon: Star, color: 'text-amber-400',
    title: 'Star relevance',
    text: 'Every item is read by AI and rated 1 to 5 stars against your topic, with the reason why. The noise disappears.',
  },
  {
    icon: Flame, color: 'text-orange-400',
    title: 'Trend radar',
    text: 'Topics accelerating abnormally are caught before they explode, with an explanation of why they are growing.',
  },
  {
    icon: FileText, color: 'text-emerald-400',
    title: 'Executive daily brief',
    text: 'Every morning, an AI-written briefing on the last 24 hours: what happened, sentiment, risks and opportunities.',
  },
  {
    icon: MonitorPlay, color: 'text-red-400',
    title: 'Live War Room',
    text: 'A full-screen control room with an animated radar, counters and a continuous feed. Project it in a meeting or on an office screen.',
  },
  {
    icon: GitBranch, color: 'text-violet-400',
    title: 'Narratives & coordination',
    text: 'Not just what is said: who is pushing which thesis, flagging suspicious coordination patterns.',
  },
  {
    icon: MessageSquareText, color: 'text-cyan-400',
    title: 'Ask the data',
    text: 'A conversational AI analyst: ask questions in plain language and get answers backed by numbers and citations as evidence.',
  },
  {
    icon: ScatterChart, color: 'text-fuchsia-400',
    title: 'Advanced insights',
    text: 'Topics × Sentiment map, hourly heatmap, sentiment waterfall, conversation clusters and a cause-effect chart: visual analyses standard tools don’t offer.',
  },
  {
    icon: PenLine, color: 'text-pink-400',
    title: 'Advanced Content Studio',
    text: 'From a concept to a multi-format kit — LinkedIn, X thread, Instagram, video hook, newsletter — plus 10 alternative hooks and conversational refinement of every draft, in the brand’s voice.',
  },
  {
    icon: Share2, color: 'text-teal-400',
    title: 'Export & sharing',
    text: 'PDF, Excel, Word, PowerPoint with editable charts. And read-only expiring links for managers and clients.',
  },
];

// ✓ = included, ~ = partial/limited, ✗ = not available
type MarkValue = 'si' | 'parz' | 'no';
type CompareRow = [string, MarkValue, MarkValue, string?, string?]; // [feature, competitor, radar, competitorNote, radarNote]

const COMPARISON: { cat: string; rows: CompareRow[] }[] = [
  {
    cat: 'Public sources (free in Radar)',
    rows: [
      ['Worldwide news (GDELT)', 'si', 'si', 'included', '100,000+ outlets, 65+ languages'],
      ['Aggregated news (Google News)', 'si', 'si', , 'thousands of outlets'],
      ['Reddit, Bluesky, Mastodon, Hacker News', 'parz', 'si', , 'public social, no keys'],
      ['YouTube', 'si', 'si', , 'free key'],
      ['Public Telegram channels', 'parz', 'si', , 'channel watchlist'],
      ['Unlimited RSS/Atom feeds', 'parz', 'si', , 'outlets, blogs, Google Alerts'],
      ['30+ language coverage', 'si', 'si'],
      ['Boolean queries (AND / OR / NOT) and geographies', 'si', 'si'],
    ],
  },
  {
    cat: 'Premium sources (private, paid)',
    rows: [
      ['NewsAPI, 150,000 news outlets', 'si', 'parz', 'included in license', 'connector ready, key separate'],
      ['X (Twitter)', 'si', 'parz', 'included', 'connector ready, key separate'],
      ['Instagram & Facebook (Meta)', 'si', 'parz', 'included', 'connectors ready, token separate'],
      ['TikTok', 'si', 'parz', 'included', 'connector ready, access separate'],
      ['LinkedIn', 'si', 'parz', 'included', 'connector ready, token separate'],
      ['Multi-year historical archive', 'si', 'no', , '90 days, extendable'],
    ],
  },
  {
    cat: 'AI analysis',
    rows: [
      ['Multilingual sentiment', 'si', 'si'],
      ['Automatic topics & entities', 'si', 'si'],
      ['Explained 1–5 relevance per item', 'no', 'si', , 'with AI rationale'],
      ['Built-in news translation', 'parz', 'si', , '8 languages, permanent cache'],
      ['AI-written executive daily brief', 'parz', 'si'],
      ['Conversational analyst over your data', 'no', 'si', , '“Ask the data”'],
      ['Semantic search by concept', 'parz', 'si'],
      ['Natural-language topic definition', 'no', 'si'],
    ],
  },
  {
    cat: 'Advanced insights',
    rows: [
      ['Topics × Sentiment map (quadrant bubbles)', 'parz', 'si', , 'volume, sentiment, growth'],
      ['Hourly & daily heatmap', 'parz', 'si'],
      ['Sentiment waterfall (what moved the tone)', 'no', 'si'],
      ['Conversation clusters (families of discourse)', 'no', 'si'],
      ['Cause-effect chart (events → consequences)', 'no', 'si'],
    ],
  },
  {
    cat: 'Intelligence',
    rows: [
      ['Alerts on volume spikes & sentiment drops', 'si', 'si'],
      ['Emerging trends with the “why”', 'parz', 'si'],
      ['Coordinated-narrative detection', 'no', 'si'],
      ['Crisis playbook with draft statement', 'no', 'si', , '30 seconds from the alert'],
      ['Historical timeline of industry events', 'no', 'si'],
      ['Actor & stakeholder map', 'parz', 'si'],
      ['Natural-language weekly comparison', 'no', 'si'],
      ['Benchmark & share of voice', 'si', 'si'],
      ['Push notifications', 'si', 'si', 'email & app', 'Telegram'],
      ['Audience demographics (age, gender)', 'si', 'no', , 'not derivable from accessible sources'],
    ],
  },
  {
    cat: 'Output & collaboration',
    rows: [
      ['Excel, Word, PDF export', 'si', 'si'],
      ['PowerPoint with editable charts', 'parz', 'si', 'static images', 'native Office charts'],
      ['Shareable reports with expiry', 'si', 'si'],
      ['War Room / animated live display', 'parz', 'si', 'TV dashboard', 'rotating animated view'],
      ['Content Studio: multi-format kit (5 channels)', 'no', 'si', , 'from one concept to every channel'],
      ['Content Studio: Hook Lab + conversational editing', 'no', 'si'],
      ['Influencer profiles with outreach draft', 'parz', 'si'],
      ['Multi-project', 'si', 'si'],
    ],
  },
  {
    cat: 'Platform',
    rows: [
      ['Open source & self-hostable', 'no', 'si', , 'AGPL-3.0'],
      ['Data in your own database', 'no', 'si'],
      ['Custom features in days', 'no', 'si', 'vendor roadmap'],
      ['Configurable AI spend cap', 'no', 'si'],
      ['No contractual lock-in', 'no', 'si', 'annual contracts'],
    ],
  },
];

function CheckIcon() { return <Check className="inline size-4 text-emerald-400" aria-label="included" />; }
function XIcon() { return <XMark className="inline size-4 text-red-400" aria-label="not available" />; }
function PartialIcon() { return <Minus className="inline size-4 text-amber-400" aria-label="partial" />; }

function Mark({ v, note }: { v: MarkValue; note?: string }) {
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      {v === 'si' ? <CheckIcon /> : v === 'no' ? <XIcon /> : <PartialIcon />}
      {note && <span className="max-w-[150px] text-[10px] leading-tight text-slate-500">{note}</span>}
    </span>
  );
}

const STEPS = [
  { n: '01', title: 'Describe your topic', text: 'In plain language too: AI turns the description into a multilingual monitoring query.' },
  { n: '02', title: 'Radar works on its own', text: 'It collects, translates, rates and organizes content every day. Automatic alerts if something blows up.' },
  { n: '03', title: 'You decide', text: 'Dashboards, briefs, maps and export-ready reports: decisions made with the data in front of you.' },
];

export default function LandingPage() {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#04070f] text-slate-200">
      {/* backgrounds */}
      <div className="pointer-events-none fixed inset-0">
        <ParticleField />
        <div aria-hidden className="absolute -right-[30vmax] -top-[30vmax] size-[80vmax] rounded-full opacity-[0.07]"
          style={{ background: 'conic-gradient(from 0deg, transparent 0deg, #38bdf8 25deg, transparent 60deg)', animation: 'radarsweep 16s linear infinite' }} />
        <div aria-hidden className="tv-aurora absolute -left-[15vmax] top-[30vmax] size-[55vmax] rounded-full opacity-[0.08]"
          style={{ background: 'radial-gradient(circle, #7c3aed 0%, transparent 60%)' }} />
      </div>

      {/* header */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center gap-4 px-5 py-5 sm:px-8">
        <Brand />
        <Link href="/login"
          className="ml-auto rounded-lg bg-sky-500/90 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400">
          Sign in
        </Link>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 sm:px-8">
        {/* hero */}
        <section className="tv-3d flex flex-col items-center py-16 text-center sm:py-24">
          <span className="mb-6 flex items-center gap-2 rounded-full border border-sky-500/30 bg-sky-500/10 px-4 py-1.5 text-xs font-medium tracking-wide text-sky-300">
            <Sparkles className="size-3.5" /> AI-powered media intelligence
          </span>
          <h1 className="max-w-3xl text-4xl font-black leading-[1.08] tracking-tight sm:text-6xl">
            Everything the world says about your topic.{' '}
            <span className="bg-gradient-to-r from-sky-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
              Understood, rated, briefed.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            Radar listens to news and social in 30+ languages, judges the relevance of every item,
            catches trends before they explode, and writes your briefing every morning.
            The work of an enterprise platform, without the enterprise price.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/login"
              className="flex items-center gap-2 rounded-xl bg-sky-500 px-7 py-3 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:bg-sky-400">
              Open Radar <ArrowRight className="size-4" />
            </Link>
            <a href="#features"
              className="rounded-xl border border-[var(--border)] px-7 py-3 text-base font-medium text-slate-300 transition hover:bg-white/5">
              See the features
            </a>
          </div>
        </section>

        {/* numbers */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            [<Database key="i" className="mx-auto size-5 text-sky-400" />, '15', 'sources · 9 free + 6 premium'],
            [<Globe2 key="i" className="mx-auto size-5 text-violet-400" />, '30+', 'languages analyzed'],
            [<Sparkles key="i" className="mx-auto size-5 text-amber-400" />, '20', 'intelligence modules'],
            [<Wallet key="i" className="mx-auto size-5 text-emerald-400" />, '<1%', 'of the cost of enterprise tools'],
          ].map(([icon, big, small], i) => (
            <div key={i} className="tv-shine rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 px-4 py-6 text-center backdrop-blur">
              {icon}
              <p className="mt-2 text-3xl font-black tracking-tight">{big}</p>
              <p className="mt-1 text-xs text-slate-500">{small}</p>
            </div>
          ))}
        </section>

        {/* philosophy — open-source manifesto */}
        <section className="mx-auto max-w-3xl py-20 text-center sm:py-24">
          <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-400">Open source</p>
          <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">Enterprise power, at a thousandth of the price</h2>
          <div className="mt-6 flex flex-col gap-4 text-left text-base leading-relaxed text-slate-400 sm:text-lg">
            <p>
              Commercial listening platforms cost <strong className="text-slate-200">thousands of euros a month</strong> and
              lock their intelligence behind annual contracts. Radar is <strong className="text-slate-200">open source</strong>:
              the same core workflow — listen, analyze, decide, create — built on <strong className="text-slate-200">free public
              data</strong> and the Claude API, that anyone can run for the price of an API key. Or nothing at all, if you just
              want to collect data.
            </p>
            <p>
              It began as a one-person project with a simple conviction: in the age of AI, a single person who orchestrates
              models well can put <strong className="text-slate-200">enterprise-grade tools</strong> in anyone’s hands. Building
              it in the open turns that into a shared, extensible foundation — <strong className="text-slate-200">bring your own
              keys</strong>, own your data, and shape the tool to your needs. The AI collects, reads, evaluates, writes and
              alerts; <strong className="text-slate-200">the decisions stay with people.</strong>
            </p>
            <blockquote className="flex flex-col gap-3 border-l-2 border-violet-500/50 pl-4 italic text-slate-300">
              <p>
                “The capabilities that used to cost thousands a month, in the hands of anyone — for a thousandth of the price.
              </p>
              <p>
                That is the whole point of building this out in the open: democratizing media intelligence, one deployment at a time.”
              </p>
            </blockquote>
          </div>
        </section>

        {/* features */}
        <section id="features" className="pb-8">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">What Radar does</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
            The features of enterprise social-intelligence platforms, rethought with generative AI at the core.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title}
                className="group rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 px-6 py-6 backdrop-blur transition hover:border-sky-500/40 hover:bg-[var(--panel)]">
                <f.icon className={`size-6 ${f.color}`} />
                <h3 className="mt-3 text-base font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* comparison */}
        <section className="py-16">
          <h2 className="text-center text-3xl font-black tracking-tight sm:text-4xl">Radar vs Competitor products</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-sm text-slate-500">
            Feature by feature, an honest comparison with the leading enterprise platforms.
          </p>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-[var(--border)] bg-[var(--panel)]/70 backdrop-blur">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left">
                  <th className="px-5 py-4 font-semibold text-slate-400">Feature</th>
                  <th className="w-40 px-4 py-4 text-center font-semibold text-slate-300">Competitor products</th>
                  <th className="w-40 bg-sky-500/10 px-4 py-4 text-center font-bold text-sky-300">Radar</th>
                </tr>
              </thead>
              <tbody className="text-slate-400">
                {COMPARISON.map((group) => (
                  [
                    <tr key={group.cat}>
                      <td colSpan={3} className="border-b border-[var(--border)]/60 bg-white/[0.03] px-5 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                        {group.cat}
                      </td>
                    </tr>,
                    ...group.rows.map(([feat, tw, radar, twNote, radarNote]) => (
                      <tr key={feat} className="border-b border-[var(--border)]/40 last:border-0">
                        <td className="px-5 py-2.5 text-[13px] font-medium text-slate-300">{feat}</td>
                        <td className="px-4 py-2.5 text-center"><Mark v={tw} note={twNote} /></td>
                        <td className="bg-sky-500/5 px-4 py-2.5 text-center"><Mark v={radar} note={radarNote} /></td>
                      </tr>
                    )),
                  ]
                ))}
                <tr>
                  <td className="px-5 py-4 text-[13px] font-bold text-slate-200">Monthly cost</td>
                  <td className="px-4 py-4 text-center text-sm font-bold text-red-300">€800–2,000+</td>
                  <td className="bg-sky-500/10 px-4 py-4 text-center text-sm font-bold text-emerald-300">~€10–40</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1"><CheckIcon /> included</span>
            <span className="flex items-center gap-1"><PartialIcon /> partial or limited</span>
            <span className="flex items-center gap-1"><XIcon /> not available</span>
          </div>
        </section>

        {/* how it works */}
        <section className="py-20">
          <h2 className="text-center text-3xl font-black tracking-tight">How it works</h2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="relative rounded-2xl border border-[var(--border)] bg-[var(--panel)]/50 px-6 py-7">
                <span className="bg-gradient-to-b from-sky-300 to-sky-600 bg-clip-text text-4xl font-black text-transparent">{s.n}</span>
                <h3 className="mt-3 text-base font-bold">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* final CTA */}
        <section className="pb-20">
          <div className="tv-shine relative overflow-hidden rounded-3xl border border-sky-500/30 bg-gradient-to-br from-[#0c1a38] to-[#0a0f22] px-6 py-14 text-center sm:px-10">
            <RadarIcon className="mx-auto size-10 text-sky-400" />
            <h2 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">
              Your industry is talking. Radar is already listening.
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-400">
              Sign in with your credentials and open the dashboard: the data is already there.
            </p>
            <Link href="/login"
              className="mt-7 inline-flex items-center gap-2 rounded-xl bg-sky-500 px-8 py-3 text-base font-bold text-slate-950 shadow-lg shadow-sky-500/25 transition hover:bg-sky-400">
              Sign in to Radar <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--border)]/60 py-8 text-center text-xs text-slate-600">
        Radar · open-source media intelligence, orchestrated with AI.
      </footer>
    </div>
  );
}
