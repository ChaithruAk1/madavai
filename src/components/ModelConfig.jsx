import { useEffect, useState } from "react";
import { Plus, Trash2, Check, RefreshCw, Plug, Save } from "lucide-react";
import ModelPicker from "./ModelPicker.jsx";
import { bridge } from "../bridge/index.js";

const BLANK = (id) => ({ id, name: "New provider", kind: "openai", baseUrl: "http://localhost:1234", apiKey: "", model: "" });

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

  useEffect(() => { bridge.getSettings().then((cfg) => { setS(cfg); setSelId(cfg.activeProfileId); }); }, []);
  if (!s || !selId) return <div className="empty"><div>Loading…</div></div>;

  const profiles = Object.values(s.profiles);
  const sel = s.profiles[selId];
  const modelGroups = profiles.map((p) => {
    const ids = (p.cachedModels && p.cachedModels.length) ? p.cachedModels : (p.model ? [p.model] : []);
    return { group: p.name, items: ids.map((mid) => ({ id: `${p.id}::${mid}`, name: mid, prov: p.name, badge: p.kind })) };
  }).filter((g) => g.items.length);

  const persist = async (next) => { setS(next); await bridge.saveSettings(next); onChanged?.(next); };
  const patch = (field, val) => persist({ ...s, profiles: { ...s.profiles, [selId]: { ...sel, [field]: val } } });
  const setField = (k, v) => persist({ ...s, [k]: v });
  const addProfile = () => { const id = "p_" + Math.random().toString(36).slice(2, 7); persist({ ...s, profiles: { ...s.profiles, [id]: BLANK(id) } }); setSelId(id); };
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
          <button className="nav-item" onClick={addProfile} style={{ marginTop: 6 }}><Plus size={15} /> Add provider</button>
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

          {sel.kind === "anthropic" && (
            <>
              <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>Billing &amp; sign‑in</div>
              <p style={{ color: "var(--text-2)", fontSize: 12, margin: "0 0 10px" }}>Choose how Anthropic models are billed:</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <button type="button" onClick={() => setField("anthropicUseSubscription", false)} style={{ textAlign: "left", border: "1px solid " + (!s.anthropicUseSubscription ? "var(--accent)" : "var(--line)"), borderRadius: 10, padding: "12px 14px", background: !s.anthropicUseSubscription ? "rgba(110,123,255,0.08)" : "var(--bg-1)", cursor: "pointer" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>🔑 API key {!s.anthropicUseSubscription && <span className="chip" style={{ color: "var(--ok)", marginLeft: 6 }}><Check size={12} /></span>}</div>
                  <div style={{ color: "var(--text-2)", fontSize: 11.5, marginTop: 6 }}>Use an <code>sk‑ant‑…</code> key. Billed <b>pay‑as‑you‑go to your Anthropic API credits</b>.</div>
                </button>
                <button type="button" onClick={() => setField("anthropicUseSubscription", true)} style={{ textAlign: "left", border: "1px solid " + (s.anthropicUseSubscription ? "var(--accent)" : "var(--line)"), borderRadius: 10, padding: "12px 14px", background: s.anthropicUseSubscription ? "rgba(110,123,255,0.08)" : "var(--bg-1)", cursor: "pointer" }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>👤 Subscription {s.anthropicUseSubscription && <span className="chip" style={{ color: "var(--ok)", marginLeft: 6 }}><Check size={12} /></span>}</div>
                  <div style={{ color: "var(--text-2)", fontSize: 11.5, marginTop: 6 }}>No API key. Billed to your <b>Claude Pro/Max plan</b> via <code>claude login</code>. All Anthropic models become available.</div>
                </button>
              </div>
              {s.anthropicUseSubscription ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ color: "var(--text-2)", fontSize: 11.5, marginBottom: 6 }}>One‑time setup — run in a terminal, then sign in with your Max account:</div>
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
            Every 