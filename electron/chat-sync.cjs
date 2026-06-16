// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Chat sync — conversations follow the ACCOUNT across devices (desktop <-> web), mirroring
// workspace-sync.cjs. Local-first: chats stay in sessions-store; we mirror them up (debounced after
// any save) and pull+merge on launch / sign-in. Merge = last-write-wins by per-conversation updatedAt.
// Fail-open: offline/signed-out = do nothing. Gate: settings.chatSync !== false.
const crypto = require("crypto");
const settings = require("./settings.cjs");
const sstore = require("./sessions-store.cjs");
let pushTimer = null, lastHash = "";
const MAX_CONVS = 100, MAX_MSGS = 300;
const baseUrl = (cfg) => (cfg.authBaseUrl || "https://madav.ai").replace(/\/+$/, "");
const enabled = (cfg) => cfg.chatSync !== false;
function localItems() {
  let all = [];
  try { all = sstore.allSessions() || []; } catch {}
  return all
    .filter((s) => s && s.id && Array.isArray(s.messages) && s.messages.length)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, MAX_CONVS)
    .map((s) => ({ id: s.id, mode: s.mode || "chat", title: s.title || "Conversation", projectId: s.projectId || null, createdAt: s.createdAt || 0, updatedAt: s.updatedAt || 0, messages: s.messages.slice(-MAX_MSGS) }));
}
const hashOf = (d) => crypto.createHash("sha1").update(JSON.stringify(d)).digest("hex");
async function push() {
  try {
    const cfg = settings.load(); if (!enabled(cfg)) return null;
    const items = localItems(); const tombstones = sstore.getTombstones(); const h = hashOf({ items, tombstones });
    if (h === lastHash) return null; // nothing changed since last push
    const r = await require("./auth.cjs").apiCall("PUT", "/conversations", { items, tombstones }, baseUrl(cfg));
    if (r && !r.error) { lastHash = h; }
    return r;
  } catch { return null; }
}
function maybePush() { clearTimeout(pushTimer); pushTimer = setTimeout(() => { push().catch(() => {}); }, 4000); }
async function pull() {
  try {
    const cfg = settings.load(); if (!enabled(cfg)) return null;
    const r = await require("./auth.cjs").apiCall("GET", "/conversations", null, baseUrl(cfg));
    if (!r || r.error || !r.data) return null;
    const items = Array.isArray(r.data.items) ? r.data.items : [];
    const remoteTomb = Array.isArray(r.data.tombstones) ? r.data.tombstones : [];
    // merge tombstones (latest deletedAt per id) from local + remote
    const tmap = new Map();
    for (const t of [...sstore.getTombstones(), ...remoteTomb]) { if (!t || !t.id) continue; const p = tmap.get(t.id); if (!p || (t.deletedAt || 0) > (p.deletedAt || 0)) tmap.set(t.id, { id: t.id, deletedAt: t.deletedAt || 0 }); }
    let merged = 0;
    for (const it of items) {
      if (!it || !it.id || !Array.isArray(it.messages)) continue;
      const tb = tmap.get(it.id); if (tb && (tb.deletedAt || 0) >= (it.updatedAt || 0)) continue; // suppressed by a newer deletion
      const local = sstore.getSession(it.id);
      if (!local || (it.updatedAt || 0) > (local.updatedAt || 0)) { try { sstore.saveSessionRaw(it); merged++; } catch {} }
    }
    // apply deletions locally; if a session was edited AFTER its tombstone, it wins and the tombstone is dropped
    let purged = 0;
    for (const [id, t] of [...tmap]) { const local = sstore.getSession(id); if (local && (t.deletedAt || 0) >= (local.updatedAt || 0)) { try { sstore.purgeSession(id); purged++; } catch {} } else if (local && (local.updatedAt || 0) > (t.deletedAt || 0)) { tmap.delete(id); } }
    sstore.setTombstones([...tmap.values()]);
    lastHash = hashOf({ items: localItems(), tombstones: sstore.getTombstones() }); // the merges above must not bounce back as a push
    if (merged || purged) console.log("[chat-sync] merged", merged, "purged", purged, "conversation(s) from the account");
    return { pulled: true, merged, purged };
  } catch { return null; }
}
async function pushNow() { lastHash = ""; return push(); } // force an upload (ignores the no-change guard) — used on launch
async function launchSync() { try { await pull(); } catch {} try { await pushNow(); } catch {} } // pull remote, then upload our full local store
module.exports = { push, maybePush, pull, pushNow, launchSync };
