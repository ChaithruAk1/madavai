import { useEffect, useState } from "react";
import { useRef } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug, Save, Download, Upload } from "lucide-react";
import HelpDot from "./HelpDot.jsx";
import ModelPicker from "./ModelPicker.jsx";
import { bridge, isWeb } from "../bridge/index.js";
import { madavAlert, madavConfirm } from "../dialogs.jsx";

const BLANK = (id) => ({ id, name: "New provider", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "" });

// Quick-add templates for popular providers — pick one and it prefills the wire format + base URL;
// you just add your API key. (All OpenAI-compatible unless noted.) Add a row here to support more.
const PROVIDER_PRESETS = [
  { name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1" },
  { name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com" },
  { name: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "Google Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "Nvidia", kind: "openai", baseUrl: "https://integrate.api.nvidia.com/v1" },
  { name: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1" },
  { name: "Mistral", kind: "openai", baseUrl: "https://api.mistral.ai/v1" },
  { name: "xAI (Grok)", kind: "openai", baseUrl: "https://api.x.ai/v1" },
  { name: "Groq", kind: "openai", baseUrl: "https://api.groq.com/openai/v1" },
  { name: "Together AI", kind: "openai", baseUrl: "https://api.together.xyz/v1" },
  { name: "Fireworks AI", kind: "openai", baseUrl: "https://api.fireworks.ai/inference/v1" },
  { name: "Perplexity", kind: "openai", baseUrl: "https://api.perplexity.ai" },
  { name: "Cerebras", kind: "openai", baseUrl: "https://api.cerebras.ai/v1" },
  { name: "DeepInfra", kind: "openai", baseUrl: "https://api.deepinfra.com/v1/openai" },
  { name: "Hyperbolic", kind: "openai", baseUrl: "https://api.hyperbolic.xyz/v1" },
  { name: "Ollama (local)", kind: "openai", baseUrl: "http://localhost:11434/v1" },
  { name: "LM Studio (local)", kind: "openai", baseUrl: "http://localhost:1234/v1" },
  { name: "llama.cpp (local)", kind: "openai", baseUrl: "http://localhost:8080/v1" },
];

// Where to get an API key for each default provider (matched by base-URL host or name).
const KEY_URLS = [
  [/openrouter\.ai/i, "https://openrouter.ai/keys"],
  [/api\.openai\.com/i, "https://platform.openai.com/api-keys"],
  [/api\.anthropic\.com/i, "https://console.anthropic.com/settings/keys"],
  [/nvidia\.com/i, "https://build.nvidia.com/models"],
  [/googleapis|gemini/i, "https://aistudio.google.com/app/apikey"],
  [/deepseek\.com/i, "https://platform.deepseek.com/api_keys"],
  [/mistral\.ai/i, "https://console.mistral.ai/api-keys"],
  [/(^|[^a-z])x\.ai/i, "https://console.x.ai"],
  [/groq\.com/i, "https://console.groq.com/keys"],
  [/together\.(xyz|ai)/i, "https://api.together.xyz/settings/api-keys"],
  [/fireworks\.ai/i, "https://fireworks.ai/account/api-keys"],
  [/perplexity\.ai/i, "https://www.perplexity.ai/settings/api"],
  [/cerebras\.ai/i, "https://cloud.cerebras.ai"],
  [/deepinfra\.com/i, "https://deepinfra.com/dash/api_keys"],
  [/hyperbolic\.xyz/i, "https://app.hyperbolic.xyz/settings"],
];
const keyUrlFor = (p) => { const s = `${(p && p.baseUrl) || ""} ${(p && p.name) || ""}`; for (const [re, url] of KEY_URLS) if (re.test(s)) return url; return null; };
// "Connected" = free Starter, a local endpoint, an Anthropic subscription, or a saved API key.
const readyOf = (p) => /\/starter\b/.test(p.baseUrl || "") || /localhost|127\.0\.0\.1/i.test(p.baseUrl || "") || (p.kind === "anthropic" && p.useSubscription) || !!(p.apiKey || "").trim();

// Provider chip — REAL brand icons via the Simple Icons CDN (brand-colored SVGs),
// with the Madav M for Starter and a deterministic hue-letter fallback when a brand
// has no icon or the machine is offline (img onError swaps the letter back in).
const BRAND_SLUG = {
  "OpenAI": "openai", "Anthropic": "anthropic", "OpenRouter": "openrouter",
  "Google Gemini": "googlegemini", "Nvidia": "nvidia", "NVIDIA NIM": "nvidia", "DeepSeek": "deepseek",
  "Mistral": "mistralai", "xAI (Grok)": "x", "Groq": "groq", "Together AI": "togetherai",
  "Fireworks AI": "fireworksai", "Perplexity": "perplexity", "Cerebras": "cerebras",
  "Ollama (local)": "ollama", "LM Studio (local)": "lmstudio", "llama.cpp (local)": "llamacpp",
};
import mUrl from "../../madav-m.png";
function PChip({ name }) {
  const [broken, setBroken] = useState(false);
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const starter = /madav starter/i.test(name);
  const slug = BRAND_SLUG[name] || BRAND_SLUG[Object.keys(BRAND_SLUG).find((k) => name.startsWith(k.split(" ")[0])) || ""];
  if (starter) return <span className="mc-pchip"><img src={mUrl} alt="" style={{ width: 22, height: 22 }} /></span>;
  if (slug && !broken) {
    // Dark theme: many brand marks are black (OpenAI, xAI…) and disappear — render them
    // white there; light theme keeps the official brand colors. Never dimmed either way.
    const light = typeof document !== "undefined" && document.documentElement.dataset.theme === "light";
    return (
      <span className="mc-pchip">
        <img src={`https://cdn.simpleicons.org/${slug}${light ? "" : "/white"}`} alt="" style={{ width: 20, height: 20 }} onError={() => setBroken(true)} />
      </span>
    );
  }
  return (
    <span className="mc-pchip" style={{ color: `hsl(${hue} 75% 70%)` }}>
      {(name.replace(/^[^a-zA-Z+]+/, "")[0] || "?").toUpperCase()}
    </span>
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

export default function ModelConfig({ onChanged }) {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [view, setView] = useState("grid"); // "grid" = provider gallery · "edit" = inside one provider's setup
  const [status, setStatus] = useState("");
  const [isPriv, setIsPriv] = useState(false); // admin OR creator — Anthropic is gated to them only
  const restoreRef = useRef(null); // backup-restore file input (must sit above the early return — hooks rule)

  useEffect(() => { bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); }); }, []);
  useEffect(() => { bridge.authMe?.().then((r) => {
    if (r && !r.error) { const role = r.role || (((r.subscription || {}).plan === "Complimentary") ? "complimentary" : null); setIsPriv(!!r.admin || role === "creator"); }
  }).catch(() => {}); }, []);
  if (!s || !selId) return (
    <div className="skel-page">
      <div className="skel" style={{ width: 260, height: 26 }} />
      <div className="skel-row"><div className="skel" style={{ width: 220, height: 340 }} /><div className="skel" style={{ flex: 1, height: 340 }} /></div>
    </div>
  );

  const profiles = Object.values(s.profiles);
  const sel = s.profiles[selId];
  const modelGroups = profiles.map((p) => {
    const ids = (p.cachedModels && p.cachedModels.length) ? p.cachedModels : (p.model ? [p.model] : []);
    return { group: p.name, items: ids.map((mid) => ({ id: `${p.id}::${mid}`, name: mid, prov: p.name, badge: p.kind })) };
  }).filter((g) => g.items.length);

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); onChanged?.(next); };

  // Backup/restore: the whole settings object (providers+keys+agents+teams+preferences) as one JSON file.
  const backupAll = async () => {
    const cur = await bridge.getSettings();
    const blob = new Blob([JSON.stringify({ app: "madav", exportedAt: new Date().toISOString(), settings: cur }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `madav-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  // Only settings keys the app actually knows about may come in from a backup file —
  // unknown keys are dropped (a tampered backup must not smuggle arbitrary state in).
  const RESTORE_KEYS = [
    "profiles", "activeProfileId", "agents", "teams", "connectors", "skillsDir", "skillsDirs", "disabledSkills",
    "account", "googleClientId", "googleClientSecret", "githubClientId", "globalInstructions", "responseLanguage",
    "theme", "accent", "defaultModel", "proxyUrl", "noProxy", "messaging", "webhooks",
    "missionTokenBudget", "agentBrowser", "authBaseUrl",
  ];
  const restoreAll = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const j = JSON.parse(String(reader.result || ""));
        const _okApp = j && (j.app === "madav" || j.app === ("brain" + "edge")); // accept legacy backups too
        if (!_okApp || !j.settings || typeof j.settings.profiles !== "object") { setStatus("Not a Madav backup file."); return; }
        // Drop unknown top-level keys (whitelist) so a crafted backup can't inject settings the UI never exposes.
        const incoming = {};
        for (const k of RESTORE_KEYS) if (k in j.settings) incoming[k] = j.settings[k];
        // authBaseUrl controls which server receives the auth token — never accept it silently.
        if (incoming.authBaseUrl) {
          const keep = await madavConfirm(`This backup wants to change the account server URL to "${incoming.authBaseUrl}" — keep it?\n\n(Cancel restores everything else but leaves your account server unchanged.)`, { okLabel: "Keep it" });
          if (!keep) delete incoming.authBaseUrl;
        }
        // Every provider must point at an http(s) URL — anything else gets dropped, not restored.
        const badProfiles = [];
        const cleanProfiles = {};
        for (const [pid, p] of Object.entries(incoming.profiles || {})) {
          if (p && typeof p.baseUrl === "string" && /^https?:\/\//i.test(p.baseUrl.trim())) cleanProfiles[pid] = p;
          else badProfiles.push((p && p.name) || pid);
        }
        incoming.profiles = cleanProfiles;
        if (badProfiles.length) madavAlert(`These providers were skipped — their server URL must start with http:// or https://:\n\n${badProfiles.join("\n")}`);
        if (!Object.keys(incoming.profiles).length) { setStatus("No valid providers in that backup — nothing restored."); return; }
        if (!incoming.profiles[incoming.activeProfileId]) incoming.activeProfileId = Object.keys(incoming.profiles)[0];
        if (!(await madavConfirm("Restore this backup? Your current providers, agents, teams and preferences will be REPLACED.", { okLabel: "Restore" }))) return;
        await persist(incoming);
        setSelId(incoming.activeProfileId || Object.keys(incoming.profiles)[0]);
        setStatus("Backup restored.");
      } catch { setStatus("Couldn't read that backup file."); }
    };
    reader.readAsText(file);
  };
  const patch = (field, val) => persist({ ...s, profiles: { ...s.profiles, [selId]: { ...sel, [field]: val } } });
  const setField = (k, v) => persist({ ...s, [k]: v });
  const addProfile = () => { const id = "p_" + Math.random().toString(36).slice(2, 7); persist({ ...s, profiles: { ...s.profiles, [id]: { ...BLANK(id), custom: true } } }); setSelId(id); setView("edit"); };
  const addPreset = (name) => {
    const id = "p_" + Math.random().toString(36).slice(2, 7);
    const pr = PROVIDER_PRESETS.find((x) => x.name === name);
    const prof = pr ? { id, name: pr.name, kind: pr.kind, baseUrl: pr.baseUrl, apiKey: "", model: "" } : BLANK(id);
    persist({ ...s, profiles: { ...s.profiles, [id]: prof } }); setSelId(id); setView("edit");
  };
  const delProfile = () => {
    const cur = s.profiles[selId];
    if (!cur || !cur.custom) return; // only user-created custom providers can be deleted; defaults are locked
    if (profiles.length <= 1) return;
    const rest = { ...s.profiles }; delete rest[selId];
    persist({ ...s, profiles: rest, activeProfileId: s.activeProfileId === selId ? Object.keys(rest)[0] : s.activeProfileId });
    setSelId(Object.keys(rest)[0]);
    setView("grid");
  };
  const test = async () => { setStatus("Fetching models…"); const list = await bridge.listModels(selId); setStatus(list.length ? `${list.length} models found` : "No /v1/models — enter the model id manually"); };
  const saveProvider = async () => {
    if (sel.kind === "anthropic" && !isPriv) { setStatus("Anthropic is available to admins and creators only."); return; }
    setStatus("Saving & validating…");
    let list = []; try { list = await bridge.listModels(selId); } catch {}
    const next = { ...s, profiles: { ...s.profiles, [selId]: { ...sel, cachedModels: list } } };
    setS(next); await bridge.saveSettings(next); onChanged?.(next);
    setStatus(list.length ? `Saved ✓ · ${list.length} models available in the picker` : "Saved ✓ · couldn't load models — enter the model id manually");
  };

  return (
    <div className="mo scroll">
      <div className="mc-wrap">
      {view === "grid" && <>
      {/* Top toolbar — backup/restore as icon-only buttons (hover shows the description). */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
        <button className="btn ghost" style={{ padding: "6px 9px" }} aria-label="Download backup"
          title="Download backup — saves your providers, agents, teams & preferences (including API keys) to one JSON file. Keep it private." onClick={backupAll}><Download size={16} /></button>
        <button className="btn ghost" style={{ padding: "6px 9px" }} aria-label="Restore from backup"
          title="Restore from backup — replaces your current providers, agents, teams & preferences from a backup JSON file." onClick={() => restoreRef.current && restoreRef.current.click()}><Upload size={16} /></button>
        <input ref={restoreRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { restoreAll(e.target.files && e.target.files[0]); e.target.value = ""; }} />
      </div>
      {/* top: default model + proxy as responsive side-by-side cards */}
      <div className="mc-top">
        <div className="mc-card">
          <div className="nav-label" style={{ paddingLeft: 0 }}>Default model<HelpDot mode="models" section="defaultmodel" /></div>
          <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 8px" }}>
            Applied every time the app starts. You can still switch models live in the top bar during a session — it resets to this on next launch.
          </p>
          <ModelPicker value={s.defaultModel || ""} groups={modelGroups} onChange={(v) => { setField("defaultModel", v); setStatus("Default model saved ✓"); }} />
          {status.startsWith("Default") && <span style={{ color: "var(--ok)", fontSize: 12, marginLeft: 10 }}>{status}</span>}
        </div>
        <div className="mc-card">
          <div className="nav-label" style={{ paddingLeft: 0 }}>Corporate proxy (optional)<HelpDot mode="models" section="proxy" /></div>
          <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 8px" }}>
            Route all LLM, MCP, and Telegram traffic through your company's approved proxy/gateway. Local models bypass it automatically. <b>Restart the app</b> after changing this.
          </p>
          <Field label="Proxy URL"><input className="model-search" value={s.proxyUrl || ""} onChange={(e) => setField("proxyUrl", e.target.value)} placeholder="http://proxy.corp:8080" /></Field>
          <Field label="Bypass hosts (no-proxy)"><input className="model-search" value={s.noProxy || ""} onChange={(e) => setField("noProxy", e.target.value)} placeholder="localhost,127.0.0.1,.corp.internal" /></Field>
        </div>
      </div>

      <div className="nav-label" style={{ paddingLeft: 0 }}>Model Providers<HelpDot mode="models" section="provider" /></div>
      <p style={{ color: "var(--text-2)", fontSize: 12.5, margin: "2px 0 10px" }}>
        <b style={{ color: "var(--text-1)" }}>Madav Starter (free)</b> works the moment you sign in — no API key needed, with a daily limit on free models.
        For long-term use we recommend adding your own provider key (OpenRouter is the easiest: one key, hundreds of models, pay only for what you use) — pick a provider below, paste the key, and every model unlocks with no daily cap.
      </p>
      {/* Provider gallery — every configured provider plus one-click presets, as cards. */}
      <div className="mc-pgrid">
        {/* Custom provider — a TEMPLATE: "Set up" creates a NEW (deletable) provider; this card itself never changes. Highlighted + first, as the entry point to add your own provider. */}
        <button className="mc-pcard" onClick={addProfile} style={{ background: "var(--accent-weak)", borderColor: "var(--accent-line)" }}>
          <PChip name="+" />
          <span className="mc-pmain">
            <b>Custom provider</b>
            <small>Add your own OpenAI/Anthropic endpoint</small>
          </span>
          <span className="mc-pact">Set up</span>
        </button>
        {profiles.filter((p) => isPriv || p.kind !== "anthropic").slice().sort((a, b) => readyOf(b) - readyOf(a)).map((p) => {
          const local = /localhost|127\.0\.0\.1/i.test(p.baseUrl || "");
          const starter = /\/starter\b/.test(p.baseUrl || "");
          const subMode = p.kind === "anthropic" && p.useSubscription;
          const ready = starter || local || subMode || !!(p.apiKey || "").trim();
          return (
            <button key={p.id} className={`mc-pcard ${p.id === selId ? "sel" : ""}`} onClick={() => { setSelId(p.id); setView("edit"); setStatus(""); }}>
              <PChip name={p.name} />
              <span className="mc-pmain">
                <b>{p.name}</b>
                <small>{starter ? "free · no key needed" : local ? "runs on this computer" : subMode ? "Claude subscription" : p.kind === "anthropic" ? "Anthropic API" : "OpenAI-compatible"}</small>
              </span>
              <span className={`mc-pact ${ready ? "ok" : ""}`}>{ready ? <><Check size={13} /> {subMode ? "Subscription" : "Connected"}</> : "Add key"}</span>
            </button>
          );
        })}
        {PROVIDER_PRESETS.filter((pr) => (isPriv || pr.kind !== "anthropic") && !profiles.some((x) => x.name === pr.name)).map((pr) => (
          <button key={pr.name} className="mc-pcard" onClick={() => addPreset(pr.name)}>
            <PChip name={pr.name} />
            <span className="mc-pmain">
              <b>{pr.name}</b>
              <small>{/localhost/.test(pr.baseUrl) ? "runs on this computer" : pr.kind === "anthropic" ? "Anthropic API" : "OpenAI-compatible"}</small>
            </span>
            <span className="mc-pact">Connect</span>
          </button>
        ))}
      </div>

      </>}

      {view === "edit" && (
      <div className="mc-providers">
        <button className="btn ghost" style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6, width: "fit-content" }} onClick={() => { setView("grid"); setStatus(""); }}>
          ← All providers
        </button>
        <div className="mc-card mc-editor">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{sel.name}</h3>
            <span style={{ flex: 1 }} />
            {sel.custom && <button className="btn ghost danger" onClick={delProfile} title="Delete this custom provider"><Trash2 size={14} /></button>}
          </div>
          <div className="mc-fields">
            <div className="nav-label" style={{ paddingLeft: 0, gridColumn: "1 / -1" }}>Connection</div>
            <Field label="Display name"><input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} /></Field>
            <Field label="Wire format">
              <select className="model-search" value={sel.kind} onChange={(e) => patch("kind", e.target.value)}>
                <option value="openai">OpenAI-compatible (/v1/chat/completions)</option>
                {isPriv && <option value="anthropic">Anthropic-compatible (/v1/messages)</option>}
              </select>
            </Field>
            <Field label="Base URL" help={<HelpDot mode="models" section="baseurl" />}><input className="model-search" value={sel.baseUrl} onChange={(e) => patch("baseUrl", e.target.value)} placeholder="https://openrouter.ai/api" /></Field>
            {sel.kind === "anthropic" && isPriv && (
              <Field label="Authentication">
                <select className="model-search" value={sel.useSubscription ? "subscription" : "key"} onChange={(e) => patch("useSubscription", e.target.value === "subscription")}>
                  <option value="key">API key (sk-ant-…)</option>
                  <option value="subscription">My Claude subscription (sign in with the Claude CLI)</option>
                </select>
              </Field>
            )}
            {!(sel.kind === "anthropic" && sel.useSubscription) && (
              <Field label="API key" help={<HelpDot mode="models" section="key" />}><input className="model-search" type="password" value={sel.apiKey} onChange={(e) => patch("apiKey", e.target.value)} placeholder={sel.kind === "anthropic" ? "sk-ant-…" : "leave blank for local"} /></Field>
            )}
          </div>
          {keyUrlFor(sel) && !(sel.kind === "anthropic" && sel.useSubscription) && (
            <p style={{ fontSize: 12, margin: "8px 0 0" }}>
              <a className="conn-link" href="#" onClick={(e) => { e.preventDefault(); try { (bridge.openExternal || window.open)(keyUrlFor(sel)); } catch {} }}>Get an API key for {sel.name} ↗</a>
            </p>
          )}
          {isWeb && (
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "8px 0 0" }}>
              🔒 Your API keys stay in <b>this browser's storage</b> and go only to the provider — Madav servers never see them.
              Anyone with access to this browser profile could use them, so avoid shared computers.
            </p>
          )}

          {sel.kind === "anthropic" && sel.useSubscription && (
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "10px 0 0" }}>
              Using your <b>Claude subscription</b> (admins &amp; creators only). Sign in once with the Claude CLI — run <code>claude login</code> in a terminal — and Madav uses that session; no API key needed.
              Note: using a Claude consumer plan from third-party software may be against Anthropic's terms.
            </p>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={saveProvider}><Save size={14} /> Save</button><HelpDot mode="models" section="modellist" />
            <button className="btn" onClick={test}><RefreshCw size={14} /> Load Models</button>
            <span style={{ color: status.startsWith("Saved") ? "var(--ok)" : "var(--text-2)", fontSize: 12 }}>{status}</span>
          </div>
          <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 14 }}>
            Every provider is always available — the model you pick in the top-bar selector decides which one runs.
          </p>
        </div>
      </div>
      )}
      </div>
    </div>
  );
}
