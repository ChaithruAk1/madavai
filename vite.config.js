import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { obfuscator } from "rollup-obfuscator";

// Obfuscate ONLY the production build (npm run build) — never dev. This scrambles the shipped
// JavaScript so it's very hard to read/copy, while our source in src/ stays untouched. Settings are
// deliberately conservative (no control-flow flattening / self-defending / debug-protection) so the
// app keeps running fast and we can still debug a production build if we ever need to.
const obfuscate = {
  ...obfuscator({
    compact: true,
    identifierNamesGenerator: "hexadecimal",
    stringArray: true,
    stringArrayEncoding: ["base64"],
    stringArrayThreshold: 0.75,
    rotateStringArray: true,
    splitStrings: true,
    // Never string-array/split these — they are dynamic import() specifiers the bundler must resolve.
    reservedStrings: ["exceljs", "docx", "jspdf", "pptxgenjs", "mammoth", "xlsx"],
    splitStringsChunkLength: 8,
    transformObjectKeys: false,
    numbersToExpressions: true,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    selfDefending: false,
    debugProtection: false,
  }),
  apply: "build", // never run during `npm run dev`
};

// base "./" so the build works when loaded from Electron's file:// too.
export default defineConfig({
  base: "./",
  plugins: [react(), obfuscate],
  // ES-format workers support code-splitting (jsPDF pulls a dynamic import); all our workers
  // are instantiated with { type: "module" }, so ES is the correct + matching format.
  worker: { format: "es" },
  server: { port: 5174, strictPort: true },
});
