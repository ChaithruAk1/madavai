// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Let's Create — Madav's creative playground. A conversational canvas: describe anything, Madav makes it, and
// every result sparks the next (an image can Animate into a video). Powered by the LocalAI engine. This is its
// own playful surface (not the chat shell) — friendly copy, a warm empty state, rich inline result cards.
import { useState, useEffect, useRef, useCallback } from "react";
import { Sparkles, Image as ImageIcon, Mic, Film, Volume2, Loader2, Download, FolderOpen, AlertCircle, Wand2, Copy, Check, Upload, X, RotateCcw, Eye, Music, Plus, ChevronDown, FolderGit2, Bot } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { localModality, prettyLocalName } from "../data/localModels.js";
import { isVisionModel } from "../modelCost.js";
import { PermissionPicker } from "./Topbar.jsx";
import MadavMark from "./MadavMark.jsx";
import HelpDot from "./HelpDot.jsx";
import Composer from "./Composer.jsx";
import EnvPicker from "./EnvPicker.jsx";

const CAPS = [
  { id: "image", label: "Image", icon: ImageIcon, placeholder: "a neon koi gliding through glowing clouds, watercolor" },
  { id: "voice", label: "Voice", icon: Volume2, placeholder: "type the words you'd like spoken aloud…" },
  { id: "video", label: "Video", icon: Film, placeholder: "a paper boat drifting down a rainy neon street" },
  { id: "transcribe", label: "Transcribe", icon: Mic, placeholder: "" },
  { id: "describe", label: "Describe", icon: Eye, placeholder: "ask about the image, or leave blank for a description" },
  { id: "music", label: "Music", icon: Music, placeholder: "describe the music — a calm lo-fi beat with soft piano" },
];
const STARTERS = [
  { cap: "image", text: "a neon koi gliding through glowing clouds" },
  { cap: "image", text: "a cozy reading nook inside a treehouse, golden hour" },
  { cap: "video", text: "a paper boat drifting down a rainy street" },
  { cap: "voice", text: "Read aloud: the quiet hum of a city at midnight." },
];
const STARTER_RE = {
  image: /stable-?diffusion|sd-?1\.5|\bflux|dreamshaper/i,
  voice: /piper|voice-en|en-us-/i,
  video: /\bltx|\bwan|hunyuan/i,
  music: /musicgen|audiocraft|stable-?audio/i,
  describe: /llava|bakllava|qwen.*vl|minicpm-v|moondream/i,
  transcribe: /whisper/i,
};
const isSTT = (n) => /(whisper|\bstt\b|\basr\b|transcrib)/i.test(String(n || ""));
const isMusic = (n) => /(musicgen|audiocraft|\bmusic\b|stable-?audio)/i.test(String(n || ""));
const capLabel = (c) => (c === "voice" ? "voice" : c === "video" ? "video" : c === "transcribe" ? "transcription" : "image");
const AGENT_PLANNER = "You plan a small local creative studio. Tools: image (text->image), video (text->short video, can start from a previous image), voice (text->speech), music (text->instrumental music), describe (image->text). Given the user's request, reply with ONLY a JSON array of steps (no prose, no markdown fences). Each step = {\"cap\":\"image|video|voice|music|describe\",\"prompt\":\"concise prompt for this step\",\"from\": <0-based index of an earlier step whose generated image to feed in, or null>}. Rules: include only steps the user asked for; \"animate it\" or \"make a video of it\" => a video step whose from is the image step; \"describe it\" => a describe step whose from is the image step; keep it minimal, at most 6 steps.";

export default function LetsCreate({ onNavigate }) {
  const [engine, setEngine] = useState(null);
  const [models, setModels] = useState([]);
  const [gallery, setGallery] = useState([]);
  const [cap, setCap] = useState("image");
  const [prompt, setPrompt] = useState("");
  const [attach, setAttach] = useState(null);
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState("");
  const [setupProg, setSetupProg] = useState(null);
  const [pullProg, setPullProg] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [who, setWho] = useState("");
  const [pickedModel, setPickedModel] = useState("");
  const [folder, setFolder] = useState("");
  const [perm, setPerm] = useState("default");
  const [agentsOn, setAgentsOn] = useState(false);
  const [plusOpen, setPlusOpen] = useState(false);
  const [mpOpen, setMpOpen] = useState(false);
  const [folderFiles, setFolderFiles] = useState([]);
  const [ffOpen, setFfOpen] = useState(false);
  const threadRef = useRef(null);

  const refresh = useCallback(async () => {
    try { setEngine(await bridge.localModels.localaiStatus()); } catch { setEngine({ api: false }); }
    try { const l = await bridge.localModels.list("localai"); setModels(Array.isArray(l) ? l : []); } catch { setModels([]); }
    try { const g = await bridge.localModels.browse("localai"); setGallery(Array.isArray(g) ? g : []); } catch {}
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);
  useEffect(() => { Promise.resolve(bridge.getSettings && bridge.getSettings()).then((cfg) => { const a = (cfg && cfg.account) || {}; const nm = ((a.name || "").trim().split(" ")[0]) || ((a.email || "").split("@")[0]) || ""; setWho(nm ? nm.charAt(0).toUpperCase() + nm.slice(1) : ""); }).catch(() => {}); }, []);
  useEffect(() => { const el = threadRef.current; if (el) el.scrollTop = el.scrollHeight; }, [turns]);
  useEffect(() => {
    const offI = bridge.localModels.onInstallProgress((p) => { if (p && p.id === "localai") setSetupProg({ phase: p.phase, pct: p.pct, line: p.line }); });
    const offP = bridge.localModels.onPullProgress((p) => {
      if (!p || p.id !== "localai") return;
      if (p.error || p.status === "error") { setPullProg({ error: p.error || "Pull failed" }); return; }
      if (p.done) { setPullProg(null); refresh(); return; }
      const pct = p.total ? Math.round((p.completed / p.total) * 100) : (p.completed || 0);
      setPullProg((cur) => ({ ...(cur || {}), pct: isFinite(pct) ? pct : 0, status: p.status || "pulling", name: (cur && cur.name) || p.name }));
    });
    return () => { offI && offI(); offP && offP(); };
  }, [refresh]);

  const baseOf = (n) => String(n || "").split("/").pop().split(":")[0].toLowerCase();
  const ucFor = (name) => { const g = gallery.find((e) => baseOf(e.pullName) === baseOf(name) || baseOf(e.name || "") === baseOf(name)); return (g && g.useCases) || []; };
  const capHint = (name) => { const uc = ucFor(name).filter((u) => u !== "general"); if (uc.length) return uc.join(" · "); const mod = localModality(name); return mod === "text" ? "media" : mod; };
  const modelsFor = (c) => models.filter((m) => {
    const uc = ucFor(m.name); const mod = localModality(m.name);
    const generic = uc.includes("general") || (!uc.length && mod === "text"); // an installed LocalAI model we can't classify -> let the user pick it for any capability
    if (c === "image") return uc.includes("image") || mod === "image" || generic;
    if (c === "video") return uc.includes("video") || mod === "video" || generic;
    if (c === "describe") return uc.includes("image") || isVisionModel(m.name) || generic;
    if (c === "music") return generic || ((uc.includes("voice") || mod === "voice") && isMusic(m.name));
    if (c === "transcribe") return generic || ((uc.includes("voice") || mod === "voice") && isSTT(m.name));
    return generic || ((uc.includes("voice") || mod === "voice") && !isSTT(m.name) && !isMusic(m.name)); // voice (TTS)
  });

  const friendlyErr = (c, modelName, err) => {
    const e = String(err || "");
    if (/No .* model/i.test(e)) return e;
    if (/\b500\b|failed|unsupported|not.*support|no handler|could not|loading|error/i.test(e)) {
      const want = c === "image" ? "an image generator (Stable Diffusion or FLUX)" : c === "video" ? "a video model (e.g. LTX / Wan)" : c === "voice" ? "a text-to-speech voice" : c === "transcribe" ? "a speech-to-text model (Whisper)" : c === "music" ? "a music model (MusicGen)" : c === "describe" ? "a vision model that can read images" : "the right kind of model";
      return "“" + prettyLocalName(modelName || "this model") + "” couldn’t do that — it may not be " + want + ". Pick a different model below, or pull one in Local Models.";
    }
    return e;
  };

  const runTurn = async ({ cap, prompt, attach }) => {
    const avail = modelsFor(cap);
    const model = chosenModel(avail);
    const id = "t" + Date.now() + Math.random().toString(36).slice(2, 5);
    setTurns((t) => [...t, { id, cap, prompt, attach: attach || null, status: model ? "running" : "error", result: null, error: model ? "" : ("No " + capLabel(cap) + " model installed yet.") }]);
    if (!model) return null;
    setBusy(true);
    try {
      let r;
      if (cap === "image") r = (attach && attach.kind === "image") ? await bridge.media.imageEdit({ model, prompt, srcB64: attach.b64, srcMime: attach.mime, size: "768x768", outDir: folder }) : await bridge.media.image({ model, prompt, size: "768x768", outDir: folder });
      else if (cap === "voice") r = await bridge.media.speech({ model, input: prompt, outDir: folder });
      else if (cap === "video") r = await bridge.media.video({ model, prompt, seconds: 4, startImageB64: attach && attach.kind === "image" ? attach.b64 : undefined, startImageMime: attach && attach.mime, outDir: folder });
      else if (cap === "transcribe") r = await bridge.media.transcribe({ model, audioB64: attach && attach.b64, mime: attach && attach.mime, filename: attach && attach.name });
      else if (cap === "describe") r = await bridge.media.describe({ model, prompt, imageB64: attach && attach.b64, imageMime: attach && attach.mime });
      else if (cap === "music") r = await bridge.media.music({ model, prompt, outDir: folder });
      const ok = r && !r.error;
      setTurns((ts) => ts.map((x) => x.id === id ? { ...x, status: ok ? "done" : "error", result: ok ? r : null, error: ok ? "" : friendlyErr(cap, model, (r && r.error) || "Something went wrong.") } : x));
      return ok ? r : null;
    } catch (e) {
      setTurns((ts) => ts.map((x) => x.id === id ? { ...x, status: "error", error: friendlyErr(cap, model, String((e && e.message) || e)) } : x));
      return null;
    } finally { setBusy(false); }
  };

  const runAgent = async (userPrompt) => {
    if (!bridge.completeOnce) return;
    const planId = "a" + Date.now();
    setTurns((t) => [...t, { id: planId, cap: "plan", prompt: userPrompt, status: "running", result: null, error: "" }]);
    setBusy(true);
    let steps = [];
    try {
      const r = await bridge.completeOnce([{ role: "system", content: AGENT_PLANNER }, { role: "user", content: userPrompt }]);
      const mm = ((r && r.text) || "").match(/\[[\s\S]*\]/);
      if (mm) steps = JSON.parse(mm[0]);
    } catch {}
    steps = Array.isArray(steps) ? steps.filter((x) => x && ["image", "video", "voice", "music", "describe"].includes(x.cap)).slice(0, 6) : [];
    if (!steps.length) { setTurns((t) => t.map((x) => x.id === planId ? { ...x, status: "error", error: "Couldn't plan steps from that — try rephrasing, or turn Agents off for a single creation." } : x)); setBusy(false); return; }
    setTurns((t) => t.map((x) => x.id === planId ? { ...x, status: "done", result: { plan: steps } } : x));
    const outs = [];
    for (let i = 0; i < steps.length; i++) {
      const st = steps[i];
      const src = (st.from != null && outs[st.from] && /image/.test((outs[st.from] || {}).mime || "")) ? outs[st.from] : null;
      outs[i] = await runTurn({ cap: st.cap, prompt: st.prompt || userPrompt, attach: src ? { kind: "image", b64: src.b64, mime: src.mime, name: "step.png" } : null });
    }
    setBusy(false);
  };

  // The shared Composer owns the input + attachments and calls this on send. Route by the active capability
  // tile; programmatic edits (the "Edit" result action) arrive via the `attach` fallback. Agents = the +-menu toggle.
  const handleCreate = async (text, images) => {
    if (busy) return;
    const list = images || [];
    const ci = list.find((a) => a.kind !== "audio");
    const ca = list.find((a) => a.kind === "audio");
    const toAtt = (a, kind) => { const m = /^data:([^;]+);base64,(.*)$/.exec((a && a.dataUrl) || ""); return m ? { kind, b64: m[2], mime: m[1], name: a.name } : null; };
    const imgAtt = (ci && toAtt(ci, "image")) || (attach && attach.kind === "image" ? attach : null);
    const audAtt = (ca && toAtt(ca, "audio")) || (attach && attach.kind === "audio" ? attach : null);
    let useAgents = false; try { const cfg = await bridge.getSettings(); useAgents = !!(cfg && cfg.agentSurfaces && cfg.agentSurfaces.create); } catch {}
    setAttach(null);
    if (useAgents) { if (text.trim()) runAgent(text.trim()); return; }
    if (cap === "transcribe") { if (audAtt) runTurn({ cap, prompt: "", attach: audAtt }); return; }
    if (cap === "describe") { if (imgAtt) runTurn({ cap, prompt: text.trim(), attach: imgAtt }); return; }
    if (cap === "image" && imgAtt) { runTurn({ cap, prompt: text.trim(), attach: imgAtt }); return; }
    if (!text.trim()) return;
    runTurn({ cap, prompt: text.trim(), attach: null });
  };
  const runStarter = (s) => { setCap(s.cap); runTurn({ cap: s.cap, prompt: s.text }); };
  const animate = (turn) => runTurn({ cap: "video", prompt: (turn.prompt || "this scene") + ", gentle natural motion", attach: { kind: "image", b64: turn.result.b64, mime: turn.result.mime, name: "frame.png" } });
  const vary = (turn) => runTurn({ cap: turn.cap, prompt: turn.prompt });
  const edit = (turn) => { setCap("image"); setAttach({ kind: "image", b64: turn.result.b64, mime: turn.result.mime, name: "edit-source.png" }); setPrompt(""); };
  const describe = (turn) => runTurn({ cap: "describe", prompt: "", attach: { kind: "image", b64: turn.result.b64, mime: turn.result.mime, name: "image.png" } });
  const onPickAudio = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => setAttach({ kind: "audio", b64: String(rd.result).split(",")[1] || "", mime: f.type || "audio/wav", name: f.name }); rd.readAsDataURL(f);
  };
  const onPickImage = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const rd = new FileReader(); rd.onload = () => setAttach({ kind: "image", b64: String(rd.result).split(",")[1] || "", mime: f.type || "image/png", name: f.name }); rd.readAsDataURL(f);
  };
  const copy = (id, text) => { try { navigator.clipboard.writeText(text); setCopied(id); setTimeout(() => setCopied(""), 1200); } catch {} };
  const setupStudio = () => {
    setSetupProg({ phase: "starting", pct: 0 });
    Promise.resolve(bridge.localModels.install("localai")).then((r) => {
      if (r && r.ok === false) setSetupProg({ done: true, note: r.note || r.error || "Couldn't finish setup — try Local Models." });
      else setSetupProg(null);
      setTimeout(refresh, 1000);
    }).catch(() => setSetupProg(null));
  };
  const pullStarter = async (c) => {
    setPullProg({ pct: 0, status: "finding" });
    let list = [];
    try { const r = await bridge.localModels.browse("localai"); list = Array.isArray(r) ? r : []; } catch {}
    const re = STARTER_RE[c] || STARTER_RE.image;
    const hit = list.find((e) => re.test(e.name || e.pullName));
    if (!hit) { setPullProg({ error: "No recommended model found — open Local Models to browse." }); return; }
    setPullProg({ pct: 0, status: "pulling", name: hit.name });
    bridge.localModels.pull("localai", hit.pullName);
  };

  const engineUp = !!(engine && engine.api);
  const active = CAPS.find((c) => c.id === cap) || CAPS[0];
  const goModels = () => onNavigate && onNavigate("models-local");
  const haveModel = modelsFor(cap).length > 0;
  const relModels = modelsFor(cap);
  const _h = new Date().getHours(); const _part = _h < 12 ? "morning" : _h < 18 ? "afternoon" : "evening";
  const greeting = who ? "Good " + _part + ", " + who : "Good " + _part;
  const pickFolder = async () => { try { const d = await bridge.chooseFolder(); const f = typeof d === "string" ? d : (d && (d.folder || d.path)); if (f) setFolder(f); } catch {} };
  const openFolderFiles = async () => {
    if (!folder) return;
    try { const entries = await bridge.listDir(folder); const re = cap === "transcribe" ? /\.(mp3|wav|m4a|ogg|flac|aac|opus)$/i : /\.(png|jpe?g|webp|gif|bmp)$/i; setFolderFiles((entries || []).filter((e) => !e.isDir && re.test(e.name))); setFfOpen(true); } catch {}
  };
  const pickFromFolder = async (name) => {
    setFfOpen(false);
    try { const r = await bridge.readFileB64(folder + "/" + name); if (r && r.b64) setAttach({ kind: cap === "transcribe" ? "audio" : "image", b64: r.b64, mime: r.mime, name: r.name || name }); } catch {}
  };
  const chosenModel = (mods) => (pickedModel && mods.some((m) => m.name === pickedModel)) ? pickedModel : (mods[0] && mods[0].name);

  const dataUrl = (r) => "data:" + (r.mime || "application/octet-stream") + ";base64," + r.b64;

  const ResultCard = (turn) => {
    const r = turn.result;
    if (turn.cap === "plan") {
      const plan = (r && r.plan) || [];
      return (
        <div className="lc2-plan">
          <div className="lc2-plan-h"><Bot size={14} /> Plan · {plan.length} step{plan.length === 1 ? "" : "s"}</div>
          {plan.map((st, i) => <div key={i} className="lc2-plan-step"><span className="lc2-plan-n">{i + 1}</span> <b>{st.cap}</b> — {st.prompt}{st.from != null ? <span style={{ color: "var(--text-2)" }}> · uses step {st.from + 1}</span> : null}</div>)}
        </div>
      );
    }
    if (turn.cap === "transcribe" || turn.cap === "describe") {
      return (
        <div className="lc2-transcript">
          <div className="lc2-transcript-h"><span>{turn.cap === "describe" ? "Description" : "Transcript"}</span>
            <button className="lc2-mini" onClick={() => copy(turn.id, r.text)}>{copied === turn.id ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}</button>
          </div>
          <div className="lc2-transcript-body">{r.text || "(no speech detected)"}</div>
        </div>
      );
    }
    const url = dataUrl(r);
    return (
      <div className="lc2-card">
        {turn.cap === "image" ? <img className="lc2-img" src={url} alt={turn.prompt} onClick={() => setZoom(url)} style={{ cursor: "zoom-in" }} />
          : turn.cap === "video" ? <video className="lc2-vid" src={url} controls />
          : <div className="lc2-audiowrap"><Volume2 size={16} /><audio src={url} controls /></div>}
        <div className="lc2-actions">
          {turn.cap === "image" ? <button className="lc2-act" onClick={() => animate(turn)}><Film size={13} /> Animate</button> : null}
          {turn.cap === "image" ? <button className="lc2-act" onClick={() => edit(turn)}><Wand2 size={13} /> Edit</button> : null}
          {turn.cap === "image" ? <button className="lc2-act" onClick={() => describe(turn)}><Eye size={13} /> Describe</button> : null}
          <button className="lc2-act" onClick={() => vary(turn)}><Copy size={13} /> Variations</button>
          {r.file ? <button className="lc2-act" onClick={() => bridge.openPath && bridge.openPath(r.file)}><FolderOpen size={13} /> Open</button> : null}
          <a className="lc2-act" href={url} download={(turn.cap === "video" ? "video" : turn.cap === "voice" ? "voice" : "image") + ".bin"}><Download size={13} /> Save</a>
        </div>
      </div>
    );
  };

  return (
    <div className={"lc2" + (turns.length === 0 ? " lc2-idle" : "")}>
      <div className="lc2-thread scroll" ref={threadRef}>
        {!engineUp ? (
          <div className="lc2-asleep">
            <div className="lc2-spark"><Sparkles size={26} /></div>
            <h1>Let's set up your studio</h1>
            <p>Let's Create runs a private engine right on your machine — offline, no API key. Two quick steps and you're making things.</p>
            <div style={{ display: "flex", gap: 14, margin: "2px 0 18px", flexWrap: "wrap", justifyContent: "center" }}>
              {[["1", "Start the engine"], ["2", "Pull a model"], ["3", "Create"]].map(([n, t], i) => (
                <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12.5, color: i === 0 ? "var(--text-0)" : "var(--text-2)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: i === 0 ? "#fff" : "var(--text-2)", background: i === 0 ? "var(--accent)" : "var(--bg-2)", border: "1px solid var(--line)" }}>{n}</span>{t}
                </span>
              ))}
            </div>
            {setupProg ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-1)" }}><Loader2 size={14} className="spin" /> {setupProg.line || (setupProg.phase === "docker" ? "Starting Docker…" : setupProg.phase === "pulling" ? "Downloading engine… " + (setupProg.pct || 0) + "%" : setupProg.phase === "booting" ? "Starting engine…" : "Setting up…")}</div>
            ) : (
              <button className="lc2-create" onClick={setupStudio}><Sparkles size={15} /> Set up the studio</button>
            )}
            {setupProg && setupProg.note ? <div className="lc2-needmodel" style={{ marginTop: 10 }}>{setupProg.note}</div> : null}
            <button className="lc2-link" style={{ marginTop: 12 }} onClick={goModels}>or do it in Local Models</button>
          </div>
        ) : models.length === 0 && turns.length === 0 ? (
          <div className="lc2-hero">
            <div className="lc2-spark"><Sparkles size={26} /></div>
            <h1>One model away</h1>
            <p>Your engine is running. Pull a starter model — a one-time download — and you're ready to create.</p>
            {pullProg ? (
              <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-1)" }}><Loader2 size={14} className="spin" /> {pullProg.error || ("Pulling " + (pullProg.name ? prettyLocalName(pullProg.name) : "a model") + "… " + (pullProg.pct || 0) + "%")}</div>
            ) : (
              <button className="lc2-create" onClick={() => pullStarter("image")}><Download size={15} /> Pull a starter image model</button>
            )}
            <button className="lc2-link" style={{ marginTop: 12 }} onClick={goModels}>or browse all models</button>
          </div>
        ) : turns.length === 0 ? (
          <div className="lc2-hero">
            <MadavMark size={46} />
            <h1>{greeting}</h1>
            <p>What shall we create? Describe an image, a voice, or a short video — Madav imagines it right here.</p>
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
                <span>{turn.cap === "transcribe" ? ("Transcribe " + ((turn.attach && turn.attach.name) || "audio")) : turn.cap === "describe" ? (turn.prompt || "Describe this image") : turn.prompt}</span>
              </div>
              <div className="lc2-reply">
                <div className="lc2-av"><Sparkles size={15} /></div>
                <div className="lc2-result">
                  {turn.status === "running" ? (
                    <div className={"lc2-gen lc2-gen-" + turn.cap}><div className="lc2-shim" /><div style={{ position: "relative", textAlign: "center" }}><div className="lc2-genlabel"><Loader2 size={14} className="spin" /> {turn.cap === "plan" ? "Madav is planning the steps…" : "Madav is imagining…"}</div><div style={{ fontSize: 11, color: "var(--text-2)", marginTop: 5 }}>{turn.cap === "video" ? "video can take a few minutes" : "first run loads the model — give it a moment"}</div></div></div>
                  ) : turn.status === "error" ? (
                    <div className="lc2-errcard"><div><AlertCircle size={15} /> {turn.error}</div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {turn.cap !== "plan" ? <button className="lc2-mini" onClick={() => vary(turn)}><RotateCcw size={12} /> Try again</button> : null}
                        {/Local Models|No .* model/.test(turn.error) ? <button className="lc2-mini" onClick={goModels}>Open Local Models</button> : null}
                      </div>
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
          {CAPS.map((c) => <button key={c.id} className={"lc2-cap " + (cap === c.id ? "on" : "")} onClick={() => { setCap(c.id); setAttach(null); }}><c.icon size={15} /> {c.label}</button>)}<HelpDot mode="letscreate" section="capabilities" />
        </div>
        {attach ? <div className="lc2-editchip"><ImageIcon size={13} /> {attach.kind === "audio" ? "Audio" : "Editing your image"} · {attach.name} <X size={12} style={{ cursor: "pointer" }} onClick={() => setAttach(null)} /></div> : null}
        <Composer mode="create" busy={busy} onSend={handleCreate} onStop={() => setBusy(false)} onPickFolder={pickFolder} cwd={folder} />
        <div className="lc2-dock">
          <EnvPicker cwd={folder} onPickFolder={pickFolder} onUseFolder={() => {}} onAddRepoUrl={() => {}} github={false} />
          <HelpDot mode="letscreate" section="folder" />
          <div className="lc2-mp">
            <button className="lc2-dockchip" onClick={() => setMpOpen((o) => !o)} disabled={!relModels.length} title="Model used for this creation">{relModels.length ? prettyLocalName(chosenModel(relModels)) : "No model"} <ChevronDown size={12} /></button>
            {mpOpen ? <div className="lc2-mp-menu" onMouseLeave={() => setMpOpen(false)}>{relModels.map((m) => { const sel = chosenModel(relModels) === m.name; return <div key={m.name} className={"lc2-mp-row" + (sel ? " sel" : "")} onClick={() => { setPickedModel(m.name); setMpOpen(false); }}><span>{prettyLocalName(m.name)} <span className="lc2-mp-hint">{capHint(m.name)}</span></span>{sel ? <Check size={14} /> : null}</div>; })}</div> : null}
          </div>
          <PermissionPicker value={perm} onChange={setPerm} />
        </div>
        {!haveModel ? (<div className="lc2-needmodel">No {capLabel(cap)} model yet — {pullProg ? <span><Loader2 size={12} className="spin" /> {pullProg.error || ("pulling " + (pullProg.name ? prettyLocalName(pullProg.name) : "a model") + "… " + (pullProg.pct || 0) + "%")}</span> : <><button className="lc2-link" onClick={() => pullStarter(cap)}>pull a starter one</button> or <button className="lc2-link" onClick={goModels}>browse in Local Models</button>.</>}</div>) : null}
      </div>
      {zoom ? <div onClick={() => setZoom(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, cursor: "zoom-out", padding: 30 }}><img src={zoom} alt="" style={{ maxWidth: "100%", maxHeight: "100%", borderRadius: 8 }} /></div> : null}
    </div>
  );
}
