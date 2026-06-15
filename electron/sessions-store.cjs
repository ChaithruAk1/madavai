// Persisted "tasks" (conversations) for Let's Talk / Let's Collaborate / Let's Build.
// Each task = { id, mode, cwd, title, messages:[{role,content}], updatedAt }. Survives restart.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const rand = (p) => p + Math.random().toString(36).slice(2, 9);
const dir = () => path.join(app.getPath("userData"), "sessions-data");
const file = (id) => path.join(dir(), id + ".json");
const ensure = () => fs.mkdirSync(dir(), { recursive: true });

function raw() {
  ensure(); const out = [];
  for (const f of fs.readdirSync(dir())) {
    if (!f.endsWith(".json")) continue;
    try { out.push(JSON.parse(fs.readFileSync(path.join(dir(), f), "utf8"))); } catch {}
  }
  return out;
}
// agentScope: undefined = all; "only" = only agent/team-bound; "exclude" = general chats only.
function listSessions(mode, agentScope) {
  return raw().filter((s) => s.mode === mode)
    .filter((s) => {
      const bound = !!(s.agent || (s.team && s.team.members && s.team.members.length));
      if (agentScope === "only") return bound;
      if (agentScope === "exclude") return !bound;
      return true;
    })
    .map((s) => ({
      id: s.id, mode: s.mode, title: s.title, cwd: s.cwd, updatedAt: s.updatedAt, count: (s.messages || []).length,
      projectId: s.projectId || null, // Collaborate tasks scoped to a project list under that project
      agentName: s.agent ? s.agent.name : null,
      teamName: s.team && s.team.members && s.team.members.length ? s.team.name : null,
    }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function getSession(id) { try { return JSON.parse(fs.readFileSync(file(id), "utf8")); } catch { return null; } }
function createSession(mode, cwd, projectId) { const s = { id: rand("ses_"), mode, cwd: cwd || "", projectId: projectId || null, title: "New task", messages: [], createdAt: Date.now(), updatedAt: Date.now() }; saveSession(s); return s; }
function saveSession(s) { ensure(); s.updatedAt = Date.now(); fs.writeFileSync(file(s.id), JSON.stringify(s, null, 2)); try { require("./chat-sync.cjs").maybePush(); } catch {} return s; }
function saveSessionRaw(s) { ensure(); fs.writeFileSync(file(s.id), JSON.stringify(s, null, 2)); return s; } // used by chat-sync pull (must NOT bump updatedAt or re-push)
function allSessions() { try { return raw(); } catch { return []; } }
function deleteSession(id) { try { fs.unlinkSync(file(id)); } catch {} return true; }

// Global search: scan message CONTENT (not just titles) across all saved conversations.
// Returns matches with a short snippet around the first hit. Case-insensitive.
function searchSessions(q, mode) {
  const needle = String(q || "").toLowerCase();
  if (needle.length < 2) return [];
  const out = [];
  for (const s of raw()) {
    if (mode && s.mode !== mode) continue;
    let snippet = "";
    if ((s.title || "").toLowerCase().includes(needle)) snippet = s.title;
    else {
      for (const m of s.messages || []) {
        const c = typeof m.content === "string" ? m.content : "";
        const i = c.toLowerCase().indexOf(needle);
        if (i >= 0) { snippet = c.slice(Math.max(0, i - 32), i + needle.length + 48).replace(/\s+/g, " "); break; }
      }
    }
    if (snippet) out.push({ id: s.id, mode: s.mode, title: s.title, updatedAt: s.updatedAt, snippet });
    if (out.length >= 50) break;
  }
  return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

module.exports = { listSessions, getSession, createSession, saveSession, saveSessionRaw, allSessions, deleteSession, searchSessions };
