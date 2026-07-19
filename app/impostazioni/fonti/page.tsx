import { Info } from 'lucide-react';
import { getMeta } from '@/lib/db';
import { CONNECTORS } from '@/lib/connectors';
import { getConnectorCredStatuses, hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { ConnectorKeys } from '@/components/connector-keys';
import { PageHeader, fmtDate } from '@/components/ui';
import type { SourceStatus } from '@/lib/ingest';

export const metadata = { title: 'Sources' };

// What each source is and what data Radar collects from it: shown in the hover tooltip.
const SOURCE_INFO: Record<string, string> = {
  googlenews: 'Google’s news aggregator. Collects public articles from thousands of outlets matching your keywords, with title, outlet and date. Ideal for mainstream press coverage.',
  gdelt: 'Global news index in 65+ languages (100,000+ outlets worldwide). Collects international articles by keyword: perfect for multilingual, cross-country monitoring.',
  reddit: 'Public discussions from subreddits. Collects posts and comments citing your terms, with votes and the community they belong to. Great for opinions and raw sentiment.',
  bluesky: 'Open social network (AT Protocol). Collects public posts by keyword, with author and interactions. Good for tech conversations and early adopters.',
  mastodon: 'Federated social network. Collects public posts (toots) from instances that mention your terms, with author and engagement.',
  hackernews: 'Y Combinator’s tech community. Collects stories and comments citing your terms, with score and discussion. Great for technology and startup topics.',
  youtube: 'Public YouTube videos. Collects videos by keyword with title, channel, date and views. Requires a free Google key.',
  telegram: 'Only the public channels you choose (set them in the project): Radar reads those channels’ messages. It does not search across all of Telegram.',
  rss: 'Any site, blog or outlet offering an RSS/Atom feed. Add the URLs in the project and Radar collects their articles automatically. Unlimited feeds.',
  x: 'Public X (Twitter) posts in real time by keyword, with author, hashtags and engagement (likes, reposts, replies). Requires a paid API (Basic plan).',
  instagram: 'Hashtag search via the Meta Graph API: collects public posts using the hashtags tied to your keywords, with author and interactions. Requires a Business account + Meta app.',
  facebook: 'Posts of the pages you link to your token (watchlist model), not all of Facebook. Collects those pages’ posts with reactions, comments and shares.',
  tiktok: 'Public videos via the Research API (approval-gated by TikTok). Collects videos by keyword with description, hashtags and metrics (likes, comments, views).',
  linkedin: 'Posts from your company page via the official LinkedIn API (full text, real metrics). LinkedIn does not allow public third-party search, so this covers ONLY your organization — for everyone else’s public posts see "LinkedIn (web)".',
  linkedin_web: 'Public LinkedIn posts and articles by ANY author, found through the Tavily search index (official API, 1,000 free searches/month). A different acquisition model from "LinkedIn (page)": you get partial excerpts with a link to the original, but no engagement metrics. Legal: it queries Tavily, never LinkedIn’s servers.',
  newsapi: 'Aggregator of ~150,000 outlets with full-text boolean search. Collects articles by advanced query: a premium alternative to GDELT/Google News. Requires an API key.',
};

export default async function FontiPage() {
  // Hydrate saved keys before reading the "active" status of the connectors.
  await hydrateConnectorCredentials();
  const [sourceStatus, credStatuses, currentUser] = await Promise.all([
    getMeta<SourceStatus>('source_status'), getConnectorCredStatuses(), getCurrentUser(),
  ]);
  const canEditKeys = isAdmin(currentUser);

  return (
    <>
      <PageHeader
        title="Sources"
        subtitle="Status of the listening sources and their API keys. AI spend and budget are in the Budget tab."
      />

      <div className="max-w-3xl">
        <section className="panel px-5 py-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-300">Source status</h2>

          <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-emerald-400/80">Free</p>
          <div className="flex flex-col gap-2">
            {CONNECTORS.filter((c) => c.tier === 'free').map((c) => <SourceRow key={c.id} c={c} st={sourceStatus?.[c.id]} />)}
          </div>

          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-widest text-sky-400/80">
            Free · requires a free key
          </p>
          <p className="mb-2 text-[11px] text-slate-600">
            Free, but you need to register a free API key with the service. Enter it here: the source turns on right away.
          </p>
          <div className="flex flex-col gap-3">
            {CONNECTORS.filter((c) => c.tier === 'freekey').map((c) => (
              <div key={c.id}>
                <SourceRow c={c} st={sourceStatus?.[c.id]} />
                {canEditKeys && credStatuses[c.id] && (
                  <ConnectorKeys connectorId={c.id} fields={credStatuses[c.id].fields} />
                )}
              </div>
            ))}
          </div>

          <p className="mb-2 mt-4 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-400/80">
            Premium — paid
          </p>
          <p className="mb-2 text-[11px] text-slate-600">
            Connectors are ready: enter your API keys here, without touching code. They turn on right away and apply to the whole account.
            Their cost is billed by each provider — see the <span className="text-slate-400">Budget</span> tab.
          </p>
          <div className="flex flex-col gap-3">
            {CONNECTORS.filter((c) => c.tier === 'premium').map((c) => (
              <div key={c.id}>
                <SourceRow c={c} st={sourceStatus?.[c.id]} />
                {canEditKeys && credStatuses[c.id] && (
                  <ConnectorKeys connectorId={c.id} fields={credStatuses[c.id].fields} />
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

/** Status row for a source: dot, name, last-collection outcome. */
function SourceRow({ c, st }: {
  c: (typeof CONNECTORS)[number];
  st?: SourceStatus[string];
}) {
  const enabled = c.enabled();
  // Amber = temporary hiccup (last run failed but it collected within the last
  // 24h, typical of GDELT's shared rate limit); red = genuinely down.
  const recentOk = st?.lastOkAt && Date.now() - new Date(st.lastOkAt).getTime() < 24 * 3600_000;
  const dot = !enabled
    ? 'bg-red-400/70'
    : st?.ok === false
      ? (recentOk ? 'bg-amber-400' : 'bg-red-400')
      : 'bg-emerald-400';
  const info = SOURCE_INFO[c.id];
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} />
      <span className="group relative flex w-32 shrink-0 items-center gap-1">
        <span className="truncate">{c.label}</span>
        {info && (
          <>
            <Info className="size-3 shrink-0 cursor-help text-slate-600 transition group-hover:text-sky-400" />
            <span
              role="tooltip"
              className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-64 rounded-lg border border-[var(--border)] bg-[var(--panel-2)] p-2.5 text-[11px] font-normal leading-relaxed text-slate-300 shadow-xl group-hover:block"
            >
              <span className="mb-1 block font-semibold text-slate-100">{c.label}</span>
              {info}
            </span>
          </>
        )}
      </span>
      <span className="truncate text-xs text-slate-500" title={!enabled ? c.disabledReason : st?.ok === false ? st.error : undefined}>
        {!enabled
          ? c.disabledReason
          : st
            ? st.ok
              ? `${st.count} new · ${fmtDate(st.at)}`
              : recentOk
                ? `temporarily unavailable · last successful collection ${fmtDate(st.lastOkAt!)}`
                : `error: ${st.error}`
            : 'awaiting first collection'}
      </span>
    </div>
  );
}
