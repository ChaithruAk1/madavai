// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Mobile link — binds ONE local session (a Let's Collaborate task) to the Telegram bot so
// messages from your phone continue that session and are written back into its history.
// At most one session is linked at a time; null means the bot runs stateless (its own target).
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const FILE = () => path.join(app.getPath("userData"), "brainedge-mobile-link.json");

function get() { try { return JSON.parse(fs.readFileSync(FILE(), "utf8")); } catch { return null; } }
function set(link) {
  const rec = link && link.sessionId
    ? { sessionId: String(link.sessionId), title: String(link.title || "Cowork session").slice(0, 120), cwd: String(link.cwd || ""), at: Date.now() }
    : null;
  try { fs.writeFileSync(FILE(), JSON.stringify(rec, null, 2)); } catch {}
  return rec;
}
function clear() { try { fs.writeFileSync(FILE(), JSON.stringify(null)); } catch {} return null; }

module.exports = { get, set, clear };
