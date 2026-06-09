import { useEffect, useState } from "react";
import { useRef } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug, Save, Download, Upload } from "lucide-react";
import ModelPicker from "./ModelPicker.jsx";
import { bridge, isWeb } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New provider", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "" });

// Quick-add templates for popular providers — pick one and it prefills the wire format + base URL;
// you just add your API key. (All OpenAI-compatible unless noted.) Add a row here to support more.
const PROVIDER_PRESETS = [
  { name: "OpenAI", kind: "openai", baseUrl: "https://api.openai.com/v1" },
  { name: "Anthropic", kind: "anthropic", baseUrl: "https://api.anthropic.com" },
  { name: "OpenRouter", kind: "openai", baseUrl: "https://openrouter.ai/api/v1" },
  { name: "Google Gemini", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { name: "NVIDIA NIM", kind: "openai", baseUrl: "https://integrate.api.nvidia.com/v1" },
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

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div style={{ fontSize: 12, color: "var(--text-2)", marginBottom: 5 }}>{label}</div>
      {children}
    </label>
  );
}

export default function ModelConfig({ onChanged }) {
  const [s, setS] = useState(null);
  const [selId, setSelId] = useState(null);
  const [status, setStatus] = useState("");
  const restoreRef = useRef(null); // backup-restore file input (must sit above the early return — hooks rule)

  useEffect(() => { bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); }); }, []);
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
    const blob = new Blob([JSON.stringify({ app: "brainedge", exportedAt: new Date().toISOString(), settings: cur }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `brainedge-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const restoreAll = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const j = JSON.parse(String(reader.result || ""));
        if (!j || j.app !== "brainedge" || !j.settings || typeof j.settings.profiles !== "object") { setStatus("Not a BrainEdge backup file."); return; }
        if (!window.confirm("Restore this backup? Your current providers, agents, teams and preferences will be REPLACED.")) return;
        await persist(j.settings);
        setSelId(j.settings.activeProfileId || Object.keys(j.settings.profiles)[0]);
        setStatus("Backup restored.");
      } catch { setStatus("Couldn't read that backup file."); }
    };
    reader.readAsText(file);
  };
  const patch = (field, val) => persist({ ...s, profiles: { ...s.profiles, [selId]: { ...sel, [field]: val } } });
  const setField = (k, v) => persist({ ...s, [k]: v });
  const addProfile = () => { const id = "p_" + Math.random().toString(36).slice(2, 7); persist({ ...s, profiles: { ...s.profiles, [id]: BLANK(id) } }); setSelId(id); };
  const addPreset = (name) => {
    const id = "p_" + Math.random().toString(36).slice(2, 7);
    const pr = PROVIDER_PRESETS.find((x) => x.name === name);
    const prof = pr ? { id, name: pr.name, kind: pr.kind, baseUrl: pr.baseUrl, apiKey: "", model: "" } : BLANK(id);
    persist({ ...s, profiles: { ...s.profiles, [id]: prof } }); setSelId(id);
  };
  const delProfile = () => {
    if (profiles.length <= 1) return;
    const rest = { ...s.profiles }; delete rest[selId];
    persist({ ...s, profiles: rest, activeProfileId: s.activeProfileId === selId ? Object.keys(rest)[0] : s.activeProfileId });
    setSelId(Object.keys(rest)[0]);
  };
  const test = async () => { setStatus("Fetching models…"); const list = await bridge.listModels(selId); setStatus(list.length ? `${list.length} models found` : "No /v1/models — enter the model id manually"); };
  const saveProvider = async () => {
    setStatus("Saving & validating…");
    let list = []; try { list = await bridge.listModels(selId); } catch {}
    const next = { ...s, profiles: { ...s.profiles, [selId]: { ...sel, cachedModels: list } } };
    setS(next); await bridge.saveSettings(next); onChanged?.(next);
    setStatus(list.length ? `Saved ✓ · ${list.length} models available in the picker` : "Saved ✓ · couldn't load models — enter the model id manually");
  };

  return (
    <div className="mo scroll">
      <div className="mc-wrap">
      {/* top: default model + proxy as responsive side-by-side cards */}
      <div className="mc-top">
        <div className="mc-card">
          <div className="nav-label" style={{ paddingLeft: 0 }}>Default model</div>
          <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 8px" }}>
            Applied every time the app starts. You can still switch models live in the top bar during a session — it resets to this on next launch.
          </p>
          <ModelPicker value={s.defaultModel || ""} groups={modelGroups} onChange={(v) => { setField("defaultModel", v); setStatus("Default model saved ✓"); }} />
          {status.startsWith("Default") && <span style={{ color: "var(--ok)", fontSize: 12, marginLeft: 10 }}>{status}</span>}
        </div>
        <div className="mc-card">
          <div className="nav-label" style={{ paddingLeft: 0 }}>Corporate proxy (optional)</div>
          <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 8px" }}>
            Route all LLM, MCP, and Telegram traffic through your company's approved proxy/gateway. Local models bypass it automatically. <b>Restart the app</b> after changing this.
          </p>
          <Field label="Proxy URL"><input className="model-search" value={s.proxyUrl || ""} onChange={(e) => setField("proxyUrl", e.target.value)} placeholder="http://proxy.corp:8080" /></Field>
          <Field label="Bypass hosts (no-proxy)"><input className="model-search" value={s.noProxy || ""} onChange={(e) => setField("noProxy", e.target.value)} placeholder="localhost,127.0.0.1,.corp.internal" /></Field>
        </div>
      </div>

      <div className="nav-label" style={{ paddingLeft: 0 }}>Providers &amp; models</div>
      <div className="mc-providers">
        <div className="mc-provlist">
          {profiles.map((p) => (
            <button key={p.id} className={`nav-item ${p.id === selId ? "active" : ""}`} onClick={() => setSelId(p.id)}>
              <Plug size={15} /> {p.name}
            </button>
          ))}
          <select className="model-search" style={{ marginTop: 6 }} value="" onChange={(e) => { if (e.target.value === "__custom") addProfile(); else if (e.target.value) addPreset(e.target.value); e.target.value = ""; }}>
            <option value="">+ Add provider…</option>
            {PROVIDER_PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
            <option value="__custom">Custom (blank)</option>
          </select>
        </div>

        <div className="mc-card mc-editor">
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>{sel.name}</h3>
            <span style={{ flex: 1 }} />
            <button className="btn ghost danger" onClick={delProfile}><Trash2 size={14} /></button>
          </div>
          <div className="mc-fields">
            <div className="nav-label" style={{ paddingLeft: 0, gridColumn: "1 / -1" }}>Connection</div>
            <Field label="Display name"><input className="model-search" value={sel.name} onChange={(e) => patch("name", e.target.value)} /></Field>
            <Field label="Wire format">
              <select className="model-search" value={sel.kind} onChange={(e) => patch("kind", e.target.value)}>
                <option value="openai">OpenAI-compatible (/v1/chat/completions)</option>
                <option value="anthropic">Anthropic-compatible (/v1/messages)</option>
              </select>
            </Field>
            <Field label="Base URL"><input className="model-search" value={sel.baseUrl} onChange={(e) => patch("baseUrl", e.target.value)} placeholder="https://openrouter.ai/api" /></Field>
            {!(sel.kind === "anthropic" && s.anthropicUseSubscription) && (
              <Field label="API key"><input className="model-search" type="password" value={sel.apiKey} onChange={(e) => patch("apiKey", e.target.value)} placeholder="leave blank for local" /></Field>
            )}
          </div>
          {isWeb && (
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "8px 0 0" }}>
              🔒 Your API keys stay in <b>this browser's storage</b> and go only to the provider — BrainEdge servers never see them.
              Anyone with access to this browser profile could use them, so avoid shared computers.
            </p>
          )}

          {sel.kind === "anthropic" && (
            <>
              <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>Billing &amp; sign‑in</div>
              <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 10px" }}>Choose how Anthropic models are billed (testing only — subscription/OAuth use is restricted by Anthropic's terms; remove before publishing):</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button type="button" onClick={() => setField("anthropicUseSubscription", false)} style={{ textAlign: "left", border: "1px solid " + (!s.anthropicUseSubscription ? "var(--accent)" : "var(--line)"), borderRadius: 10, padding: "12px 14px", background: !s.anthropicUseSubscription ? "var(--accent-weak)" : "var(--bg-1)", cursor: "pointer" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>🔑 API key {!s.anthropicUseSubscription && <span className="chip" style={{ color: "var(--ok)", marginLeft: 6 }}><Check size={12} /></span>}</div>
                  <div style={{ color: "var(--text-2)", fontSize: 11.5, marginTop: 6 }}>Use an <code>sk‑ant‑…</code> commercial key. Billed pay‑as‑you‑go to your Anthropic API credits.</div>
                </button>
                <button type="button" onClick={() => setField("anthropicUseSubscription", true)} style={{ textAlign: "left", border: "1px solid " + (s.anthropicUseSubscription ? "var(--accent)" : "var(--line)"), borderRadius: 10, padding: "12px 14px", background: s.anthropicUseSubscription ? "var(--accent-weak)" : "var(--bg-1)", cursor: "pointer" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>👤 Subscription {s.anthropicUseSubscription && <span className="chip" style={{ color: "var(--ok)", marginLeft: 6 }}><Check size={12} /></span>}</div>
                  <div style={{ color: "var(--text-2)", fontSize: 11.5, marginTop: 6 }}>No API key. Uses your Claude plan via <code>claude login</code>. ⚠ Testing only — not permitted for production.</div>
                </button>
              </div>
              {s.anthropicUseSubscription ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "var(--text-2)", fontSize: 11.5, marginBottom: 6 }}>One‑time setup — run in a terminal, then sign in:</div>
                  <pre style={{ margin: 0, padding: "10px 12px", background: "rgba(0,0,0,0.45)", border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5, lineHeight: 1.6, color: "var(--text-1)", whiteSpace: "pre-wrap", fontFamily: "var(--mono)" }}>npm i -g @anthropic-ai/claude-code{"\n"}claude login</pre>
                </div>
              ) : (
                <div style={{ maxWidth: 420 }}><Field label="Anthropic API key"><input className="model-search" type="password" value={sel.apiKey} onChange={(e) => patch("apiKey", e.target.value)} placeholder="sk-ant-…" /></Field></div>
              )}
            </>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, flexWrap: "wrap" }}>
            <button className="btn primary" onClick={saveProvider}><Save size={14} /> Save &amp; load models</button>
            <button className="btn" onClick={test}><RefreshCw size={14} /> Test only</button>
            <span style={{ color: status.startsWith("Saved") ? "var(--ok)" : "var(--text-2)", fontSize: 12 }}>{status}</span>
          </div>
          <p style={{ color: "var(--text-2)", fontSize: 12, marginTop: 14 }}>
            Every provider is always available — the model you pick in the top-bar selector decides which one runs.
          </p>

          {/* Backup & restore — settings + agents + teams in one file. */}
          <div style={{ marginTop: 22, paddingTop: 16, borderTop: "1px solid var(--line)" }}>
            <div className="nav-label" style={{ paddingLeft: 0 }}>Backup &amp; restore</div>
            <p style={{ color: "var(--text-2)", fontSize: 12, margin: "6px 0 10px" }}>
              One file holds your providers, agents, teams and preferences. ⚠ The backup contains your API keys in readable form — store it somewhere private.
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn" onClick={backupAll}><Download size={14} /> Download backup</button>
              <button className="btn" onClick={() => restoreRef.current && restoreRef.current.click()}><Upload size={14} /> Restore from backup</button>
              <input ref={restoreRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { restoreAll(e.target.files && e.target.files[0]); e.target.value = ""; }} />
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
