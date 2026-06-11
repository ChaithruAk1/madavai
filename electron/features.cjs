// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// features — the engine's view of the build channel. builtIn(key) answers "does THIS
// build ship feature <key>?" from electron/build-features.json (written by
// scripts/build-features.mjs at build time; admin channel = everything true).
//
// Rules that keep coupling/decoupling safe:
//  - DEV always has everything (unpackaged apps ignore the manifest, so a stale
//    public manifest on disk can never disable features during development).
//  - Missing/unreadable manifest = everything ON (fail open — a build problem must
//    never brick a feature at runtime).
//  - builtIn() is the BUILD gate; the runtime Extras switchboard
//    ((settings.extras || {}).<key> !== false) remains the OWNER gate. Feature
//    availability = builtIn(key) && extras gate. Keep keys in sync with src/extras.js.
let _app = null;
try { _app = require("electron").app; } catch {}
let _m;

function builtIn(key) {
  if (!_app || !_app.isPackaged) return true; // dev: full feature set, always
  if (_m === undefined) { try { _m = require("./build-features.json"); } catch { _m = null; } }
  return !_m || _m[key] !== false;
}

function channel() {
  if (!_app || !_app.isPackaged) return "dev";
  if (_m === undefined) { try { _m = require("./build-features.json"); } catch { _m = null; } }
  return (_m && _m.channel) || "admin";
}

module.exports = { builtIn, channel };
