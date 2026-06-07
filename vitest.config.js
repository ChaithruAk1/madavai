import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import path from "path";

const here = path.dirname(fileURLToPath(import.meta.url));

// Central test library for BrainEdge core features.
//  - tests/component/**  → jsdom (React component behavior)
//  - everything else     → node (pure logic + static contract checks)
// The electron alias lets us import the main-process .cjs modules in plain node
// (they only need app.getPath, which the stub points at a temp dir).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { electron: path.resolve(here, "tests/stubs/electron.js") },
  },
  test: {
    globals: true,
    environment: "node",
    environmentMatchGlobs: [["tests/component/**", "jsdom"]],
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.test.{js,jsx}"],
  },
});
