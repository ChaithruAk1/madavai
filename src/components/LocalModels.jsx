// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Models -> Local Models. One page, three providers (Ollama / HuggingFace / LM Studio). Search a provider,
// pull a model with a live progress bar, see what's installed + which are loaded (health), remove, and one-click
// install the runtime if it's missing. SINGLE SOURCE: every model action goes through bridge.localModels.*
// (desktop preload on the app; a "desktop only" stub on web), which calls the shared @madav/models registry.
import { useState, useEffect, useCallback } from "react";
import { Cpu, Search, Download, Trash2, CheckCircle2, Loader2, AlertCircle, RefreshCw, HardDrive, Activity, Zap, Square, MessageSquare, Code2, Brain, Eye, Image as ImageIcon, Mic, Film, Star } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { providerForRuntime } from "../data/localProviders.js";
import { prettyLocalName, localCaps, fitForRam, goalMatches, isChatModel } from "../data/localModels.js";

const PROVIDERS = [
  { id: "ollama", label: "Ollama", blurb: "The simplest way to run models locally. Search the built-in catalog or type any model name to pull." },
  { id: "huggingface", label: "HuggingFace", blurb: "Pull any GGUF model from the HuggingFace Hub. Runs through the Ollama engine under the hood." },
  { id: "lmstudio", label: "LM Studio", blurb: "Use models from LM Studio. Needs the LM Studio app with its command-line tool (lms) enabled." },
  { id: "localai", label: "LocalAI", blurb: "One engine for image, voice and video generation. Runs in Docker — Madav sets it up for you." },
];

// Goal-first browse tiles — people know what they want to DO, not which model does it. Keys match the catalog's
// useCases (and are inferred from the model id for live HuggingFace / LM Studio feeds).
const GOALS = [
  { id: "general", label: "Private ChatGPT", desc: "A capable all-round assistant", icon: MessageSquare },
  { id: "coding", label: "Coding assistant", desc: "Writes and explains code", icon: Code2 },
  { id: "reasoning", label: "Deep reasoning", desc: "Thinks step by step", icon: Brain },
  { id: "vision", label: "Sees images", desc: "Understands pictures + screenshots", icon: Eye },
  { id: "tiny", label: "Tiny & fast", desc: "Runs on modest hardware", icon: Zap },
];
const FIT_LABEL = { good: "Runs great", tight: "Will be slow", over: "Too big" };
const MEDIA_GOALS = [
  { id: "all", label: "All", icon: null },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "video", label: "Video", icon: Film },
];
// Proven families per capability. We MATCH these against the live LocalAI gallery, so the model we surface
// (and its pull name) is always a real entry — never a hard-coded name that could 404.
const RECOMMENDED_MEDIA = {
  image: [/stable-?diffusion|sd-?1\.5|sd-?xl|sdxl/i, /\bflux/i, /dreamshaper/i],
  voice: [/piper|voice-en|en-us-/i, /\bbark\b/i, /whisper/i],
  video: [/\bltx/i, /\bwan/i, /hunyuan/i],
};

function fmtBytes(n) {
  if (!n || n <= 0) return "";
  const u = ["B", "KB", "MB", "GB", "TB"]; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return v.toFixed(v >= 10 || i === 0 ? 0 : 1) + " " + u[i];
}
function fmtCount(n) {
  if (!n) return "";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return String(n);
}

export default function LocalModels({ onChanged, onRefresh, onActivate, activeValue }) {
  const [active, setActive] = useState("ollama");
  const [status, setStatus] = useState({});       // id -> detect result
  const [installed, setInstalled] = useState({});  // id -> LocalModel[]
  const [running, setRunning] = useState({});      // id -> Set(name)
  const [query, setQuery] = useState({});          // id -> string
  const [results, setResults] = useState({});      // id -> ModelSearchResult[]
  const [searching, setSearching] = useState({});  // id -> bool
  const [searchErr, setSearchErr] = useState({});  // id -> string
  const [pulls, setPulls] = useState({});          // "id::name" -> { pct, status, done, error }
  const [installing, setInstalling] = useState({}); // id -> { phase, pct }
  const [profIds, setProfIds] = useState({});       // provider key -> local profile id (powers the Use button)
  const [installNote, setInstallNote] = useState({}); // a short result note after an install/setup attempt
  const [browseList, setBrowseList] = useState({});  // id -> ModelSearchResult[] (the default gallery)
  const [goal, setGoal] = useState("general");       // active chat browse goal tile
  const [mediaGoal, setMediaGoal] = useState("all"); // active LocalAI capability tile (image/voice/video)
  const [sys, setSys] = useState({ totalRamGB: 0 }); // machine RAM, for the fits-your-machine badge
  const [dockerInfo, setDockerInfo] = useState(null);  // LocalAI: Docker presence/running
  const [laiInfo, setLaiInfo] = useState(null);        // LocalAI: container + API status

  const refresh = useCallback(async (id) => {
    try {
      const [det, lst, run] = await Promise.all([
        bridge.localModels.detect(id),
        bridge.localModels.list(id),
        bridge.localModels.running(id),
      ]);
      setStatus((s) => ({ ...s, [id]: det || {} }));
      setInstalled((s) => ({ ...s, [id]: Array.isArray(lst) ? lst : [] }));
      setRunning((s) => ({ ...s, [id]: new Set((Array.isArray(run) ? run : []).map((x) => x.name)) }));
    } catch { /* offline / web */ }
  }, []);

  // Background progress streams (keep firing even when you switch provider tabs).
  useEffect(() => {
    const offPull = bridge.localModels.onPullProgress((p) => {
      const key = p.id + "::" + p.name;
      const pct = p.total ? Math.round((p.completed / p.total) * 100) : (p.completed || 0);
      const err = p.error || (p.status === "error" ? "Pull failed" : "");
      setPulls((m) => ({ ...m, [key]: { pct: isFinite(pct) ? pct : 0, status: p.status || "", done: !!p.done && !err, error: err } }));
      if (p.done && !err) { refresh(p.id); onChanged && onChanged(); }
    });
    const offInstall = bridge.localModels.onInstallProgress((p) => {
      setInstalling((m) => ({ ...m, [p.id]: { phase: p.phase, pct: p.pct } }));
    });
    return () => { offPull && offPull(); offInstall && offInstall(); };
  }, [refresh, onChanged]);

  useEffect(() => { PROVIDERS.forEach((p) => refresh(p.id)); }, [refresh]);

  // Make pulled models usable everywhere: represent each available runtime as a Madav provider PROFILE and
  // keep its cachedModels in lockstep with what's installed. The EXISTING model selector (pickerGroups) and
  // Models overview already read profiles -> no duplicate model-listing logic here. Ollama is authoritative
  // for its profile (its list already contains hf.co/* HuggingFace models); LM Studio drives its own.
  const syncLocalProfile = async (runtimeId, models) => {
    const preset = providerForRuntime(runtimeId);
    if (!preset) return;
    const names = (models || []).map((m) => m && m.name).filter(Boolean).filter(isChatModel);
    let cfg; try { cfg = await bridge.getSettings(); } catch { return; }
    if (!cfg || !cfg.profiles) return;
    const host = (u) => String(u || "").replace(/\/+$/, "").replace(/\/v1$/, "");
    const target = host(preset.baseUrl);
    const profiles = { ...cfg.profiles };
    const prof = Object.values(profiles).find((p) => host(p.baseUrl) === target);
    const same = prof && Array.isArray(prof.cachedModels) && prof.cachedModels.length === names.length && prof.cachedModels.every((n, i) => n === names[i]);
    if (prof && same) return;                 // nothing changed -> no write
    if (!names.length && !prof) return;        // no models, no profile to seed -> don't litter settings
    if (!prof) {
      const id = "p_" + preset.runtime + "_local";
      profiles[id] = { id, name: preset.name, kind: preset.kind, baseUrl: preset.baseUrl, apiKey: "", model: names[0] || "", cachedModels: names };
    } else {
      profiles[prof.id] = { ...prof, cachedModels: names, model: (prof.model && names.includes(prof.model)) ? prof.model : (names[0] || prof.model || "") };
    }
    const next = { ...cfg, profiles };
    try { await bridge.saveSettings(next); } catch { return; }
    onChanged && onChanged(next);
    onRefresh && onRefresh();
  };

  // Re-sync when the installed set changes (page load, a pull finishing, a remove): mirror installs into the
  // local provider profile, then capture each provider's profile id so the Use button can activate a model.
  useEffect(() => {
    (async () => {
      for (const id of ["ollama", "lmstudio"]) {
        const det = status[id];
        if (det && det.available) await syncLocalProfile(id, installed[id] || []);
      }
      try {
        const cfg = await bridge.getSettings();
        const host = (u) => String(u || "").replace(/\/+$/, "").replace(/\/v1$/, "");
        const find = (rk) => { const pr = providerForRuntime(rk); const hit = pr && Object.values(cfg.profiles || {}).find((x) => host(x.baseUrl) === host(pr.baseUrl)); return hit ? hit.id : null; };
        setProfIds({ ollama: find("ollama"), lmstudio: find("lmstudio") });
      } catch { /* web / offline */ }
    })();
  }, [installed, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Machine RAM once (powers the fit badges) + the browse gallery for the active provider (Ollama = instant
  // curated catalog; HuggingFace / LM Studio = a live "most-downloaded GGUF" feed fetched on tab open).
  useEffect(() => { Promise.resolve(bridge.localModels.system()).then((x) => setSys(x || { totalRamGB: 0 })).catch(() => {}); }, []);
  useEffect(() => {
    let alive = true;
    Promise.resolve(bridge.localModels.browse(active)).then((r) => { if (alive && Array.isArray(r)) setBrowseList((m) => ({ ...m, [active]: r })); }).catch(() => {});
    return () => { alive = false; };
  }, [active]);

  // LocalAI is a Docker-hosted engine — poll Docker + container status while its tab is open.
  useEffect(() => {
    if (active !== "localai") return;
    let alive = true;
    const load = () => {
      Promise.resolve(bridge.localModels.dockerStatus()).then((d) => alive && setDockerInfo(d)).catch(() => {});
      Promise.resolve(bridge.localModels.localaiStatus()).then((x) => { if (alive) { setLaiInfo(x); if (x && x.api) bridge.localModels.browse("localai").then((r) => Array.isArray(r) && setBrowseList((m) => ({ ...m, localai: r }))).catch(() => {}); } }).catch(() => {});
    };
    load(); const t = setInterval(load, 4000);
    return () => { alive = false; clearInterval(t); };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSearch = async (id) => {
    setSearching((s) => ({ ...s, [id]: true })); setSearchErr((s) => ({ ...s, [id]: "" }));
    try {
      const r = await bridge.localModels.search(id, (query[id] || "").trim());
      if (r && r.error) { setSearchErr((s) => ({ ...s, [id]: r.error })); setResults((s) => ({ ...s, [id]: [] })); }
      else setResults((s) => ({ ...s, [id]: Array.isArray(r) ? r : [] }));
    } catch (e) { setSearchErr((s) => ({ ...s, [id]: String((e && e.message) || e) })); }
    finally { setSearching((s) => ({ ...s, [id]: false })); }
  };
  const doPull = (id, name) => {
    setPulls((m) => ({ ...m, [id + "::" + name]: { pct: 0, status: "starting", done: false, error: "" } }));
    bridge.localModels.pull(id, name);
  };
  const doRemove = async (id, name) => {
    try { await bridge.localModels.remove(id, name); } catch {}
    refresh(id); onChanged && onChanged();
  };
  const doStop = async (id, name) => {                 // unload a running model from memory (frees RAM/VRAM)
    try { await bridge.localModels.stop(id, name); } catch {}
    setTimeout(() => refresh(id), 400);
  };
  const doInstall = (id) => {
    setInstalling((m) => ({ ...m, [id]: { phase: "starting", pct: 0 } }));
    setInstallNote((m) => ({ ...m, [id]: "" }));
    Promise.resolve(bridge.localModels.install(id)).then((r) => {
      setInstalling((m) => ({ ...m, [id]: null }));           // the flow finished -> stop the spinner; the button returns
      const note = r && (r.error || r.note);
      if (note) setInstallNote((m) => ({ ...m, [id]: note }));
      setTimeout(() => refresh(id), 1200);
    }).catch((e) => { setInstalling((m) => ({ ...m, [id]: null })); setInstallNote((m) => ({ ...m, [id]: String((e && e.message) || e) })); });
  };

  const isInstalled = (id, r) => {
    const names = (installed[id] || []).map((m) => m.name);
    const pn = r.pullName || "";
    if (pn.includes(":")) return names.includes(pn);
    return names.some((n) => n === pn || n.split(":")[0] === pn);
  };

  // One card for a model — used by both the browse gallery and search results. Friendly name + raw id, size,
  // a fits-your-machine badge from the machine RAM, inferred capability chips, and the existing pull flow.
  const renderCard = (entry, id) => {
    const det = status[id] || {};
    const fit = fitForRam(entry.sizeGB, sys.totalRamGB);
    const caps = localCaps(entry.name || entry.pullName) || {};
    const done = isInstalled(id, entry);
    const pr = pulls[id + "::" + entry.pullName];
    return (
      <div className="lm-card" key={entry.pullName}>
        <div className="lm-card-top">
          <div className="lm-card-name">{prettyLocalName(entry.name || entry.pullName)}</div>
          {fit !== "unknown" ? <span className={"lm-fit " + fit} title={fit === "good" ? "Should run smoothly on your RAM" : fit === "tight" ? "Will run but may be slow / swap to disk" : "Larger than your RAM — likely won't run well"}>{FIT_LABEL[fit]}</span> : null}
        </div>
        <div className="lm-card-sub">{entry.pullName}</div>
        {entry.description ? <div className="lm-card-desc">{entry.description}</div> : null}
        <div className="lm-card-meta">
          {entry.sizeLabel ? <span className="lm-meta-tag">{entry.sizeLabel}</span> : (entry.sizeGB ? <span className="lm-meta-tag">~{entry.sizeGB} GB</span> : null)}
          {entry.downloads ? <span className="lm-meta-tag"><Download size={11} /> {fmtCount(entry.downloads)}</span> : null}
          {caps.coding ? <span className="lm-cap">Code</span> : null}
          {caps.reasoning ? <span className="lm-cap">Reasoning</span> : null}
          {caps.vision ? <span className="lm-cap">Vision</span> : null}
          {caps.tools && !caps.coding ? <span className="lm-cap">Tools</span> : null}
          {(entry.useCases || []).includes("image") ? <span className="lm-cap">Image</span> : null}
          {(entry.useCases || []).includes("voice") ? <span className="lm-cap">Voice</span> : null}
          {(entry.useCases || []).includes("video") ? <span className="lm-cap">Video</span> : null}
        </div>
        <div className="lm-card-foot">
          {done ? <span className="lm-chip ok"><CheckCircle2 size={12} /> Installed</span>
            : pr && !pr.done && !pr.error ? <div className="lm-pulling"><div className="lm-bar small"><div className="lm-bar-fill" style={{ width: (pr.pct || 0) + "%" }} /></div><span className="lm-pct">{pr.pct || 0}%</span></div>
            : pr && pr.error ? <button className="btn ghost sm" onClick={() => doPull(id, entry.pullName)} title={pr.error}><AlertCircle size={13} /> Retry</button>
            : <button className="btn primary sm" onClick={() => doPull(id, entry.pullName)} disabled={!det.available} title={det.available ? "Download this model" : "Install the engine first"}><Download size={13} /> Pull</button>}
        </div>
      </div>
    );
  };

  const renderPanel = (p) => {
    const id = p.id;
    const det = status[id] || {};
    const inst = installing[id];
    const res = results[id] || [];
    const insd = installed[id] || [];
    const run = running[id] || new Set();
    const showSearch = !!(searching[id] || searchErr[id] || (res && res.length));
    const isMedia = id === "localai";
    const galleryFilter = (e) => isMedia ? (mediaGoal === "all" || (e.useCases || []).includes(mediaGoal)) : (isChatModel(e.name || e.pullName) && goalMatches(e, goal));
    const recList = (() => {
      if (!isMedia) return [];
      const all = (browseList[id] || []).filter(galleryFilter);
      const fams = mediaGoal === "all" ? [].concat(RECOMMENDED_MEDIA.image, RECOMMENDED_MEDIA.voice, RECOMMENDED_MEDIA.video) : (RECOMMENDED_MEDIA[mediaGoal] || []);
      const out = [];
      for (const re of fams) { const hit = all.find((e) => re.test(e.name || e.pullName)); if (hit && !out.includes(hit)) out.push(hit); }
      return out;
    })();
    const recSet = new Set(recList.map((e) => e.pullName));
    return (
      <div className="lm-panel" key={id}>
        <div className="lm-status prof-card">
          <div className="lm-status-main">
            <div className="lm-status-title">
              {p.label}
              {det.available
                ? <span className="lm-chip ok"><CheckCircle2 size={12} /> Ready{det.version ? " · v" + det.version : ""}</span>
                : <span className="lm-chip off"><AlertCircle size={12} /> Not detected</span>}
            </div>
            <div className="lm-status-note">{det.note || p.blurb}</div>
          </div>
          <div className="lm-status-actions">
            <button className="btn ghost sm" onClick={() => refresh(id)} title="Re-check status"><RefreshCw size={14} /></button>
            {!det.available && (inst
              ? <span className="lm-installing"><Loader2 size={13} className="spin" /> {inst.line ? inst.line : (inst.phase === "downloading" ? "Downloading… " + (inst.pct || 0) + "%" : inst.phase === "docker" ? "Starting Docker…" : inst.phase === "pulling" ? "Downloading engine…" : inst.phase === "booting" || inst.phase === "starting" ? "Starting engine…" : inst.phase === "installing" ? "Installing…" : inst.phase === "ready" ? "Ready" : inst.phase === "opened" ? "Opened download page" : "Working…")}</span>
              : <button className="btn primary" onClick={() => doInstall(id)}><Download size={14} /> {id === "localai" ? "Set up LocalAI" : id === "lmstudio" ? "Get LM Studio" : id === "huggingface" ? "Install Ollama engine" : "Install Ollama"}</button>)}
          </div>
        </div>
        {inst && (inst.phase === "downloading" || inst.phase === "docker" || inst.phase === "pulling" || inst.phase === "booting") ? <div className="lm-bar"><div className="lm-bar-fill" style={{ width: (inst.pct || 0) + "%" }} /></div> : null}
        {installNote[id] ? <div className="lm-hint">{installNote[id]}</div> : null}
        {isMedia ? (
          <div className="lm-lai-strip">
            <span className={"lm-chip " + (dockerInfo && dockerInfo.running ? "ok" : "off")}>{dockerInfo ? (dockerInfo.running ? "Docker running" : dockerInfo.installed ? "Docker installed - not started" : "Docker not installed") : "Checking Docker…"}</span>
            <span className={"lm-chip " + (laiInfo && laiInfo.api ? "ok" : "off")}>{laiInfo ? (laiInfo.api ? "Engine running" : laiInfo.container === "stopped" ? "Engine stopped" : "Engine not started") : "Checking engine…"}</span>
            {laiInfo && laiInfo.api ? <button className="btn ghost sm" onClick={() => { bridge.localModels.localaiStop(); setLaiInfo({ ...laiInfo, api: false }); }} title="Stop the LocalAI container"><Square size={12} /> Stop engine</button> : null}
          </div>
        ) : null}

        <div className="lm-search">
          <Search size={15} className="lm-search-ico" />
          <input className="lm-search-in" placeholder={id === "ollama" ? "Search the catalog or type a model name (e.g. llama3.2, qwen2.5:7b)" : "Search HuggingFace GGUF models (e.g. llama, qwen, mistral)"}
            value={query[id] || ""} onChange={(e) => setQuery((q) => ({ ...q, [id]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(id); }} />
          <button className="btn primary" onClick={() => doSearch(id)} disabled={!!searching[id]}>{searching[id] ? <Loader2 size={14} className="spin" /> : "Search"}</button>
          {showSearch ? <button className="btn ghost" onClick={() => { setResults((s) => ({ ...s, [id]: [] })); setSearchErr((s) => ({ ...s, [id]: "" })); setQuery((q) => ({ ...q, [id]: "" })); }} title="Back to browse">Clear</button> : null}
        </div>
        {searchErr[id] ? <div className="lm-err"><AlertCircle size={13} /> {searchErr[id]}</div> : null}

        {showSearch ? (
          <div className="lm-gallery">{res.filter((r) => isMedia || isChatModel(r.name || r.pullName)).map((r) => renderCard(r, id))}</div>
        ) : (
          <div className="lm-browse">
            <div className="lm-goals">
              {!isMedia ? GOALS.map((g) => (
                <button key={g.id} className={"lm-goal " + (goal === g.id ? "on" : "")} onClick={() => setGoal(g.id)} title={g.desc}>
                  <g.icon size={15} /> <span>{g.label}</span>
                </button>
              )) : MEDIA_GOALS.map((g) => (
                <button key={g.id} className={"lm-goal " + (mediaGoal === g.id ? "on" : "")} onClick={() => setMediaGoal(g.id)}>
                  {g.icon ? <g.icon size={15} /> : null} <span>{g.label}</span>
                </button>
              ))}
            </div>
            {isMedia ? <div className="lm-hint">These power <b>Let's Create</b> — pull a model here, then generate in the Let's Create tab.</div> : null}
            {sys.totalRamGB ? <div className="lm-ram">Your machine has <b>{sys.totalRamGB} GB</b> RAM — the badge on each model estimates whether it will run smoothly.</div> : null}
            {recList.length ? (
              <div style={{ marginBottom: 16 }}>
                <div className="lm-section-label"><Star size={13} /> Recommended — proven picks for {mediaGoal === "all" ? "media" : mediaGoal}</div>
                <div className="lm-gallery">{recList.map((e) => renderCard(e, id))}</div>
              </div>
            ) : null}
            <div className="lm-gallery">{(browseList[id] || []).filter(galleryFilter).filter((e) => !recSet.has(e.pullName)).map((e) => renderCard(e, id))}</div>
            {!(browseList[id] && browseList[id].length)
              ? <div className="lm-empty">{isMedia && !det.available ? "Start LocalAI above to see image, voice and video models." : "Loading suggestions…"}</div>
              : ((browseList[id].filter(galleryFilter).length === 0)
                  ? <div className="lm-empty">{isMedia ? "No models for this capability in the gallery yet — try another tab or the search." : ("Nothing tagged \"" + ((GOALS.find((g) => g.id === goal) || {}).label) + "\" here — try another goal, or search above.")}</div> : null)}
          </div>
        )}

        <div className="lm-installed">
          <div className="lm-section-label"><HardDrive size={13} /> Installed on this machine{insd.length ? " (" + insd.length + ")" : ""}</div>
          {insd.length === 0
            ? <div className="lm-empty">No {p.label} models yet. Search above and click Pull.</div>
            : insd.map((m) => {
                const isRun = run.has(m.name);
                const pkey = (providerForRuntime(id) || {}).runtime;
                const value = profIds[pkey] ? profIds[pkey] + "::" + m.name : null;
                const isActive = !!value && value === activeValue;
                return (
                  <div className={"lm-installed-row" + (isActive ? " on" : "")} key={m.name}>
                    <div className="lm-installed-info">
                      <span className={"lm-dot " + (isRun ? "live" : "idle")} title={isRun ? "Loaded in memory" : "On disk"} />
                      <div className="lm-name-wrap">
                        <span className="lm-name-main">{prettyLocalName(m.name)}</span>
                        <span className="lm-name-sub">{m.name}</span>
                      </div>
                      {m.family ? <span className="lm-meta-tag">{m.family}</span> : null}
                      {m.sizeBytes ? <span className="lm-meta-tag">{fmtBytes(m.sizeBytes)}</span> : null}
                      {isRun ? <span className="lm-chip ok sm"><Activity size={11} /> running</span> : null}
                    </div>
                    <div className="lm-installed-actions">
                      {isRun ? <button className="btn ghost sm" onClick={() => doStop(id, m.name)} title="Unload from memory (free RAM/VRAM)"><Square size={12} /> Stop</button> : null}
                      {isActive
                        ? <span className="lm-chip ok"><CheckCircle2 size={12} /> Active</span>
                        : <button className="btn primary sm" onClick={() => value && onActivate && onActivate(value)} disabled={!value} title={value ? "Use this model now" : "Syncing…"}><Zap size={13} /> Use</button>}
                      <button className="btn ghost sm" onClick={() => doRemove(id, m.name)} title="Remove from disk"><Trash2 size={13} /></button>
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    );
  };

  return (
    <div className="local-models scroll">
      <div className="lm-head">
        <h2><Cpu size={18} /> Local Models</h2>
        <p className="lm-sub">Run models on your own machine — private, offline, no API key. Pick a provider, search, and pull. Anything you install becomes selectable everywhere in Madav.</p>
      </div>
      <div className="lm-pills">
        {PROVIDERS.map((p) => {
          const det = status[p.id] || {};
          return (
            <button key={p.id} className={"lm-pill " + (active === p.id ? "on" : "")} onClick={() => setActive(p.id)}>
              <span className="lm-pill-label">{p.label}</span>
              <span className={"lm-dot " + (det.available ? "live" : "idle")} />
            </button>
          );
        })}
      </div>
      {PROVIDERS.filter((p) => p.id === active).map((p) => renderPanel(p))}
    </div>
  );
}
