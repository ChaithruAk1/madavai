// Personal "Saved" library — interesting BrainEdge responses the user bookmarks.
// One JSON file in userData. Each item:
//   { id, text, question, meta:{model,provider}, convId, mode, note, tags:[], createdAt }
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const rand = (p) => p + Math.random().toString(36).slice(2, 9);
const file = () => path.join(app.getPath("userData"), "brainedge-saved.json");

function load() {
  try { return JSON.parse(fs.readFileSync(file(), "utf8")); } catch { return []; }
}
function persist(list) {
  try { fs.writeFileSync(file(), JSON.stringify(list, null, 2)); } catch {}
  return list;
}

function listSaved() {
  return load().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
function addSaved(item) {
  const list = load();
  const rec = {
    id: rand("sav_"),
    text: String(item.text || ""),
    question: String(item.question || ""),
    meta: item.meta || null,
    convId: item.convId || null,
    mode: item.mode || null,
    note: String(item.note || ""),
    tags: Array.isArray(item.tags) ? item.tags : [],
    createdAt: Date.now(),
  };
  list.push(rec);
  persist(list);
  return rec;
}
function updateSaved(id, patch) {
  const list = load();
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch, id };
  persist(list);
  return list[i];
}
function removeSaved(id) {
  persist(load().filter((x) => x.id !== id));
  return true;
}

module.exports = { listSaved, addSaved, updateSaved, removeSaved };
