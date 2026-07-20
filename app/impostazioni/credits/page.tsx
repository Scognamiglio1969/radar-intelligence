import { PageHeader } from '@/components/ui';
import { Heart, Scale, Package, Image as ImageIcon, Database, ShieldAlert, ExternalLink } from 'lucide-react';

export const metadata = { title: 'Credits & Legal' };

const DEPS: { name: string; license: string; url: string }[] = [
  { name: 'Next.js', license: 'MIT', url: 'https://github.com/vercel/next.js' },
  { name: 'React', license: 'MIT', url: 'https://react.dev' },
  { name: 'three.js', license: 'MIT', url: 'https://threejs.org' },
  { name: 'Recharts', license: 'MIT', url: 'https://recharts.org' },
  { name: 'Tailwind CSS', license: 'MIT', url: 'https://tailwindcss.com' },
  { name: 'Drizzle ORM', license: 'Apache-2.0', url: 'https://orm.drizzle.team' },
  { name: 'PGlite', license: 'Apache-2.0', url: 'https://pglite.dev' },
  { name: 'Neon serverless driver', license: 'MIT', url: 'https://github.com/neondatabase/serverless' },
  { name: '@anthropic-ai/sdk', license: 'MIT', url: 'https://github.com/anthropics/anthropic-sdk-typescript' },
  { name: 'lucide-react (icons)', license: 'ISC', url: 'https://lucide.dev' },
  { name: 'ExcelJS', license: 'MIT', url: 'https://github.com/exceljs/exceljs' },
  { name: 'PptxGenJS', license: 'MIT', url: 'https://gitbrent.github.io/PptxGenJS/' },
  { name: 'docx', license: 'MIT', url: 'https://github.com/dolanmiu/docx' },
  { name: 'PDFKit', license: 'MIT', url: 'https://pdfkit.org' },
  { name: 'jsPDF', license: 'MIT', url: 'https://github.com/parallax/jsPDF' },
  { name: 'marked', license: 'MIT', url: 'https://marked.js.org' },
  { name: 'fast-xml-parser', license: 'MIT', url: 'https://github.com/NaturalIntelligence/fast-xml-parser' },
  { name: 'date-fns', license: 'MIT', url: 'https://date-fns.org' },
];

const SOURCES = 'GDELT · Google News · Bluesky · Mastodon · Hacker News (Algolia) · Telegram · RSS/Atom · Reddit · YouTube · X · Meta (Instagram/Facebook) · TikTok · LinkedIn · NewsAPI';

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-sky-400 hover:text-sky-300">
      {children}<ExternalLink className="size-3" />
    </a>
  );
}

export default function CreditsPage() {
  return (
    <>
      <PageHeader title="Credits & Legal" subtitle="Who built Radar, what it's made of, and the terms it's released under." />

      <div className="flex max-w-2xl flex-col gap-4">
        {/* Chi */}
        <section className="panel px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><Heart className="size-4 text-pink-400" /> Made by</h2>
          <div className="flex flex-col gap-2 text-sm text-slate-300">
            <p><span className="text-slate-500">Creator & product:</span> <span className="font-medium text-slate-100">Massimo Scognamiglio</span> — idea, design, direction and every decision behind Radar.</p>
            <p><span className="text-slate-500">Built in pair with:</span> <span className="font-medium text-slate-100">Claude</span> by <Ext href="https://www.anthropic.com">Anthropic</Ext> — the AI collaborator that wrote and shaped the code side by side with the author, and that also powers Radar’s in-app AI features (sentiment, emotion, briefs, clustering, Content Studio…).</p>
            <p className="text-xs text-slate-500">A one-person team plus an AI partner — enterprise-grade media intelligence at a thousandth of the price. And yes, we had a lot of fun together. 🐣</p>
          </div>
        </section>

        {/* Licenza */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300"><Scale className="size-4 text-sky-400" /> License</h2>
          <p className="text-sm text-slate-300">
            Radar is <span className="font-medium text-slate-100">free and open source</span> under the{' '}
            <Ext href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</Ext> license.
            © {new Date().getFullYear()} Massimo Scognamiglio and contributors.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            If you run a modified version as a network service, the AGPL requires you to make your source available under the same license.
            Source code: <Ext href="https://github.com/Scognamiglio1969/radar-intelligence">github.com/Scognamiglio1969/radar-intelligence</Ext>.
          </p>
        </section>

        {/* Open source */}
        <section className="panel px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><Package className="size-4 text-violet-400" /> Built with open source</h2>
          <p className="mb-3 text-xs text-slate-500">Radar stands on the shoulders of these projects. Each package’s authoritative license text ships in its own folder under <code className="text-slate-400">node_modules/</code>.</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 sm:grid-cols-3">
            {DEPS.map((d) => (
              <div key={d.name} className="flex flex-col text-xs">
                <Ext href={d.url}>{d.name}</Ext>
                <span className="text-slate-600">{d.license}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Media / asset */}
        <section className="panel px-5 py-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-300"><ImageIcon className="size-4 text-emerald-400" /> Media & assets</h2>
          <ul className="flex flex-col gap-2 text-xs text-slate-400">
            <li>
              Planet, sun and moon textures in the <span className="text-slate-300">Conversation Galaxy</span> — © <Ext href="https://www.solarsystemscope.com/textures/">Solar System Scope</Ext>, licensed <span className="text-slate-300">CC BY 4.0</span>.
            </li>
            <li>
              Egg photo (easter egg) — “White chicken egg” via <Ext href="https://commons.wikimedia.org/wiki/File:White_chicken_egg_square.jpg">Wikimedia Commons</Ext>, <span className="text-slate-300">CC BY 2.0</span>.
            </li>
            <li>
              Chick photo (easter egg) — “Day old chick” via <Ext href="https://commons.wikimedia.org/wiki/File:Day_old_chick_white_background.jpg">Wikimedia Commons</Ext>, <span className="text-slate-300">GFDL 1.2</span>.
            </li>
          </ul>
        </section>

        {/* Fonti dati */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300"><Database className="size-4 text-amber-400" /> Data sources</h2>
          <p className="text-xs leading-relaxed text-slate-400">
            Radar reads publicly available data from: <span className="text-slate-300">{SOURCES}</span>.
            All trademarks and content belong to their respective owners; Radar is not affiliated with or endorsed by any of them.
          </p>
        </section>

        {/* Legale */}
        <section className="panel px-5 py-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300"><ShieldAlert className="size-4 text-red-400" /> Legal & responsible use</h2>
          <p className="text-xs leading-relaxed text-slate-400">
            Radar is provided <span className="text-slate-300">“as is”, without warranty of any kind</span>. You are responsible for complying with the
            Terms of Service of each data source and with applicable data-protection laws (e.g. GDPR) in your jurisdiction. Some sources restrict
            automated access — enable only what you are entitled to use. AI outputs can be imprecise or biased and should be reviewed before acting on them.
            To report a security issue, see <Ext href="https://github.com/Scognamiglio1969/radar-intelligence/blob/main/SECURITY.md">SECURITY.md</Ext>.
          </p>
        </section>

        <p className="pb-6 text-center text-[11px] text-slate-600">Made with curiosity by a human and an AI. 🛰️</p>
      </div>
    </>
  );
}
