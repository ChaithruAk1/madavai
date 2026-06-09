// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// First-run onboarding: the #1 support question is "why doesn't it answer?" (no API key).
// A 60-second guided start: pick a provider → paste a key (or go local) → verified → chatting.
import { useState } from "react";
import { Sparkles, Check, Loader2, ArrowRight, Cpu } from "lucide-react";
import { bridge } from "../bridge/index.js";

const CHOICES = [
  { id: "p_openrouter", label: "OpenRouter", sub: "One key, 400+ models — has FREE models", baseUrl: "https://openrouter.ai/api/v1", kind: "openai", keyUrl: "openrouter.ai/keys", needKey: true, recommended: true },
  { id: "p_gemini", label: "Google Gemini", sub: "Free tier available", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", kind: "openai", keyUrl: "aistudio.google.com/apikey", needKey: true },
  { id: "p_nim", label: "NVIDIA NIM", sub: "Free credits for developers", baseUrl: "https://integrate.api.nvidia.com/v1", kind: "openai", keyUrl: "build.nvidia.com", needKey: true },
  { id: "p_local", label: "Local model", sub: "LM Studio / Ollama on this computer — no key, fully private", baseUrl: "http://localhost:1234/v1", kind: "openai", needKey: false },
];

export default function Onboarding({ onDone }) {
  const [pick, setPick] = useState(CHOICES[0]);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(null); // { count, model }

  const finish = () => { try { localStorage.setItem("be.onboarded", "1"); } catch {} onDone && onDone(); };

  const connect = async () => {
    setBusy(true); setErr(""); setOk(null);
    try {
      const cur = await bridge.getSettings(); // re-read before write (never clobber)
      const prof = { ...(cur.profiles[pick.id] || {}), id: pick.id, name: pick.label, kind: pick.kind, baseUrl: pick.baseUrl, apiKey: key.trim(), model: (cur.profiles[pick.id] || {}).model || "" };
      const next = { ...cur, activeProfileId: pick.id, profiles: { ...cur.profiles, [pick.id]: prof } };
      await bridge.saveSettings(next);
      const models = await bridge.listModels(pick.id);
      if (!models || !models.length) { setErr(pick.needKey ? "Connected, but no models came back — double-check the key." : "Nothing answered at " + pick.baseUrl + " — is your local model server running?"); return; }
      const model = models.find((m) => /free/i.test(m)) || models[0];
      const cur2 = await bridge.getSettings();
      await bridge.saveSettings({ ...cur2, activeProfileId: pick.id, profiles: { ...cur2.profiles, [pick.id]: { ...cur2.profiles[pick.id], model, cachedModels: models.slice(0, 500) } } });
      setOk({ count: models.length, model });
    } catch (e) {
      setErr(String((e && e.message) || e));
    } finally { setBusy(false); }
  };

  return (
    <div className="scrim" style={{ zIndex: 60 }}>
      <div className="ob-card">
        <div className="agg-kicker"><Sparkles size={13} /> Welcome to BrainEdge</div>
        <h2 className="ob-h">Let's get you talking to a model</h2>
        <p className="ob-p">BrainEdge runs on any AI provider — your key stays on this device. Pick one to start (you can add more later in Settings):</p>

        <div className="ob-choices">
          {CHOICES.map((c) => (
            <button key={c.id} className={`ob-choice ${pick.id === c.id ? "on" : ""}`} onClick={() => { setPick(c); setErr(""); setOk(null); }}>
              <span className="ob-choice-l">{c.label}{c.recommended && <span className="ob-rec">recommended</span>}</span>
              <span className="ob-choice-s">{c.sub}</span>
            </button>
          ))}
        </div>

        {pick.needKey ? (
          <>
            <div className="ob-p" style={{ marginTop: 14 }}>Get a free key at <b>{pick.keyUrl}</b>, then paste it:</div>
            <input className="model-search" type="password" autoFocus value={key} placeholder={`${pick.label} API key`} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") connect(); }} style={{ marginTop: 8 }} />
          </>
        ) : (
          <div className="ob-p" style={{ marginTop: 14 }}>Make sure LM Studio (or Ollama) is running with a model loaded, then connect.</div>
        )}

        {err && <div className="ag-err" style={{ marginTop: 10 }}>{err}</div>}
        {ok && <div className="ob-ok"><Check size={14} /> Connected — {ok.count} models found. Starting on <b>{ok.model}</b>.</div>}

        <div className="ob-actions">
          <button className="btn ghost" onClick={finish}>Skip for now</button>
          {ok
            ? <button className="btn primary" onClick={finish}>Start chatting <ArrowRight size={14} /></button>
            : <button className="btn primary" disabled={busy || (pick.needKey && !key.trim())} onClick={connect}>{busy ? <><Loader2 size={14} className="ag-spin" /> Checking…</> : <><Cpu size={14} /> Connect</>}</button>}
        </div>
      </div>
    </div>
  );
}
