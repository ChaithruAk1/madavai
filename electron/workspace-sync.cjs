// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Workspace sync — agents, teams, agent folders and global instructions follow the
// ACCOUNT across devices (desktop ⇄ web). API keys, connectors and local paths are
// deliberately NOT synced — they stay on each device.
//
// Model: last-write-wins on the server's updatedAt.
//   pull(): on app start (and after sign-in) — if the server copy is newer than what
//           this device last saw, the synced keys are replaced locally.
//   push(): debounced after any local save that CHANGES a synced key.
// Loop-safety: applying a pull records the server stamp + content hash, so the save it
// triggers hashes identically and is not pushed back. Fail-open: offline/signed-out =
// silently do nothing; sync can never break local work. Gate: settings.workspaceSync !== false.
const crypto = require("crypto");
const settings = require("./settings.cjs");

const SYNC_KEYS = ["agents", "teams", "agentGroups", "globalInstructions"];
let lastHash = "";      // hash of the synced subset as last pulled/pushed
let pushTimer = null;

const subset = (cfg) => ({
  agents: cfg.agents || [],
  teams: cfg.teams || [],
  agentGroups: cfg.agentGroups || [],
  globalInstructions: cfg.globalInstructions || "",
});
const hashOf = (data) => crypto.createHash("sha1").update(JSON.stringify(data)).digest("hex");
const baseUrl = (cfg) => (cfg.authBaseUrl || "https://madav.ai").replace(/\/+$/, "");
const enabled = (cfg) => cfg.workspaceSync !== false;

async function pull() {
  try {
    const cfg = settings.load();
    if (!enabled(cfg)) return null;
    const auth = require("./auth.cjs");
    const r = await auth.apiCall("GET", "/workspace", null, baseUrl(cfg));
    if (!r || r.error) return null;
    if (!r.data) {
      // Account has no workspace yet — this device seeds it (if it has anything to offer).
      const local = subset(cfg);
      if ((local.agents.length || local.teams.length) > 0) { lastHash = ""; maybePush(); }
      else lastHash = hashOf(local);
      return null;
    }
    if ((r.updatedAt || 0) <= (cfg.workspaceSyncedAt || 0)) { lastHash = hashOf(subset(cfg)); return null; }
    const next = { ...settings.load() };
    for (const k of SYNC_KEYS) if (k in r.data) next[k] = r.data[k];
    next.workspaceSyncedAt = r.updatedAt;
    lastHash = hashOf(subset(next)); // the save below must not bounce back as a push
    settings.save(next);
    console.log("[workspace-sync] pulled account workspace (server", new Date(r.updatedAt).toISOString() + ")");
    return { pulled: true };
  } catch { return null; }
}

// Called after every settings save (cheap): pushes only when a synced key really changed.
function maybePush() {
  try {
    const cfg = settings.load();
    if (!enabled(cfg)) return;
    const h = hashOf(subset(cfg));
    if (h === lastHash) return; // nothing synced changed (or this save WAS the pull)
    clearTimeout(pushTimer);
    pushTimer = setTimeout(async () => {
      try {
        const cfg2 = settings.load();
        const data = subset(cfg2);
        const h2 = hashOf(data);
        if (h2 === lastHash) return;
        const auth = require("./auth.cjs");
        const r = await auth.apiCall("PUT", "/workspace", data, baseUrl(cfg2));
        if (r && r.ok) {
          lastHash = h2;
          settings.save({ ...settings.load(), workspaceSyncedAt: r.updatedAt });
          console.log("[workspace-sync] pushed workspace to account");
        }
      } catch { /* offline — next change retries */ }
    }, 4000); // debounce bursts of edits
  } catch {}
}

module.exports = { pull, maybePush };
