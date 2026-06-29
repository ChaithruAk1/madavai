import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { obfuscator } from "rollup-obfuscator";
import { fileURLToPath } from "node:url";

// Absolute path to a repo file (ESM config has no __dirname).
const r = (rel) => fileURLToPath(new URL(rel, import.meta.url));

// Obfuscate ONLY the production build (npm run build) — never dev.
const obfuscate = {
  ...obfuscator({
    compact: true,
    identifierNamesGenerator: "hexadecimal",
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.75,
    rotateStringArray: true,
    splitStrings: true,
    reservedStrings: ["exceljs", "docx", "jspdf", "pptxgenjs", "mammoth", "xlsx", "@madav/documents", "@madav/contracts", "@madav/knowledge", "@madav/rbac", "@madav/insight"],
    splitStringsChunkLength: 8,
    transformObjectKeys: false,
    numbersToExpressions: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
  }),
  apply: "build",
};

// base "./" so the build works when loaded from Electron's file:// too.
export default defineConfig({
  base: "./",
  plugins: [react(), obfuscate],
  // The shared TypeScript engine resolves to its source here (one source: web + desktop run the SAME
  // @madav/* code the tests verify). Vite compiles the TS on the fly.
  resolve: {
    alias: {
      "@madav/documents": r("./packages/documents/src/index.ts"),
      "@madav/contracts": r("./packages/contracts/src/index.ts"),
      "@madav/knowledge": r("./packages/knowledge/src/index.ts"),
      "@madav/rbac": r("./packages/rbac/src/index.ts"),
      "@madav/insight": r("./packages/insight/src/index.ts"),
    },
  },
  worker: { format: "es" },
  server: { port: 5180, strictPort: true },
});
