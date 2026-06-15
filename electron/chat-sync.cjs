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
    const items = localItems(); const h = hashOf(items);
    if (h === lastHash) return null; // nothing changed since last push
    const r = await require("./auth.cjs").apiCall("PUT", "/conversations", { items }, baseUrl(cfg));
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
    let merged = 0;
    for (const it of items) {
      if (!it || !it.id || !Array.isArray(it.messages)) continue;
      const local = sstore.getSession(it.id);
      if (!local || (it.updatedAt || 0) > (local.updatedAt || 0)) { try { sstore.saveSessionRaw(it); merged++; } catch {} }
    }
    lastHash = hashOf(localItems()); // the merges above must not bounce back as a push
    if (merged) console.log("[chat-sync] merged", merged, "conversation(s) from the account");
    return { pulled: true, merged };
  } catch { return null; }
}
module.exports = { push, maybePush, pull };
