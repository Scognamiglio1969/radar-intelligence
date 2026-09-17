import { headers } from 'next/headers';
import { Plug, PlugZap } from 'lucide-react';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { getLocale } from '@/lib/i18n';
import { getConnectorCredStatuses } from '@/lib/connector-credentials';
import { MCP_TOOLS } from '@/lib/mcp';
import { MCP_PROMPTS, RULES } from '@/lib/mcp-prompts';
import type { Lang } from '@/lib/kpi-standard';
import { PageHeader, EmptyState } from '@/components/ui';
import { CopyButton } from '@/components/copy-button';
import { McpSelfTest, TokenGenerator } from '@/components/mcp-client';
import { L, Section } from '@/components/facts-ui';

// ---------------------------------------------------------------------------
// MCP: Radar dentro Claude e Copilot.
//
// Il server esisteva già (/api/mcp) ma non si vedeva da nessuna parte: per
// accenderlo serviva una variabile d'ambiente, per sapere che strumenti
// offriva bisognava leggere il codice. Qui si accende, si prova, si collega.
// ---------------------------------------------------------------------------

export const metadata = { title: 'MCP' };

function Code({ text }: { text: string }) {
  return (
    <div className="relative mt-1.5 overflow-x-auto rounded-lg border border-[var(--border)] bg-black/30">
      <pre className="px-3 py-2 pr-20 text-[11px] leading-relaxed text-slate-200">{text}</pre>
      <div className="absolute right-1 top-1"><CopyButton text={text} /></div>
    </div>
  );
}

export default async function McpPage() {
  const lang: Lang = (await getLocale()) === 'it' ? 'it' : 'en';
  // Nella demo pubblica la pagina si vede, ma il token non si può generare.
  if (!isAdmin(await getCurrentUser()) && process.env.DEMO_MODE !== '1') {
    return <EmptyState message={L(lang, 'Pagina riservata agli amministratori.', 'Available to admins.')} />;
  }
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const endpoint = `${process.env.APP_URL?.replace(/\/$/, '') ?? `${proto}://${host}`}/api/mcp`;

  const creds = await getConnectorCredStatuses();
  const field = creds.mcp?.fields[0];
  const active = Boolean(field?.set);
  const TOKEN = L(lang, 'IL_TUO_TOKEN', 'YOUR_TOKEN');

  const claudeCode = `claude mcp add --transport http radar ${endpoint} \\\n  --header "Authorization: Bearer ${TOKEN}"`;
  const claudeDesktop = JSON.stringify({
    mcpServers: {
      radar: {
        command: 'npx',
        args: ['-y', 'mcp-remote', endpoint, '--header', 'Authorization:${RADAR_AUTH}'],
        env: { RADAR_AUTH: `Bearer ${TOKEN}` },
      },
    },
  }, null, 2);

  return (
    <>
      <PageHeader
        title="MCP"
        subtitle={L(lang,
          'Radar dentro Claude e Copilot: gli stessi dati, interrogati in conversazione.',
          'Radar inside Claude and Copilot: the same data, queried in conversation.')}
        info={L(lang,
          'MCP (Model Context Protocol) è lo standard con cui un assistente AI usa strumenti esterni. Radar espone un server MCP in sola lettura: gli strumenti leggono ciò che Radar ha già calcolato, non chiamano l’AI né le fonti esterne, e non spendono budget né crediti Talkwalker. Senza token l’endpoint è spento, non aperto.',
          'MCP (Model Context Protocol) is the standard an AI assistant uses to call external tools. Radar exposes a read-only MCP server: tools read what Radar has already computed, never call the AI or external sources, and spend no budget or Talkwalker credits. Without a token the endpoint is off, not open.')}
      />

      <Section className="mb-4" title={L(lang, 'Stato', 'Status')}>
        <div className="flex flex-col gap-3">
          <p className={`flex items-center gap-2 text-sm ${active ? 'text-emerald-300' : 'text-slate-400'}`}>
            {active ? <PlugZap className="size-4" /> : <Plug className="size-4" />}
            {active
              ? L(lang, 'Acceso', 'On')
              : L(lang, 'Spento: nessun token', 'Off: no token')}
            {active && field && process.env.DEMO_MODE !== '1' && (
              <span className="text-[11px] text-slate-500">
                · {L(lang, 'token', 'token')} {field.display}
                {field.fromEnv ? L(lang, ' (da variabile d’ambiente)', ' (from environment variable)') : L(lang, ' (salvato in Radar)', ' (saved in Radar)')}
              </span>
            )}
          </p>
          <div>
            <p className="text-[11px] text-slate-500">{L(lang, 'Indirizzo dell’endpoint (streamable HTTP)', 'Endpoint address (streamable HTTP)')}</p>
            <Code text={endpoint} />
          </div>
          <TokenGenerator hasToken={active} lang={lang} />
          {active && <McpSelfTest lang={lang} />}
        </div>
      </Section>

      <Section className="mb-4" title={L(lang, 'Come collegarlo', 'How to connect it')}
        hint={L(lang, `Sostituisci ${TOKEN} con il token. Se lo hai perso, generane uno nuovo.`, `Replace ${TOKEN} with the token. If you lost it, generate a new one.`)}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-slate-200">Claude Code</p>
            <Code text={claudeCode} />
            <p className="mt-1 text-[11px] text-slate-500">{L(lang, 'Poi, dentro Claude Code, /mcp mostra se è collegato.', 'Then, inside Claude Code, /mcp shows whether it is connected.')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Claude Desktop</p>
            <Code text={claudeDesktop} />
            <p className="mt-1 text-[11px] text-slate-500">{L(lang, 'Nel file claude_desktop_config.json (Impostazioni → Sviluppatore). Serve Node.js.', 'In claude_desktop_config.json (Settings → Developer). Requires Node.js.')}</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">Microsoft Copilot Studio</p>
            <ol className="mt-1.5 list-decimal pl-4 text-[11px] leading-relaxed text-slate-400">
              <li>{L(lang, 'Agente → Strumenti → Aggiungi strumento → Model Context Protocol → Nuovo.', 'Agent → Tools → Add a tool → Model Context Protocol → New.')}</li>
              <li>{L(lang, 'URL del server: l’indirizzo qui sopra.', 'Server URL: the address above.')}</li>
              <li>{L(lang, 'Autenticazione: chiave API, nell’intestazione, con nome ', 'Authentication: API key, in the header, named ')}<code className="text-slate-200">x-api-key</code>.</li>
              <li>{L(lang, 'Quando la connessione lo chiede, incolla il token.', 'When the connection asks for it, paste the token.')}</li>
            </ol>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-200">claude.ai</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
              {L(lang,
                'I connettori personalizzati di claude.ai oggi accettano solo l’accesso OAuth, non un token fisso: Radar non si collega da lì. Usa Claude Code o Claude Desktop.',
                'claude.ai custom connectors currently accept only OAuth, not a static token: Radar cannot be connected from there. Use Claude Code or Claude Desktop.')}{' '}
              <a href="https://github.com/anthropics/claude-ai-mcp/issues/112" target="_blank" rel="noopener noreferrer" className="text-sky-300 hover:underline">{L(lang, 'segnalazione aperta', 'open issue')}</a>
            </p>
          </div>
        </div>
      </Section>

      <Section className="mb-4 overflow-x-auto" title={L(lang, `Strumenti (${MCP_TOOLS.length})`, `Tools (${MCP_TOOLS.length})`)}
        hint={L(lang, 'Tutti in sola lettura e a costo zero.', 'All read-only and free.')}>
        <table className="w-full min-w-[36rem] text-left text-xs">
          <tbody>
            {MCP_TOOLS.map((t) => (
              <tr key={t.name} className="border-b border-[var(--border)]/60 align-top last:border-0">
                <td className="py-2 pr-3"><code className="text-sky-200">{t.name}</code><span className="block text-[10px] text-slate-500">{t.title}</span></td>
                <td className="py-2 text-[11px] leading-relaxed text-slate-400">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title={L(lang, `Libreria di prompt (${MCP_PROMPTS.length})`, `Prompt library (${MCP_PROMPTS.length})`)}
        hint={L(lang,
          'I client MCP li mostrano già nel loro menù dei prompt. Qui si possono leggere e copiare, per chi usa un assistente che non li supporta. Le regole sui dati sono le stesse che Radar applica nelle sue pagine.',
          'MCP clients already show them in their prompt menu. Here you can read and copy them, for assistants that do not support them. The data rules are the same Radar applies in its pages.')}>
        <details className="mb-3 rounded-lg border border-[var(--border)] px-3 py-2">
          <summary className="cursor-pointer text-xs font-semibold text-slate-200">{L(lang, 'Le regole sui dati (comuni a tutti i prompt)', 'The data rules (shared by every prompt)')}</summary>
          <Code text={RULES} />
        </details>
        <ul className="flex flex-col gap-2">
          {MCP_PROMPTS.map((p) => (
            <li key={p.name}>
              <details className="rounded-lg border border-[var(--border)] px-3 py-2">
                <summary className="cursor-pointer text-xs">
                  <span className="font-semibold text-slate-200">{p.title}</span>
                  <span className="ml-2 text-slate-500">{p.audience} · {p.cadence}</span>
                  <span className="block pl-3 text-[11px] text-slate-400">{p.description}</span>
                </summary>
                <p className="mt-2 text-[11px] text-slate-500">
                  <code>{p.name}</code>
                  {p.args.length > 0 && <> · {L(lang, 'argomenti', 'arguments')}: {p.args.map((a) => `${a.name}${a.required ? '*' : ''}`).join(', ')}</>}
                </p>
                <Code text={p.body} />
              </details>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
