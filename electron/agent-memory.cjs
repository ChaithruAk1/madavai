// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Agent memory — each agent keeps a small file of durable learnings that survives
// across missions (the agent memory-tool pattern). After a mission, a cheap model call
// extracts up to three durable notes (user preferences, domain facts, corrections);
// they are injected into the agent's system prompt next time. The user can view,
// edit, and clear an agent's memory in the Studio Blueprint.
const { app } = require("electron");
const fs = require("fs");
const path = require("path");

const MAX_NOTES = 60;       // hard cap on stored notes (oldest age out)
const INJECT_NOTES = 30;    // newest notes injected into the prompt
const NOTE_CHARS = 500;

const dir = () => path.join(app.getPath("userData"), "agent-memory");
const file = (id) => path.join(dir(), String(id).replace(/[^\w.-]/g, "_") + ".json");

function get(id) {
  if (!id) return { notes: [] };
  try { const m = JSON.parse(fs.readFileSync(file(id), "utf8")); return { notes: [], ...m, notes: Array.isArray(m.notes) ? m.notes : [] }; }
  catch { return { notes: [] }; }
}

function save(id, mem) {
  if (!id) return mem;
  fs.mkdirSync(dir(), { recursive: true });
  mem.updatedAt = Date.now();
  fs.writeFileSync(file(id), JSON.stringify(mem, null, 2));
  return mem;
}

// Replace the whole note list (the user edited it in the Blueprint).
function setNotes(id, notes) {
  const list = (Array.isArray(notes) ? notes : [])
    .map((n) => (typeof n === "string" ? { at: Date.now(), text: n } : n))
    .filter((n) => n && String(n.text || "").trim())
    .map((n) => ({ at: n.at || Date.now(), text: String(n.text).trim().slice(0, NOTE_CHARS) }))
    .slice(-MAX_NOTES);
  return save(id, { ...get(id), notes: list });
}

// Append new learnings, de-duplicated, capped.
function append(id, texts) {
  if (!id) return null;
  const m = get(id);
  for (const t of Array.isArray(texts) ? texts : [texts]) {
    const txt = String(t || "").trim().slice(0, NOTE_CHARS);
    if (!txt || txt.length < 8) continue;
    if (m.notes.some((n) => n.text.toLowerCase() === txt.toLowerCase())) continue;
    m.notes.push({ at: Date.now(), text: txt });
  }
  m.notes = m.notes.slice(-MAX_NOTES);
  return save(id, m);
}

function clear(id) { try { fs.unlinkSync(file(id)); } catch {} return { notes: [] }; }

// Prompt block injected into the agent's system prompt ("" when empty or memory off).
function block(agent) {
  if (!agent || !agent.id || agent.memory === false) return "";
  const m = get(agent.id);
  if (!m.notes.length) return "";
  const lines = m.notes.slice(-INJECT_NOTES).map((n) => "- " + n.text);
  return ("\n\nAgent memory — durable learnings from this agent's past missions (apply them; the user expects you to remember):\n" + lines.join("\n")).slice(0, 8000);
}

const LEARN_SYS = `You maintain an AI agent's long-term memory. From the mission transcript, extract ONLY durable learnings worth remembering for FUTURE missions: the user's stated preferences (format, tone, tools, constraints), corrections the user made, and stable domain facts discovered. NEVER store one-off mission content, summaries of the answer itself, secrets, or anything time-bound. Reply with ONLY a JSON array of 0-3 short strings (each under 200 characters), no prose. Reply [] if nothing is durable — that is the most common correct answer.`;

// Fire-and-forget after a mission: extract durable learnings and append them.
// Never throws; failures simply mean nothing is learned this time.
async function learnFromMission(profile, agent, userText, replyText) {
  try {
    if (!agent || !agent.id || agent.memory === false) return;
    if (!profile || !profile.baseUrl) return;
    if (!(userText || "").trim() || !(replyText || "").trim()) return;
    const { streamChat } = require("./providers.cjs");
    const body = `MISSION (user brief):\n${String(userText).slice(0, 6000)}\n\nAGENT'S WORK (result):\n${String(replyText).slice(0, 6000)}`;
    const { text } = await streamChat(profile, [
      { role: "system", content: LEARN_SYS },
      { role: "user", content: body },
    ], { onDelta: () => {} });
    const i = text.indexOf("["); const j = text.lastIndexOf("]");
    if (i < 0 || j <= i) return;
    const arr = JSON.parse(text.slice(i, j + 1));
    if (Array.isArray(arr) && arr.length) append(agent.id, arr.slice(0, 3).map(String));
  } catch { /* memory is best-effort */ }
}

module.exports = { get, setNotes, append, clear, block, learnFromMission };
