import { ExternalLink, Heart, Info, MessageCircle, Repeat2, Star } from 'lucide-react';
import { SOURCE_META } from '@/lib/connectors';
import type { mentions } from '@/lib/db/schema';

/** Piccola "i" con balloon esplicativo al passaggio del mouse. */
export function InfoTip({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex align-middle">
      <Info className="size-3.5 cursor-help text-slate-500 hover:text-sky-400" />
      <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-40 mb-2 w-72 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-left text-[11px] font-normal normal-case leading-snug text-slate-300 opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
        {title && <span className="mb-0.5 block font-semibold text-sky-300">{title}</span>}
        {children}
        <span className="absolute left-1/2 top-full -mt-1 size-2 -translate-x-1/2 rotate-45 border-b border-r border-[var(--border)] bg-[var(--panel-2)]" />
      </span>
    </span>
  );
}

/** AI relevance stars (1-5) with an explanatory tooltip on hover. */
export function StarRating({ relevance, reason }: { relevance: number | null; reason?: string | null }) {
  if (!relevance) return null;
  return (
    <span className="group relative inline-flex items-center gap-px" aria-label={`Relevance ${relevance} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`size-3 ${i <= relevance ? 'fill-amber-400 text-amber-400' : 'fill-transparent text-slate-700'}`} />
      ))}
      {reason && (
        <span className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-60 -translate-x-1/2 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] px-3 py-2 text-[11px] font-normal normal-case leading-snug text-slate-300 opacity-0 shadow-xl transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
          <span className="mb-0.5 block font-semibold text-amber-300">Relevance {relevance}/5</span>
          {reason}
          <span className="absolute left-1/2 top-full -mt-1 size-2 -translate-x-1/2 rotate-45 border-b border-r border-[var(--border)] bg-[var(--panel-2)]" />
        </span>
      )}
    </span>
  );
}

export function PageHeader({ title, subtitle, info }: {
  title: string; subtitle?: string;
  /** Optional "what am I looking at" explanation shown on hovering an ⓘ next to the title. */
  info?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {info && <InfoTip title={`About: ${title}`}>{info}</InfoTip>}
      </div>
      {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
    </header>
  );
}

export function KpiCard({ label, value, hint, exact }: {
  label: string; value: string; hint?: string;
  /** Exact value shown on hover when the value is compacted */
  exact?: string;
}) {
  return (
    <div className="panel px-5 py-4" title={exact}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 cursor-default text-2xl font-bold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** 1234 → "1.2k", 1250000 → "1.3M" (en-US). */
export function fmtCompact(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function SourceBadge({ source }: { source: string }) {
  const meta = SOURCE_META[source] ?? { label: source, color: '#94a3b8' };
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
    >
      <span className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  );
}

// Sentiment styling and labels. Accepts both the current English values and
// legacy Italian values (positivo/neutro/negativo) from previously analyzed data.
const SENTIMENT_STYLE: Record<string, string> = {
  positive: 'bg-emerald-500/15 text-emerald-400',
  neutral: 'bg-slate-500/15 text-slate-400',
  negative: 'bg-red-500/15 text-red-400',
};

function normSentiment(s: string): 'positive' | 'neutral' | 'negative' {
  const map: Record<string, 'positive' | 'neutral' | 'negative'> = {
    positivo: 'positive', neutro: 'neutral', negativo: 'negative',
    positive: 'positive', neutral: 'neutral', negative: 'negative',
  };
  return map[s.toLowerCase()] ?? 'neutral';
}

export function SentimentBadge({ sentiment }: { sentiment: string | null }) {
  if (!sentiment) {
    return <span className="rounded-full bg-slate-700/40 px-2 py-0.5 text-[11px] text-slate-500">analyzing</span>;
  }
  const key = normSentiment(sentiment);
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${SENTIMENT_STYLE[key]}`}>
      {key}
    </span>
  );
}

export function fmtDate(d: Date | string) {
  return new Date(d).toLocaleString('en-US', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function fmtNum(n: number) {
  return n.toLocaleString('en-US');
}

type Mention = typeof mentions.$inferSelect;

/** Link to the author's profile on the source (or the post itself as a fallback). */
function authorLink(m: Mention): string | null {
  const h = (m.authorHandle ?? '').replace(/^@/, '').trim();
  switch (m.source) {
    case 'x': return h ? `https://x.com/${encodeURIComponent(h)}` : m.url;
    case 'bluesky': return h ? `https://bsky.app/profile/${encodeURIComponent(h)}` : m.url;
    case 'reddit': return h ? `https://www.reddit.com/user/${encodeURIComponent(h)}` : m.url;
    case 'hackernews': return h ? `https://news.ycombinator.com/user?id=${encodeURIComponent(h)}` : m.url;
    default: return m.url; // news outlets, telegram, mastodon, youtube → the original post/article
  }
}

export function MentionCard({ m, translated }: {
  m: Mention;
  /** Text translated into the reading language chosen by the user */
  translated?: { title?: string; content: string };
}) {
  const e = m.engagement;
  const aLink = authorLink(m);
  const title = translated?.title ?? m.title;
  const content = translated?.content ?? m.content;
  return (
    <article className="panel px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <SourceBadge source={m.source} />
        <SentimentBadge sentiment={m.sentiment} />
        <StarRating relevance={m.relevance} reason={m.relevanceReason} />
        {translated ? (
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300"
            title="Translated by AI — the link opens the original">
            🌐 translated{m.language ? ` · orig. ${m.language.toUpperCase()}` : ''}
          </span>
        ) : m.language && <span className="uppercase">{m.language}</span>}
        <span>{fmtDate(m.publishedAt)}</span>
        {m.community && <span className="text-slate-400">{m.community}</span>}
      </div>
      {title && (
        <h3 className="mt-1.5 text-sm font-semibold leading-snug">
          {m.url ? (
            <a href={m.url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-sky-300">
              {title}
            </a>
          ) : title}
        </h3>
      )}
      {content && content !== title && (
        <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-300">{content}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
        {m.author && (aLink ? (
          <a href={aLink} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-sky-300" title="Open the author on the source">
            {m.authorHandle ?? m.author}
          </a>
        ) : <span>{m.authorHandle ?? m.author}</span>)}
        {e && (
          <span className="flex items-center gap-2.5">
            {e.likes != null && <span className="flex items-center gap-1"><Heart className="size-3" />{fmtNum(e.likes)}</span>}
            {e.comments != null && <span className="flex items-center gap-1"><MessageCircle className="size-3" />{fmtNum(e.comments)}</span>}
            {e.shares != null && <span className="flex items-center gap-1"><Repeat2 className="size-3" />{fmtNum(e.shares)}</span>}
          </span>
        )}
        {m.topics && m.topics.length > 0 && (
          <span className="flex flex-wrap gap-1">
            {m.topics.map((t) => (
              <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-slate-400">{t}</span>
            ))}
          </span>
        )}
        {m.url && (
          <a href={m.url} target="_blank" rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 text-sky-400 hover:text-sky-300">
            open <ExternalLink className="size-3" />
          </a>
        )}
      </div>
    </article>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="panel flex flex-col items-center gap-2 px-6 py-14 text-center">
      <p className="text-sm text-slate-400">{message}</p>
    </div>
  );
}
