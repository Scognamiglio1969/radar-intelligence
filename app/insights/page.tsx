import Link from 'next/link';
import {
  Activity, Boxes, Gauge, Globe2, Grid3x3, HeartPulse, LayoutGrid, Orbit, Scale,
  ScatterChart, ShieldAlert, Sparkles, Triangle, TrendingDown, Waypoints, Network, Workflow,
} from 'lucide-react';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Explore insights' };

// Hub degli insight: 16 visualizzazioni raggruppate per DOMANDA a cui rispondono.
// In elenco nel menu erano illeggibili (metà delle voci) e il nome da solo non
// diceva a cosa servissero: qui ognuna arriva con la sua domanda.
const GROUPS: {
  title: string;
  hint: string;
  items: { href: string; label: string; icon: typeof Activity; question: string }[];
}[] = [
  {
    title: 'Shape of the conversation',
    hint: 'What is being talked about, and how the themes hang together',
    items: [
      { href: '/insights/topics', label: 'Topics × Sentiment', icon: ScatterChart, question: 'Which themes are big, which are loved or hated, which are growing?' },
      { href: '/insights/constellation', label: 'Semantic constellation', icon: Sparkles, question: 'Which words travel together, and with what tone?' },
      { href: '/insights/flow', label: 'Conversation flow', icon: Waypoints, question: 'Which source feeds which topic, and how does it end up in sentiment?' },
      { href: '/insights/clusters', label: 'Conversation clusters', icon: Boxes, question: 'Which families of discourse (the framings) split the conversation?' },
    ],
  },
  {
    title: 'People',
    hint: 'Who carries the conversation',
    items: [
      { href: '/insights/network', label: 'Influencer network', icon: Network, question: 'Who are the loudest voices, and which topic tribes do they form?' },
      { href: '/insights/pyramid', label: 'Author pyramid', icon: Triangle, question: 'Is reach concentrated in a few big voices or spread widely?' },
    ],
  },
  {
    title: 'Momentum & health',
    hint: 'Where it is heading, and how healthy it is',
    items: [
      { href: '/insights/health', label: 'Health Index', icon: Gauge, question: 'One 0–100 score: how healthy is the conversation — and your brand in it?' },
      { href: '/insights/momentum', label: 'Momentum quadrant', icon: LayoutGrid, question: 'Which topics are rising stars and which are fading?' },
      { href: '/insights/sov', label: 'Share of Voice', icon: Activity, question: 'How much of the conversation does each player own over time?' },
      { href: '/insights/waterfall', label: 'Sentiment waterfall', icon: TrendingDown, question: 'Day by day, what pushed the mood up or down?' },
      { href: '/insights/emotions', label: 'Emotion radar', icon: HeartPulse, question: 'Beyond positive/negative: joy, trust, fear, anger, sadness, surprise?' },
    ],
  },
  {
    title: 'Context',
    hint: 'Where and when it happens',
    items: [
      { href: '/insights/geo', label: 'Languages & geography', icon: Globe2, question: 'Which languages and areas are talking, and with what tone?' },
      { href: '/insights/heatmap', label: 'Hourly heatmap', icon: Grid3x3, question: 'Which days and hours does the conversation actually live?' },
    ],
  },
  {
    title: 'Your channels',
    hint: 'How your own posts do, against everything said about you',
    items: [
      { href: '/insights/owned', label: 'Owned vs Earned', icon: Scale, question: 'Are your own posts working, or is the conversation happening entirely without you?' },
    ],
  },
  {
    title: 'Risk',
    hint: 'What could go wrong, and what caused what',
    items: [
      { href: '/insights/crisis', label: 'Crisis radar', icon: ShieldAlert, question: 'How exposed are you right now, and what drove the last spike?' },
      { href: '/insights/causal', label: 'Cause & effect', icon: Workflow, question: 'Which events produced measurable consequences?' },
    ],
  },
  {
    title: 'The whole picture',
    hint: 'Everything at once, for a wall or a demo',
    items: [
      { href: '/insights/galaxy', label: 'Conversation Galaxy', icon: Orbit, question: 'The entire conversation as a living solar system.' },
    ],
  },
];

export default function InsightsHubPage() {
  const total = GROUPS.reduce((s, g) => s + g.items.length, 0);
  return (
    <>
      <PageHeader
        title="Explore insights"
        info={`All ${total} advanced visualizations, grouped by the question they answer rather than by chart type. Each one runs on the mentions your project has collected; the AI-powered ones (clusters, cause & effect) are generated on demand and cached for the day.`}
        subtitle={`${total} ways to read the same conversation, grouped by the question you are trying to answer. Every card says what it is for — pick the question, not the chart.`}
      />
      <div className="flex flex-col gap-6">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-sm font-semibold text-slate-200">{g.title}</h2>
              <span className="text-[11px] text-slate-600">{g.hint}</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map((it) => (
                <Link key={it.href} href={it.href} title={it.question}
                  className="panel group flex items-start gap-3 px-4 py-3 transition hover:border-sky-500/40 hover:bg-sky-500/[0.04]">
                  <it.icon className="mt-0.5 size-4 shrink-0 text-sky-400" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-200 transition group-hover:text-sky-200">{it.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">{it.question}</span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
