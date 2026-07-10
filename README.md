# Radar

**Open-source media intelligence & social listening** — an alternative to enterprise
platforms like Talkwalker or Brandwatch, built on free data sources and Claude AI.
Self-hostable, bring-your-own-keys, runs locally with zero configuration.

![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)
![CI](https://img.shields.io/badge/CI-GitHub_Actions-informational)
![Next.js](https://img.shields.io/badge/Next.js-16-black)

> The user interface and AI outputs are in English. Full internationalization (i18n) for
> additional languages is on the roadmap and contributions are very welcome.

---

## Why Radar

Enterprise listening tools cost thousands per month. Radar gives a single person or a
small team the same core workflow — **listen, analyze, decide, create** — using public
data sources and the Claude API, for the price of an API key (or nothing at all if you
just want to collect data).

- **9 free sources** out of the box: worldwide news via GDELT (100k+ outlets, 65+
  languages) and Google News, plus Bluesky, Mastodon, Hacker News, Telegram, RSS —
  and Reddit / YouTube with a free API key.
- **6 premium connectors ready** (X, Instagram, Facebook, TikTok, LinkedIn, NewsAPI) —
  drop in a key and the source turns on.
- **AI analysis with Claude**: sentiment, relevance scoring, story clustering, daily
  executive briefs, conversation clusters, cause-effect chains, quality scores.
- **Content Studio**: turn a concept into a multi-format kit, explore alternative hooks,
  refine drafts conversationally in your brand voice.
- **Exports**: branded PDF, PowerPoint, Word, Excel. Read-only share links.

## Try it in 30 seconds (local, zero config)

No database, no keys, no cloud account required. Uses an embedded database (PGlite) and
runs entirely offline. AI features stay idle until you add an Anthropic key.

```bash
git clone https://github.com/Scognamiglio1969/radar-intelligence.git
cd radar-intelligence
npm install
npm run dev
# open http://localhost:3000  ·  first login: admin@example.com / changeme
```

To enable AI, add your own key to `.env.local`:

```bash
cp .env.example .env.local
# set ANTHROPIC_API_KEY=...   (get one at https://console.anthropic.com)
```

## Deploy your own

One-click deploy to Vercel (add a free [Neon](https://neon.tech) Postgres and your keys
when prompted):

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Scognamiglio1969/radar-intelligence)

Minimum production env vars: `DATABASE_URL`, `SESSION_SECRET`. Recommended:
`ANTHROPIC_API_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. See [`.env.example`](.env.example)
for the full, commented list.

## Bring your own keys (BYOK)

Radar never ships with anyone's keys. Every paid/registered data source can be configured
**from the UI** (Settings → Sources), stored **encrypted at rest**, without editing any
file — or via environment variables as a fallback. The Anthropic key powers the AI
features and is yours to provide.

## Modules

| Page | What it does |
|---|---|
| Dashboard | KPIs, volume per source, sentiment, emerging topics, latest brief |
| Listening | Stream of every mention with filters (source, sentiment, language, period, text) |
| Media | News grouped into stories (AI clustering) + most active outlets |
| Benchmark | Share of voice, trends and comparative sentiment across configurable entities |
| Audience | Most active communities, languages, influential authors, topics by community |
| Content | Engagement ranking (per-platform percentile) + AI quality score |
| Insights | Topics × Sentiment, hourly heatmap, sentiment waterfall, clusters, cause-effect |
| Content Studio | Concept → multi-format kit, Hook Lab, conversational refinement |
| Alerts / Brief | Auto-detected volume spikes & sentiment drops; daily executive brief |
| War Room | Full-screen live view for a wall display |
| Settings | Projects & keywords, team, sources status, API budget |

## Architecture

- **Next.js 16** (App Router) — deploys on Vercel, dark theme
- **Postgres**: Neon in production, embedded **PGlite** for local dev (zero setup)
- **Drizzle ORM**, schema created & migrated automatically on boot
- **Claude** (`@anthropic-ai/sdk`) with a hard monthly spend cap
- Pluggable **connectors** (`lib/connectors/`) — adding a source is one small file

See [CONTRIBUTING.md](CONTRIBUTING.md) for a walk-through of adding a connector.

## Legal & responsible use

Radar collects publicly available data. **You are responsible** for complying with the
Terms of Service of each data source (Reddit, X, Meta, GDELT, Google News, etc.) and with
applicable data-protection laws (e.g. GDPR) in your jurisdiction. Some sources restrict
automated access; enable only what you are entitled to use. This project is provided as-is,
without warranty. See [SECURITY.md](SECURITY.md) to report vulnerabilities.

## Contributing

Issues and pull requests are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and our
[Code of Conduct](CODE_OF_CONDUCT.md). Good places to start: internationalization,
new connectors, tests.

## License

[GNU AGPL-3.0](LICENSE) © Massimo Scognamiglio and contributors. If you run a modified
version as a network service, you must make your source available under the same license.
