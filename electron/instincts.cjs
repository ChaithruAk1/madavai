// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Skill Forge — instinct → skill evolution (the ECC continuous-learning pattern, our way).
//
// Madav quietly OBSERVES completed turns (a one-line task signature, never full content).
// When the same kind of task keeps recurring (≥3 similar observations), it has the active
// model DRAFT a reusable skill (SKILL.md). Drafts go to a pending queue — NOTHING becomes
// a real skill until the user clicks Approve in the Skills screen (Repair-Bay rule: the
// human click is mandatory). Approved skills land in <userData>/skills, which is added to
// settings.skillsDirs so they load like any other skill.
//
// Fail-open everywhere: observation/forging errors are swallowed; worst case the feature
// simply does nothing. Gate: settings.extras.forge !== false (Extras switchboard).
const fs = require("fs");
const path = require("path");

function dataFile() {
  try { return path.join(require("electron").app.getPath("userData"), "skill-forge.json"); }
  catch { return path.join(__dirname, "..", ".skill-forge.json"); }
}
function load() { try { return JSON.parse(fs.readFileSync(dataFile(), "utf8")); } catch { return { obs: [], drafts: {}, lastForge: 0 }; } }
function save(st) { try { fs.writeFileSync(dataFile(), JSON.stringify(st, null, 2)); } catch {} }

const words = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4);
function similar(a, b) { // Dice coefficient over word sets — cheap, no model
  const A = new Set(words(a)), B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let hit = 0; for (const w of A) if (B.has(w)) hit++;
  return (2 * hit) / (A.size + B.size);
}

// Record one completed turn (call fire-and-forget; agent/cowork/code modes only).
function observe(mode, userText) {
  try {
    const sig = String(userText || "").replace(/\s+/g, " ").trim().slice(0, 160);
    if (sig.length < 24) return; // too short to mean anything
    const st = load();
    st.obs.push({ at: Date.now(), mode, sig });
    if (st.obs.length > 200) st.obs = st.obs.slice(-200);
    save(st);
  } catch {}
}

// When a pattern has repeated, draft a skill with the active model (≤1 forge/hour,
// ≤5 pending drafts). Returns silently in every failure case.
async function maybeForge() {
  let st;
  try {
    st = load();
    if (Date.now() - (st.lastForge || 0) < 3600000) return;
    if (Object.keys(st.drafts || {}).length >= 5) return;
    // Find the densest cluster among recent observations not already covered by a draft.
    const recent = st.obs.slice(-60);
    let cluster = null;
    for (let i = 0; i < recent.length; i++) {
      const c = recent.filter((o) => similar(o.sig, recent[i].sig) >= 0.5);
      if (c.length >= 3 && (!cluster || c.length > cluster.length)) cluster = c;
    }
    if (!cluster) return;
    const covered = Object.values(st.drafts || {}).some((d) => similar(d.evidence[0], cluster[0].sig) >= 0.5);
    if (covered) return;
    st.lastForge = Date.now(); save(st); // claim the slot BEFORE the model call (no double-forge)

    const settings = require("./settings.cjs");
    const profile = settings.activeProfile();
    if (!profile || !profile.baseUrl || !profile.model) return;
    const { streamChat } = require("./providers.cjs");
    const sys = `You distill a recurring user task into a reusable SKILL file. Reply with ONLY the file content, no fence, in EXACTLY this shape:
---
name: <kebab-case-short-name>
description: <one sentence: when Madav should use this skill>
---

# <Title>

<Concise, concrete instructions Madav should follow when this task recurs: the steps, the output format the user seems to want, pitfalls. Write from the EVIDENCE only — never invent specifics. Max 250 words.>`;
    const user = "EVIDENCE — the user asked for these similar tasks recently:\n" + cluster.map((c) => "- " + c.sig).join("\n");
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 90000);
    let text = "";
    try { text = (await streamChat({ ...profile }, [{ role: "system", content: sys }, { role: "user", content: user }], { signal: ac.signal, onDelta: () => {} })).text || ""; }
    finally { clearTimeout(to); }
    const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text.trim().replace(/^```[a-z]*\n|```$/g, ""));
    if (!m) return;
    const name = ((/name:\s*(.+)/.exec(m[1]) || [])[1] || "").trim().replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
    const description = ((/description:\s*(.+)/.exec(m[1]) || [])[1] || "").trim();
    if (!name || !description || m[2].trim().length < 60) return;
    st = load();
    st.drafts[name] = { name, description, body: text.trim(), evidence: cluster.map((c) => c.sig).slice(0, 5), at: Date.now() };
    save(st);
  } catch { /* fail open */ }
}

function list() {
  const st = load();
  return Object.values(st.drafts || {}).sort((a, b) => b.at - a.at);
}

// Approve: write the draft as a real skill into <userData>/skills/<name>/SKILL.md and
// make sure that folder is in settings.skillsDirs (clobber-safe read-modify-write).
function approve(name) {
  try {
    const st = load();
    const d = (st.drafts || {})[name];
    if (!d) return { error: "draft not found" };
    const settings = require("./settings.cjs");
    const base = path.join(require("electron").app.getPath("userData"), "skills");
    const dir = path.join(base, d.name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), d.body + "\n\n<!-- Forged by Madav from " + d.evidence.length + " observed tasks; approved by the user. -->\n");
    const cfg = settings.load();
    const dirs = Array.isArray(cfg.skillsDirs) ? cfg.skillsDirs : [];
    if (!dirs.includes(base)) settings.save({ ...cfg, skillsDirs: [...dirs, base] });
    delete st.drafts[name]; save(st);
    return { approved: true, dir };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

function discard(name) {
  const st = load();
  if (st.drafts && st.drafts[name]) { delete st.drafts[name]; save(st); }
  return { discarded: true };
}

module.exports = { observe, maybeForge, list, approve, discard };
