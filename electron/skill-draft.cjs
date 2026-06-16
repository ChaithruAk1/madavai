// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Robustly turn a recorder's model output (ideally a frontmatter SKILL.md, but real
// models add preamble / fences / drop fields) into a Skill Forge DRAFT. The whole point
// of recording is that you ALWAYS get a draft to approve or edit — so this never throws
// away a recording: it tolerates messy output and, in the worst case, synthesizes a
// draft from the raw text. Drafts land in the same skill-forge.json the Playbook reads.
const fs = require("fs");
const path = require("path");

function kebab(s) {
  return String(s || "").trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 48);
}

// Tolerant parse: strip wrapping fences, find the FIRST `---..---` block ANYWHERE (not
// anchored at the start), fall back to a `# Title` for the name, and ALWAYS return a
// well-formed SKILL.md body with both name + description in the frontmatter.
function parseSkill(raw, fallbackName) {
  let text = String(raw || "").trim();
  text = text.replace(/^```[a-zA-Z]*\s*\n?/, "").replace(/\n?```\s*$/, "").trim();
  let name = "", description = "", body = text;
  const fm = /(^|\n)---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/.exec(text);
  if (fm) {
    const head = fm[2];
    name = ((/name:\s*(.+)/i.exec(head) || [])[1] || "").trim();
    description = ((/description:\s*(.+)/i.exec(head) || [])[1] || "").trim();
    body = text.slice(fm.index + fm[0].length).trim() || text;
  }
  if (!name) { const h = /(^|\n)#\s+(.+)/.exec(text); if (h) name = h[2].trim(); }
  name = kebab(name) || kebab(fallbackName) || ("recorded-" + Date.now().toString(36));
  if (!description) description = "Recorded workflow — review and edit before use.";
  if (!body || !body.trim()) body = "# Recorded workflow\n\n(No steps were captured.)";
  const out = `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}`;
  return { name, description, body: out };
}

// Always writes a draft. Returns { name } or null only if the data file is unwritable.
function saveDraft({ text, fallbackName, evidence }) {
  const parsed = parseSkill(text, fallbackName);
  if (!parsed.name) return null;
  const dataFile = path.join(require("electron").app.getPath("userData"), "skill-forge.json");
  let st;
  try { st = JSON.parse(fs.readFileSync(dataFile, "utf8")); } catch { st = { obs: [], drafts: {}, lastForge: 0 }; }
  st.obs = st.obs || []; st.drafts = st.drafts || {};
  st.drafts[parsed.name] = { name: parsed.name, description: parsed.description, body: parsed.body, evidence: evidence || [], at: Date.now() };
  try { fs.writeFileSync(dataFile, JSON.stringify(st, null, 2)); } catch { return null; }
  return { name: parsed.name };
}

module.exports = { parseSkill, saveDraft, kebab };
