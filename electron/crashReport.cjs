// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Desktop crash capture — LOCAL ONLY (no network). Formats via the shared @madav/insight formatCrash and
// appends to a capped JSON file in userData. Flag-guarded at the call site (MADAV_CRASH_REPORTS).
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

let _format = null; // shared formatter, loaded async at startup
(async () => { try { ({ formatCrash: _format } = await import(pathToFileURL(path.join(__dirname, "..", "packages", "insight", "dist", "src", "index.js")).href)); } catch {} })();

let _file = null; const CAP = 50;
function setLogPath(p) { _file = p; }

function record(kind, err, meta) {
  try {
    const r = _format ? _format(kind, err, meta || {})
      : { id: "crash_" + Date.now().toString(36), ts: new Date().toISOString(), kind, message: String((err && err.message) || err).slice(0, 1000), stack: err && err.stack ? String(err.stack).slice(0, 8000) : undefined };
    if (!_file) return r;
    let list = [];
    try { const j = JSON.parse(fs.readFileSync(_file, "utf8")); if (Array.isArray(j)) list = j; } catch {}
    list.push(r); if (list.length > CAP) list = list.slice(-CAP);
    fs.writeFileSync(_file, JSON.stringify(list, null, 2));
    return r;
  } catch { return null; }
}
function list() { try { return JSON.parse(fs.readFileSync(_file, "utf8")); } catch { return []; } }
module.exports = { record, list, setLogPath };
