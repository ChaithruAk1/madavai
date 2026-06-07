// Log of remote "Via Mobile" requests (e.g. from the Telegram bot) and their results,
// so the in-app Via Mobile inbox can show what came in from your phone and what BrainEdge did.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = () => path.join(app.getPath("userData"), "brainedge-viamobile-log.json");
const load = () => { try { return JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { return []; } };
const save = (l) => { try { fs.writeFileSync(FILE(), JSON.stringify(l.slice(-2000), null, 2)); } catch {} };

function add(entry) {
  const l = load();
  const rec = { id: "vm_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), ...entry };
  l.push(rec);
  save(l);
  return rec;
}
function list() { return load().slice().reverse(); } // newest first
function remove(id) { save(load().filter((r) => r.id !== id)); return true; }
function clear() { save([]); return true; }

module.exports = { add, list, remove, clear };
