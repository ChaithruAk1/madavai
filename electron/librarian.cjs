// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Sage Librarian — phase 2 of the sage-knowledge system (SAGE-KNOWLEDGE-PROCESS.md §9).
// An in-app maintenance agent that keeps Sage's control-level knowledge in sync with
// the source code: it git-diffs the components since the last sweep (§6 step 1), has a
// model regenerate the affected sage-knowledge area files from CURRENT source (§6 step
// 2), and presents an entry-level diff for ADMIN APPROVAL. Repair-Bay pattern: nothing
// is written without the human click; every apply makes a timestamped backup; one-click
// rollback. Dev machines only — requires the source tree + git (never ships in public
// builds, same as the QA tools). Fail-open: any error is returned as { error }, never thrown.
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const settings = require("./settings.cjs");

const ROOT = path.join(__dirname, "..");
const KDIR = path.join(ROOT, "sage-knowledge");

// ---- which components feed which knowledge area (mirror of PROCESS §4) ----
// A changed component may touch several areas (Agents.jsx feeds 02 AND 03).
const AREAS = [
  { file: "01-settings.md", label: "Settings", components: ["Settings.jsx"] },
  { file: "02-agent-studio.md", label: "Agent Studio", components: ["Agents.jsx"] },
  { file: "03-agents-tabs.md", label: "Agents tabs & teams", components: ["Agents.jsx", "AgentOps.jsx", "TeamOps.jsx"] },
  { file: "04-models.md", label: "Models", components: ["ModelPicker.jsx", "ModelsOverview.jsx", "ModelsSection.jsx", "SpeedCheck.jsx"] },
  { file: "05-chat.md", label: "Chat / Collaborate / Build", components: ["Composer.jsx", "Message.jsx", "ToolCard.jsx", "ArtifactPanel.jsx", "PermissionModal.jsx", "markdown.jsx", "App.jsx"] },
  { file: "06-projects-scheduler.md", label: "Projects · Scheduler · Via Mobile", components: ["ProjectsBrowser.jsx", "Scheduler.jsx", "ViaMobile.jsx"] },
  { file: "07-interface.md", label: "Interface & tools", components: ["Sidebar.jsx", "TopNav.jsx", "Topbar.jsx", "Skills.jsx", "Connectors.jsx", "Plugins.jsx", "Consumption.jsx", "TerminalPanel.jsx"] },
  { file: "08-community-studio-sage.md", label: "Community · Studio · Sage", components: ["Community.jsx", "ProductRequests.jsx", "StudioLauncher.jsx", "Onboarding.jsx", "UserGuide.jsx", "SageDock.jsx"] },
];

// ---- tiny persisted state (userData): last sweep commit + pending proposals ----
function stateFile() {
  try { return path.join(require("electron").app.getPath("userData"), "librarian-state.json"); }
  catch { return path.join(ROOT, ".librarian-state.json"); } // tests / non-electron
}
function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), "utf8")); } catch { return { lastSweep: "", proposals: {} }; }
}
function saveState(s) {
  try { fs.writeFileSync(stateFile(), JSON.stringify(s, null, 2)); } catch { /* fail open */ }
}

// ---- git plumbing (10s cap; the repo is local so this is instant in practice) ----
function git(args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: ROOT, timeout: 10000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
      if (err) reject(new Error("git " + args[0] + " failed: " + String(err.message || err).slice(0, 200)));
      else resolve(String(out || "").trim());
    });
  });
}

async function available() {
  if (!fs.existsSync(KDIR) || !fs.existsSync(path.join(ROOT, "src", "components"))) return false;
  try { await git(["rev-parse", "HEAD"]); return true; } catch { return false; }
}

// ---- entry-level parsing (same "### " contract as src/sageKnowledge.js) ----
function parseEntries(md) {
  const map = new Map();
  for (const chunk of String(md || "").split(/\n(?=### )/)) {
    if (!chunk.startsWith("### ")) continue;
    const heading = chunk.split("\n", 1)[0].replace(/^###\s*/, "").trim();
    if (heading) map.set(heading, chunk.trim());
  }
  return map;
}
function entryDiff(oldMd, newMd) {
  const a = parseEntries(oldMd), b = parseEntries(newMd);
  const added = [], removed = [], changed = [];
  let unchanged = 0;
  for (const [h, txt] of b) { if (!a.has(h)) added.push(h); else if (a.get(h) !== txt) changed.push(h); else unchanged++; }
  for (const h of a.keys()) if (!b.has(h)) removed.push(h);
  return { added, removed, changed, unchanged, oldCount: a.size, newCount: b.size };
}

// ---- §6 STEP 1: what drifted since the last sweep ----
async function scan() {
  try {
    if (!(await available())) return { error: "Librarian needs the source tree + git (dev machines only)." };
    const st = loadState();
    let base = st.lastSweep;
    if (base) { try { await git(["cat-file", "-e", base]); } catch { base = ""; } } // baseline gone (rebase) → fall back
    if (!base) base = (await git(["log", "-1", "--format=%H", "--", "sage-knowledge"])) || (await git(["rev-list", "--max-parents=0", "HEAD"])).split("\n")[0];
    // base..working-tree (uncommitted changes count too — that's where drift lives during dev)
    const out = await git(["diff", "--name-only", base, "--", "src"]);
    const changed = out ? out.split("\n").map((l) => l.trim()).filter(Boolean) : [];
    const names = new Set(changed.map((p) => path.basename(p)));
    const areas = AREAS
      .map((a) => ({ file: a.file, label: a.label, components: a.components.filter((c) => names.has(c)) }))
      .filter((a) => a.components.length);
    return { baseline: base.slice(0, 10), changedFiles: changed.length, areas, pending: Object.keys(st.proposals || {}).length };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

// ---- model call (Repair-Bay style: active profile, hard timeout, no streaming UI) ----
function askModel(system, user) {
  const { streamChat } = require("./providers.cjs");
  const profile = settings.activeProfile();
  if (!profile || !profile.baseUrl || !profile.model) return Promise.reject(new Error("no active provider/model"));
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 180000); // area regeneration reads a lot — 3 min cap
  return streamChat({ ...profile }, [{ role: "system", content: system }, { role: "user", content: user }], { signal: ac.signal, onDelta: () => {} })
    .then(({ text }) => text || "").finally(() => clearTimeout(to));
}

const ENTRY_CONTRACT = `### <Screen> · <Exact control label>
aliases: <lowercase synonyms users might say>
What: <one sentence>
Why: <one sentence>
Behavior: <2-3 sentences of REAL behavior — defaults, gotchas, who can see it>
Example: <short concrete example, only when it helps>`;

// ---- §6 STEP 2: regenerate ONE area file from current source ----
async function generate(areaFile) {
  try {
    if (!(await available())) return { error: "Librarian needs the source tree + git (dev machines only)." };
    const area = AREAS.find((a) => a.file === areaFile);
    if (!area) return { error: "unknown area file" };
    const kPath = path.join(KDIR, area.file);
    const current = fs.existsSync(kPath) ? fs.readFileSync(kPath, "utf8") : "";
    // Read the area's component sources (current working tree = the truth).
    const sources = [];
    for (const c of area.components) {
      const p = c === "App.jsx" || c === "markdown.jsx" ? path.join(ROOT, "src", c) : path.join(ROOT, "src", "components", c);
      try { sources.push({ name: c, content: fs.readFileSync(p, "utf8").slice(0, 60000) }); } catch { /* component may not exist yet */ }
    }
    if (!sources.length) return { error: "no readable source files for this area" };

    const sys = `You are the Sage Librarian inside Madav: you maintain Sage's control-level knowledge file for the "${area.label}" area so it exactly matches the CURRENT source code.
You receive (1) the current knowledge file and (2) the current source of the components it documents.
Return the COMPLETE UPDATED knowledge file as raw markdown — the whole file, not a diff, no code fence, no commentary.
Entry contract (split marker is "### " — keep it exactly):
${ENTRY_CONTRACT}
Hard rules:
- Exact labels copied from the JSX strings; behavior ONLY from real code in the provided source.
- Keep entries for controls still present (update them if behavior changed); REMOVE entries for controls that no longer exist; ADD entries for new controls.
- State role/platform gates (admin-only, desktop-only, web-only) when the code shows them.
- ≤110 words per entry, warm expert voice, no markdown beyond the contract's structure.
- NEVER invent. If you cannot verify a control from the provided source, keep its existing entry unchanged.
- Keep the file's leading header comment lines (before the first "### ") unchanged.`;

    const user = `=== CURRENT KNOWLEDGE FILE: sage-knowledge/${area.file} ===\n${current.slice(0, 40000)}\n\n` +
      sources.map((s) => `=== SOURCE: ${s.name} ===\n${s.content}`).join("\n\n");

    let proposed = (await askModel(sys, user)).trim();
    // Tolerate fenced replies from weaker models.
    const fence = /^```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/.exec(proposed);
    if (fence) proposed = fence[1].trim();
    // Validate before it ever reaches the admin: must still be a plausible knowledge file.
    const d = entryDiff(current, proposed);
    if (proposed.length < 400 || d.newCount < 3) return { error: "model returned an implausible file (too small) — try a stronger model" };
    if (d.newCount < d.oldCount * 0.5) return { error: `model dropped ${d.oldCount - d.newCount} of ${d.oldCount} entries — refused as unsafe; try a stronger model` };

    const st = loadState();
    st.proposals = st.proposals || {};
    st.proposals[area.file] = { proposed, base: current, diff: d, components: area.components, at: Date.now(), model: (settings.activeProfile() || {}).model || "" };
    saveState(st);
    return { area: area.file, label: area.label, diff: d };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

// ---- proposals for the UI (entry-level diff + full texts for review) ----
function proposals() {
  const st = loadState();
  return Object.entries(st.proposals || {}).map(([file, p]) => ({
    file, label: (AREAS.find((a) => a.file === file) || {}).label || file,
    diff: p.diff, components: p.components, at: p.at, model: p.model,
    base: p.base, proposed: p.proposed,
  }));
}

// ---- APPLY (admin clicked): backup → write → clear proposal; sweep marked when queue empties ----
async function apply(areaFile) {
  try {
    const st = loadState();
    const p = (st.proposals || {})[areaFile];
    if (!p) return { error: "no pending proposal for " + areaFile };
    const kPath = path.join(KDIR, areaFile);
    const onDisk = fs.existsSync(kPath) ? fs.readFileSync(kPath, "utf8") : "";
    if (onDisk !== p.base) return { error: "knowledge file changed since this proposal was generated — re-scan and regenerate" };
    const backup = kPath + ".libbak-" + Date.now();
    if (onDisk) fs.copyFileSync(kPath, backup);
    fs.writeFileSync(kPath, p.proposed);
    delete st.proposals[areaFile];
    if (!Object.keys(st.proposals).length) { try { st.lastSweep = await git(["rev-parse", "HEAD"]); } catch { /* keep old baseline */ } }
    saveState(st);
    return { applied: true, backup: path.relative(ROOT, backup), swept: !Object.keys(st.proposals).length };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

function discard(areaFile) {
  const st = loadState();
  if (st.proposals && st.proposals[areaFile]) { delete st.proposals[areaFile]; saveState(st); }
  return { discarded: true };
}

function rollback(areaFile, backupRel) {
  try {
    const kPath = path.join(KDIR, areaFile);
    const bak = path.resolve(ROOT, backupRel || "");
    if (!bak.startsWith(KDIR + path.sep) || !bak.includes(".libbak-")) return { error: "not a librarian backup" };
    fs.copyFileSync(bak, kPath);
    return { restored: true };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

async function status() {
  const ok = await available();
  const st = loadState();
  return { available: ok, root: ROOT, lastSweep: (st.lastSweep || "").slice(0, 10), pending: Object.keys(st.proposals || {}).length };
}

module.exports = { status, scan, generate, proposals, apply, discard, rollback };
