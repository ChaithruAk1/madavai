import { useEffect, useState } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug, User, ShieldCheck, Cpu, LogOut, Save, Send, FolderInput, Palette, Sparkles, Server } from "lucide-react";
import ModelPicker from "./ModelPicker.jsx";
import AccountCard from "../auth/AccountCard.jsx";
import AdminPanel from "../auth/AdminPanel.jsx";
import CliAccess from "./CliAccess.jsx";
import { bridge } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New provider", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "" });
const SECTIONS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "terminal", label: "Terminal access", icon: Server },
];

export default function Settings({ onChanged }) {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState("");
  const [section, setSection] = useState("profile");
  const [busy, setBusy] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => { bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); }); }, []);
  useEffect(() => { bridge.authMe?.().then((r) => { if (r && !r.error) setIsAdmin(!!r.admin); }).catch(() => {}); }, []);
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
  const signOut = async () => { await bridge.signOut(); const next = await bridge.getSettings(); setS(next); };

  const initials = (account.name || account.email || "Y").slice(0, 1).toUpperCase();

  return (
    <div className="settings scroll" style={{ padding: 0, overflow: "hidden", display: "grid", gridTemplateColumns: "230px 1fr", height: "100%" }}>
      <div style={{ borderRight: "1px solid var(--line)", padding: 16, overflowY: "auto" }}>
        <div className="nav-label" style={{ paddingLeft: 0 }}>Settings</div>
        {SECTIONS.map((sec) => { const I = sec.icon; return (
          <button key={sec.id} className={`nav-item ${section === sec.id ? "active" : ""}`} onClick={() => setSection(sec.id)}><I size={15} /> {sec.label}</button>
        ); })}
        {isAdmin && (
          <button className={`nav-item ${section === "admin" ? "active" : ""}`} onClick={() => setSection("admin")}><ShieldCheck size={15} /> Admin Analytics</button>
        )}
      </div>

      <div style={{ padding: 24, overflowY: "auto" }}>
        {section === "profile" && (
          <div className="prof">
            <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>Profile</h2>
            <AccountCard />

            <div className="prof-card">
              <div className="prof-card-h"><span className="prof-ico"><Palette size={15} /></span> Appearance</div>
              <Field label="Theme">
                <select className="model-search" value={s.theme || "dark"} onChange={(e) => setField("theme", e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System (match OS)</option>
                </select>
              </Field>
              <Field label="Accent color">
                <div className="prof-accents">
                  <button className={`prof-acc ${(s.accent || "default") === "default" ? "on" : ""}`} onClick={() => setField("accent", "default")} title="Default (multi-color)">
                    <span className="prof-acc-dot" style={{ background: "linear-gradient(135deg, #9fb0ff, #38e8d0 55%, #b88cff)" }} /> Default
                  </button>
                  <label className={`prof-acc ${(s.accent && s.accent !== "default") ? "on" : ""}`} title="Pick your own accent">
                    <span className="prof-acc-dot" style={{ background: (s.accent && s.accent !== "default") ? s.accent : "var(--bg-1)" }} />
                    Custom
                    <input type="color" value={(s.accent && s.accent !== "default") ? s.accent : "#13c2d6"} onChange={(e) => setField("accent", e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                  </label>
                </div>
              </Field>
            </div>

            <div className="prof-card">
              <div className="prof-card-h"><span className="prof-ico"><Sparkles size={15} /></span> Instructions for BrainEdge</div>
              <p className="prof-sub">Applied to <b>every</b> conversation (Chat, Code, Cowork, Projects) — tone, role, rules, and things to always remember.</p>
              <textarea className="model-search" rows={6} style={{ resize: "vertical", fontFamily: "inherit" }}
                value={s.globalInstructions || ""} onChange={(e) => setS({ ...s, globalInstructions: e.target.value })}
                placeholder="e.g. Be warm and concise. I'm a senior engineer — skip the basics. Prefer TypeScript and show code diffs." />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <button className="btn primary" onClick={async () => { await bridge.saveSettings(s); onChanged?.(s); setStatus("Saved ✓"); setTimeout(() => setStatus(""), 1500); }}><Save size={14} /> Save</button>
                <span style={{ color: "var(--ok)", fontSize: 12 }}>{status}</span>
              </div>
            </div>

            <details className="prof-adv">
              <summary><Server size={13} /> Advanced</summary>
              <Field label="Account server URL">
                <input className="model-search" value={s.authBaseUrl || ""} onChange={(e) => setField("authBaseUrl", e.target.value)} placeholder="http://127.0.0.1:8787  (or your deployed https URL)" />
              </Field>
            </details>
          </div>
        )}

        {section === "terminal" && (
          <div style={{ maxWidth: 720 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Terminal access</h2>
            <p style={{ color: "var(--text-2)", fontSize: 13, margin: "0 0 16px" }}>Run BrainEdge as a coding agent in any terminal — like the desktop app, but in your shell. It's set up automatically for active subscribers using the provider and key you already configured; the controls below let you re-run or turn it off.</p>
            <CliAccess />
          </div>
        )}

        {section === "admin" && isAdmin && (
          <div style={{ maxWidth: 820 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 18 }}>Admin Analytics</h2>
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 14px" }}>Usage stats and user management — suspend/ban users or grant free access. Visible only to admins.</p>
            <AdminPanel />
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
