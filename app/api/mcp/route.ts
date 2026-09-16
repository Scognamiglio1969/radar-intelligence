import {
  WebStandardStreamableHTTPServerTransport,
} from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createRadarMcpServer, mcpToken, readToken, tokenMatches } from '@/lib/mcp';
import { hydrateConnectorCredentials } from '@/lib/connector-credentials';

// Endpoint MCP di Radar: streamable HTTP, senza sessione.
//
// È l'unico transport che Microsoft Copilot Studio parla (SSE è deprecato da
// agosto 2025, stdio non è supportato), ed è anche quello che Claude accetta
// per i server remoti: un endpoint solo, due mondi.
//
// L'accesso è a token (RADAR_MCP_TOKEN), non a sessione: nessun cookie, quindi
// proxy.ts lo lascia passare e la verifica avviene qui.
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  // Le credenziali salvate dall'app (non solo le env var) devono essere in
  // cache prima di leggere il token e prima che i tool tocchino i dati.
  await hydrateConnectorCredentials();

  const expected = mcpToken();
  if (!expected) {
    // Senza token l'MCP è SPENTO, non aperto: un endpoint che espone l'intero
    // archivio non deve poter restare pubblico per dimenticanza.
    return Response.json(
      { error: 'mcp_disabled', hint: 'Set RADAR_MCP_TOKEN to enable the MCP endpoint.' },
      { status: 503 },
    );
  }
  if (!tokenMatches(readToken(req.headers), expected)) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  const server = createRadarMcpServer();
  // JSON invece di SSE: una risposta completa per richiesta sta dentro il
  // modello serverless (niente stream da tenere aperto oltre la funzione) ed è
  // pienamente valida per il protocollo streamable.
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  try {
    await server.connect(transport);
    return await transport.handleRequest(req);
  } finally {
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

/** GET serve solo a capire se l'endpoint è vivo: il protocollo viaggia in POST. */
export async function GET(): Promise<Response> {
  return Response.json({
    server: 'radar-mcp',
    transport: 'streamable-http',
    enabled: Boolean(mcpToken()),
    endpoint: '/api/mcp',
  });
}
