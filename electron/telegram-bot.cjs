// Telegram bot — drives BrainEdge's agent remotely via the Bot API (long polling, no server).
// Reuses the task runner so it inherits providers/skills/connectors. Single poll loop
// that reads the latest config each iteration, so re-applying settings reconfigures it live.
const runner = require("./task-runner.cjs");

let cfg = null, active = false, running = false, offset = 0;
let status = "stopped", username = "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}),
  });
  return res.json();
}
async function send(token, chatId, text) {
  const s = String(text || "(no output)");
  for (let i = 0; i < s.length; i += 3800) {
    try { await tg(token, "sendMessage", { chat_id: chatId, text: s.slice(i, i + 3800) }); } catch {}
  }
}

async function handle(c, u) {
  const msg = u.message;
  if (!msg || !msg.text) return;
  const from = String(msg.from && msg.from.id);
  const allowed = (c.allowed || "").split(/[,\s]+/).filter(Boolean);
  if (!allowed.length) { await send(c.token, msg.chat.id, "🔒 BrainEdge bot is locked — no allowed user is configured in Settings → Messaging."); return; }
  if (!allowed.includes(from)) { await send(c.token, msg.chat.id, `Not authorized. Your Telegram user id is ${from}.`); return; }

  const text = msg.text.trim();
  if (text === "/start" || text === "/help") {
    const lk = require("./mobile-link.cjs").get();
    const where = lk && lk.title
      ? `Continuing: “${lk.title}”. /sessions to switch, /unlink to work independently.`
      : `Working independently (${c.target || "chat"}). /sessions to continue a Let's Collaborate project.`;
    await send(c.token, msg.chat.id, "BrainEdge is connected 🧠. Send a prompt and I'll run it. " + where + "\n\nCommands: /sessions, /use <name or number>, /unlink");
    return;
  }
  if (text === "/unlink") {
    require("./mobile-link.cjs").clear();
    await send(c.token, msg.chat.id, "Unlinked. Messages now run independently as " + (c.target || "chat") + " requests.");
    return;
  }
  // List your Let's Collaborate sessions (each can have a different folder).
  if (text === "/sessions" || text === "/list") {
    const list = require("./sessions-store.cjs").listSessions("cowork");
    if (!list.length) { await send(c.token, msg.chat.id, "No Let's Collaborate sessions yet. Start one on the desktop first."); return; }
    const cur = require("./mobile-link.cjs").get();
    const lines = list.slice(0, 30).map((sx, i) => `${i + 1}. ${sx.title || sx.id}${sx.cwd ? ` — ${sx.cwd}` : " — (chat, no folder)"}${cur && cur.sessionId === sx.id ? "   ⬅ current" : ""}`);
    await send(c.token, msg.chat.id, "Your Let's Collaborate sessions:\n\n" + lines.join("\n") + "\n\nSend  /use <number or name>  to continue one.");
    return;
  }
  // Switch which session the bot continues, by number or by (part of) its name.
  if (text.toLowerCase().startsWith("/use")) {
    const q = text.slice(4).trim();
    const list = require("./sessions-store.cjs").listSessions("cowork");
    if (!q) { await send(c.token, msg.chat.id, "Usage:  /use <number or part of the name>.  Send /sessions to see them."); return; }
    let pick = /^\d+$/.test(q) ? (list[parseInt(q, 10) - 1] || null) : null;
    if (!pick) {
      const ql = q.toLowerCase();
      const matches = list.filter((sx) => (sx.title || "").toLowerCase().includes(ql));
      if (matches.length > 1) { await send(c.token, msg.chat.id, `Several sessions match “${q}”:\n` + matches.slice(0, 10).map((sx, i) => `${i + 1}. ${sx.title}`).join("\n") + "\n\nBe more specific, or use the number from /sessions."); return; }
      pick = matches[0] || null;
    }
    if (!pick) { await send(c.token, msg.chat.id, `No session matches “${q}”. Send /sessions to list them.`); return; }
    require("./mobile-link.cjs").set({ sessionId: pick.id, title: pick.title || pick.id, cwd: pick.cwd || "" });
    await send(c.token, msg.chat.id, `Now continuing: “${pick.title || pick.id}”${pick.cwd ? ` (folder: ${pick.cwd})` : " (chat — no folder)"}. Send your next message.`);
    return;
  }

  try { await tg(c.token, "sendChatAction", { chat_id: msg.chat.id, action: "typing" }); } catch {}

  // If a Let's Collaborate session is linked, continue it (shared history + folder) and write back.
  const link = require("./mobile-link.cjs").get();
  const sessions = require("./sessions-store.cjs");
  const linkedSes = link && link.sessionId ? sessions.getSession(link.sessionId) : null;

  let run, target, logTarget;
  if (linkedSes) {
    // Continue the linked session using ITS OWN folder — each Let's Collaborate project can have a
    // different folder, and the bot follows whichever session is linked (not the Bot-setup folder,
    // which is only for independent/standalone messages with no session linked).
    target = linkedSes.cwd ? { type: "folder", folder: linkedSes.cwd } : { type: "chat" };
    const history = (linkedSes.messages || []).slice(-30).map((m) => ({ role: m.role, content: m.content }));
    try { run = await runner.runTask({ prompt: text, target, history }); }
    catch (e) { run = { output: "Error: " + ((e && e.message) || e), status: "error" }; }
    try {
      linkedSes.messages = linkedSes.messages || [];
      linkedSes.messages.push({ role: "user", content: text, via: "mobile", at: Date.now() });
      linkedSes.messages.push({ role: "assistant", content: run.output, via: "mobile", at: Date.now() });
      sessions.saveSession(linkedSes);
    } catch {}
    logTarget = `session: ${link.title || linkedSes.title || linkedSes.id}` + (target.type === "folder" ? ` · ${target.folder}` : " · chat (no files)");
  } else {
    target = c.target === "folder" && c.folder ? { type: "folder", folder: c.folder } : { type: "chat" };
    try { run = await runner.runTask({ prompt: text, target }); }
    catch (e) { run = { output: "Error: " + ((e && e.message) || e), status: "error" }; }
    logTarget = c.target === "folder" ? `folder: ${c.folder || ""}` : "chat";
  }

  await send(c.token, msg.chat.id, run.output);
  try {
    require("./viamobile-log.cjs").add({
      source: "Telegram", from: (msg.from && (msg.from.username || msg.from.first_name)) || from,
      text, output: run.output, status: run.status || (/^error/i.test(run.output || "") ? "error" : "ok"),
      target: logTarget,
    });
  } catch {}
}

async function loop() {
  running = true;
  while (active) {
    const c = cfg;
    if (!c || !c.token) { status = "no token"; await sleep(1200); continue; }
    let upd;
    try { upd = await tg(c.token, "getUpdates", { offset, timeout: 25 }); }
    catch { status = "network error"; await sleep(2000); continue; }
    if (!upd || !upd.ok) {
      const code = upd && upd.error_code;
      const desc = (upd && upd.description) || "no response";
      if (code === 401) status = "bad token";
      else if (code === 404) status = "bad token (404)";
      else if (code === 409) { status = "conflict — clearing webhook…"; try { await tg(c.token, "deleteWebhook", { drop_pending_updates: false }); } catch {} }
      else status = "error: " + desc;
      await sleep(3000); continue;
    }
    status = username ? `online @${username}` : "online";
    for (const u of upd.result) { offset = u.update_id + 1; await handle(c, u); }
  }
  running = false; status = "stopped";
}

async function start(c) {
  cfg = { ...c, token: String(c.token || "").trim() }; active = true;
  c = cfg;
  if (!/^\d{6,}:[\w-]{30,}$/.test(c.token)) {
    status = "bad token format — expected like 123456789:AAH... (digits, colon, ~35 chars). Re-copy from @BotFather.";
    active = false; return;
  }
  // Validate the token up front and clear any webhook (a set webhook makes getUpdates 409).
  try {
    const me = await tg(c.token, "getMe");
    if (me && me.ok) { username = me.result.username; status = "validated @" + username; }
    else { status = "bad token: " + ((me && me.description) || "getMe failed"); active = false; return; }
  } catch (e) { status = "network error: " + ((e && e.message) || e); active = false; return; }
  try { await tg(c.token, "deleteWebhook", { drop_pending_updates: false }); } catch {}
  if (!running) loop().catch((e) => { running = false; status = "error: " + ((e && e.message) || e); });
}
function stop() { active = false; }
function getStatus() { return { running, status, username }; }

module.exports = { start, stop, getStatus };
