// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Models -> Local Models. One page, three providers (Ollama / HuggingFace / LM Studio). Search a provider,
// pull a model with a live progress bar, see what's installed + which are loaded (health), remove, and one-click
// install the runtime if it's missing. SINGLE SOURCE: every model action goes through bridge.localModels.*
// (desktop preload on the app; a "desktop only" stub on web), which calls the shared @madav/models registry.
import { useState, useEffect, useCallback, Fragment } from "react";
import { Cpu, Search, Download, Trash2, CheckCircle2, Loader2, AlertCircle, RefreshCw, HardDrive, Activity, Zap, Square, MessageSquare, Code2, Brain, Eye, Image as ImageIcon, Mic, Film, Star, ExternalLink, ChevronRight, LayoutGrid, Wrench } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { providerForRuntime } from "../data/localProviders.js";
import { prettyLocalName, localCaps, fitForRam, goalMatches, isChatModel } from "../data/localModels.js";
import { madavConfirm } from "../dialogs.jsx";
import { MakerLogo } from "./ModelsOverview.jsx";

const PROVIDERS = [
  { id: "ollama", label: "Ollama", blurb: "The simplest way to run models locally. Search the built-in catalog or type any model name to pull." },
  { id: "huggingface", label: "HuggingFace", blurb: "Pull any GGUF model from the HuggingFace Hub. Runs through the Ollama engine under the hood." },
  { id: "lmstudio", label: "LM Studio", blurb: "Use models from LM Studio. Needs the LM Studio app with its command-line tool (lms) enabled." },
  { id: "localai", label: "Let's Create Models", blurb: "One engine for image, voice and video generation. Runs in Docker — Madav sets it up for you." },
];

// Goal-first browse tiles — people know what they want to DO, not which model does it. Keys match the catalog's
// useCases (and are inferred from the model id for live HuggingFace / LM Studio feeds).
const GOALS = [
  { id: "all", label: "All", desc: "Show every model", icon: LayoutGrid },
  { id: "coding", label: "Coding assistant", desc: "Writes and explains code", icon: Code2 },
  { id: "reasoning", label: "Deep reasoning", desc: "Thinks step by step", icon: Brain },
  { id: "vision", label: "Sees images", desc: "Understands pictures + screenshots", icon: Eye },
  { id: "tiny", label: "Tiny & fast", desc: "Runs on modest hardware", icon: Zap },
  { id: "downloaded", label: "Downloaded", desc: "Models you've already installed", icon: HardDrive },
];
const FIT_LABEL = { good: "Runs great", tight: "Will be slow", over: "Too big" };
const SITE = { ollama: "https://ollama.com/library", huggingface: "https://huggingface.co/models?library=gguf&sort=downloads", lmstudio: "https://lmstudio.ai/models", localai: "https://localai.io/models/" };
const SITE_LABEL = { ollama: "ollama.com", huggingface: "huggingface.co", lmstudio: "lmstudio.ai", localai: "localai.io" };
const UC_META = { Chat: { icon: MessageSquare, tone: "#7aa2f7" }, Coding: { icon: Code2, tone: "#3ecf8e" }, Reasoning: { icon: Brain, tone: "#b692f6" }, Vision: { icon: Eye, tone: "#5aa0ff" }, Tools: { icon: Wrench, tone: "#f0883e" }, Image: { icon: ImageIcon, tone: "#ed64a6" }, Voice: { icon: Mic, tone: "#fc8181" }, Video: { icon: Film, tone: "#7f9cf5" }, Media: { icon: Star, tone: "#9aa4b2" } };
const MAKER_MAP = [[/llama|codellama/, { key: "meta", label: "Meta" }], [/qwen|qwq/, { key: "qwen", label: "Qwen" }], [/gemma/, { key: "google", label: "Google" }], [/devstral|mixtral|mistral/, { key: "mistral", label: "Mistral AI" }], [/deepseek/, { key: "deepseek", label: "DeepSeek" }], [/phi/, { key: "microsoft", label: "Microsoft" }], [/gpt-oss/, { key: "openai", label: "OpenAI" }], [/wan/, { key: "alibaba", label: "Alibaba" }], [/flux/, { key: "flux", label: "Black Forest Labs" }], [/llava|minicpm|nomic/, { key: "community", label: "Community" }]];
const makerInfo = (name, family) => { const t = String(name || family || "").toLowerCase(); for (const [re, info] of MAKER_MAP) if (re.test(t)) return info; return { key: family || "local", label: family ? family.charAt(0).toUpperCase() + family.slice(1) : "Community" }; };
const paramsOf = (n) => { const m = /(\d+(?:\.\d+)?)\s*x?\s*b\b/i.exec(String(n || "").toLowerCase()); return m ? m[1] + "B" : "—"; };
const ctxOf = (n) => { const t = String(n || "").toLowerCase(); if (/llama-?3|llama3/.test(t)) return "128K"; if (/qwen-?2\.5|qwen2\.5|qwen-?3|qwen3/.test(t)) return "128K"; if (/gemma-?2|gemma2/.test(t)) return "8K"; if (/phi-?3\.5|phi3\.5|phi-?4|phi4/.test(t)) return "128K"; if (/mistral-?nemo/.test(t)) return "128K"; if (/codellama|code-?llama/.test(t)) return "16K"; if (/mistral/.test(t)) return "32K"; return "—"; };
const ctxNum = (n) => { const c = ctxOf(n); const m = /(\d+(?:\.\d+)?)\s*([KM])?/.exec(c); if (!m) return 0; let v = parseFloat(m[1]); if (m[2] === "K") v *= 1e3; if (m[2] === "M") v *= 1e6; return v; };
const paramNum = (n) => { const m = /(\d+(?:\.\d+)?)/.exec(paramsOf(n)); return m ? parseFloat(m[1]) : 0; };
const modelPageUrl = (id, pullName) => { const pn = String(pullName || ""); if (id === "ollama") return "https://ollama.com/library/" + pn.split(":")[0]; if (id === "huggingface") return "https://huggingface.co/" + pn.replace(/^hf\.co\//i, "").split(":")[0]; if (id === "lmstudio") return "https://huggingface.co/" + pn.split(":")[0]; return SITE[id]; };
const BROWSE_TTL = 12 * 60 * 60 * 1000; // refresh the curated list at most twice a day (when online)
function readBrowseCache(id) { try { const j = JSON.parse(localStorage.getItem("madav.lmbrowse." + id) || "null"); return j && Array.isArray(j.data) ? j : null; } catch { return null; } }
function writeBrowseCache(id, data) { try { localStorage.setItem("madav.lmbrowse." + id, JSON.stringify({ at: Date.now(), data })); } catch {} }
const MEDIA_GOALS = [
  { id: "all", label: "All", icon: null },
  { id: "image", label: "Image", icon: ImageIcon },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "video", label: "Video", icon: Film },
  { id: "downloaded", label: "Downloaded", icon: HardDrive },
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
  const [expandedRow, setExpandedRow] = useState(null);
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("desc");
  const toggleSort = (k) => { if (!k) return; if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(k); setSortDir(k === "model" ? "asc" : "desc"); } };
  const [browseList, setBrowseList] = useState({});  // id -> ModelSearchResult[] (the default gallery)
  const [goal, setGoal] = useState("all");            // active chat browse goal tile
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
    const cache = readBrowseCache(active);
    if (cache) setBrowseList((m) => ({ ...m, [active]: cache.data }));                  // show the cached curated list instantly
    const fresh = cache && (Date.now() - cache.at) < BROWSE_TTL;                         // refreshed within the last 12h?
    const online = typeof navigator === "undefined" || navigator.onLine !== false;
    if (fresh || !online) return () => { alive = false; };                              // fresh enough, or offline -> keep the cache
    Promise.resolve(bridge.localModels.browse(active)).then((r) => { if (alive && Array.isArray(r) && r.length) { setBrowseList((m) => ({ ...m, [active]: r })); writeBrowseCache(active, r); } }).catch(() => {});
    return () => { alive = false; };
  }, [active]);

  // LocalAI is a Docker-hosted engine — poll Docker + container status while its tab is open.
  useEffect(() => {
    if (active !== "localai") return;
    let alive = true;
    const load = () => {
      Promise.resolve(bridge.localModels.dockerStatus()).then((d) => alive && setDockerInfo(d)).catch(() => {});
      Promise.resolve(bridge.localModels.localaiStatus()).then((x) => { if (alive) { setLaiInfo(x); if (x && x.api) bridge.localModels.browse("localai").then((r) => { if (Array.isArray(r) && r.length) { setBrowseList((m) => ({ ...m, localai: r })); writeBrowseCache("localai", r); } }).catch(() => {}); } }).catch(() => {});
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
  const askRemove = async (id, name) => { const ok = await madavConfirm("Delete " + prettyLocalName(name) + "?\n\nThis frees the disk space. You can pull it again any time."); if (ok) doRemove(id, name); };
  const openExt = (url) => url && bridge.openExternal && bridge.openExternal(url);
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


  const renderRow = (r, id) => {
    const det = status[id] || {};
    const isMedia = id === "localai";
    const fit = fitForRam(r.sizeGB, sys.totalRamGB);
    const incompatible = fit === "over";
    const caps = localCaps(r.name || r.pullName) || {};
    const pr = pulls[id + "::" + r.pullName];
    const size = r.sizeLabel || (r.sizeGB ? "~" + r.sizeGB + " GB" : (r.sizeBytes ? fmtBytes(r.sizeBytes) : "—"));
    const ucs = [];
    if (r.useCases && r.useCases.length) { ["image", "voice", "video"].forEach((u) => { if (r.useCases.includes(u)) ucs.push(u.charAt(0).toUpperCase() + u.slice(1)); }); }
    if (!ucs.length) { if (caps.coding) ucs.push("Coding"); if (caps.reasoning) ucs.push("Reasoning"); if (caps.vision) ucs.push("Vision"); if (caps.tools && !caps.coding) ucs.push("Tools"); }
    if (!ucs.length) ucs.push(isMedia ? "Media" : "Chat");
    const mk = makerInfo(r.name || r.pullName, r.family);
    const useIt = () => { const pkey = (providerForRuntime(id) || {}).runtime; const v = profIds[pkey] ? profIds[pkey] + "::" + r.name : null; if (v && onActivate) onActivate(v); };
    const _pk = (providerForRuntime(id) || {}).runtime;
    const _val = r.installed && profIds[_pk] ? profIds[_pk] + "::" + r.name : null;
    const isActive = !!_val && _val === activeValue;
    const open = expandedRow === r.pullName;
    const dot = fit === "good" ? "#3fb950" : fit === "tight" ? "#f5a623" : fit === "over" ? "#ff6b6b" : "var(--text-2)";
    const fitLabel = fit === "good" ? "Compatible" : fit === "tight" ? "Runs but slow" : fit === "over" ? "Too big" : "—";
    return (
      <Fragment key={r.pullName}>
        <tr className={(r.installed ? "lmt-on " : "") + "lmt-row"} onClick={() => setExpandedRow(open ? null : r.pullName)}>
          <td><div className="lmt-name">{r.installed ? <CheckCircle2 size={13} style={{ color: "#3fb950", flex: "none" }} /> : null}<ChevronRight size={12} className={"lmt-caret" + (open ? " open" : "")} /> {prettyLocalName(r.name || r.pullName)}</div><div className="lmt-maker"><MakerLogo maker={mk.key} /> {mk.label}</div><div className="lmt-sub">{r.pullName}</div></td>
          <td><div className="lmt-caps">{ucs.map((u) => { const M = UC_META[u] || { tone: "#9aa4b2" }; const I = M.icon; return <span key={u} className="lmt-cap" style={{ color: M.tone, borderColor: "color-mix(in srgb, " + M.tone + " 38%, transparent)" }}>{I ? <I size={11} /> : null} {u}</span>; })}</div></td>
          <td className="lmt-nowrap">{size}</td>
          <td className="lmt-nowrap lmt-dim">{ctxOf(r.name || r.pullName)}</td>
          <td className="lmt-nowrap lmt-dim">{paramsOf(r.name || r.pullName)}</td>
          <td><span className="lmt-fit"><span className="lmt-dot" style={{ background: dot }} />{fitLabel}</span></td>
          <td className="lmt-nowrap lmt-dim">{r.downloads ? fmtCount(r.downloads) : "—"}</td>
          <td className="lmt-free">Free</td>
          <td className="lmt-act" onClick={(e) => e.stopPropagation()}>
            {r.installed ? (
              <span className="lmt-actrow">
                {isMedia ? <span className="lm-chip ok sm" title="Use in the Let's Create tab">Let's Create</span> : isActive ? <span className="lm-chip ok sm" title="This is your active model"><CheckCircle2 size={12} /> Active</span> : <button className="btn primary sm" onClick={useIt} disabled={!_val} title={_val ? "Activate this model" : "Preparing this model… one moment"}><Zap size={12} /> Activate</button>}
                <button className="btn ghost sm" onClick={() => askRemove(id, r.name)} title="Delete from disk"><Trash2 size={12} /></button>
              </span>
            ) : incompatible ? (
              <span className="lmt-incompat" title="Too large for your system's memory">Not compatible</span>
            ) : pr && !pr.done && !pr.error ? (
              <span className="lmt-actrow"><span className="lm-bar small" style={{ width: 64 }}><span className="lm-bar-fill" style={{ width: (pr.pct || 0) + "%" }} /></span><span className="lm-pct">{pr.pct || 0}%</span></span>
            ) : pr && pr.error ? (
              <button className="btn ghost sm" onClick={() => doPull(id, r.pullName)} title={pr.error}><AlertCircle size={12} /> Retry</button>
            ) : (
              <button className="btn primary sm" onClick={() => doPull(id, r.pullName)} disabled={!det.available} title={det.available ? "Download" : "Install the engine first"}><Download size={12} /> Pull</button>
            )}
          </td>
        </tr>
        {open ? (
          <tr className="lmt-detail"><td colSpan={9}>
            <div className="lmt-detailbody">
              <div className="lmt-detaildesc">{r.description || "No description available for this model. Open its page below for full details."}</div>
              <div className="lmt-detailmeta">
                <span>Pull: <code>{r.pullName}</code></span>
                <span>Size: {size}</span>
                <span>Params: {paramsOf(r.name || r.pullName)}</span>
                <span>Context: {ctxOf(r.name || r.pullName)}</span>
                <span>Runs here: {fitLabel}</span>
                <span>Use: {ucs.join(", ")}</span>
              </div>
              {SITE[id] ? <button className="lm-sitelink" onClick={() => openExt(modelPageUrl(id, r.pullName))}>View on {SITE_LABEL[id]} <ExternalLink size={11} /></button> : null}
            </div>
          </td></tr>
        ) : null}
      </Fragment>
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
            {SITE[id] ? <button className="lm-sitelink" onClick={() => openExt(SITE[id])} title={"Open " + SITE_LABEL[id]}>Browse all models on {SITE_LABEL[id]} <ExternalLink size={11} /></button> : null}
          </div>
          <div className="lm-status-actions">
            <button className="btn ghost sm" onClick={() => refresh(id)} title="Re-check status"><RefreshCw size={14} /></button>
            {!det.available && (inst
              ? <span className="lm-installing"><Loader2 size={13} className="spin" /> {inst.line ? inst.line : (inst.phase === "downloading" ? "Downloading… " + (inst.pct || 0) + "%" : inst.phase === "docker" ? "Starting Docker…" : inst.phase === "pulling" ? "Downloading engine…" : inst.phase === "booting" || inst.phase === "starting" ? "Starting engine…" : inst.phase === "installing" ? "Installing…" : inst.phase === "ready" ? "Ready" : inst.phase === "opened" ? "Opened download page" : "Working…")}</span>
              : <button className="btn primary" onClick={() => doInstall(id)}><Download size={14} /> {id === "localai" ? "Set up Let's Create" : id === "lmstudio" ? "Get LM Studio" : id === "huggingface" ? "Install Ollama engine" : "Install Ollama"}</button>)}
          </div>
        </div>
        {inst && (inst.phase === "downloading" || inst.phase === "docker" || inst.phase === "pulling" || inst.phase === "booting") ? <div className="lm-bar"><div className="lm-bar-fill" style={{ width: (inst.pct || 0) + "%" }} /></div> : null}
        {installNote[id] ? <div className="lm-hint">{installNote[id]}</div> : null}
        {isMedia ? (
          <div className="lm-lai-strip">
            <span className={"lm-chip " + (dockerInfo && dockerInfo.running ? "ok" : "off")}>{dockerInfo ? (dockerInfo.running ? "Docker running" : dockerInfo.installed ? "Docker installed - not started" : "Docker not installed") : "Checking Docker…"}</span>
            <span className={"lm-chip " + (laiInfo && laiInfo.api ? "ok" : "off")}>{laiInfo ? (laiInfo.api ? "Engine running" : laiInfo.container === "stopped" ? "Engine stopped" : "Engine not started") : "Checking engine…"}</span>
            {laiInfo && laiInfo.api ? <button className="btn ghost sm" onClick={() => { bridge.localModels.localaiStop(); setLaiInfo({ ...laiInfo, api: false }); }} title="Stop the Let's Create engine"><Square size={12} /> Stop engine</button> : null}
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

        {!showSearch ? (
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
            {isMedia ? <div className="lm-hint">These power <b>Let's Create</b> — pull a model here, then create in the Let's Create tab.</div> : null}
            {sys.totalRamGB ? <div className="lm-ram">Your machine has <b>{sys.totalRamGB} GB</b> RAM — showing popular models that run great on it, most-downloaded first.</div> : null}
          </div>
        ) : null}
        {(() => {
          const baseOf = (n) => String(n || "").split("/").pop().split(":")[0].toLowerCase();
          const activeGoal = isMedia ? mediaGoal : goal;
          let rows;
          if (showSearch) {
            rows = (res || []).filter((rr) => isMedia || isChatModel(rr.name || rr.pullName)).map((e) => ({ name: e.name, pullName: e.pullName, installed: isInstalled(id, e), sizeGB: e.sizeGB, sizeLabel: e.sizeLabel, downloads: e.downloads, description: e.description, useCases: e.useCases }));
          } else {
            const galAll = browseList[id] || [];
            const galByBase = new Map(); galAll.forEach((e) => { const b = baseOf(e.pullName); if (!galByBase.has(b)) galByBase.set(b, e); });
            const enrich = (m) => { const g = galByBase.get(baseOf(m.name)) || {}; return { name: m.name, pullName: m.name, installed: true, sizeBytes: m.sizeBytes, sizeGB: m.sizeBytes ? Math.round(m.sizeBytes / 1e9 * 10) / 10 : g.sizeGB, sizeLabel: g.sizeLabel, downloads: g.downloads || 0, description: g.description || "", useCases: g.useCases }; };
            const installedRows = (installed[id] || []).map(enrich);                      // REAL installed names -> activate + delete work
            const installedBases = new Set((installed[id] || []).map((m) => baseOf(m.name)));
            if (activeGoal === "downloaded") {
              rows = installedRows;                                                        // "Downloaded" filter = only what you have
            } else {
              const curated = galAll.filter(galleryFilter).filter((e) => { const f = fitForRam(e.sizeGB, sys.totalRamGB); return f === "good" || f === "unknown"; }).filter((e) => !installedBases.has(baseOf(e.pullName))).slice(0, 50).map((e) => ({ name: e.name, pullName: e.pullName, installed: false, sizeGB: e.sizeGB, sizeLabel: e.sizeLabel, downloads: e.downloads, description: e.description, useCases: e.useCases }));
              rows = [...installedRows.filter((r) => galleryFilter(r)), ...curated];
            }
          }
          if (sortKey) {
            const fitRank = (r) => { const f = fitForRam(r.sizeGB, sys.totalRamGB); return f === "good" ? 0 : f === "tight" ? 1 : f === "over" ? 2 : 3; };
            const val = (r) => sortKey === "model" ? prettyLocalName(r.name || r.pullName).toLowerCase() : sortKey === "size" ? (r.sizeGB || 0) : sortKey === "context" ? ctxNum(r.name || r.pullName) : sortKey === "params" ? paramNum(r.name || r.pullName) : sortKey === "ram" ? fitRank(r) : sortKey === "downloads" ? (r.downloads || 0) : 0;
            rows = [...rows].sort((a, b) => { const va = val(a), vb = val(b); const c = typeof va === "string" ? va.localeCompare(vb) : (va - vb); return sortDir === "asc" ? c : -c; });
          }
          if (!rows.length) {
            return <div className="lm-empty">{searching[id] ? "Searching…" : (isMedia && !det.available) ? "Start the Let's Create engine above to see models." : ((browseList[id] && browseList[id].length) ? "No models match — try another goal or search." : "Loading…")}</div>;
          }
          return (
            <div className="mo-tablewrap lmt-wrap">
              <table className="mo-table lmt-table">
                <thead><tr><th className={sortKey === "model" ? "sorted" : ""} onClick={() => toggleSort("model")}>Model{sortKey === "model" ? <span className="lmt-sortar">{sortDir === "asc" ? "▲" : "▼"}</span> : null}</th><th>Capabilities</th><th className={sortKey === "size" ? "sorted" : ""} onClick={() => toggleSort("size")}>Size{sortKey === "size" ? <span className="lmt-sortar">{sortDir === "asc" ? "▲" : "▼"}</span> : null}</th><th className={sortKey === "context" ? "sorted" : ""} onClick={() => toggleSort("context")}>Context{sortKey === "context" ? <span className="lmt-sortar">{sortDir === "asc" ? "▲" : "▼"}</span> : null}</th><th className={sortKey === "params" ? "sorted" : ""} onClick={() => toggleSort("params")}>Params{sortKey === "params" ? <span className="lmt-sortar">{sortDir === "asc" ? "▲" : "▼"}</span> : null}</th><th className={sortKey === "ram" ? "sorted" : ""} onClick={() => toggleSort("ram")}>RAM compatibility{sortKey === "ram" ? <span className="lmt-sortar">{sortDir === "asc" ? "▲" : "▼"}</span> : null}</th><th className={sortKey === "downloads" ? "sorted" : ""} onClick={() => toggleSort("downloads")}>Downloads{sortKey === "downloads" ? <span className="lmt-sortar">{sortDir === "asc" ? "▲" : "▼"}</span> : null}</th><th>Cost</th><th></th></tr></thead>
                <tbody>{rows.map((r) => renderRow(r, id))}</tbody>
              </table>
            </div>
          );
        })()}
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
