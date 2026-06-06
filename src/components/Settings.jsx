import { useEffect, useState } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug, User, ShieldCheck, Cpu, LogOut, Save, Send, FolderInput } from "lucide-react";
import ModelPicker from "./ModelPicker.jsx";
import { bridge } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New provider", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "" });
const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "messaging", label: "Messaging", icon: Send },
];

export default function Settings({ onChanged }) {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("profile");
  const [busy, setBusy] = useState("");
  const [msgStatus, setMsgStatus] = useState(null);
  const [anthStatus, setAnthStatus] = useState("");

  useEffect(() => { bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); }); }, []);
  useEffect(() => {
    if (section !== "messaging") return;
    let alive = true;
    const t = () => bridge.messagingStatus().then((r) => alive && setMsgStatus(r));
    t(); const iv = setInterval(t, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, [section]);
  if (!s || !selId) return <div className="empty"><div>Loading settings…</div></div>;

  const account = s.account || {};
  const profiles = Object.values(s.profiles);
  const sel = s.profiles[selId];
  const modelGroups = profiles.map((p) => {
    const ids = (p.cachedModels && p.cachedModels.length) ? p.cachedModels : (p.model ? [p.model] : []);
    return { group: p.name, items: ids.map((mid) => ({ id: `${p.id}::${mid}`, name: mid, prov: p.name, badge: p.kind })) };
  }).filter((g) => g.items.length);

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); onChanged?.(next); };
  const patch = (field, val) => persist({ ...s, profiles: { ...s.profiles, [selId]: { ...sel, [field]: val } } });
  const setAccount = (a) => persist({ ...s, account: { ...account, ...a } });
  const setField = (k, v) => persist({ ...s, [k]: v });
  const msg = s.messaging || {};
  const setMsg = (k, v) => persist({ ...s, messaging: { ...msg, [k]: v } });
  const applyMsg = async () => { await bridge.saveSettings(s); const r = await bridge.applyMessaging(); setMsgStatus(r); };
  const pickMsgFolder = async () => { const d = await bridge.chooseFolder(); if (d) setMsg("folder", d); };

  const addProfile = () => { const id = "p_" + Math.random().toString(36).slice(2, 7); persist({ ...s, profiles: { ...s.profiles, [id]: BLANK(id) } }); setSelId(id); };
  const delProfile = () => {
    if (profiles.length <= 1) return;
    const rest = { ...s.profiles }; delete rest[selId];
    persist({ ...s, profiles: rest, activeProfileId: s.activeProfileId === selId ? Object.keys(rest)[0] : s.activeProfileId });
    setSelId(Object.keys(rest)[0]);
  };
  const test = async () => { setStatus("Fetching models…"); const list = await bridge.listModels(selId); setModels(list); setStatus(list.length ? `${list.length} models found` : "No /v1/models — enter the model id manually"); };
  // Save the provider AND cache its discovered models so the top-bar picker always has them.
  const saveProvider = async () => {
    setStatus("Saving & validating…");
    let list = [];
    try { list = await bridge.listModels(selId); } catch {}
    const next = { ...s, profiles: { ...s.profiles, [selId]: { ...sel, cachedModels: list } } };
    setS(next); await bridge.saveSettings(next); onChanged?.(next);
    setModels(list);
    setStatus(list.length ? `Saved ✓ · ${list.length} models available in the picker` : "Saved ✓ · couldn't load models — enter the model id manually");
  };

  const googleSignIn = async () => {
    setBusy("google");
    const r = await bridge.googleSignIn();
    setBusy("");
    if (r?.error) { setStatus(r.error); return; }
    if (r?.account) { const next = await bridge.getSettings(); setS(next); }
  };
  const githubSignIn = async () => {
    setBusy("github");
    const r = await bridge.githubSignIn();
    setBusy("");
    if (r?.error) { setStatus(r.error); return; }
    if (r?.account) { const next = await bridge.getSettings(); setS(next); }
  };
  const setAnthKey = (v) => {
    const base = s.profiles.p_anthropic || { id: "p_anthropic", name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com", model: "claude-sonnet-4-6" };
    persist({ ...s, profiles: { ...s.profiles, p_anthropic: { ...base, apiKey: v } } });
  };
  const verifyAnthropic = async () => {
    setAnthStatus("Authenticating…");
    const models = await bridge.listModels("p_anthropic");
    if (models && models.length) { setAnthStatus(`Authenticated ✓ · ${models.length} models available to this key`); setAccount({ anthropicLinked: true }); }
    else { setAnthStatus("Could not authenticate — check the API key (a 401 means the key is wrong)."); setAccount({ anthropicLinked: false }); }
  };
  const signOut = async () => { await bridge.signOut(); const next = await bridge.getSettings(); setS(next); };

  const initials = (account.name || account.email || "Y").slice(0, 1).toUpperCase();

  return (
    <div className="settings scroll" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "230px 1fr", height: "100%" }}>
      <div style={{ borderRight: "1px solid var(--line)", padding: 16, overflowY: "auto" }}>
        <div className="nav-label" style={{ paddingLeft: 0 }}>Settings</div>
        {SECTIONS.map((sec) => { const I = sec.icon; return (
          <button key={sec.id} className={`nav-item ${section === sec.id ? "active" : ""}`} onClick={() => setSection(sec.id)}><I size={15} /> {sec.label}</button>
        ); })}
      </div>

      <div style={{ padding: 24, overflowY: "auto" }}>
        {section === "profile" && (
          <div style={{ maxWidth: 480 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 18 }}>Profile</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              {account.avatar ? <img src={account.avatar} alt="" style={{ width: 56, height: 56, borderRadius: "50%" }} />
                : <div style={{ width: 56, height: 56, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 600, background: "linear-gradient(135deg, var(--accent), var(--accent-2))", color: "#06070a" }}>{initials}</div>}
              <div>
                <div style={{ fontWeight: 600, fontSize: 16 }}>{account.name || "Your name"}</div>
                <div style={{ color: "var(--text-2)", fontSize: 13 }}>{account.email || "no email set"}</div>
              </div>
            </div>
            <Field label="Display name"><input className="model-search" value={account.name || ""} onChange={(e) => setAccount({ name: e.target.value })} placeholder="Your name" /></Field>
            <Field label="Email"><input className="model-search" value={account.email || ""} onChange={(e) => setAccount({ email: e.target.value })} placeholder="you@example.com" /></Field>
            <Field label="Avatar URL (optional)"><input className="model-search" value={account.avatar || ""} onChange={(e) => setAccount({ avatar: e.target.value })} placeholder="https://…" /></Field>

            <div className="nav-label" style={{ paddingLeft: 0, marginTop: 6 }}>Link your profile</div>
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 8px" }}>Sign in with Google or GitHub to auto‑fill your name, email, and avatar. Each needs a one‑time OAuth Client ID (your own app).</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <button className="btn" onClick={googleSignIn} disabled={busy === "google"}>{busy === "google" ? "Opening…" : "Sign in with Google"}{account.googleLinked ? " ✓" : ""}</button>
              <button className="btn" onClick={githubSignIn} disabled={busy === "github"}>{busy === "github" ? "Waiting…" : "Sign in with GitHub"}{account.githubLinked ? " ✓" : ""}</button>
              {(account.googleLinked || account.githubLinked) && <button className="btn ghost danger" onClick={signOut}><LogOut size={14} /> Unlink</button>}
            </div>
            <Field label="Google OAuth Client ID (Desktop app)"><input className="model-search" value={s.googleClientId || ""} onChange={(e) => setField("googleClientId", e.target.value)} placeholder="…apps.googleusercontent.com" /></Field>
            <Field label="Google Client Secret (if required)"><input className="model-search" type="password" value={s.googleClientSecret || ""} onChange={(e) => setField("googleClientSecret", e.target.value)} /></Field>
            <Field label="GitHub OAuth Client ID (enable Device Flow)"><input className="model-search" value={s.githubClientId || ""} onChange={(e) => setField("githubClientId", e.target.value)} placeholder="Iv1.xxxxxxxx" /></Field>
            {status && !status.startsWith("Default") && <div style={{ color: "var(--text-2)", fontSize: 12, marginBottom: 8 }}>{status}</div>}

            <div className="nav-label" style={{ paddingLeft: 0, marginTop: 6 }}>Instructions for BrainEdge</div>
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 8px" }}>
              Applied to <b>every</b> conversation across the app (Chat, Code, Cowork, Projects) — like Claude's custom instructions. Tone, role, rules, things to always remember.
            </p>
            <textarea className="model-search" rows={6} style={{ resize: "vertical", fontFamily: "inherit" }}
              value={s.globalInstructions || ""} onChange={(e) => setS({ ...s, globalInstructions: e.target.value })}
              placeholder="e.g. Be concise. I'm a senior engineer — skip basics. Always show code diffs. Prefer TypeScript." />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
              <button className="btn primary" onClick={async () => { await bridge.saveSettings(s); onChanged?.(s); setStatus("Saved ✓"); setTimeout(() => setStatus(""), 1500); }}>Save</button>
              <span style={{ color: "var(--ok)", fontSize: 12 }}>{status}</span>
            </div>
          </div>
        )}

        {section === "messaging" && (
          <div style={{ maxWidth: 560 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Messaging — Telegram bot</h2>
            <p style={{ color: "var(--text-2)", fontSize: 13, marginTop: 0 }}>
              Drive BrainEdge from Telegram. Message your bot and it runs the active model and replies. ⚠ This is remote control of this machine — only your allowed user id can use it.
            </p>
            <div className="acc-card">
              <label className="chip" style={{ cursor: "pointer", marginBottom: 12 }}>
                <input type="checkbox" checked={!!msg.enabled} onChange={(e) => setMsg("enabled", e.target.checked)} style={{ marginRight: 6 }} /> Enable Telegram bot
              </label>
              <Field label="Bot token (from @BotFather)"><input className="model-search" type="password" value={msg.telegramToken || ""} onChange={(e) => setMsg("telegramToken", e.target.value)} placeholder="123456:ABC-..." /></Field>
              <Field label="Allowed Telegram user id(s) — comma separated (find yours via @userinfobot)"><input className="model-search" value={msg.telegramAllowedUserIds || ""} onChange={(e) => setMsg("telegramAllowedUserIds", e.target.value)} placeholder="e.g. 123456789" /></Field>
              <Field label="Run target">
                <select className="model-search" value={msg.target || "chat"} onChange={(e) => setMsg("target", e.target.value)}>
                  <option value="chat">Chat (no file/shell access — safest)</option>
                  <option value="folder">A folder (agent can edit files & run commands)</option>
                </select>
              </Field>
              {msg.target === "folder" && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12 }}>
                  <button className="btn" onClick={pickMsgFolder}><FolderInput size={14} /> Choose folder</button>
                  {msg.folder && <span style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{msg.folder}</span>}
                </div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button className="btn primary" onClick={applyMsg}>Apply</button>
                {msgStatus && (
                  <span className="chip" style={{ color: msgStatus.running ? "var(--ok)" : "var(--text-2)" }}>
                    <span style={{ width: 7, height: 7, borderRadius: 9, background: msgStatus.running ? "var(--ok)" : "var(--text-2)", marginRight: 6 }} />
                    {msgStatus.status}
                  </span>
                )}
              </div>
            </div>
            <p style={{ color: "var(--text-2)", fontSize: 12 }}>
              Scheduled/unattended, so it auto-approves tools. Uses the active provider. Send /start to your bot to test.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             