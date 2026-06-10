// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// .agent share files + versioning.
//  - Export one agent (with its knowledge, tools, identity) to a portable .agent file;
//    import one on any BrainEdge install. Prerequisite for sharing/marketplace.
//  - Every Studio save snapshots the previous version (last 10 kept) with rollback.
const { app, dialog } = require("electron");
const fs = require("fs");
const path = require("path");

const FORMAT = "brainedge.agent/v1";
const MAX_VERSIONS = 10;

const vdir = () => path.join(app.getPath("userData"), "agent-versions");
const vfile = (id) => path.join(vdir(), String(id).replace(/[^\w.-]/g, "_") + ".json");

// ---- versioning ----
function listVersions(agentId) {
  try { return JSON.parse(fs.readFileSync(vfile(agentId), "utf8")); } catch { return []; }
}
// Snapshot the agent AS IT WAS before an overwrite. Skips no-op saves.
function snapshot(agent) {
  if (!agent || !agent.id) return { ok: false };
  const versions = listVersions(agent.id);
  const fp = JSON.stringify({ n: agent.name, d: agent.description, i: agent.instructions, t: agent.tools, k: (agent.knowledge || []).map((x) => x.name + ":" + (x.content || "").length), m: agent.model });
  if (versions.length && versions[0].fp === fp) return { ok: true, skipped: true };
  versions.unshift({ at: Date.now(), fp, agent: JSON.parse(JSON.stringify(agent)) });
  fs.mkdirSync(vdir(), { recursive: true });
  fs.writeFileSync(vfile(agent.id), JSON.stringify(versions.slice(0, MAX_VERSIONS), null, 2));
  return { ok: true, count: Math.min(versions.length, MAX_VERSIONS) };
}

// ---- .agent export / import ----
async function exportAgent(win, agent) {
  if (!agent || !agent.instructions) return { error: "Nothing to export — the agent has no instructions yet." };
  const name = (agent.name || "agent").replace(/[^\w-]+/g, "-").toLowerCase();
  const r = await dialog.showSaveDialog(win, {
    title: "Export agent",
    defaultPath: name + ".agent",
    filters: [{ name: "BrainEdge agent", extensions: ["agent"] }],
  });
  if (r.canceled || !r.filePath) return { canceled: true };
  const payload = {
    format: FORMAT,
    exportedAt: new Date().toISOString(),
    app: "BrainEdge",
    agent: {
      name: agent.name || "", description: agent.description || "", instructions: agent.instructions || "",
      tools: agent.tools || {}, identity: agent.identity || null, knowledge: agent.knowledge || [],
      browserAllow: agent.browserAllow || "",
      memorySeed: [], // memory stays private to the exporting machine by design
    },
  };
  try { fs.writeFileSync(r.filePath, JSON.stringify(payload, null, 2), "utf8"); return { ok: true, file: r.filePath }; }
  catch (e) { return { error: String((e && e.message) || e) }; }
}

async function importAgent(win) {
  const r = await dialog.showOpenDialog(win, {
    title: "Import a .agent file",
    properties: ["openFile"],
    filters: [{ name: "BrainEdge agent", extensions: ["agent", "json"] }],
  });
  if (r.canceled || !r.filePaths.length) return { canceled: true };
  try {
    const raw = JSON.parse(fs.readFileSync(r.filePaths[0], "utf8"));
    const a = raw.agent || raw; // tolerate a bare agent object
    if (!a || !String(a.instructions || "").trim()) return { error: "That file has no agent instructions — not a valid .agent file." };
    const agent = {
      id: "agent_" + Math.random().toString(36).slice(2, 9), // fresh id — never collide with an existing agent
      name: String(a.name || "Imported agent").slice(0, 60),
      description: String(a.description || "").slice(0, 200),
      instructions: String(a.instructions || ""),
      tools: { files: !!(a.tools && a.tools.files), shell: !!(a.tools && a.tools.shell), connectors: !!(a.tools && a.tools.connectors), skills: !!(a.tools && a.tools.skills), browser: !!(a.tools && a.tools.browser) },
      browserAllow: String(a.browserAllow || "").slice(0, 600),
      identity: a.identity || null,
      knowledge: (Array.isArray(a.knowledge) ? a.knowledge : []).slice(0, 24).map((k) => ({ name: String(k.name || "doc").slice(0, 120), content: String(k.content || "").slice(0, 400000) })),
      model: "", // model pins are machine-specific — never imported
      createdAt: Date.now(),
    };
    return { ok: true, agent };
  } catch (e) { return { error: String((e && e.message) || e) }; }
}

module.exports = { exportAgent, importAgent, snapshot, listVersions };
