// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Let's Create — a dedicated media studio (separate from Let's Chat). Pick a capability, see only the relevant
// LocalAI models, describe what you want, generate, and save. Stage 2 ships Image; Voice/Video follow.
import { useState, useEffect, useCallback } from "react";
import { Sparkles, Image as ImageIcon, Mic, Film, Loader2, Download, FolderOpen, AlertCircle } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { localModality, prettyLocalName } from "../data/localModels.js";

const CAPS = [
  { id: "image", label: "Image", icon: ImageIcon, ready: true },
  { id: "voice", label: "Voice", icon: Mic, ready: false },
  { id: "video", label: "Video", icon: Film, ready: false },
];
const SIZES = ["512x512", "768x768", "1024x1024"];

export default function LetsCreate({ onNavigate }) {
  const [cap, setCap] = useState("image");
  const [engine, setEngine] = useState(null);
  const [models, setModels] = useState([]);
  const [model, setModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("512x512");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState([]);

  const refresh = useCallback(async () => {
    try { setEngine(await bridge.localModels.localaiStatus()); } catch { setEngine({ api: false }); }
    try { const l = await bridge.localModels.list("localai"); setModels(Array.isArray(l) ? l : []); } catch { setModels([]); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);

  const capModels = models.filter((m) => localModality(m.name) === cap);
  useEffect(() => { if (capModels.length && !capModels.some((m) => m.name === model)) setModel(capModels[0].name); }, [models, cap]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async () => {
    if (!model || !prompt.trim()) return;
    setBusy(true); setErr("");
    try {
      const r = await bridge.media.image({ model, prompt: prompt.trim(), size });
      if (r && r.error) setErr(r.error);
      else if (r && r.b64) setResults((xs) => [{ ...r, prompt: prompt.trim() }, ...xs]);
      else setErr("No image came back from the engine.");
    } catch (e) { setErr(String((e && e.message) || e)); }
    finally { setBusy(false); }
  };

  const engineUp = !!(engine && engine.api);
  const activeCap = CAPS.find((c) => c.id === cap) || CAPS[0];
  const goModels = () => onNavigate && onNavigate("models-local");

  return (
    <div className="lets-create scroll">
      <div className="lc-head">
        <h1><Sparkles size={20} /> Let's Create</h1>
        <p>Generate images, voice and video on your own machine — powered by the LocalAI engine.</p>
      </div>
      <div className="lc-caps">
        {CAPS.map((c) => (
          <button key={c.id} className={"lc-cap " + (cap === c.id ? "on" : "")} onClick={() => setCap(c.id)}>
            <c.icon size={16} /> {c.label}{!c.ready ? <span className="lc-soon">soon</span> : null}
          </button>
        ))}
      </div>

      {!activeCap.ready ? (
        <div className="lc-panel"><div className="lc-empty">{activeCap.label} generation is coming in the next update.</div></div>
      ) : !engineUp ? (
        <div className="lc-panel"><div className="lc-empty">
          <div><AlertCircle size={16} /> The LocalAI engine isn't running.</div>
          <div className="lc-empty-sub">Set it up in Local Models → LocalAI, then come back here.</div>
          <button className="btn primary" onClick={goModels}>Open Local Models</button>
        </div></div>
      ) : capModels.length === 0 ? (
        <div className="lc-panel"><div className="lc-empty">
          <div>No image model installed yet.</div>
          <div className="lc-empty-sub">Open Local Models → LocalAI and pull one (e.g. a Stable Diffusion model).</div>
          <button className="btn primary" onClick={goModels}>Open Local Models</button>
        </div></div>
      ) : (
        <div className="lc-panel">
          <div className="lc-controls">
            <label className="lc-field"><span>Model</span>
              <select value={model} onChange={(e) => setModel(e.target.value)}>
                {capModels.map((m) => <option key={m.name} value={m.name}>{prettyLocalName(m.name)}</option>)}
              </select>
            </label>
            <label className="lc-field"><span>Size</span>
              <select value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
            </label>
          </div>
          <textarea className="lc-prompt" rows={3} placeholder="Describe the image you want — e.g. a confused monkey on a tree, watercolor style" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          <div className="lc-actions">
            <button className="btn primary lc-gen" onClick={generate} disabled={busy || !prompt.trim()}>{busy ? <span><Loader2 size={15} className="spin" /> Generating…</span> : <span><Sparkles size={15} /> Generate</span>}</button>
            {err ? <span className="lc-err"><AlertCircle size={13} /> {err}</span> : null}
          </div>
          {results.length > 0 ? (
            <div className="lc-results">
              {results.map((r, i) => {
                const url = "data:" + (r.mime || "image/png") + ";base64," + r.b64;
                return (
                  <div className="lc-result" key={i}>
                    <img src={url} alt={r.prompt} />
                    <div className="lc-result-foot">
                      <span className="lc-result-prompt" title={r.prompt}>{r.prompt}</span>
                      {r.file ? <button className="btn ghost sm" onClick={() => bridge.openPath && bridge.openPath(r.file)} title={r.file}><FolderOpen size={13} /> Open</button> : null}
                      <a className="btn ghost sm" href={url} download={"image-" + (i + 1) + ".png"}><Download size={13} /> Save</a>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
