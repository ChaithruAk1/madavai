// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// user-memory.cjs — CROSS-CHAT MEMORY (the #1 competitive gap, now closed).
// One small, durable, human-readable memory about THE USER that follows them into
// every conversation: chat, collaborate, build, projects. Same proven shape as
// agent-memory.cjs, but global. The user can view, edit, toggle, and clear it in
// Settings → Profile → Memory. PRIVACY: a local JSON file in userData; injected
// only into the system prompt of the user's own chosen model. Never uploaded.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const MAX_NOTES = 48;     // hard cap (oldest age out)
const INJECT_NOTES = 28;  // newest notes injected into prompts
const NOTE_CHARS = 400;
const LEARN_COOLDOWN_MS = 4 * 60 * 1000; // at most one extraction call per 4 minutes

const file = () => path.join(app.getPath("userData"), "user-memory.json");
let _lastLearn = 0;

function get() {
  try { const m = JSON.parse(fs.readFileSync(file(), "utf8")); return { notes: Array.isArray(m.notes) ? m.notes : [] }; }
  catch { return { notes: [] }; }
}
function save(mem) {
  mem.updatedAt = Date.now();
  try { fs.writeFileSync(file(), JSON.stringify(mem, null, 2)); } catch {}
  return mem;
}
function setNotes(notes) {
  const list = (Array.isArray(notes) ? notes : [])
    .map((n) => (typeof n === "string" ? { at: Date.now(), text: n } : n))
    .filter((n) => n && String(n.text || "").trim())
    .map((n) => ({ at: n.at || Date.now(), text: String(n.text).trim().slice(0, NOTE_CHARS) }))
    .slice(-MAX_NOTES);
  return save({ ...get(), notes: list });
}
function append(texts) {
  const m = get();
  for (const t of Array.isArray(texts) ? texts : [texts]) {
    const txt = String(t || "").trim().slice(0, NOTE_CHARS);
    if (!txt || txt.length < 8) continue;
    if (m.notes.some((n) => n.text.toLowerCase() === txt.toLowerCase())) continue;
    m.notes.push({ at: Date.now(), text: txt });
  }
  m.notes = m.notes.slice(-MAX_NOTES);
  return save(m);
}
function clear() { try { fs.unlinkSync(file()); } catch {} return { notes: [] }; }

// Prompt block for EVERY conversation ("" when off or empty). cfg gates the toggle.
function block(cfg) {
  if (cfg && cfg.userMemory && cfg.userMemory.enabled === false) return "";
  const m = get();
  if (!m.notes.length) return "";
  const lines = m.notes.slice(-INJECT_NOTES).map((n) => "- " + n.text);
  return ("\n\nWhat you remember about this user from previous conversations (apply naturally; never recite this list):\n" + lines.join("\n")).slice(0, 7000);
}

const LEARN_SYS = `You maintain a person's long-term memory for their AI assistant. From this conversation turn, extract ONLY durable facts worth remembering in FUTURE conversations: stated preferences (format, tone, language, tools), stable personal/professional facts they volunteered (role, projects, goals), and corrections they made. NEVER store one-off content, the answer itself, anything sensitive (health, credentials, finances) unless they explicitly asked you to remember it, or anything time-bound. Reply with ONLY a JSON array of 0-2 short strings (each under 160 characters). Reply [] if nothing is durable — that is the most common correct answer.`;

// Fire-and-forget after a turn; throttled so chatting never gets expensive.
async function learnFromTurn(profile, cfg, userText, replyText) {
  try {
    if (cfg && cfg.userMemory && cfg.userMemory.enabled === false) return;
    if (!profile || !profile.baseUrl) return;
    if (Date.now() - _lastLearn < LEARN_COOLDOWN_MS) return;
    if (!(userText || "").trim() || !(replyText || "").trim()) return;
    if (String(userText).length < 40) return; // tiny messages rarely carry durable facts
    _lastLearn = Date.now(); // claim the slot first — never double-spend
    const { streamChat } = require("./providers.cjs");
    const { text } = await streamChat(profile, [
      { role: "system", content: LEARN_SYS },
      { role: "user", content: `USER SAID:\n${String(userText).slice(0, 4000)}\n\nASSISTANT REPLIED:\n${String(replyText).slice(0, 3000)}` },
    ], { onDelta: () => {} });
    const i = text.indexOf("["); const j = text.lastIndexOf("]");
    if (i < 0 || j <= i) return;
    const arr = JSON.parse(text.slice(i, j + 1));
    if (Array.isArray(arr) && arr.length) append(arr.slice(0, 2).map(String));
  } catch { /* memory is best-effort */ }
}

module.exports = { get, setNotes, append, clear, block, learnFromTurn };
