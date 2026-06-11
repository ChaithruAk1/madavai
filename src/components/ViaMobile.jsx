// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
import { useEffect, useState } from "react";
import { Smartphone, Trash2, RefreshCw, FolderInput, ChevronDown, ChevronRight, HelpCircle, ExternalLink } from "lucide-react";
import { bridge } from "../bridge/index.js";

// Hide the bot's @username in status text (privacy).
const maskBot = (t) => String(t || "").replace(/@\w+/g, "@•••••");

function rel(ts) {
  if (!ts) return "";
  const d = Date.now() - ts;
  if (d < 60000) return "just now";
  if (d < 3600000) return Math.floor(d / 60000) + "m ago";
  if (d < 86400000) return Math.floor(d / 3600000) + "h ago";
  return new Date(ts).toLocaleString();
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

export default function ViaMobile({ onSettingsChanged } = {}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState(null);
  const [s, setS] = useState(null);
  const [msgStatus, setMsgStatus] = useState(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [link, setLink] = useState(null);

  // Bot username comes from the live status; build a t.me deep link for it.
  const botUser = status && status.username;
  const tme = botUser ? `https://t.me/${botUser}` : "";
  const openBot = () => tme && bridge.openExternal && bridge.openExternal(tme);

  const load = () => {
    bridge.listViaMobile && bridge.listViaMobile().then((l) => setItems(l || [])).catch(() => {});
    bridge.messagingStatus && bridge.messagingStatus().then(setStatus).catch(() => {});
    bridge.getMobileLink && bridge.getMobileLink().then(setLink).catch(() => {});
  };
  const unlink = async () => { await bridge.clearMobileLink(); setLink(null); };
  useEffect(() => {
    load();
    bridge.getSettings().then((cfg) => { setS(cfg); if (!cfg.messaging || !cfg.messaging.enabled) setSetupOpen(true); });
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, []);

  const clear = async () => { if (window.confirm("Delete the entire Via Mobile request history? This cannot be undone.")) { await bridge.clearViaMobile(); load(); } };
  const removeOne = async (id) => { await bridge.removeViaMobile(id); load(); };
  const online = status && status.running;

  const msg = (s && s.messaging) || {};
  const setMsg = async (k, v) => { const next = { ...s, messaging: { ...msg, [k]: v } }; setS(next); await bridge.saveSettings(next); onSettingsChanged && onSettingsChanged(next); };
  const applyMsg = async () => { await bridge.saveSettings(s); onSettingsChanged && onSettingsChanged(s); const r = await bridge.applyMessaging(); setMsgStatus(r); load(); };
  const pickFolder = async () => { const d = await bridge.chooseFolder(); if (d) setMsg("folder", d); };

  return (
    <div className="settings scroll" style={{ padding: 24, overflow: "auto" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><Smartphone size={18} style={{ color: "var(--accent)" }} /> Via Mobile</h2>
          <span className="chip" style={{ color: online ? "var(--ok)" : "var(--text-2)" }}>
            <span style={{ width: 7, height: 7, borderRadius: 9, background: online ? "var(--ok)" : "var(--text-2)", marginRight: 6, display: "inline-block" }} />
            {status ? maskBot(status.status) : "checking…"}
          </span>
          <span style={{ flex: 1 }} />
          <button className="btn" onClick={load} title="Refresh"><RefreshCw size={14} /></button>
          {items.length > 0 && <button className="btn ghost danger" onClick={clear}><Trash2 size={14} /> Clear</button>}
        </div>
        <p style={{ color: "var(--text-1)", fontSize: 13.5, marginTop: 4, lineHeight: 1.65 }}>
          Via Mobile lets you operate Madav remotely through a private Telegram bot. Send the bot an instruction from your
          phone and it is executed here on this computer by your active model, with the result delivered back to your chat —
          so you can start work, follow up, or get answers while away from your desk. Because each request runs locally, the bot
          inherits the same capabilities available in the app: answering questions and drafting content, invoking your installed
          Skills, calling your connected tools and data sources (MCP connectors), and — when pointed at a working folder —
          reading, editing, and creating files and running commands within it. Access is limited to the Telegram user IDs you
          authorize, so only you can control execution; the machine must be running and online for requests to be served.
        </p>

        {link && link.sessionId && (
          <div className="vm-linkbar">
            <Smartphone size={15} style={{ color: "var(--accent)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Continuing a desktop session: “{link.title}”</div>
              <div style={{ fontSize: 12, color: "var(--text-2)" }}>
                Messages you send the bot continue this Let’s Collaborate session{link.cwd ? ` (folder: ${link.cwd})` : ""} and are written back into it. Send <code>/unlink</code> in Telegram, or click Unlink.
              </div>
            </div>
            <button className="btn ghost" onClick={unlink}>Unlink</button>
          </div>
        )}

        {/* ---- Bot setup (moved here from Settings → Messaging) ---- */}
        <button className="nav-item nav-group" style={{ marginTop: 8 }} onClick={() => setSetupOpen((o) => !o)}>
          {setupOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />} <span className="sb-t">Bot setup</span>
        </button>
        {setupOpen && (
          <div className="acc-card" style={{ marginTop: 8 }}>
            <p style={{ color: "var(--text-2)", fontSize: 12.5, marginTop: 0 }}>
              ⚠ This is remote control of this machine — only your allowed Telegram user id can use it.
            </p>

            <button className="nav-item nav-group vm-help-toggle" style={{ marginBottom: helpOpen ? 6 : 12 }} onClick={() => setHelpOpen((o) => !o)}>
              <HelpCircle size={15} /> <span className="sb-t">How to set up your Telegram bot</span>
              <span className="nav-caret sb-t">{helpOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
            </button>
            {helpOpen && (
              <div className="bot-help">
                <ol>
                  <li><b>Install Telegram</b> on your phone (or use Telegram Desktop / web) and sign in.</li>
                  <li><b>Create the bot.</b> In Telegram, search for <code>@BotFather</code> (the official one has a blue checkmark) and open it. Tap <b>Start</b>, then send <code>/newbot</code>.</li>
                  <li><b>Name it.</b> BotFather asks for a display name (anything, e.g. <i>My Madav</i>), then a <b>username</b> that must be unique and end in <code>bot</code> (e.g. <code>my_madav_bot</code>).</li>
                  <li><b>Copy the token.</b> BotFather replies with an HTTP API token like <code>123456789:AAH…</code>. Copy the whole thing and paste it into <b>Bot token</b> below. Keep it secret — anyone with it can message your bot.</li>
                  <li><b>Find your user id.</b> In Telegram, search <code>@userinfobot</code>, open it, tap <b>Start</b>. It replies with your numeric <b>Id</b> (e.g. <code>123456789</code>). Paste that into <b>Allowed Telegram user id(s)</b>. Only ids listed here may use the bot; add more separated by commas.</li>
                  <li><b>Choose the run target.</b> <b>Chat</b> = answers only, no file or shell access (safest). <b>A folder</b> = the agent can read/edit files and run commands in that folder — only use this for a folder you trust it with.</li>
                  <li><b>Enable &amp; apply.</b> Tick <b>Enable Telegram bot</b> and click <b>Apply</b>. The status chip should turn green and show <i>online @your_bot</i>.</li>
                  <li><b>Test it.</b> In Telegram, open your new bot (tap the link BotFather gave, or search its username), tap <b>Start</b> / send <code>/start</code>, then send any prompt — e.g. "summarize today's news". The reply runs on this computer with your active model and appears in the <b>Requests</b> list below.</li>
                </ol>
                <p className="bot-help-note">Notes: the app must be open and online for the bot to respond. Runs are unattended, so tools auto‑approve — keep the allow‑list tight and prefer the <b>Chat</b> target unless you specifically need file access. To stop it, untick Enable and Apply.</p>
              </div>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              <label className="chip" style={{ cursor: "pointer" }}>
                <input type="checkbox" checked={!!msg.enabled} onChange={(e) => setMsg("enabled", e.target.checked)} style={{ marginRight: 6 }} /> Enable Telegram bot
              </label>
              <label className="chip" style={{ cursor: "pointer" }} title="When on, whatever Let's Collaborate session you're working on is automatically continued by the bot — no need to click Continue on phone.">
                <input type="checkbox" checked={msg.autoContinue !== false} onChange={(e) => setMsg("autoContinue", e.target.checked)} style={{ marginRight: 6 }} /> Auto‑continue my current Let’s Collaborate session
              </label>
            </div>
            <Field label="Bot token (from @BotFather)"><input className="model-search" type="password" value={msg.telegramToken || ""} onChange={(e) => setMsg("telegramToken", e.target.value)} placeholder="123456:ABC-…" /></Field>
            <Field label="Allowed Telegram user id(s) — comma separated (find yours via @userinfobot)"><input className="model-search" type="password" autoComplete="off" value={msg.telegramAllowedUserIds || ""} onChange={(e) => setMsg("telegramAllowedUserIds", e.target.value)} placeholder="e.g. 123456789" /></Field>
            <Field label="Run target when working independently (no project linked)">
              <select className="model-search" value={msg.target || "chat"} onChange={(e) => setMsg("target", e.target.value)}>
                <option value="chat">Chat (no file/shell access — safest)</option>
                <option value="folder">A folder (agent can edit files & run commands)</option>
              </select>
            </Field>
            {msg.target === "folder" && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                <button className="btn" onClick={pickFolder}><FolderInput size={14} /> Choose folder</button>
                {msg.folder && <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{msg.folder}</span>}
              </div>
            )}
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "-2px 0 12px" }}>
              This applies only when the bot runs on its own. When you’re working in a <b>Let’s Collaborate</b> project, the bot
              automatically uses <b>that project’s own folder</b> — and each project can have a different one. From Telegram, send
              <code> /sessions </code> to list your projects and <code> /use &lt;name or number&gt; </code> to continue a specific one.
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button className="btn primary" onClick={applyMsg}>Apply</button>
              {msgStatus && (
                <span className="chip" style={{ color: msgStatus.running ? "var(--ok)" : "var(--text-2)" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 9, background: msgStatus.running ? "var(--ok)" : "var(--text-2)", marginRight: 6 }} />
                  {maskBot(msgStatus.status)}
                </span>
              )}
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 14 }}>Uses the active provider. Send /start to your bot to test.</p>

            <div className="vm-cmds">
              <div className="vm-cmds-h"><Smartphone size={15} /> Using the bot with your Let’s Collaborate projects</div>
              <ol>
                <li>On the desktop, open a <b>Let’s Collaborate</b> session for each project — each can point at its own folder.</li>
                <li>In Telegram, send <code>/sessions</code> to list your projects and their folders.</li>
                <li>Send <code>/use &lt;name or number&gt;</code> to continue one — e.g. <code>/use website</code> or <code>/use 2</code>. The bot then reads/edits <b>that project’s folder</b> and shares its history; replies also show up on the desktop.</li>
                <li>Keep sending normal messages to work in that project. To jump to another, send <code>/use &lt;another&gt;</code> again.</li>
                <li><code>/unlink</code> = work independently (no project); <code>/start</code> shows which project is active.</li>
              </ol>
              <p className="vm-cmds-note">
                The bot works on <b>one project at a time</b>. To work across several, switch with <code>/use</code> — each switch resumes exactly where that project left off. Tip: turn <b>Auto‑continue</b> off (above) if you want the phone, not the desktop, to decide which project is active.
              </p>
            </div>

            {tme && (
              <div className="vm-qr">
                <div className="vm-qr-body">
                  <div className="vm-qr-h"><ExternalLink size={15} /> Open your bot</div>
                  <p style={{ color: "var(--text-2)", fontSize: 12.5, margin: "4px 0 10px" }}>
                    Tap below to open your bot in Telegram, then press <b>Start</b> and send a message. On your phone you can also search your bot’s username or use the link BotFather gave you.
                  </p>
                  <button className="btn primary" onClick={openBot}><ExternalLink size={14} /> Open in Telegram</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
          Requests
          {items.length > 0 && <span style={{ color: "var(--text-2)", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· {items.length} kept</span>}
        </div>
        <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 8px" }}>
          Every request is saved here and kept across restarts. Delete a single one with its trash icon, or remove everything with <b>Clear</b> above.
        </p>
        {items.length === 0 ? (
          <div className="pjd-files-empty">
            {online ? "No requests yet. Send a message to your bot from your phone." : "Bot is offline. Enable it in Bot setup above, then message it from your phone."}
          </div>
        ) : (
          <div className="sv-list" style={{ marginTop: 8 }}>
            {items.map((it) => (
              <div key={it.id} className="sv-card">
                <div className="sv-meta">
                  <span className="sv-time">{rel(it.at)}</span>
                  <span className="mo-sub">{it.source}{it.from ? ` · ${it.from}` : ""} · {it.target}</span>
                  <span style={{ flex: 1 }} />
                  <span style={{ fontSize: 11, color: it.status === "error" ? "var(--danger)" : "var(--ok)" }}>{it.status}</span>
                  <button className="sv-del" title="Delete this request" onClick={() => removeOne(it.id)}><Trash2 size={13} /></button>
                </div>
                <div className="sv-q">{it.text}</div>
                <div className="sv-text">{it.output}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
