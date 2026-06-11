// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Repair Bay — the fix half of the zero-bug loop.
// For a failed Test Center check: an AI repair agent reads the error + the suspect file,
// produces a plain-English diagnosis and an EXACT proposed patch. Nothing is applied
// without the admin's explicit approval. Every apply writes a timestamped backup first,
// and a one-click rollback restores it. Autonomous diagnosis, supervised surgery.
const fs = require("fs");
const path = require("path");
const settings = require("./settings.cjs");

const ROOT = path.join(__dirname, "..");
const SAFE_EXT = new Set([".cjs", ".mjs", ".js", ".jsx", ".css", ".json"]);

// Which source files each test (by id prefix/exact id) most likely implicates.
// The repair agent reads these to ground its diagnosis in real code.
function suspectFiles(testId) {
  const e = (...p) => path.join("electron", ...p);
  if (testId.startsWith("parse_server")) return [path.join("server", "auth-server.mjs")];
  if (testId.startsWith("parse_pkg")) return ["package.json"];
  if (testId.startsWith("parse_")) return [e(testId.replace(/^parse_/, ""))];
  const MAP = {
    settings_roundtrip: [e("settings.cjs")],
    agents_schema: [e("settings.cjs")],
    sessions_crud: [e("sessions-store.cjs")],
    projects_crud: [e("projects-store.cjs")],
    usage_summary: [e("usage-store.cjs")],
    file_tools: [e("agent-openai.cjs")],
    path_escape: [e("agent-openai.cjs")],
    provider_ping: [e("providers.cjs"), e("settings.cjs")],
    instruction_follow: [e("providers.cjs")],
    agent_identity: [e("session-manager.cjs")],
    json_discipline: [e("providers.cjs")],
    team_plan: [e("session-manager.cjs")],
    markdown_output: [e("providers.cjs")],
    agent_sys_knowledge: [e("session-manager.cjs")],
    member_profile_pin: [e("session-manager.cjs")],
    team_relay_e2e: [e("session-manager.cjs"), e("agent-openai.cjs")],
    skills_discover: [e("skills-manager.cjs")],
    task_store: [e("task-store.cjs")],
    viamobile_log: [e("viamobile-log.cjs")],
    cli_parses: [path.join("cli", "agent-core.mjs"), path.join("cli", "madav.mjs")],
    server_health: [path.join("server", "auth-server.mjs")],
    server_version: [path.join("server", "auth-server.mjs")],
    admin_locked: [path.join("server", "auth-server.mjs")],
  };
  return MAP[testId] || [];
}

const insideRoot = (rel) => {
  const abs = path.resolve(ROOT, rel);
  if (!abs.startsWith(path.resolve(ROOT) + path.sep)) throw new Error("file outside the project");
  if (!SAFE_EXT.has(path.extname(abs))) throw new Error("file type not allowed for auto-repair");
  return abs;
};

async function askModel(system, user) {
  const { streamChat } = require("./providers.cjs");
  const profile = settings.activeProfile();
  if (!profile || !profile.baseUrl || !profile.model) throw new Error("no active provider/model");
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 90000);
  try {
    const { text } = await streamChat({ ...profile }, [{ role: "system", content: system }, { role: "user", content: user }], { signal: ac.signal, onDelta: () => {} });
    return text || "";
  } finally { clearTimeout(to); }
}

// Step 1 — DIAGNOSE: the repair agent reads error + code, returns a grounded proposal.
async function diagnose(test) {
  const candidates = suspectFiles(test.id);
  const sources = candidates.map((rel) => {
    try { return { rel, content: fs.readFileSync(path.join(ROOT, rel), "utf8").slice(0, 26000) }; }
    catch { return null; }
  }).filter(Boolean);

  const sys = `You are the repair agent inside Madav's QA Test Center. A self-test failed; diagnose it and, when the cause is in the provided code, propose ONE minimal surgical fix.
Reply with ONLY a JSON object, no prose, no code fence:
{"diagnosis":"2-4 plain-English sentences a non-developer understands: what broke and why",
 "fixable":true|false,
 "file":"<relative path of the file to change, from the provided ones, or empty>",
 "find":"<EXACT, UNIQUE snippet copied verbatim from that file (10-400 chars)>",
 "replace":"<the corrected snippet>",
 "restartRequired":true|false,
 "confidence":"high|medium|low"}
Rules: "find" must be copied character-for-character from the provided source so the patch applies exactly once. If the failure is environmental (provider down, missing key, server not running, model too weak), set fixable:false and explain that in the diagnosis. Prefer the smallest possible change. Never invent files.`;

  const user = `FAILED TEST: ${test.name} (id: ${test.id}, area: ${test.area})\nERROR:\n${test.error}\n\n` +
    (sources.length ? sources.map((s) => `=== FILE: ${s.rel} ===\n${s.content}`).join("\n\n") : "(no source files mapped — diagnose from the error alone, fixable:false unless certain)");

  const raw = await askModel(sys, user);
  const i = raw.indexOf("{"), j = raw.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error("repair agent returned no JSON");
  const p = JSON.parse(raw.slice(i, j + 1));

  // Validate the patch BEFORE showing it: it must apply exactly once, or it's diagnosis-only.
  let valid = false, occurrences = 0;
  if (p.fixable && p.file && p.find) {
    try {
      const abs = insideRoot(p.file);
      const content = fs.readFileSync(abs, "utf8");
      occurrences = content.split(p.find).length - 1;
      valid = occurrences === 1 && typeof p.replace === "string" && p.replace !== p.find;
    } catch { valid = false; }
  }
  return {
    testId: test.id, testName: test.name,
    diagnosis: String(p.diagnosis || "").slice(0, 1200),
    fixable: !!p.fixable && valid,
    patchInvalid: !!p.fixable && !valid ? (occurrences === 0 ? "proposed snippet not found in the file" : occurrences > 1 ? "proposed snippet is not unique in the file" : "patch malformed") : null,
    file: p.file || "", find: p.find || "", replace: p.replace || "",
    restartRequired: !!p.restartRequired || /main\.cjs|preload\.cjs/.test(p.file || "") || /^src[\\/]/.test(p.file || ""),
    confidence: ["high", "medium", "low"].includes(p.confidence) ? p.confidence : "low",
  };
}

// Step 2 — APPLY (admin approved): backup → patch → drop the module cache so re-runs see it.
function applyFix({ file, find, replace }) {
  const abs = insideRoot(file);
  const content = fs.readFileSync(abs, "utf8");
  if (content.split(find).length - 1 !== 1) throw new Error("file changed since diagnosis — re-diagnose");
  const backup = abs + ".repairbak-" + Date.now();
  fs.copyFileSync(abs, backup);
  fs.writeFileSync(abs, content.replace(find, replace));
  try { delete require.cache[require.resolve(abs)]; } catch {}
  return { applied: true, backup: path.relative(ROOT, backup) };
}

// Step 3 — ROLLBACK: one click restores the pre-fix file.
function rollback({ file, backup }) {
  const abs = insideRoot(file);
  const bak = path.resolve(ROOT, backup);
  if (!bak.startsWith(path.resolve(ROOT) + path.sep) || !bak.includes(".repairbak-")) throw new Error("not a repair backup");
  fs.copyFileSync(bak, abs);
  try { delete require.cache[require.resolve(abs)]; } catch {}
  return { restored: true };
}

module.exports = { diagnose, applyFix, rollback };
