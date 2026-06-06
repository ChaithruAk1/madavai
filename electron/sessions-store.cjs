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
function listSessions(mode) {
  return raw().filter((s) => s.mode === mode)
    .map((s) => ({ id: s.id, mode: s.mode, title: s.title, cwd: s.cwd, updatedAt: s.updatedAt, count: (s.messages || []).length }))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}
function getSession(id) { try { return JSON.parse(fs.readFileSync(file(id), "utf8")); } catch { return null; } }
function createSession(mode, cwd) { const s = { id: rand("ses_"), mode, cwd: cwd || "", title: "New task", messages: [], createdAt: Date.now(), updatedAt: Date.now() }; saveSession(s); return s; }
function saveSession(s) { ensure(); s.updatedAt = Date.now(); fs.writeFileSync(file(s.id), JSON.stringify(s, null, 2)); return s; }
function deleteSession(id) { try { fs.unlinkSync(file(id)); } catch {} return true; }

module.exports = { listSessions, getSession, createSession, saveSession, deleteSession };
