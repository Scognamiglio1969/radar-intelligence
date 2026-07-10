# Contributing to Radar

Thanks for your interest! Contributions of all kinds are welcome — bug reports, features,
docs, tests, and especially **internationalization** and **new connectors**.

## Getting started

```bash
git clone https://github.com/Scognamiglio1969/radar-intelligence.git
cd radar-intelligence
npm install
npm run dev      # http://localhost:3000, embedded PGlite DB, zero config
```

No database or API keys are required to run the app locally. To work on AI features,
copy `.env.example` to `.env.local` and add your own `ANTHROPIC_API_KEY`.

## Before opening a pull request

```bash
npm run lint          # ESLint
npx tsc --noEmit      # type-check
npm run build         # production build
```

Please keep PRs focused, describe the change and how you tested it, and match the
existing code style (see the surrounding files — comment density, naming, idioms).

## Adding a data source (connector)

Connectors live in `lib/connectors/`. Each is a single file exporting a `Connector`:

```ts
export const mySource: Connector = {
  id: 'mysource',
  label: 'My Source',
  tier: 'free',            // 'free' | 'freekey' | 'premium'
  enabled: () => true,     // or check cfg('MYSOURCE_KEY') for keyed sources
  async fetchMentions(q) {
    // fetch and return RawMention[]
  },
};
```

Then register it in `lib/connectors/index.ts` (the `CONNECTORS` array and `SOURCE_META`).
For a source that needs a key, read it via `cfg('ENV_NAME')` and add the field(s) to
`CREDENTIAL_FIELDS` in `lib/connector-credentials.ts` so users can enter it from the UI.

## Reporting bugs

Open an issue using the bug template. Include steps to reproduce, expected vs. actual
behavior, and your environment. **Never paste API keys or secrets** in issues.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## License

By contributing, you agree that your contributions are licensed under the project's
[AGPL-3.0](LICENSE) license.
