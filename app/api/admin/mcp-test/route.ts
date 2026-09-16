import { NextResponse } from 'next/server';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';
import { mcpToken } from '@/lib/mcp';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Prova l'endpoint MCP come farebbe un client vero: dall'esterno, con il
 * token, attraverso lo stesso indirizzo che si dà a Claude o a Copilot.
 * Una prova fatta chiamando le funzioni direttamente direbbe "funziona" anche
 * con il token sbagliato o l'endpoint spento.
 */
export async function POST(req: Request) {
  if (!isAdmin(await getCurrentUser())) return NextResponse.json({ error: 'solo amministratori' }, { status: 403 });
  await hydrateConnectorCredentials();
  const token = mcpToken();
  if (!token) return NextResponse.json({ error: 'L’endpoint è spento: genera prima un token.' }, { status: 400 });

  const endpoint = new URL('/api/mcp', req.url).toString();
  const call = async (id: number, method: string, params: Record<string, unknown> = {}) => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        'mcp-protocol-version': '2025-06-18',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(20000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.error) throw new Error(`${method}: ${body?.error?.message ?? body?.error ?? `HTTP ${res.status}`}`);
    return body.result;
  };

  const t0 = Date.now();
  try {
    const init = await call(1, 'initialize', {
      protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'radar-selftest', version: '1' },
    });
    const tools = await call(2, 'tools/list');
    const prompts = await call(3, 'prompts/list');
    const projects = await call(4, 'tools/call', { name: 'radar_projects', arguments: {} });
    const parsed = JSON.parse(projects?.content?.[0]?.text ?? '{}');
    return NextResponse.json({
      ok: true,
      ms: Date.now() - t0,
      server: init?.serverInfo?.name,
      tools: tools?.tools?.length ?? 0,
      prompts: prompts?.prompts?.length ?? 0,
      projects: parsed?.projects?.length ?? 0,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
