import { useEffect, useState } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug, User, ShieldCheck, Cpu, LogOut, Save, Send, FolderInput, Palette, Sparkles, Server, Globe, Brain, Pencil, MessagesSquare, Lightbulb } from "lucide-react";
import Community from "./Community.jsx";
import ProductRequests from "./ProductRequests.jsx";
import ModelPicker from "./ModelPicker.jsx";
import AccountCard from "../auth/AccountCard.jsx";
import HelpDot from "./HelpDot.jsx";
import AdminPanel from "../auth/AdminPanel.jsx";
import CliAccess from "./CliAccess.jsx";
import { bridge } from "../bridge/index.js";
import { EXTRAS, extraOn, setExtra, FEAT_BUILT } from "../extras.js";

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
  const [extrasOk, setExtrasOk] = useState(false); // Extras switchboard: Creator + Complimentary accounts only

  useEffect(() => { bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); }); }, []);
  useEffect(() => { bridge.authMe?.().then((r) => {
    if (r && !r.error) {
      setIsAdmin(!!r.admin);
      const role = r.role || (((r.subscription || {}).plan === "Complimentary") ? "complimentary" : null);
      setExtrasOk(!!r.admin || role === "creator" || role === "complimentary");
    }
  }).catch(() => {}); }, []);
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
        <button className={`nav-item ${section === "community" ? "active" : ""}`} onClick={() => setSection("community")}><MessagesSquare size={15} /> Community</button>
        <button className={`nav-item ${section === "requests" ? "active" : ""}`} onClick={() => setSection("requests")}><Lightbulb size={15} /> Product requests</button>
        {extrasOk && (
          <button className={`nav-item ${section === "extras" ? "active" : ""}`} onClick={() => setSection("extras")}><Sparkles size={15} /> Extras</button>
        )}
        {isAdmin && (
          <button className={`nav-item ${section === "agentbrowser" ? "active" : ""}`} onClick={() => setSection("agentbrowser")}><Globe size={15} /> Agent Browser</button>
        )}
        {isAdmin && (
          <button className={`nav-item ${section === "admin" ? "active" : ""}`} onClick={() => setSection("admin")}><ShieldCheck size={15} /> Admin Analytics</button>
        )}
      </div>

      <div style={{ padding: 24, overflowY: "auto" }}>
        {section === "profile" && (
          <div className="prof">
            <h2 style={{ margin: "0 0 16px", fontSize: 20 }}>Profile<HelpDot mode="settings" section="account" /></h2>
            <AccountCard />

            <div className="prof-card">
              <div className="prof-card-h"><span className="prof-ico"><Palette size={15} /></span> Appearance</div>
              <Field label="Theme" help={<HelpDot mode="settings" section="theme" />}>
                <select className="model-search" value={s.theme || "dark"} onChange={(e) => setField("theme", e.target.value)}>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                  <option value="system">System (match OS)</option>
                </select>
              </Field>
              <Field label="Accent color" help={<HelpDot mode="settings" section="accent" />}>
                {(() => {
                  const MADAV = "grad:#0ad0f5:#2196f8:#8b50f5"; // measured from the Madav logo (cyan → azure → violet)
                  let acc = s.accent || MADAV;
                  if (acc === "default") acc = MADAV; // previous default accent retired — Madav is the default
                  const isGrad = acc.startsWith("grad:");
                  const isTerracotta = acc === "#d97757";
                  const isSolid = !isGrad && !isTerracotta;
                  const stops = isGrad ? acc.slice(5).split(":") : ["#0ad0f5", "#8b50f5"];
                  const gradCss = (st) => `linear-gradient(110deg, ${st.join(", ")})`;
                  const setStop = (i, v) => { const st = isGrad ? acc.slice(5).split(":") : ["#0ad0f5", "#8b50f5"]; st[i === 0 ? 0 : st.length - 1] = v; setField("accent", "grad:" + st.join(":")); };
                  return (
                    <div className="prof-accents">
                      <button className={`prof-acc ${acc === MADAV ? "on" : ""}`} onClick={() => setField("accent", MADAV)} title="The Madav logo's own colors — cyan → azure → violet">
                        <span className="prof-acc-dot" style={{ background: gradCss(["#0ad0f5", "#2196f8", "#8b50f5"]) }} /> Madav
                      </button>
                      <button className={`prof-acc ${acc === "#d97757" ? "on" : ""}`} onClick={() => setField("accent", "#d97757")} title="Warm terracotta accent">
                        <span className="prof-acc-dot" style={{ background: "#d97757" }} /> Terracotta
                      </button>
                      <label className={`prof-acc ${isSolid ? "on" : ""}`} title="Pick a single accent color">
                        <span className="prof-acc-dot" style={{ background: isSolid ? acc : "var(--bg-1)" }} />
                        Custom
                        <input type="color" value={isSolid ? acc : "#13c2d6"} onChange={(e) => setField("accent", e.target.value)} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                      </label>
                      <span className={`prof-acc ${isGrad && acc !== MADAV ? "on" : ""}`} title="Build your own two-color gradient accent" style={{ cursor: "default" }}>
                        <span className="prof-acc-dot" style={{ background: gradCss([stops[0], stops[stops.length - 1]]) }} />
                        Gradient
                        <input type="color" title="Start color" value={stops[0]} onChange={(e) => setStop(0, e.target.value)} style={{ width: 22, height: 22, padding: 0, border: "none", background: "none", cursor: "pointer", marginLeft: 6 }} />
                        <span style={{ color: "var(--text-2)" }}>→</span>
                        <input type="color" title="End color" value={stops[stops.length - 1]} onChange={(e) => setStop(1, e.target.value)} style={{ width: 22, height: 22, padding: 0, border: "none", background: "none", cursor: "pointer" }} />
                      </span>
                    </div>
                  );
                })()}
              </Field>
              <Field label="Office Suite Theme color">
                {(() => {
                  const oa = (s.officeAccent || "1F3864").replace(/^#/, "");
                  const isNavy = oa.toUpperCase() === "1F3864";
                  return (
                    <>
                      <div className="prof-accents">
                        <button className={`prof-acc ${isNavy ? "on" : ""}`} onClick={() => setField("officeAccent", "1F3864")} title="Default \u2014 Navy Blue">
                          <span className="prof-acc-dot" style={{ background: "#1F3864" }} /> Navy Blue
                        </button>
                        <label className={`prof-acc ${!isNavy ? "on" : ""}`} title="Pick a custom header colour">
                          <span className="prof-acc-dot" style={{ background: "#" + oa }} />
                          Custom
                          <input type="color" value={"#" + oa} onChange={(e) => setField("officeAccent", e.target.value.replace(/^#/, "").toUpperCase())} style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }} />
                        </label>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 6 }}>Header & title colour for the Word & Excel files Madav generates. Financial cell colours (blue inputs, black formulas, green links) stay fixed.</div>
                    </>
                  );
                })()}
              </Field>
            </div>

            <div className="prof-card">
              <div className="prof-card-h"><span className="prof-ico"><Sparkles size={15} /></span> Instructions for Madav</div>
              <p className="prof-sub">Applied to <b>every</b> conversation (Chat, Code, Cowork, Projects) — tone, role, rules, and things to always remember.</p>
              <textarea className="model-search" rows={6} style={{ resize: "vertical", fontFamily: "inherit" }}
                value={s.globalInstructions || ""} onChange={(e) => setS({ ...s, globalInstructions: e.target.value })}
                placeholder="e.g. Be warm and concise. I'm a senior engineer — skip the basics. Prefer TypeScript and show code diffs." />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
                <button className="btn primary" onClick={async () => { await bridge.saveSettings(s); onChanged?.(s); setStatus("Saved ✓"); setTimeout(() => setStatus(""), 1500); }}><Save size={14} /> Save</button>
                <span style={{ color: "var(--ok)", fontSize: 12 }}>{status}</span>
              </div>
            </div>

            <UserMemoryCard s={s} setField={setField} />

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
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Terminal access<HelpDot mode="terminal" section="cli" /></h2>
            <p style={{ color: "var(--text-2)", fontSize: 13, margin: "0 0 16px" }}>Run Madav as a coding agent in any terminal — like the desktop app, but in your shell. It's set up automatically for active subscribers using the provider and key you already configured; the controls below let you re-run or turn it off.</p>
            <CliAccess />
          </div>
        )}

        {section === "extras" && extrasOk && (
          <div className="prof">
            <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Extras<HelpDot mode="settings" section="extras" /></h2>
            <p className="mo-sub" style={{ margin: "0 0 16px" }}>
              The feature switchboard — turn this install's capabilities on or off for users.
              Only Creator and Complimentary accounts see this page.
            </p>
            {EXTRAS.map((f) => {
              const inBuild = FEAT_BUILT[f.key] !== false;
              const on = inBuild && extraOn(s, f.key);
              return (
                <div key={f.key} className="prof-card" style={{ display: "flex", alignItems: "center", gap: 12, opacity: inBuild ? 1 : 0.55 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                      {f.label}
                      {f.map && <span className="mo-sub" style={{ marginLeft: 8, fontSize: 11 }}>master switch</span>}
                      {!inBuild && <span className="mo-sub" style={{ marginLeft: 8, fontSize: 11 }}>not in this build</span>}
                    </div>
                    <div className="mo-sub" style={{ fontSize: 12, marginTop: 2 }}>{f.desc}</div>
                  </div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: inBuild ? "pointer" : "not-allowed", whiteSpace: "nowrap" }}>
                    <input type="checkbox" checked={on} disabled={!inBuild} onChange={async (e) => {
                      const want = e.target.checked;
                      const cur = await bridge.getSettings(); // re-read from disk first — never clobber another writer
                      const next = setExtra(cur, f.key, want);
                      setS(next); await bridge.saveSettings(next); onChanged?.(next);
                    }} />
                    <span style={{ fontSize: 12.5, color: on ? "var(--accent)" : "var(--text-2)", minWidth: 24 }}>{inBuild ? (on ? "On" : "Off") : "—"}</span>
                  </label>
                </div>
              );
            })}
            <div className="ag-hint" style={{ marginTop: 10 }}>
              Interface features (Sage, Studio, Terminal, Scheduler, Via Mobile, voice) apply immediately.
              Engine features (image generation, office files) apply from the next message; running missions keep the tools they started with.
            </div>
          </div>
        )}
        {section === "community" && <Community isAdmin={isAdmin} />}
        {section === "requests" && <ProductRequests isAdmin={isAdmin} />}
        {section === "agentbrowser" && isAdmin && (
          <AgentBrowserSettings s={s} setField={setField} />
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

function Field({ label, help, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}{help}</div>
      {children}
    </label>
  );
}

// Admin-only Agent Browser guardrails. Secure defaults; relaxing any widens what a
// browsing agent can do on hostile pages. Each toggle carries a plain-English risk note.
function AgentBrowserSettings({ s, setField }) {
  const ab = s.agentBrowser || { enabled: true, enforceAllowlist: true, shieldInjection: true, allowSecretFields: false };
  const featureOn = ab.enabled !== false;
  const set = (k, v) => setField("agentBrowser", { ...ab, [k]: v });
  const Row = ({ k, title, on, onText, offText, danger, disabled, children }) => (
    <div className="prof-card" style={{ ...(danger ? { borderColor: "color-mix(in srgb, var(--danger) 45%, var(--line))" } : {}), ...(disabled ? { opacity: 0.5 } : {}) }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="prof-card-h" style={{ marginBottom: 4 }}>{title}</div>
          <p className="prof-sub" style={{ margin: 0 }}>{children}</p>
          <div style={{ fontSize: 11.5, marginTop: 6, color: on ? "var(--ok)" : (danger ? "var(--danger)" : "var(--text-2)") }}>
            {on ? onText : offText}
          </div>
        </div>
        <label className="chip" style={{ cursor: disabled ? "not-allowed" : "pointer", flexShrink: 0 }}>
          <input type="checkbox" checked={!!on} disabled={disabled} onChange={(e) => set(k, e.target.checked)} style={{ marginRight: 6 }} />
          {on ? "On" : "Off"}
        </label>
      </div>
    </div>
  );
  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><Globe size={18} /> Agent Browser controls</h2>
      <p style={{ color: "var(--text-2)", fontSize: 12.5, margin: "0 0 16px", lineHeight: 1.55 }}>
        Admin-only. You always keep the Agent Browser; the master switch decides whether everyone else gets it. The guardrails below protect any agent that drives the real browser — secure defaults are recommended; relax them only for trusted automation you're actively supervising. Web pages are untrusted input.
      </p>

      {/* MASTER switch — disables the entire feature when off */}
      <div className="prof-card" style={{ borderColor: featureOn ? "var(--accent-line)" : "color-mix(in srgb, var(--danger) 45%, var(--line))", background: featureOn ? "var(--accent-weak)" : undefined }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div className="prof-card-h" style={{ marginBottom: 4 }}>Agent Browser feature</div>
            <p className="prof-sub" style={{ margin: 0 }}>Master switch for everyone else. <b>You (admin) always keep the Agent Browser</b> — this controls whether non-admin users get it. When off, their Browser capability is hidden in the Studio and any agent that has it simply runs without browser tools. Turn off to stop non-admins' agents touching the live web.</p>
            <div style={{ fontSize: 11.5, marginTop: 6, color: featureOn ? "var(--ok)" : "var(--danger)" }}>
              {featureOn ? "✓ Enabled for everyone — any user's agents can browse (subject to the guardrails below)." : "⛔ Off for non-admins — only admins can use the Agent Browser. Your own agents are unaffected."}
            </div>
          </div>
          <label className="chip" style={{ cursor: "pointer", flexShrink: 0 }}>
            <input type="checkbox" checked={featureOn} onChange={(e) => set("enabled", e.target.checked)} style={{ marginRight: 6 }} />
            {featureOn ? "On" : "Off"}
          </label>
        </div>
      </div>

      {!featureOn && <div className="ag-hint" style={{ margin: "4px 0 10px" }}>Guardrails are inactive while the feature is off.</div>}

      <Row k="enforceAllowlist" disabled={!featureOn} title="Enforce site allowlist" on={ab.enforceAllowlist !== false}
        onText="✓ Agents stay on each agent's allowed sites; off-list redirects are blocked."
        offText="⚠ Off — agents may open ANY site and follow redirects anywhere.">
        Confine each browsing agent to the domains listed on its card. Leave on so a stray link or injected redirect can't take an agent somewhere unexpected.
      </Row>

      {/* Global default allowlist — used by any agent that doesn't define its own */}
      <div className="prof-card" style={!featureOn || ab.enforceAllowlist === false ? { opacity: 0.5 } : undefined}>
        <div className="prof-card-h" style={{ marginBottom: 4 }}>Default allowed sites</div>
        <p className="prof-sub" style={{ margin: "0 0 8px" }}>
          Domains every browsing agent may visit when it has <b>no allowlist of its own</b> — one per line or comma-separated
          (e.g. <code>github.com, news.ycombinator.com</code>). Subdomains are included automatically. An agent's own
          allowed-sites list (in its Blueprint) always wins over this default. Leave empty to allow any site for agents without a list.
        </p>
        <textarea rows={3} disabled={!featureOn || ab.enforceAllowlist === false}
          value={ab.globalAllow || ""} placeholder="github.com, docs.python.org, news.ycombinator.com"
          onChange={(e) => set("globalAllow", e.target.value)}
          style={{ width: "100%", background: "var(--bg-1)", border: "1px solid var(--line)", borderRadius: 9, padding: "8px 11px", color: "var(--text-0)", fontSize: 12.5, outline: "none", resize: "vertical", fontFamily: "var(--mono)" }} />
        {ab.enforceAllowlist === false && <div className="ag-hint" style={{ margin: "6px 0 0" }}>Inactive while "Enforce site allowlist" is off.</div>}
      </div>
      <Row k="shieldInjection" disabled={!featureOn} title="Shield against page-injected instructions" on={ab.shieldInjection !== false}
        onText="✓ Page text is marked UNTRUSTED so embedded commands stay inert."
        offText="⚠ Off — text hidden in a page could hijack the agent (prompt injection).">
        Wraps page content so an agent treats it as data, never as commands. The single most important defense when agents read the open web — keep it on.
      </Row>
      <Row k="allowSecretFields" disabled={!featureOn} title="Allow agents to fill password & payment fields" on={ab.allowSecretFields === true} danger
        onText="⚠ DANGEROUS — agents can now type into password, card, CVV, OTP and SSN fields."
        offText="✓ Recommended — those fields are human-only; the agent hands the window to you.">
        Off by default for good reason: an agent auto-typing credentials or card details into a web form is high-risk, especially if a page tries to trick it. The visible browser lets you fill these yourself. Enable only for trusted, supervised automation on sites you control.
      </Row>
      <Row k="fullSpeedMinimized" disabled={!featureOn} title="Full speed while minimized" on={ab.fullSpeedMinimized !== false}
        onText="✓ The browser keeps running at full speed even when minimized out of the way."
        offText="⚠ Off — minimized windows are throttled by Chromium, which can stall pages mid-task.">
        The agent's browser window keeps working at full speed when minimized (no background throttling).
      </Row>
      <div className="ag-hint" style={{ marginTop: 6 }}>
        Changes apply to the next browser action. Per-agent allowlists are set on each agent in the Studio (Browser capability).
      </div>
    </div>
  );
}

/* Cross-chat memory — what Madav remembers about you, everywhere.
   Lives in a local file on this device; injected only into your own model's prompts. */
function UserMemoryCard({ s, setField }) {
  const [notes, setNotes] = useState(null); // null = loading
  const [edit, setEdit] = useState(null);   // editable text or null
  const enabled = !s.userMemory || s.userMemory.enabled !== false;
  useEffect(() => { bridge.getUserMemory?.().then((m) => setNotes((m && m.notes) || [])).catch(() => setNotes([])); }, []);
  const saveEdit = async () => {
    const list = (edit || "").split("\n").map((l) => l.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
    const m = await bridge.setUserMemory?.(list);
    setNotes((m && m.notes) || []); setEdit(null);
  };
  return (
    <div className="prof-card">
      <div className="prof-card-h"><span className="prof-ico"><Brain size={15} /></span> Memory</div>
      <p className="prof-sub">
        Madav quietly remembers durable facts about you (preferences, your projects, corrections) and applies them
        in <b>every</b> conversation. Stored only on this device — view and edit everything below.
      </p>
      <label className="chip" style={{ cursor: "pointer", display: "inline-flex", marginBottom: 10 }}>
        <input type="checkbox" checked={enabled} style={{ marginRight: 6 }}
          onChange={() => setField("userMemory", { ...(s.userMemory || {}), enabled: !enabled })} />
        Remember things about me across chats
      </label>
      {!enabled && <div className="ag-hint" style={{ margin: "0 0 8px" }}>Memory is off — existing notes are kept but not used, and nothing new is learned.</div>}
      {edit !== null ? (
        <>
          <textarea className="model-search" rows={6} style={{ resize: "vertical", fontFamily: "inherit" }}
            value={edit} onChange={(e) => setEdit(e.target.value)} placeholder="One memory per line" />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button className="btn primary" onClick={saveEdit}><Save size={13} /> Save memory</button>
            <button className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          {notes === null && <div className="ag-hint" style={{ margin: 0 }}>Loading…</div>}
          {notes && notes.length === 0 && <div className="ag-hint" style={{ margin: 0 }}>Nothing remembered yet — as you chat, durable facts you share (preferences, what you're building) will appear here.</div>}
          {(notes || []).slice().reverse().map((n, i) => (
            <div key={i} style={{ fontSize: 12.5, padding: "5px 0", borderBottom: "1px dashed color-mix(in srgb, currentColor 10%, transparent)" }}>• {n.text}</div>
          ))}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setEdit((notes || []).map((n) => n.text).join("\n"))}><Pencil size={12} /> Edit</button>
            {(notes || []).length > 0 && <button className="btn ghost" style={{ color: "var(--danger)" }} onClick={async () => { await bridge.clearUserMemory?.(); setNotes([]); }}><Trash2 size={12} /> Forget everything</button>}
          </div>
        </>
      )}
    </div>
  );
}
