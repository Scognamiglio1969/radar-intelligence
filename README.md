<div align="center">

# 📡 Radar

### Open-source media intelligence & social listening

**The alternative to Talkwalker or Brandwatch that doesn't cost thousands a month.**
21 data sources, an AI engine of your choice, and a set of signals enterprise tools
don't have at all — self-hosted, bring-your-own-keys, running in 30 seconds flat.

![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![Connectors](https://img.shields.io/badge/connectors-21-success)
![AI](https://img.shields.io/badge/AI-Claude%20%7C%20OpenAI%20%7C%20Grok-8a63d2)
![Self-hosted](https://img.shields.io/badge/self--hosted-zero%20config-orange)

[Try it live](https://social-radar-lemon.vercel.app) · [Deploy your own](#deploy-your-own) · [30-second local start](#try-it-in-30-seconds-local-zero-config)

</div>

---

> **Bilingual (English / Italian), on two independent axes.** One flag switches the
> **interface**; a separate one sets the language the **AI writes in** — briefs, Point of View,
> answers, narratives. They are deliberately decoupled: you can read Radar in Italian and
> still generate deliverables in English, because the language of the output depends on who
> will read it, not on who is using the tool. Your collected data is never translated:
> mentions, topics and sentiment stay in their original language, because the interface
> language must not alter the dataset. More languages are welcome as contributions — a
> missing translation simply falls back to English.

## Screenshots

The whole conversation as a real 3D solar system — sources are planets, sentiment split
becomes moons, the sun is your Health Index:

![Conversation Galaxy](docs/screenshots/galaxy.png)

Source → Topic → Sentiment flow, with multi-select cross-filtering:

![Conversation flow](docs/screenshots/flow.png)

Real-world geographic map and the executive Health Index:

![Geographic map](docs/screenshots/geo.png)
![Health Index](docs/screenshots/health.png)

Pick your AI engine — Claude, OpenAI or Grok — enter its key and set the models, all from
the app. No code, no redeploy:

![Choose your AI engine](docs/screenshots/ai-engine.png)

**Point of View** — 90 days of data turned into a thesis you can defend, in slide-ready
blocks with clickable citations, plus the Market × Research crossover that shows where
academic research is running ahead of the market:

![Point of View](docs/screenshots/pov.png)

**Earned Media Value** — what your coverage would have cost to buy, explained in plain
language and with every assumption on screen:

![Earned Media Value](docs/screenshots/emv.png)

The **insights hub**: 16 visualizations grouped by the question they answer, so the sidebar
stays readable and every chart says what it is for:

![Explore insights](docs/screenshots/insights.png)

Zoom into any single channel with a **source deep-dive** — how that channel's volume,
sentiment, topics and authors compare with the whole project, each figure a verifiable
subset of the totals:

![Source deep-dive](docs/screenshots/source-deepdive.png)

---

## Beyond mentions — signals Talkwalker doesn't have

Not everything worth watching is a keyword match in a stream of posts. Three
self-contained sections, each with its own sources and its own kind of analysis,
answer questions that a pure mention-search tool structurally can't:

**Sport** — for publicly listed clubs, match results crossed with fan sentiment and
share price on one timeline. Three incomparable units (league points, sentiment,
euros) on hidden axes, so the only question that matters is whether the lines move
together — plus how long a win's mood boost actually lasts, and whether the margin
of victory matters at all:

![Sport crossover](docs/screenshots/sport.png)

**Wikipedia edit monitoring** — who is editing a brand's Wikipedia page, and does it
look like a fight? Reverts, anonymous accounts and a weekly activity chart surface an
edit war *before* it shows up anywhere else — no AI, just the official MediaWiki API
reading its own revert/anonymous tags:

![Wikipedia edit monitoring](docs/screenshots/wikipedia.png)

**Reviews** — star ratings from the App Store, Google Places and Yelp in one place,
because a rating *is* the sentiment already, no AI needed to interpret it:

![Reviews](docs/screenshots/reviews.png)

**Share of search** — Google Trends interest for your brand against its competitors,
already scaled against each other (100 = the peak across all of them), sitting next
to Share of Voice on the Benchmark page:

![Share of search](docs/screenshots/benchmark.png)

---

## Why Radar

Enterprise listening tools cost thousands per month. Radar gives a single person or a
small team the same core workflow — **listen, analyze, decide, create** — using public
data sources and the Claude API, for the price of an API key (or nothing at all if you
just want to collect data).

- **Your AI, your choice**: run every AI feature on **Claude (Anthropic), OpenAI or Grok
  (xAI)**. Pick the engine, paste its key, and even set which models power the fast (bulk
  tagging) and smart (briefs, insights) tiers — all from *Settings → Budget*, no code and
  no redeploy. Switch providers anytime; the spend cap works the same for all of them.
- **21 connectors, 15 free** (11 need no key at all): worldwide news via GDELT (100k+
  outlets, 65+ languages) and Google News, Bluesky, Mastodon, Hacker News, Telegram, RSS,
  Stack Exchange, GitHub, SEC EDGAR filings and arXiv papers out of the box — plus Reddit,
  YouTube, Discord and **public LinkedIn posts** with a free API key. Full table
  [below](#connectors). Every source is verified live against its real API before shipping,
  not assumed from documentation — see [CONTRIBUTING.md](CONTRIBUTING.md) for what that means
  in practice.
- **Public LinkedIn listening, legally**: LinkedIn offers no public post search, so Radar
  finds public LinkedIn posts and articles by *anyone* through the [Tavily](https://tavily.com)
  search index (free tier, 1,000 searches/month) — labelled **LinkedIn (web)** and kept
  distinct from **LinkedIn (page)** (your own company page via the official API), so the two
  acquisition models never get mixed.
- **6 premium connectors ready** (X, Instagram, Facebook, TikTok, NewsAPI, LinkedIn page) —
  drop in a key and the source turns on.
- **Beyond mentions** ✦: three self-contained sections outside the keyword-search model —
  **Sport** (match results × fan sentiment × share price for listed clubs), **Wikipedia
  edit monitoring** (edit wars and anonymous activity as an early-warning signal) and
  **Reviews** (App Store, Google Places, Yelp star ratings). See the [screenshots
  above](#beyond-mentions--signals-talkwalker-doesnt-have).
- **Share of search**: Google Trends interest for every benchmark entity, already scaled
  against each other, next to Share of Voice — because how much people search for you
  matters as much as how much they talk about you.
- **Import your own data**: create an *Import* project and drop in an Excel/CSV export
  (from any platform or vendor). Radar runs the whole analysis engine — sentiment, topics,
  narratives, insights — over rows it never scraped, so external data lives alongside live
  listening.
- **Point of View** ✦: turns 90 days of data into a defensible thesis for a meeting — 3-5
  slide-ready blocks (named idea, narrative, supporting figures), counter-signals and
  clickable citations to the real posts. The numbers come from SQL, never from the model,
  and invented citations are dropped by a validation pass. It also crosses your market
  signal with **academic research** (via the open OpenAlex index) to show where research is
  running ahead of the market, and where the market is loud with no research behind it.
- **Message pull-through**: whether the messages *you* want to land are actually picked up —
  by which sources, with what tone, and where exactly they landed.
- **Earned Media Value**: what the coverage would have cost to buy, computed conservatively
  with every assumption on screen (negative coverage valued at zero and reported separately,
  no arbitrary AVE multiplier).
- **Per-source deep-dive**: focus on one channel and compare its volume, sentiment, topics
  and authors against the whole project — every number a verifiable subset of the totals,
  with a banner spelling out how that source's data is collected.
- **AI analysis with Claude**: sentiment, **emotion** (joy/trust/fear/anger/sadness/
  surprise), relevance scoring, story clustering, daily executive briefs, conversation
  clusters, cause-effect chains, quality scores.
- **Brand vs Market Health Index**: one 0–100 score for the whole theme, and — when you
  flag one benchmark entity as *your brand* — your brand's score next to the market and a
  competitive ranking.
- **12 advanced insight visualizations** (see below), from a live 3D "Conversation Galaxy"
  to a Share-of-Voice streamgraph, a Source→Topic→Sentiment Sankey and a real-world map.
- **Content Studio**: turn a concept into a multi-format kit, explore alternative hooks,
  refine drafts conversationally in your brand voice.
- **Cost control**: an admin-set spend cap on the AI, a password-protected reset, and an
  all-time total across every user — the app stops calling the AI at the cap while data
  collection keeps running.
- **Exports**: branded PDF, PowerPoint, Word, Excel — every insight included. Read-only
  share links.

## Try it in 30 seconds (local, zero config)

No database, no keys, no cloud account required. Uses an embedded database (PGlite) and
runs entirely offline. AI features stay idle until you add a key for your chosen engine
(Claude, OpenAI or Grok).

```bash
git clone https://github.com/Scognamiglio1969/radar-intelligence.git
cd radar-intelligence
npm install
npm run dev
# open http://localhost:3000  ·  first login: admin@example.com / changeme
```

To enable AI, add your own key to `.env.local` (or paste it later from *Settings → Budget*):

```bash
cp .env.example .env.local
# Claude:  ANTHROPIC_API_KEY=...   (https://console.anthropic.com)
# OpenAI:  OPENAI_API_KEY=...      (https://platform.openai.com)
# Grok:    XAI_API_KEY=...         (https://console.x.ai)
```

## Deploy your own

One-click deploy to Vercel (add a free [Neon](https://neon.tech) Postgres and your keys
when prompted):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Scognamiglio1969/radar-intelligence)

Minimum production env vars: `DATABASE_URL`, `SESSION_SECRET`. Recommended:
`ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. See [`.env.example`](.env.example)
for the full, commented list.

## Bring your own keys (BYOK)

Radar never ships with anyone's keys — you bring your own, and everything is stored
**encrypted at rest**.

- **AI engine key** — powers all AI features (sentiment, briefs, ratings, clustering,
  Content Studio, "Ask the data"…). In *Settings → Budget → AI engine* choose your provider —
  **Claude, OpenAI or Grok** — and paste its key, or set the matching environment variable
  (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` or `XAI_API_KEY`). The default models per provider
  are editable, so a newly released model just needs its id typed in — no code change. No key
  needed just to collect data.
- **Data-source keys** (X, Instagram, Facebook, TikTok, LinkedIn, NewsAPI, Reddit, YouTube,
  Discord, Tavily for LinkedIn-web, football-data.org and Alpha Vantage for Sport, Yelp for
  Reviews) — configured **from the UI** in *Settings → Sources* (or inline on the Sport /
  Reviews pages, next to the source they unlock), or via environment variables as a
  fallback.

Nothing requires editing code or redeploying: an admin adds the keys from the app and the
features turn on immediately.

## Modules

The sidebar is organised by what you are trying to do — **Monitor** (what is happening),
**Analyze** (understand the numbers), **Interpret** (what it means), **Create** (what you
produce) and **Setup** — instead of by chart type. The advanced visualizations live in a
hub that groups them by the question they answer, so the menu stays readable.

| Page | What it does |
|---|---|
| Dashboard | KPIs, volume per source, sentiment, emerging topics, latest brief |
| Listening | Stream of every mention with filters (source, sentiment, language, period, text) — filter by a source to open its **deep-dive**, or land on a curated set of posts from a narrative |
| Source deep-dive | One channel vs the whole project: volume, sentiment, topics and top authors, each a verifiable subset of the totals |
| Import | Create a project that ingests an Excel/CSV file instead of scraping — the full analysis engine runs over your own rows |
| Media | News grouped into stories (AI clustering) + most active outlets |
| Benchmark | Share of voice, trends and comparative sentiment across configurable entities |
| Audience | Most active communities, languages, influential authors, topics by community |
| Content | Engagement ranking (per-platform percentile) + AI quality score |
| Point of View | An evidence-backed market thesis in slide-ready blocks, with research corroboration |
| Message pull-through | Are your key messages being picked up, and by whom |
| Media value | Earned Media Value with every assumption exposed |
| Explore insights | A hub grouping 16 visualizations by the question they answer |
| Content Studio | Concept → multi-format kit, Hook Lab, conversational refinement |
| Alerts / Brief | Auto-detected volume spikes & sentiment drops; daily executive brief |
| War Room | Full-screen live view for a wall display |
| Settings | Tabbed: **My account**, **Team** (mark one entity as *your brand*), **Sources** (connector status & keys), **Budget** (choose the AI engine — Claude/OpenAI/Grok — its key & models, spend cap, admin cost controls), **Credits & Legal** |
| **Reviews** *(beyond mentions)* | Star ratings from App Store, Google Places and Yelp, plus your own imported file — a self-contained section, since a rating already *is* the sentiment |
| **Sport** *(beyond mentions)* | For publicly listed clubs: match results crossed with fan sentiment and share price, an edit-anatomy of how long a win's mood boost lasts, and whether the margin of victory matters |
| **Wikipedia** *(beyond mentions)* | Who edits a followed page, how often, and whether it looks like an edit war — reverts, anonymous accounts, a weekly activity chart |

## Advanced insights

A suite of purpose-built visualizations, each on its own page and each included in the
PDF / PowerPoint / Word / Excel exports:

| Insight | What it shows |
|---|---|
| **Conversation Galaxy** ✦ | The whole conversation as a real WebGL solar system: the sun is your Health Index, planets are sources (size = volume) with photographic NASA-based textures, and each planet has three moons sized 1–10 by its sentiment split. Drag to orbit, scroll to fly closer. |
| **Health Index** | One 0–100 composite (sentiment, positive share, momentum, resonance). Market health always; **Brand health + competitive ranking** when you flag *your brand*. |
| **Share of Voice** | 100% stacked area of each entity's share of the conversation over time, plus an explicit 30-day ranking. |
| **Conversation flow** | Source → Topic → Sentiment Sankey. **Multi-select cross-filtering**: pick any sources × sentiments to isolate a sub-flow (e.g. what drives negativity in two sources). Rich hover tooltips. |
| **Momentum quadrant** | Topics by volume × acceleration: Rising stars / Emerging / Steady / Declining. |
| **Emotion radar** | The emotional fingerprint beyond sentiment (joy, trust, fear, anger, sadness, surprise). |
| **Geographic map** | Real-world choropleth: each language shades its countries (English → US/UK/CA/AU, Spanish → Latin America…), colored by sentiment. |
| **Semantic constellation** | Key terms as a star map — size = frequency, color = sentiment, links = co-occurrence. |
| **Influencer network** | Force-directed graph of the top authors, clustered by community, sized by engagement. |
| **Author pyramid** | Authors tiered by influence (mega / macro / micro / long tail) with the share of reach each tier holds — is your conversation carried by a few big voices or broadly distributed? |
| **Crisis radar** | A risk gauge plus the anatomy of the biggest spike: what drove it, and the content that weighed most. |
| **Topics · Heatmap · Waterfall · Clusters · Cause-effect** | Topic×sentiment map, hourly heatmap, sentiment waterfall, conversation clusters, AI cause-effect chains. |

## Connectors

Every connector is a small, isolated file (`lib/connectors/`) — see
[CONTRIBUTING.md](CONTRIBUTING.md) for how to add one. **free** works immediately;
**freekey** needs a free key to turn on; **premium** needs a paid API.

| Source | Tier | Category | Notes |
|---|---|---|---|
| Google News | free | General & news | Public articles by keyword |
| GDELT | free | General & news | 100k+ outlets, 65+ languages |
| RSS | free | General & news | Any feed you add, unlimited |
| NewsAPI | premium | General & news | ~150k outlets, boolean search |
| SEC EDGAR | free | Financial & corporate | US-listed company filings (8-K/10-K/10-Q/DEF 14A) |
| arXiv | free | Academic | Papers with full abstract, re-checked for literal matches |
| Stack Exchange | free | Tech & developer | Stack Overflow + 5 other communities |
| GitHub | free | Tech & developer | Issues/PRs with full text, bot-filtered |
| Hacker News | free | Tech & developer | Stories and comments |
| Reddit | freekey | Social & messaging | Posts and comments |
| Bluesky | free | Social & messaging | Public posts |
| Mastodon | free | Social & messaging | Public toots |
| Telegram | free | Social & messaging | Your own watchlist of public channels |
| Discord | freekey | Social & messaging | Your own server, via your bot |
| LinkedIn (web) | freekey | Social & messaging | Any public post/article, via Tavily search |
| LinkedIn (page) | premium | Social & messaging | Your own company page, official API |
| X (Twitter) | premium | Social & messaging | Real-time search |
| Instagram | premium | Social & messaging | Hashtag search |
| Facebook | premium | Social & messaging | Your own linked pages |
| TikTok | premium | Social & messaging | Research API |
| YouTube | freekey | Video | Videos by keyword |

Plus, outside the mention model entirely: **App Store**, **Google Places** and **Yelp**
(review ratings), **football-data.org** and **Alpha Vantage** (Sport), **Google Trends**
(Share of search) and the **MediaWiki API** (Wikipedia edit monitoring) — see
[Beyond mentions](#beyond-mentions--signals-talkwalker-doesnt-have) above.

## Architecture

- **Next.js 16** (App Router) — deploys on Vercel, dark theme
- **Postgres**: Neon in production, embedded **PGlite** for local dev (zero setup)
- **Drizzle ORM**, schema created & migrated automatically on boot
- **Pluggable AI engine** — Claude (`@anthropic-ai/sdk`), OpenAI or Grok (OpenAI-compatible
  API), switchable from the UI, all behind one hard monthly spend cap
- **Recharts** + hand-built SVG/Canvas charts, and **three.js** for the 3D galaxy
- Pluggable **connectors** (`lib/connectors/`) — adding a source is one small file
- **Beyond mentions** sections (`lib/sport/`, `lib/reviews/`, `lib/wikipedia/`,
  `lib/search-interest/`) follow the same self-contained pattern as connectors — their own
  tables, their own ingest, their own page — for data that isn't a keyword match in a post

See [CONTRIBUTING.md](CONTRIBUTING.md) for a walk-through of adding a connector.

Planet/sun/moon textures in the Conversation Galaxy are © [Solar System Scope](https://www.solarsystemscope.com/textures/),
licensed **CC BY 4.0**.

## Legal & responsible use

Radar collects publicly available data. **You are responsible** for complying with the
Terms of Service of each data source (Reddit, X, Meta, GDELT, Google News, etc.) and with
applicable data-protection laws (e.g. GDPR) in your jurisdiction. Some sources restrict
automated access; enable only what you are entitled to use. Note that **Share of search**
uses Google Trends' internal, undocumented API (no official public API exists) — it is
best-effort and checked at most once a day, not a guaranteed-uptime data source. This
project is provided as-is, without warranty. See [SECURITY.md](SECURITY.md) to report
vulnerabilities.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). Good places to start: internationalization,
new connectors, tests. See [CHANGELOG.md](CHANGELOG.md) for how the project got here.

## License

[GNU AGPL-3.0](LICENSE) © Massimo Scognamiglio and contributors. If you run a modified
version as a network service, you must make your source available under the same license.
