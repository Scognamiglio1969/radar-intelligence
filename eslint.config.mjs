import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Le regole sperimentali del React Compiler (react-hooks v6) segnalano pattern
  // che qui usiamo di proposito e in sicurezza: mirror di stato in ref letti dentro
  // il loop di animazione three.js (refs), calcoli di layout deterministici in
  // render (purity/immutability), idratazione di preferenze da localStorage in un
  // effetto (set-state-in-effect). Le teniamo come avvisi, non come errori bloccanti.
  {
    rules: {
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
