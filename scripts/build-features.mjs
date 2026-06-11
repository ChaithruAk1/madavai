// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// build-features — generates the per-channel feature manifest consumed by BOTH build layers:
//
//   electron/build-features.json   → engine gates (electron/features.cjs builtIn()) AND
//                                    electron-builder file excludes + artifact naming
//   .env.production.local          → renderer flags (VITE_FEAT_*=0) that Vite folds at
//                                    build time so excluded feature code is DROPPED from
//                                    the public bundle (same pattern as VITE_INCLUDE_QA)
//
// Channels:
//   node scripts/build-features.mjs --all    ADMIN channel — every feature included.
//   node scripts/build-features.mjs          PUBLIC channel — reads the owner's Extras
//                                            switchboard (Settings → Extras) from
//                                            %APPDATA%/brainedge/brainedge-settings.json;
//                                            anything switched OFF there is excluded.
//
// Both output files are gitignored and rewritten on every build — never edit by hand.
// Keep the KEYS list in sync with src/extras.js (the Extras catalog).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const KEYS = ["sage", "voice", "imagegen", "office", "browser", "memory", "desktop", "research", "studio", "terminal", "scheduler", "viamobile"];
const all = process.argv.includes("--all");

let extras = {};
if (!all) {
  const f = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "brainedge", "brainedge-settings.json");
  try { extras = JSON.parse(fs.readFileSync(f, "utf8")).extras || {}; }
  catch { console.warn("[features] Couldn't read " + f + " — defaulting to ALL features ON."); }
}

const manifest = { channel: all ? "admin" : "public" };
for (const k of KEYS) manifest[k] = all ? true : extras[k] !== false;

fs.writeFileSync(path.join("electron", "build-features.json"), JSON.stringify(manifest, null, 2) + "\n");

// Renderer flags: only OFF features get a line (absent = ON). --all writes an empty file,
// which also CLEARS any stale public flags before an admin or plain web build.
const offKeys = KEYS.filter((k) => !manifest[k]);
fs.writeFileSync(".env.production.local", offKeys.map((k) => `VITE_FEAT_${k.toUpperCase()}=0`).join("\n") + (offKeys.length ? "\n" : ""));

console.log(`[features] channel=${manifest.channel} · excluded: ${offKeys.join(", ") || "(none — all features in)"}`);
