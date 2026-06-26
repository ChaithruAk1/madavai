// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Models -> Local Models. One page, three providers (Ollama / HuggingFace / LM Studio). Search a provider,
// pull a model with a live progress bar, see what's installed + which are loaded (health), remove, and one-click
// install the runtime if it's missing. SINGLE SOURCE: every model action goes through bridge.localModels.*
// (desktop preload on the app; a "desktop only" stub on web), which calls the shared @madav/models registry.
import { useState, useEffect, useCallback } from "react";
import { Cpu, Search, Download, Trash2, CheckCircle2, Loader2, AlertCircle, RefreshCw, HardDrive, Activity } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { providerForRuntime } from "../data/localProviders.js";

const PROVIDERS = [
  { id: "ollama", label: "Ollama", blurb: "The simplest way to run models locally. Search the built-in catalog or type any model name to pull." },
  { id: "huggingface", label: "HuggingFace", blurb: "Pull any GGUF model from the HuggingFace Hub. Runs through the Ollama engine under the hood." },
  { id: "lmstudio", label: "LM Studio", blurb: "Use models from LM Studio. Needs the LM Studio app with its command-line tool (lms) enabled." },
];

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

export default function LocalModels({ onChanged, onRefresh }) {
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
    const names = (models || []).map((m) => m && m.name).filter(Boolean);
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

  // Re-sync whenever the installed set changes (page load, a pull finishing, a remove).
  useEffect(() => {
    for (const id of ["ollama", "lmstudio"]) {
      const det = status[id];
      if (det && det.available) syncLocalProfile(id, installed[id] || []);
    }
  }, [installed, status]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const doInstall = (id) => {
    setInstalling((m) => ({ ...m, [id]: { phase: "starting", pct: 0 } }));
    Promise.resolve(bridge.localModels.install(id)).then((r) => {
      setInstalling((m) => ({ ...m, [id]: { phase: r && r.opened ? "opened" : "done", pct: 100 } }));
      setTimeout(() => refresh(id), 1500);
    }).catch(() => setInstalling((m) => ({ ...m, [id]: null })));
  };

  const isInstalled = (id, r) => {
    const names = (installed[id] || []).map((m) => m.name);
    const pn = r.pullName || "";
    if (pn.includes(":")) return names.includes(pn);
    return names.some((n) => n === pn || n.split(":")[0] === pn);
  };

  const renderPanel = (p) => {
    const id = p.id;
    const det = status[id] || {};
    const inst = installing[id];
    const res = results[id] || [];
    const insd = installed[id] || [];
    const run = running[id] || new Set();
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
              ? <span className="lm-installing"><Loader2 size={13} className="spin" /> {inst.phase === "downloading" ? "Downloading… " + (inst.pct || 0) + "%" : inst.phase === "installing" ? "Installing…" : inst.phase === "opened" ? "Opened download page" : "Working…"}</span>
              : <button className="btn primary" onClick={() => doInstall(id)}><Download size={14} /> {id === "lmstudio" ? "Get LM Studio" : id === "huggingface" ? "Install Ollama engine" : "Install Ollama"}</button>)}
          </div>
        </div>
        {inst && inst.phase === "downloading" ? <div className="lm-bar"><div className="lm-bar-fill" style={{ width: (inst.pct || 0) + "%" }} /></div> : null}

        <div className="lm-search">
          <Search size={15} className="lm-search-ico" />
          <input className="lm-search-in" placeholder={id === "ollama" ? "Search the catalog or type a model name (e.g. llama3.2, qwen2.5:7b)" : "Search HuggingFace GGUF models (e.g. llama, qwen, mistral)"}
            value={query[id] || ""} onChange={(e) => setQuery((q) => ({ ...q, [id]: e.target.value }))}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(id); }} />
          <button className="btn primary" onClick={() => doSearch(id)} disabled={!!searching[id]}>{searching[id] ? <Loader2 size={14} className="spin" /> : "Search"}</button>
        </div>
        {searchErr[id] ? <div className="lm-err"><AlertCircle size={13} /> {searchErr[id]}</div> : null}
        {!det.available && res.length > 0 ? <div className="lm-hint">Install {id === "lmstudio" ? "LM Studio" : "the Ollama engine"} above to pull these.</div> : null}

        {res.length > 0 ? (
          <div className="lm-results">
            {res.map((r) => {
              const pr = pulls[id + "::" + r.pullName];
              const done = isInstalled(id, r);
              return (
                <div className="lm-result" key={r.pullName}>
                  <div className="lm-result-main">
                    <div className="lm-result-name">{r.name || r.pullName}</div>
                    <div className="lm-result-meta">
                      {r.sizeLabel ? <span className="lm-meta-tag">{r.sizeLabel}</span> : null}
                      {r.downloads ? <span className="lm-meta-tag"><Download size={11} /> {fmtCount(r.downloads)}</span> : null}
                      {r.family ? <span className="lm-meta-tag">{r.family}</span> : null}
                    </div>
                    {r.description ? <div className="lm-result-desc">{r.description}</div> : null}
                  </div>
                  <div className="lm-result-action">
                    {done
                      ? <span className="lm-chip ok"><CheckCircle2 size={12} /> Installed</span>
                      : pr && !pr.done && !pr.error
                        ? <div className="lm-pulling"><div className="lm-bar small"><div className="lm-bar-fill" style={{ width: (pr.pct || 0) + "%" }} /></div><span className="lm-pct">{pr.pct || 0}%</span></div>
                        : pr && pr.error
                          ? <button className="btn ghost sm" onClick={() => doPull(id, r.pullName)} title={pr.error}><AlertCircle size={13} /> Retry</button>
                          : <button className="btn primary sm" onClick={() => doPull(id, r.pullName)} disabled={!det.available} title={det.available ? "" : "Install the engine first"}><Download size={13} /> Pull</button>}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="lm-installed">
          <div className="lm-section-label"><HardDrive size={13} /> Installed on this machine{insd.length ? " (" + insd.length + ")" : ""}</div>
          {insd.length === 0
            ? <div className="lm-empty">No {p.label} models yet. Search above and click Pull.</div>
            : insd.map((m) => {
                const isRun = run.has(m.name);
                return (
                  <div className="lm-installed-row" key={m.name}>
                    <div className="lm-installed-info">
                      <span className={"lm-dot " + (isRun ? "live" : "idle")} title={isRun ? "Loaded in memory" : "On disk"} />
                      <span className="lm-installed-name">{m.name}</span>
                      {m.family ? <span className="lm-meta-tag">{m.family}</span> : null}
                      {m.sizeBytes ? <span className="lm-meta-tag">{fmtBytes(m.sizeBytes)}</span> : null}
                      {isRun ? <span className="lm-chip ok sm"><Activity size={11} /> running</span> : null}
                    </div>
                    <button className="btn ghost sm" onClick={() => doRemove(id, m.name)} title="Remove from disk"><Trash2 size={13} /></button>
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
