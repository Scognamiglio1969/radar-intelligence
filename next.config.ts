import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (WASM) e pdfkit (font AFM + dati) leggono file dal filesystem:
  // il bundling li romperebbe, restano esterni. L'SDK MCP porta con sé server
  // HTTP interi (express, hono): esterno anche lui, non va impacchettato.
  serverExternalPackages: ["@electric-sql/pglite", "pdfkit", "@modelcontextprotocol/sdk"],
};

export default nextConfig;
