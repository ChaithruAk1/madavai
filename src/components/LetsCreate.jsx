// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Let's Create — a dedicated media studio (separate from Let's Chat). Pick a capability, see only the relevant
// LocalAI models, describe what you want, generate, and save. Image + Voice ship here; Video follows.
import { useState, useEffect, useCallback } from "react";
import { Sparkles, Image as ImageIcon, Mic, Film, Loader2, Download, FolderOpen, AlertCircle, Volume2, Upload, Copy, Check } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { localModality, prettyLocalName } from "../data/localModels.js";

const CAPS = [
  { id: "image", label: "Image", icon: ImageIcon, ready: true },
  { id: "voice", label: "Voice", icon: Mic, ready: true },
  { id: "video", label: "Video", icon: Film, ready: true },
];
const SIZES = ["512x512", "768x768", "1024x1024"];
const isSTT = (n) => /(whisper|\bstt\b|\basr\b|transcrib)/i.test(String(n || ""));

export default function LetsCreate({ onNavigate }) {
  const [cap, setCap] = useState("image");
  const [engine, setEngine] = useState(null);
  const [models, setModels] = useState([]);

  const [imgModel, setImgModel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("512x512");
  const [imgBusy, setImgBusy] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const [imgResults, setImgResults] = useState([]);

  const [voiceMode, setVoiceMode] = useState("speak");
  const [ttsModel, setTtsModel] = useState("");
  const [ttsVoice, setTtsVoice] = useState("");
  const [ttsText, setTtsText] = useState("");
  const [ttsBusy, setTtsBusy] = useState(false);
  const [ttsErr, setTtsErr] = useState("");
  const [ttsResults, setTtsResults] = useState([]);
  const [sttModel, setSttModel] = useState("");
  const [sttFile, setSttFile] = useState(null);
  const [sttBusy, setSttBusy] = useState(false);
  const [sttErr, setSttErr] = useState("");
  const [sttText, setSttText] = useState("");
  const [copied, setCopied] = useState(false);
  const [vidModel, setVidModel] = useState("");
  const [vidPrompt, setVidPrompt] = useState("");
  const [vidSeconds, setVidSeconds] = useState("4");
  const [vidBusy, setVidBusy] = useState(false);
  const [vidErr, setVidErr] = useState("");
  const [vidResults, setVidResults] = useState([]);

  const refresh = useCallback(async () => {
    try { setEngine(await bridge.localModels.localaiStatus()); } catch { setEngine({ api: false }); }
    try { const l = await bridge.localModels.list("localai"); setModels(Array.isArray(l) ? l : []); } catch { setModels([]); }
  }, []);
  useEffect(() => { refresh(); const t = setInterval(refresh, 5000); return () => clearInterval(t); }, [refresh]);

  const imageModels = models.filter((m) => localModality(m.name) === "image");
  const voiceModels = models.filter((m) => localModality(m.name) === "voice");
  const speakModels = voiceModels.filter((m) => !isSTT(m.name));
  const sttModels = voiceModels.filter((m) => isSTT(m.name));
  const videoModels = models.filter((m) => localModality(m.name) === "video");

  useEffect(() => { if (imageModels.length && !imageModels.some((m) => m.name === imgModel)) setImgModel(imageModels[0].name); }, [models]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (speakModels.length && !speakModels.some((m) => m.name === ttsModel)) setTtsModel(speakModels[0].name);
    if (sttModels.length && !sttModels.some((m) => m.name === sttModel)) setSttModel(sttModels[0].name);
  }, [models]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (videoModels.length && !videoModels.some((m) => m.name === vidModel)) setVidModel(videoModels[0].name); }, [models]); // eslint-disable-line react-hooks/exhaustive-deps

  const genImage = async () => {
    if (!imgModel || !prompt.trim()) return;
    setImgBusy(true); setImgErr("");
    try {
      const r = await bridge.media.image({ model: imgModel, prompt: prompt.trim(), size });
      if (r && r.error) setImgErr(r.error);
      else if (r && r.b64) setImgResults((xs) => [{ ...r, prompt: prompt.trim() }, ...xs]);
      else setImgErr("No image came back from the engine.");
    } catch (e) { setImgErr(String((e && e.message) || e)); }
    finally { setImgBusy(false); }
  };
  const genSpeech = async () => {
    if (!ttsModel || !ttsText.trim()) return;
    setTtsBusy(true); setTtsErr("");
    try {
      const r = await bridge.media.speech({ model: ttsModel, input: ttsText.trim(), voice: ttsVoice.trim() || undefined });
      if (r && r.error) setTtsErr(r.error);
      else if (r && r.b64) setTtsResults((xs) => [{ ...r, text: ttsText.trim() }, ...xs]);
      else setTtsErr("No audio came back from the engine.");
    } catch (e) { setTtsErr(String((e && e.message) || e)); }
    finally { setTtsBusy(false); }
  };
  const onPickAudio = (e) => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setSttFile({ name: f.name, b64: String(reader.result).split(",")[1] || "", mime: f.type || "audio/wav" });
    reader.readAsDataURL(f);
  };
  const doTranscribe = async () => {
    if (!sttModel || !sttFile) return;
    setSttBusy(true); setSttErr(""); setSttText("");
    try {
      const r = await bridge.media.transcribe({ model: sttModel, audioB64: sttFile.b64, mime: sttFile.mime, filename: sttFile.name });
      if (r && r.error) setSttErr(r.error);
      else setSttText((r && r.text) || "(no speech detected)");
    } catch (e) { setSttErr(String((e && e.message) || e)); }
    finally { setSttBusy(false); }
  };

  const genVideo = async () => {
    if (!vidModel || !vidPrompt.trim()) return;
    setVidBusy(true); setVidErr("");
    try {
      const r = await bridge.media.video({ model: vidModel, prompt: vidPrompt.trim(), seconds: vidSeconds });
      if (r && r.error) setVidErr(r.error);
      else if (r && r.b64) setVidResults((xs) => [{ ...r, prompt: vidPrompt.trim() }, ...xs]);
      else setVidErr("No video came back from the engine.");
    } catch (e) { setVidErr(String((e && e.message) || e)); }
    finally { setVidBusy(false); }
  };

  const engineUp = !!(engine && engine.api);
  const activeCap = CAPS.find((c) => c.id === cap) || CAPS[0];
  const goModels = () => onNavigate && onNavigate("models-local");

  const EngineGate = () => (
    <div className="lc-empty">
      <div><AlertCircle size={16} /> The LocalAI engine isn't running.</div>
      <div className="lc-empty-sub">Set it up in Local Models -> LocalAI, then come back here.</div>
      <button className="btn primary" onClick={goModels}>Open Local Models</button>
    </div>
  );
  const NoModel = ({ noun }) => (
    <div className="lc-empty">
      <div>No {noun} model installed yet.</div>
      <div className="lc-empty-sub">Open Local Models -> LocalAI and pull one.</div>
      <button className="btn primary" onClick={goModels}>Open Local Models</button>
    </div>
  );

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

      <div className="lc-panel">
        {!activeCap.ready ? (
          <div className="lc-empty">{activeCap.label} generation is coming in the next update.</div>
        ) : !engineUp ? (
          <EngineGate />
        ) : cap === "image" ? (
          imageModels.length === 0 ? <NoModel noun="image" /> : (
            <div>
              <div className="lc-controls">
                <label className="lc-field"><span>Model</span>
                  <select value={imgModel} onChange={(e) => setImgModel(e.target.value)}>
                    {imageModels.map((m) => <option key={m.name} value={m.name}>{prettyLocalName(m.name)}</option>)}
                  </select>
                </label>
                <label className="lc-field"><span>Size</span>
                  <select value={size} onChange={(e) => setSize(e.target.value)}>{SIZES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
                </label>
              </div>
              <textarea className="lc-prompt" rows={3} placeholder="Describe the image — e.g. a confused monkey on a tree, watercolor style" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              <div className="lc-actions">
                <button className="btn primary lc-gen" onClick={genImage} disabled={imgBusy || !prompt.trim()}>{imgBusy ? <span><Loader2 size={15} className="spin" /> Generating…</span> : <span><Sparkles size={15} /> Generate</span>}</button>
                {imgErr ? <span className="lc-err"><AlertCircle size={13} /> {imgErr}</span> : null}
              </div>
              {imgResults.length > 0 ? (
                <div className="lc-results">
                  {imgResults.map((r, i) => {
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
          )
        ) : cap === "voice" ? (
          <div>
            <div className="lc-subtabs">
              <button className={"lc-subtab " + (voiceMode === "speak" ? "on" : "")} onClick={() => setVoiceMode("speak")}><Volume2 size={14} /> Speak</button>
              <button className={"lc-subtab " + (voiceMode === "transcribe" ? "on" : "")} onClick={() => setVoiceMode("transcribe")}><Mic size={14} /> Transcribe</button>
            </div>
            {voiceMode === "speak" ? (
              speakModels.length === 0 ? <NoModel noun="text-to-speech" /> : (
                <div>
                  <div className="lc-controls">
                    <label className="lc-field"><span>Model</span>
                      <select value={ttsModel} onChange={(e) => setTtsModel(e.target.value)}>
                        {speakModels.map((m) => <option key={m.name} value={m.name}>{prettyLocalName(m.name)}</option>)}
                      </select>
                    </label>
                    <label className="lc-field"><span>Voice (optional)</span>
                      <input className="lc-input" placeholder="e.g. en-US, alloy" value={ttsVoice} onChange={(e) => setTtsVoice(e.target.value)} />
                    </label>
                  </div>
                  <textarea className="lc-prompt" rows={3} placeholder="Type what you want spoken aloud…" value={ttsText} onChange={(e) => setTtsText(e.target.value)} />
                  <div className="lc-actions">
                    <button className="btn primary lc-gen" onClick={genSpeech} disabled={ttsBusy || !ttsText.trim()}>{ttsBusy ? <span><Loader2 size={15} className="spin" /> Generating…</span> : <span><Volume2 size={15} /> Speak</span>}</button>
                    {ttsErr ? <span className="lc-err"><AlertCircle size={13} /> {ttsErr}</span> : null}
                  </div>
                  {ttsResults.map((r, i) => {
                    const url = "data:" + (r.mime || "audio/wav") + ";base64," + r.b64;
                    return (
                      <div className="lc-audio" key={i}>
                        <div className="lc-audio-text" title={r.text}>{r.text}</div>
                        <audio controls src={url} />
                        <div className="lc-audio-acts">
                          {r.file ? <button className="btn ghost sm" onClick={() => bridge.openPath && bridge.openPath(r.file)}><FolderOpen size={13} /> Open</button> : null}
                          <a className="btn ghost sm" href={url} download={"voice-" + (i + 1) + ".wav"}><Download size={13} /> Save</a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              sttModels.length === 0 ? <NoModel noun="transcription (Whisper)" /> : (
                <div>
                  <div className="lc-controls">
                    <label className="lc-field"><span>Model</span>
                      <select value={sttModel} onChange={(e) => setSttModel(e.target.value)}>
                        {sttModels.map((m) => <option key={m.name} value={m.name}>{prettyLocalName(m.name)}</option>)}
                      </select>
                    </label>
                    <label className="lc-field"><span>Audio file</span>
                      <label className="lc-filebtn"><Upload size={14} /> {sttFile ? sttFile.name : "Choose audio…"}<input type="file" accept="audio/*" onChange={onPickAudio} hidden /></label>
                    </label>
                  </div>
                  <div className="lc-actions">
                    <button className="btn primary lc-gen" onClick={doTranscribe} disabled={sttBusy || !sttFile}>{sttBusy ? <span><Loader2 size={15} className="spin" /> Transcribing…</span> : <span><Mic size={15} /> Transcribe</span>}</button>
                    {sttErr ? <span className="lc-err"><AlertCircle size={13} /> {sttErr}</span> : null}
                  </div>
                  {sttText ? (
                    <div className="lc-transcript">
                      <div className="lc-transcript-h">Transcript
                        <button className="btn ghost sm" onClick={() => { try { navigator.clipboard.writeText(sttText); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} }}>{copied ? <span><Check size={13} /> Copied</span> : <span><Copy size={13} /> Copy</span>}</button>
                      </div>
                      <div className="lc-transcript-body">{sttText}</div>
                    </div>
                  ) : null}
                </div>
              )
            )}
          </div>
        ) : cap === "video" ? (
          videoModels.length === 0 ? <NoModel noun="video" /> : (
            <div>
              <div className="lc-warn"><AlertCircle size={15} /> Local video generation is heavy — it needs a strong GPU and can take several minutes per clip. On a typical laptop it may be slow or run out of memory. Keep clips short.</div>
              <div className="lc-controls">
                <label className="lc-field"><span>Model</span>
                  <select value={vidModel} onChange={(e) => setVidModel(e.target.value)}>
                    {videoModels.map((m) => <option key={m.name} value={m.name}>{prettyLocalName(m.name)}</option>)}
                  </select>
                </label>
                <label className="lc-field"><span>Length (seconds)</span>
                  <select value={vidSeconds} onChange={(e) => setVidSeconds(e.target.value)}>{["2", "4", "6"].map((x) => <option key={x} value={x}>{x}</option>)}</select>
                </label>
              </div>
              <textarea className="lc-prompt" rows={3} placeholder="Describe the video — e.g. a confused monkey swinging between trees" value={vidPrompt} onChange={(e) => setVidPrompt(e.target.value)} />
              <div className="lc-actions">
                <button className="btn primary lc-gen" onClick={genVideo} disabled={vidBusy || !vidPrompt.trim()}>{vidBusy ? <span><Loader2 size={15} className="spin" /> Generating… (this can take minutes)</span> : <span><Film size={15} /> Generate video</span>}</button>
                {vidErr ? <span className="lc-err"><AlertCircle size={13} /> {vidErr}</span> : null}
              </div>
              {vidResults.map((r, i) => {
                const url = "data:" + (r.mime || "video/mp4") + ";base64," + r.b64;
                return (
                  <div className="lc-video" key={i}>
                    <div className="lc-audio-text" title={r.prompt}>{r.prompt}</div>
                    <video controls src={url} />
                    <div className="lc-audio-acts">
                      {r.file ? <button className="btn ghost sm" onClick={() => bridge.openPath && bridge.openPath(r.file)}><FolderOpen size={13} /> Open</button> : null}
                      <a className="btn ghost sm" href={url} download={"video-" + (i + 1) + ".mp4"}><Download size={13} /> Save</a>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
