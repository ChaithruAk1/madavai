// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// EXTERNAL QA + CHECKPOINT/RESTORE — the safety net OUTSIDE the application.
// Runs from a plain terminal with zero dependence on the app, so it works even when
// BrainEdge is too broken to start. Every GREEN verification automatically saves a
// snapshot of the working source code; one command restores the last known good state.
//
//   node scripts/qa-external.mjs            verify everything (+ auto-checkpoint on green)
//   node scripts/qa-external.mjs --no-build verify without the slow build step
//   node scripts/qa-external.mjs restore    put the code back to the last GREEN state
//   node scripts/qa-external.mjs list       show saved checkpoints
//
// Restore is reversible: before restoring, the CURRENT (broken) state is itself
// snapshotted to .checkpoints/pre-restore-<time>, so nothing is ever lost.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CP_DIR = path.join(ROOT, ".checkpoints");
const POINTER = path.join(CP_DIR, "LAST_GOOD.txt");
// What a checkpoint contains: everything needed to get back to a working app.
const SNAP_PATHS = ["electron", "src", "server", "cli", "scripts", "package.json", "vite.config.js", "index.html"];
const KEEP = 5;

const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`, dim = (s) => `\x1b[2m${s}\x1b[0m`;
const say = (s) => console.log(s);

// ---------- checks (each returns null = pass, or a plain-English problem) ----------
function nodeCheck(file) {
  try { execFileSync(process.execPath, ["--check", file], { stdio: "pipe" }); return null; }
  catch (e) { return String(e.stderr || e.message).split("\n").slice(0, 3).join(" ").slice(0, 300); }
}
function* walk(dir, exts) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p, exts);
    else if (exts.includes(path.extname(e.name))) yield p;
  }
}
function buildChecks(noBuild) {
  const checks = [];
  for (const dir of ["electron", "server", "cli", "scripts"]) {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of walk(abs, [".cjs", ".mjs", ".js"])) {
      checks.push({ name: `${path.relative(ROOT, f)} is valid code`, run: () => nodeCheck(f) });
    }
  }
  checks.push({ name: "package.json is valid and versions are pinned", run: () => {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
      const loose = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, v]) => v === "latest").map(([k]) => k);
      return loose.length ? "unpinned 'latest' versions: " + loose.join(", ") : null;
    } catch (e) { return "package.json unreadable: " + e.message; }
  } });
  if (!noBuild) {
    checks.push({ name: "the app BUILDS (npm run build — the assembly test)", run: () => {
      const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], { cwd: ROOT, encoding: "utf8", timeout: 240000, shell: process.platform === "win32" });
      if (r.status !== 0) return ("build failed: " + String(r.stderr || r.stdout).split("\n").filter(Boolean).slice(-6).join(" | ")).slice(0, 500);
      if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) return "build reported success but dist/index.html is missing";
      return null;
    } });
  }
  return checks;
}

// ---------- snapshots ----------
const cpCopy = (src, dest) => {
  const s = path.join(ROOT, src), d = path.join(dest, src);
  if (!fs.existsSync(s)) return;
  fs.cpSync(s, d, { recursive: true, filter: (p) => !p.includes("node_modules") && !p.includes(".checkpoints") });
};
function saveCheckpoint(label) {
  fs.mkdirSync(CP_DIR, { recursive: true });
  const name = `${label}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const dest = path.join(CP_DIR, name);
  fs.mkdirSync(dest, { recursive: true });
  for (const p of SNAP_PATHS) cpCopy(p, dest);
  fs.writeFileSync(path.join(dest, "MANIFEST.json"), JSON.stringify({ label, at: new Date().toISOString(), paths: SNAP_PATHS }, null, 2));
  if (label === "good") {
    fs.writeFileSync(POINTER, name);
    // rotation: keep only the newest KEEP good checkpoints
    const goods = fs.readdirSync(CP_DIR).filter((x) => x.startsWith("good-")).sort();
    for (const old of goods.slice(0, Math.max(0, goods.length - KEEP))) fs.rmSync(path.join(CP_DIR, old), { recursive: true, force: true });
  }
  return name;
}
function restore() {
  if (!fs.existsSync(POINTER)) { say(red("✗ No good checkpoint exists yet — run a verification first, while things work.")); process.exit(1); }
  const name = fs.readFileSync(POINTER, "utf8").trim();
  const srcDir = path.join(CP_DIR, name);
  if (!fs.existsSync(srcDir)) { say(red(`✗ Checkpoint folder ${name} is missing.`)); process.exit(1); }
  say(`Restoring the last known GOOD state: ${dim(name)}`);
  say(dim("Saving your CURRENT state first (so this restore is reversible)…"));
  const pre = saveCheckpoint("pre-restore");
  for (const p of SNAP_PATHS) {
    const from = path.join(srcDir, p);
    if (!fs.existsSync(from)) continue;
    const to = path.join(ROOT, p);
    fs.rmSync(to, { recursive: true, force: true });
    fs.cpSync(from, to, { recursive: true });
  }
  say(green(`✓ Restored. Your previous state is saved as .checkpoints/${pre}`));
  say("Next: npm install (if package.json changed), then npm run build, then restart the app.");
}
function list() {
  if (!fs.existsSync(CP_DIR)) { say("No checkpoints yet."); return; }
  const ptr = fs.existsSync(POINTER) ? fs.readFileSync(POINTER, "utf8").trim() : "";
  for (const d of fs.readdirSync(CP_DIR).filter((x) => fs.statSync(path.join(CP_DIR, x)).isDirectory()).sort().reverse()) {
    say(`${d === ptr ? green("● ") : "  "}${d}${d === ptr ? dim("  ← last known good") : ""}`);
  }
}

// ---------- main ----------
const arg = process.argv[2] || "";
if (arg === "restore") { restore(); process.exit(0); }
if (arg === "list") { list(); process.exit(0); }

const noBuild = process.argv.includes("--no-build");
say(`\nBrainEdge external QA ${dim("(runs without the app — your safety net)")}\n`);
const checks = buildChecks(noBuild);
let fails = 0;
for (const c of checks) {
  const problem = c.run();
  if (problem) { fails++; say(`${red("✗")} ${c.name}\n   ${dim(problem)}`); }
  else say(`${green("✓")} ${c.name}`);
}
say("");
if (fails === 0) {
  const name = saveCheckpoint("good");
  say(green(`ALL CLEAR — ${checks.length} checks passed.`));
  say(`Checkpoint saved: ${dim(".checkpoints/" + name)} ${dim("(restore any time with: npm run qa:restore)")}\n`);
  process.exit(0);
} else {
  say(red(`${fails} problem${fails === 1 ? "" : "s"} found.`) + " Fix them, or go back to the last working state with: " + green("npm run qa:restore") + "\n");
  process.exit(1);
}
