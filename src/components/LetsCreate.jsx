// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Let's Create — Madav's creative playground. A conversational canvas: describe anything, Madav makes it, and
// every result sparks the next (an image can Animate into a video). Powered by the LocalAI engine. This is its
// own playful surface (not the chat shell) — friendly copy, a warm empty state, rich inline result cards.
import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Image as ImageIcon, Mic, Film, Volume2, Loader2, Download, FolderOpen, AlertCircle, Wand2, Copy, Check, Upload, X, RotateCcw } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { localModality, prettyLocalName } from "../data/localModels.js";

const CAPS = [
  { id: "image", label: "Image", icon: ImageIcon, placeholder: "a neon koi gliding through glowing clouds, watercolor" },
  { id: "voice", label: "Voice", icon: Volume2, placeholder: "type the words you'd like spoken aloud…" },
  { id: "video", label: "Video", icon: Film, placeholder: "a paper boat drifting down a rainy neon street" },
  { id: "transcribe", label: "Transcribe", icon: Mic, placeholder: "" },
];
const STARTERS = [
  { cap: "image", text: "a neon koi gliding through glowing clouds" },
  { cap: "image", text: "a cozy reading nook inside a treehouse, golden hour" },
  { cap: "video", text: "a paper boat drifting down a rainy street" },
  { cap: "voice", text: "Read aloud: the quiet hum of a city at midnight." },
];
const isSTT = (n) => /(whisper|\bstt\b|\basr\b|transcrib)/i.test(String(n || ""));
const capLabel = (c) => (c === "voice" ? "voice" : c === "video" ? "video" : c === "transcribe" ? "transcription" : "image");

export default function LetsCreate({ onNavigate }) {
  const [engine, setEngine] = useState(null);
  const [models, setModels] = useState([]);
  const [cap, setCap] = useState("image");
  const [prompt, setPrompt] = useState("");
  const [attach, setAttach] = useState(null);
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const threadRef = useRef(null);

  const refresh = useCallback(async () => {
    try { setEngine(await bridge.localModels.localaiStatus()); } catch { setEngine({ api: false }); }
    try { const l = await bridge.localModels.list("localai"); setModels(Array.isArray(l) ? l : []); } catch { setModels([]); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns]);

  const modelsFor = (c) => {
    if (c === "image") return models.filter((m) => localModality(m.name) === "image");
    if (c === "video") return models.filter((m) => localModality(m.name) === "video");
    if (c === "transcribe") return models.filter((m) => localModality(m.name) === "voice" && isSTT(m.name));
    return models.filter((m) => localModality(m.name) === "voice" && !isSTT(m.name)); // voice = TTS
  };

  const runTurn = async ({ cap, prompt, attach }) => {
    const avail = modelsFor(cap);
    const model = avail[0] && avail[0].name;
    const id = "t" + Date.now() + Math.random().toString(36).slice(2, 5);
    setTurns((t) => [...t, { id, cap, prompt, attach: attach || null, status: model ? "running" : "error", result: null, error: model ? "" : ("No " + capLabel(cap) + " model installed yet.") }]);
    if (!model) return;
    setBusy(true);
    try {
      let r;
      if (cap === "image") r = await bridge.media.image({ model, prompt, size: "768x768" });
      else if (cap === "voice") r = await bridge.media.speech({ model, input: prompt });
      else if (cap === "video") r = await bridge.media.video({ model, prompt, seconds: 4, startImageB64: attach && attach.kind === "image" ? attach.b64 : undefined, startImageMime: attach && attach.mime });
      else if (cap === "transcribe") r = await bridge.media.transcribe({ model, audioB64: attach && attach.b64, mime: attach && attach.mime, filename: attach && attach.name });
      const ok = r && !r.error;
      setTurns((ts) => ts.map((x) => x.id === id ? { ...x, status: ok ? "done" : "error", result: ok ? r : null, error: ok ? "" : ((r && r.error) || "Something went wrong.") } : x));
    } catch (e) {
      setTurns((ts) => ts.map((x) => x.id === id ? { ...x, status: "error", error: String((e && e.message) || e) } : x));
    } finally { setBusy(false); }
  };

  const onCreate = () => {
    if (busy) return;
    if (cap === "transcribe") { if (attach) { runTurn({ cap, prompt: "", attach }); setAttach(null); } return; }
    if (!prompt.trim()) return;
    runTurn({ cap, prompt: prompt.trim(), attach }); setPrompt(""); setAttach(null);
  };
  const runStarter = (s) => { setCap(s.cap); runTurn({ cap: s.cap, prompt: s.text }); };
  const animate = (turn) => runTurn({ cap: "video", prompt: (turn.prompt || "this scene") + ", gentle natural motion", attach: { kind: "image", b64: turn.result.b64, mime: turn.result.mime, name: "frame.png" } });
  const vary = (turn) => runTurn({ cap: turn.cap, prompt: turn.prompt, attach: turn.attach });
  const onPickAudio = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => setAttach({ kind: "audio", b64: String(rd.result).split(",")[1] || "", mime: f.type || "audio/wav", name: f.name }); rd.readAsDataURL(f);
  };
  const copy = (id, text) => { try { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1200); } catch {} };

  const engineUp = !!(engine && engine.api);
  const active = CAPS.find((c) => c.id === cap) || CAPS[0];
  const goModels = () => onNavigate && onNavigate("models-local");
  const haveModel = modelsFor(cap).length > 0;

  const dataUrl = (r) => "data:" + (r.mime || "application/octet-stream") + ";base64," + r.b64;

  const ResultCard = (turn) => {
    const r = turn.result;
    if (turn.cap === "transcribe") {
      return (
        <div className="lc2-transcript">
          <div className="lc2-transcript-h"><span>Transcript</span>
            <button className="lc2-mini" onClick={() => copy(turn.id, r.text)}>{copied === turn.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}</button>
          </div>
          <div className="lc2-transcript-body">{r.text || "(no speech detected)"}</div>
        </div>
      );
    }
    const url = dataUrl(r);
    return (
      <div className="lc2-card">
        {turn.cap === "image" ? <img className="lc2-img" src={url} alt={turn.prompt} />
          : turn.cap === "video" ? <video className="lc2-vid" src={url} controls />
          : <div className="lc2-audiowrap"><Volume2 size={16} /><audio src={url} controls /></div>}
        <div className="lc2-actions">
          {turn.cap === "image" ? <button className="lc2-act" onClick={() => animate(turn)}><Film size={13} /> Animate</button> : null}
          <button className="lc2-act" onClick={() => vary(turn)}><Wand2 size={13} /> Variations</button>
          {r.file ? <button className="lc2-act" onClick={() => bridge.openPath && bridge.openPath(r.file)}><FolderOpen size={13} /> Open</button> : null}
          <a className="lc2-act" href={url} download={(turn.cap === "video" ? "video" : turn.cap === "voice" ? "voice" : "image") + ".bin"}><Download size={13} /> Save</a>
        </div>
      </div>
    );
  };

  return (
    <div className="lc2">
      <div className="lc2-thread scroll" ref={threadRef}>
        {!engineUp ? (
          <div className="lc2-asleep">
            <div className="lc2-spark"><Sparkles size={26} /></div>
            <h1>The studio is asleep</h1>
            <p>Let's Create runs on the LocalAI engine. Wake it up in Local Models, then come back and make something.</p>
            <button className="lc2-create" onClick={goModels}><Sparkles size={15} /> Open Local Models</button>
          </div>
        ) : turns.length === 0 ? (
          <div className="lc2-hero">
            <div className="lc2-spark"><Sparkles size={26} /></div>
            <h1>What shall we create?</h1>
            <p>Describe anything — an image, a voice, a short video. Madav imagines it, right here. Each result sparks the next.</p>
            <div className="lc2-starters">
              {STARTERS.map((s, i) => {
                const I = (CAPS.find((c) => c.id === s.cap) || {}).icon || Sparkles;
                return <button key={i} className="lc2-starter" onClick={() => runStarter(s)}><I size={15} /> <span>{s.text}</span></button>;
              })}
            </div>
          </div>
        ) : (
          turns.map((turn) => (
            <div className="lc2-turn" key={turn.id}>
              <div className="lc2-ask">
                {turn.attach && turn.attach.kind === "image" ? <span className="lc2-from"><ImageIcon size={12} /> from your image</span> : null}
                <span>{turn.cap === "transcribe" ? ("Transcribe " + ((turn.attach && turn.attach.name) || "audio")) : turn.prompt}</span>
              </div>
              <div className="lc2-reply">
                <div className="lc2-av"><Sparkles size={15} /></div>
                <div className="lc2-result">
                  {turn.status === "running" ? (
                    <div className={"lc2-gen lc2-gen-" + turn.cap}><div className="lc2-shim" /><div className="lc2-genlabel"><Loader2 size={14} className="spin" /> Madav is imagining…</div></div>
                  ) : turn.status === "error" ? (
                    <div className="lc2-errcard"><div><AlertCircle size={15} /> {turn.error}</div>
                      {/No .* model/.test(turn.error) ? <button className="lc2-mini" onClick={goModels}>Pull a model</button> : <button className="lc2-mini" onClick={() => vary(turn)}><RotateCcw size={12} /> Try again</button>}
                    </div>
                  ) : ResultCard(turn)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="lc2-composer">
        <div className="lc2-caps">
          {CAPS.map((c) => <button key={c.id} className={"lc2-cap " + (cap === c.id ? "on" : "")} onClick={() => { setCap(c.id); setAttach(null); }}><c.icon size={15} /> {c.label}</button>)}
        </div>
        <div className="lc2-inputrow">
          {attach ? <span className="lc2-attachchip"><ImageIcon size={13} /> {attach.name} <X size={12} onClick={() => setAttach(null)} /></span> : null}
          {cap === "transcribe" ? (
            <label className="lc2-filebtn"><Upload size={15} /> {attach ? attach.name : "Choose an audio file…"}<input type="file" accept="audio/*" hidden onChange={onPickAudio} /></label>
          ) : (
            <textarea className="lc2-prompt" rows={2} placeholder={active.placeholder} value={prompt}
              onChange={(e) => setPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onCreate(); } }} />
          )}
          <button className="lc2-create" onClick={onCreate} disabled={busy || (cap === "transcribe" ? !attach : !prompt.trim())}>
            {busy ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} <span>Create</span>
          </button>
        </div>
        {!haveModel ? <div className="lc2-needmodel">No {capLabel(cap)} model yet — <button className="lc2-link" onClick={goModels}>pull one in Local Models</button> to use {active.label}.</div> : null}
      </div>
    </div>
  );
}
