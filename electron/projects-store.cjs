// Projects store — project workspaces persisted to disk.
// A project has: name, custom instructions, knowledge (text/files injected as context),
// and a set of conversations whose messages persist across restarts.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const rand = (p) => p + Math.random().toString(36).slice(2, 9);
const baseDir = () => path.join(app.getPath("userData"), "projects-data");
const convDir = () => path.join(baseDir(), "conversations");
const projFile = () => path.join(baseDir(), "projects.json");
const ensure = () => fs.mkdirSync(convDir(), { recursive: true });

// WORKROOMS visual identity — every room gets a deterministic {color, glyph}, same
// scheme as agents. KEEP IN SYNC with autoIdentity in src/components/Agents.jsx.
const ID_COLORS = ["#13c2d6", "#8b7cf6", "#f4a261", "#e76f81", "#5fb573", "#d6a313", "#5e9bf2", "#c77dba"];
const ID_GLYPHS = ["🜁", "✦", "◆", "⌘", "♟", "✺", "☄", "❖", "⚙", "🜃", "♜", "✤"];
const hashStr = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };
const autoIdentity = (seed) => ({ color: ID_COLORS[hashStr(seed) % ID_COLORS.length], glyph: ID_GLYPHS[hashStr(seed + "g") % ID_GLYPHS.length] });

// Normalize older records into Workrooms shape: identity + agent crew always present.
function normalize(p) {
  if (!p) return p;
  if (!p.identity || !p.identity.color) p.identity = autoIdentity(p.id || p.name || "room");
  if (!Array.isArray(p.agentIds)) p.agentIds = [];
  if (!Array.isArray(p.teamIds)) p.teamIds = []; // teams staffed in the room (crew's big sibling)
  return p;
}

function loadProjects() { try { return (JSON.parse(fs.readFileSync(projFile(), "utf8")).projects || []).map(normalize); } catch { return []; } }
function saveProjects(arr) { ensure(); fs.writeFileSync(projFile(), JSON.stringify({ projects: arr }, null, 2)); }

function listProjects() {
  // Shelf data: identity, crew, knowledge meter, and pulse (last conversation activity).
  const convMeta = {};
  for (const c of rawConversations()) {
    const m = convMeta[c.projectId] || (convMeta[c.projectId] = { count: 0, lastAt: 0 });
    m.count++;
    if ((c.updatedAt || 0) > m.lastAt) m.lastAt = c.updatedAt || 0;
  }
  return loadProjects().map((p) => ({
    id: p.id, name: p.name, instructions: p.instructions, createdAt: p.createdAt, updatedAt: p.updatedAt,
    knowledgeCount: (p.knowledge || []).length,
    knowledgeBytes: (p.knowledge || []).reduce((n, k) => n + String(k.content || "").length, 0),
    identity: p.identity, agentIds: p.agentIds, teamIds: p.teamIds, folder: p.folder || "", githubUrl: p.githubUrl || "",
    sim: !!p.sim, // built-in Project Simulation room (Workrooms guide) — delete-protected in the UI
    convCount: (convMeta[p.id] || {}).count || 0, lastConvAt: (convMeta[p.id] || {}).lastAt || 0,
  }));
}
function getProject(id) { return loadProjects().find((p) => p.id === id) || null; }
function createProject(name) {
  const id = rand("prj_");
  const p = { id, name: name || "Untitled project", instructions: "", knowledge: [], agentIds: [], teamIds: [], identity: autoIdentity(id), createdAt: Date.now() };
  const arr = loadProjects(); arr.unshift(p); saveProjects(arr); return p;
}
function updateProject(id, patch) {
  const arr = loadProjects(); const i = arr.findIndex((p) => p.id === id); if (i < 0) return null;
  arr[i] = { ...arr[i], ...patch }; saveProjects(arr); return arr[i];
}
function deleteProject(id) {
  saveProjects(loadProjects().filter((p) => p.id !== id));
  for (const c of rawConversations()) if (c.projectId === id) deleteConversation(c.id);
  return true;
}

// ---- agent crew (Workrooms) ----
// project.agentIds[] = the room's crew. Assign/unassign keeps order stable and dedupes.
function assignAgent(projectId, agentId) {
  if (!agentId) return null;
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  if (!p.agentIds.includes(agentId)) p.agentIds.push(agentId);
  p.updatedAt = Date.now(); saveProjects(arr); return p;
}
function unassignAgent(projectId, agentId) {
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  p.agentIds = p.agentIds.filter((id) => id !== agentId);
  p.updatedAt = Date.now(); saveProjects(arr); return p;
}
function assignTeam(projectId, teamId) {
  if (!teamId) return null;
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  if (!p.teamIds.includes(teamId)) p.teamIds.push(teamId);
  p.updatedAt = Date.now(); saveProjects(arr); return p;
}
function unassignTeam(projectId, teamId) {
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  p.teamIds = p.teamIds.filter((id) => id !== teamId);
  p.updatedAt = Date.now(); saveProjects(arr); return p;
}

// ---- knowledge ----
function addKnowledge(projectId, item) {
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  p.knowledge = p.knowledge || [];
  p.knowledge.push({ id: rand("kn_"), name: item.name || "untitled", type: item.type || "text", content: String(item.content || "").slice(0, 200000) });
  saveProjects(arr); return p;
}
function removeKnowledge(projectId, knId) {
  const arr = loadProjects(); const p = arr.find((x) => x.id === projectId); if (!p) return null;
  p.knowledge = (p.knowledge || []).filter((k) => k.id !== knId); saveProjects(arr); return p;
}

// System prompt = instructions + knowledge, injected into every conversation in the project.
function projectSystem(project) {
  let s = `You are Madav, a helpful AI assistant working within the project "${project.name}".`;
  if (project.instructions) s += `\n\nProject instructions:\n${project.instructions}`;
  const kn = project.knowledge || [];
  if (kn.length) s += `\n\nProject knowledge (reference material you can use):\n` + kn.map((k) => `### ${k.name}\n${k.content}`).join("\n\n");
  s += `\n\nReply clearly in natural language; never paste raw JSON or tool syntax.`;
  return s;
}

// ---- conversations ----
const convFile = (id) => path.join(convDir(), id + ".json");
function rawConversations() {
  ensure(); const out = [];
  for (const f of fs.readdirSync(convDir())) {
    if (!f.endsWith(".json")) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(convDir(), f), "utf8"))); } catch {}
  }
  return out;
}
function listConversations(projectId) {
  return rawConversations().filter((c) => c.projectId === projectId)
    .map((c) => ({ id: c.id, projectId: c.projectId, title: c.title, updatedAt: c.updatedAt, count: (c.messages || []).length }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function getConversation(id) { try { return JSON.parse(fs.readFileSync(convFile(id), "utf8")); } catch { return null; } }
function createConversation(projectId) {
  const c = { id: rand("cnv_"), projectId, title: "New conversation", messages: [], createdAt: Date.now(), updatedAt: Date.now() };
  saveConversation(c); return c;
}
function saveConversation(c) { ensure(); c.updatedAt = Date.now(); fs.writeFileSync(convFile(c.id), JSON.stringify(c, null, 2)); return c; }
function deleteConversation(id) { try { fs.unlinkSync(convFile(id)); } catch {} return true; }

module.exports = {
  listProjects, getProject, createProject, updateProject, deleteProject,
  assignAgent, unassignAgent, assignTeam, unassignTeam,
  addKnowledge, removeKnowledge, projectSystem,
  listConversations, getConversation, createConversation, saveConversation, deleteConversation,
};
