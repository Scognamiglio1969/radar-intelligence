import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (WASM) e pdfkit (font AFM + dati) leggono file dal filesystem:
  // il bundling li romperebbe, restano esterni.
  serverExternalPackages: ["@electric-sql/pglite", "pdfkit"],
};

export default nextConfig;
