import { useState, useMemo, useRef, useEffect, useLayoutEffect } from "react";
import { ChevronDown, Check, Search, RefreshCw } from "lucide-react";
import { MODELS } from "../bridge/contract.js";
import { bridge } from "../bridge/index.js";
import { localCaps } from "../data/localModels.js";
import HelpDot from "./HelpDot.jsx";

// Best-guess of a model's core purpose from its name (no universal API exposes this).
export function classify(id) {
  const n = (id || "").toLowerCase();
  if (/cod(er|e)\b|coder|deepseek-coder/.test(n)) return "coding";
  if (/reason|\br1\b|\bo1\b|\bo3\b|qwq|thinking|think\b/.test(n)) return "reasoning";
  if (/vision|multimodal|\bvl\b|llava|-v\b/.test(n)) return "vision";
  if (/embed/.test(n)) return "embeddings";
  if (/flash|mini|lite|haiku|tiny|small|turbo|nano|\b[1-9]b\b/.test(n)) return "fast";
  return "general";
}
const PURPOSE_COLOR = { coding: "#7ee787", reasoning: "#d2a8ff", vision: "#79c0ff", fast: "#ffd479", embeddings: "#79c0ff", agentic: "#f0883e", general: "var(--text-2)" };
const chipStyle = (active) => ({ padding: "4px 12px", borderRadius: 999, fontSize: 11.5, lineHeight: 1.5, border: "1px solid " + (active ? "var(--accent)" : "var(--line)"), background: active ? "var(--accent)" : "transparent", color: active ? "#04121a" : "var(--text-2)", cursor: "pointer", fontWeight: active ? 600 : 400 });
const pill = (color) => ({ fontSize: 10, padding: "1px 7px", borderRadius: 999, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)`, color, whiteSpace: "nowrap", lineHeight: 1.6, fontWeight: 600 });

// Provider → domain, for real logos (site favicons).
const DOMAIN = {
  openai: "openai.com", anthropic: "anthropic.com", google: "google.com", meta: "meta.ai", "meta-llama": "meta.ai",
  mistralai: "mistral.ai", mistral: "mistral.ai", deepseek: "deepseek.com", qwen: "qwen.ai", alibaba: "alibabacloud.com",
  "x-ai": "x.ai", xai: "x.ai", nvidia: "nvidia.com", openrouter: "openrouter.ai", cohere: "cohere.com", liquid: "liquid.ai",
  moonshotai: "moonshot.ai", stepfun: "stepfun.com", "stepfun-ai": "stepfun.com", nous: "nousresearch.com", nousresearch: "nousresearch.com",
  microsoft: "microsoft.com", perplexity: "perplexity.ai", "01-ai": "01.ai", ai21: "ai21.com", amazon: "amazon.com",
  ibm: "ibm.com", "ibm-granite": "ibm.com", arcee: "arcee.ai", "arcee-ai": "arcee.ai", morph: "morphllm.com", allenai: "allenai.org",
  reka: "reka.ai", thudm: "z.ai", zhipu: "z.ai", baidu: "baidu.com", minimax: "minimaxi.com", kwaipilot: "kuaishou.com", cohereforai: "cohere.com",
  bigcode: "huggingface.co", bytedance: "bytedance.com", inclusionai: "huggingface.co", agentica: "huggingface.co", "z-ai": "z.ai",
  // Routers / hosting providers (used for the provider group header logo)
  deepinfra: "deepinfra.com", groq: "groq.com", together: "together.ai", togetherai: "together.ai", fireworks: "fireworks.ai",
  lmstudio: "lmstudio.ai", ollama: "ollama.com", novita: "novita.ai", hyperbolic: "hyperbolic.xyz", sambanova: "sambanova.ai",
  cerebras: "cerebras.ai", lambda: "lambdalabs.com", nvidianim: "nvidia.com", nim: "nvidia.com",
};
function Logo({ name, prov }) {
  const [err, setErr] = useState(false);
  const maker = ((name || "").includes("/") ? name.split("/")[0] : (prov || "")).toLowerCase().trim();
  const d = DOMAIN[maker] || DOMAIN[maker.replace(/\s+/g, "")] || DOMAIN[maker.split(/[\s-]/)[0]];
  if (d && !err) return <img src={`https://www.google.com/s2/favicons?domain=${d}&sz=64`} alt="" width={16} height={16} loading="lazy" onError={() => setErr(true)} style={{ borderRadius: 4, flex: "none" }} />;
  const hue = [...maker].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 360;
  return <span style={{ flex: "none", width: 16, height: 16, borderRadius: 4, display: "grid", placeItems: "center", fontSize: 9, fontWeight: 700, background: `hsl(${hue} 55% 55% / .2)`, color: `hsl(${hue} 70% 72%)` }}>{(maker.replace(/^[~@]/, "")[0] || "?").toUpperCase()}</span>;
}

// `groups` are provider-derived: [{ group: providerName, items: [{id:"pid::model", name, prov, badge}] }]
// `agenticOnly`: opt-in pre-filter to tool-calling-capable models (used by Agent Studio —
// agents need function calling). The default global picker behavior is unchanged.
export default function ModelPicker({ value, onChange, groups: groupsProp, onRefresh, agenticOnly = false, compact = false }) {
  const source = groupsProp && groupsProp.length ? groupsProp : MODELS;
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false); // bottom half of the screen → the menu opens upward
  const [maxH, setMaxH] = useState(520); // measured height cap so the menu never overruns the window (set after render)
  const menuRef = useRef(null);
  const measure = () => { // choose the open direction from the trigger's position in the window
    try { const r = ref.current && ref.current.getBoundingClientRect(); setOpenUp(!!r && r.top > window.innerHeight * 0.55); } catch {}
  };
  const toggleOpen = () => { if (!open) measure(); setOpen((o) => !o); };
  const [q, setQ] = useState("");
  const [cost, setCost] = useState("all");       // all | free | paid
  const [host, setHost] = useState("all");       // all | cloud | local (where the model runs)
  const [caps, setCaps] = useState(() => new Set()); // active capability filters (multi-select, AND-combined)
  const [refreshing, setRefreshing] = useState(false);
  const [orCat, setOrCat] = useState(null);
  const [maker, setMaker] = useState("all"); // filter by model maker (nvidia, meta, qwen…) within a router
  const ref = useRef(null);
  // After the menu renders, measure where it ACTUALLY sits and clamp its height so the search
  // header stays on-screen below the top tabs — regardless of window size or which ancestor the
  // menu anchors to. Placed after the filter state it reads (deps run during render → no TDZ).
  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const topSafe = 92, botSafe = 10; // clear the mode tabs (top) / window edge (bottom)
    const avail = openUp ? (r.bottom - topSafe) : (window.innerHeight - r.top - botSafe);
    const v = Math.max(220, Math.min(560, Math.floor(avail)));
    if (Math.abs(v - r.height) > 2) setMaxH(v);
  }, [open, openUp, q, maker, cost, host, caps]);
  const isFree = (it, groupName) => /local/i.test(it.prov || groupName || "") || /:free\b/.test((it.name || "").toLowerCase());
  const makerOf = (it, group) => ((it.name || "").includes("/") ? it.name.split("/")[0] : (it.prov || group || "")).toLowerCase().trim();
  const ormOf = (it) => { if (!orCat) return null; const id = it.id && it.id.includes("::") ? it.id.split("::")[1] : it.name; return orCat[id] || null; };
  // Local models have no catalog metadata — fall back to the curated family registry (localModels.js).
  const lcOf = (it, group) => (/local/i.test(it.prov || group || "") ? localCaps((it.id && it.id.includes("::") ? it.id.split("::")[1] : it.name) || it.name) : null);
  // Agentic = real tool-calling capability from the catalog. Don't assume it from "coder" etc.
  const agenticOf = (it, group) => { const o = ormOf(it); if (o) return !!o.tools; const l = lcOf(it, group); if (l) return !!l.tools; return /\bagent/i.test(it.name || ""); };
  // Each capability is detected INDEPENDENTLY — a model can be several at once (e.g. coding AND agentic).
  const CAPS = {
    coding: (it, group) => /cod(er|e)\b|coder|codestral|devstral/i.test(it.name || "") || !!lcOf(it, group)?.coding,
    reasoning: (it, group) => { const o = ormOf(it); return (o && o.reasoning) || /reason|\br1\b|\bo1\b|\bo3\b|qwq|think/i.test(it.name || "") || !!lcOf(it, group)?.reasoning; },
    vision: (it, group) => { const o = ormOf(it); return (o && o.image) || /vision|multimodal|\bvl\b|llava/i.test(it.name || "") || !!lcOf(it, group)?.vision; },
    fast: (it) => /flash|mini|lite|haiku|tiny|small|turbo|nano/i.test(it.name || ""),
    agentic: (it, group) => agenticOf(it, group),
  };

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  // Catalog gives real tool-calling data for the Agentic detection; agenticOnly pickers
  // need it immediately (not just on open) so the filter is accurate from the first render.
  useEffect(() => { if ((open || agenticOnly) && !orCat && bridge.getOpenRouterCatalog) bridge.getOpenRouterCatalog().then(setOrCat).catch(() => {}); }, [open, agenticOnly]); // eslint-disable-line

  const current = useMemo(() => {
    if (value === "auto") return { id: "auto", name: "✨ Auto", prov: "" };
    for (const g of source) for (const it of g.items) if (it.id === value) return it;
    if (value && value.includes("::")) { const mid = value.slice(value.indexOf("::") + 2); return { id: value, name: mid || "select model", prov: "" }; }
    return source[0]?.items[0] || { name: "no models", prov: "" };
  }, [value, source]);

  const total = source.reduce((n, g) => n + g.items.length, 0);
  // Unique makers across all loaded models (e.g. nvidia, meta-llama, qwen…), sorted by how many each has.
  const makers = useMemo(() => {
    const m = new Map();
    for (const g of source) for (const it of g.items) { const k = makerOf(it, g.group); if (k) m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [source]);
  // Agent Studio no longer HIDES non-agentic models (local models often lack agentic
  // metadata yet still work as agents). It's now a soft "Agent-ready" TOGGLE the user
  // can switch on; off by default, every model is selectable.
  const [agOnly, setAgOnly] = useState(false);
  const groups = source
    .map((g) => ({ ...g, items: g.items.filter((it) => {
      if (!(it.name + it.id).toLowerCase().includes(q.toLowerCase())) return false;
      if (agOnly && !CAPS.agentic(it, g.group)) return false; // only when the user opts in
      if (maker !== "all" && makerOf(it, g.group) !== maker) return false;
      const free = isFree(it, g.group);
      if (cost === "free" && !free) return false;
      if (cost === "paid" && free) return false;
      const local = /local/i.test(it.prov || g.group || "");
      if (host === "cloud" && local) return false;
      if (host === "local" && !local) return false;
      for (const k of caps) { if (CAPS[k] && !CAPS[k](it, g.group)) return false; } // multi-select, AND-combined
      return true;
    }) }))
    .filter((g) => g.items.length);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  // Render cap: 250 rows max in the DOM (filters/search still cover everything) — keeps the
  // dropdown instant even with 500+ models loaded.
  const MAX_RENDER = 250;
  let _n = 0;
  const renderGroups = groups.map((g) => {
    if (_n >= MAX_RENDER) return null;
    const items = g.items.slice(0, MAX_RENDER - _n); _n += items.length;
    return { ...g, items };
  }).filter(Boolean);
  const truncated = shown > _n;

  const doRefresh = async () => { if (!onRefresh) return; setRefreshing(true); try { await onRefresh(); } finally { setRefreshing(false); } };

  return (
    <div className="model-picker" ref={ref}>
      {compact ? (
        <button className="model-btn compact" onClick={toggleOpen} title={`${current.prov ? current.prov + " · " : ""}${current.name}`}>
          {(() => { const s = String(current.name || "model").split("/").pop().replace(/:free$/, ""); return s.length > 22 ? s.slice(0, 20) + "…" : s; })()} <ChevronDown size={13} />
        </button>
      ) : (
        <button className="model-btn" onClick={toggleOpen}>
          {current.prov && <span className="prov">{current.prov}</span>} {current.name} <ChevronDown size={14} />
        </button>
      )}
      {open && (
        <div ref={menuRef} className="model-menu mp-menu scroll" style={{ width: 720, maxWidth: "min(94vw, 720px)", maxHeight: maxH, ...(openUp ? { top: "auto", bottom: 46 } : {}) }}>
          {/* Sticky header — search + maker + filter chips stay put; only the model list scrolls. */}
          <div className="mp-head" style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--bg-1)", borderBottom: "1px solid var(--line)", paddingBottom: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: 10, color: "var(--text-2)" }} />
              <input className="model-search" style={{ paddingLeft: 32, marginBottom: 0 }} autoFocus placeholder={`Search ${total} models…`} value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            {onRefresh && <button className="btn" title="Reload models from providers" onClick={doRefresh} style={{ padding: "8px 9px" }}><RefreshCw size={14} className={refreshing ? "spin" : ""} /></button>}
          </div>

          {makers.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: ".05em" }}>Maker</span>
              <select value={maker} onChange={(e) => setMaker(e.target.value)} className="model-search" style={{ flex: 1, marginBottom: 0, padding: "7px 10px", cursor: "pointer" }}>
                <option value="all">All makers · {total}</option>
                {makers.map(([k, n]) => <option key={k} value={k}>{k} · {n}</option>)}
              </select>
            </div>
          )}

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            {[["all", "All"], ["free", "Free"], ["paid", "Paid"]].map(([k, label]) => (
              <button key={k} onClick={() => setCost(k)} style={chipStyle(cost === k)}>{label}</button>
            ))}
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--line)", margin: "2px 4px" }} />
            {[["cloud", "Cloud"], ["local", "Local"]].map(([k, label]) => (
              <button key={k} onClick={() => setHost((h) => (h === k ? "all" : k))} style={chipStyle(host === k)} title={k === "local" ? "Models running on this machine (Ollama / LM Studio)" : "Hosted models"}>{label}</button>
            ))}
            <span style={{ width: 1, alignSelf: "stretch", background: "var(--line)", margin: "2px 4px" }} />
            {[["coding", "Coding"], ["reasoning", "Reasoning"], ["vision", "Vision"], ["fast", "Fast"], ["agentic", "Agentic"]].map(([k, label]) => (
              <button key={k} onClick={() => setCaps((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; })} style={chipStyle(caps.has(k))}>{label}</button>
            ))}
            {agenticOnly && (
              <button onClick={() => setAgOnly((v) => !v)} style={chipStyle(agOnly)} title="Show only models tagged tool-capable. Off by default — local models may work as agents even without the tag.">
                {agOnly ? "✓ " : ""}Agent-ready only
              </button>
            )}
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{shown} of {total}</span>
          </div>
          </div>{/* /mp-head */}

          {groups.length === 0 && (
            <div className="model-group" style={{ textTransform: "none", color: "var(--text-2)", padding: 12 }}>
              No models match these filters. Clear a filter, or open Settings to add a provider.
            </div>
          )}

          {/* Auto routing — top of the list, above the real models. Madav picks the best keyed model per request. */}
          <div title="Auto — Madav picks the best keyed model for each request" className={`model-row ${value === "auto" ? "sel" : ""}`} onClick={() => { onChange("auto"); setOpen(false); }} style={{ gap: 9 }}>
            <span style={{ flex: "none", width: 16, textAlign: "center" }}>✨</span>
            <span style={{ flex: 1, minWidth: 0 }}>Auto <span style={{ color: "var(--text-3)", fontSize: 11 }}>· best model per request{value === "auto" ? " · click to unselect" : ""}</span></span>
            <span onClick={(e) => e.stopPropagation()} style={{ flex: "none" }}><HelpDot mode="chat" section="automodel" /></span>
            {value === "auto" && <Check size={15} className="check" style={{ flex: "none" }} />}
          </div>
          {renderGroups.map((g) => (
            <div key={g.group}>
              <div className="model-group" style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Logo prov={g.group} /> {g.group} · {g.items.length}
              </div>
              {g.items.map((it) => {
                const isLocal = /local/i.test(it.prov || g.group || "");
                const free = isFree(it, g.group);
                const tags = [];
                if (CAPS.coding(it, g.group)) tags.push("coding");
                if (CAPS.reasoning(it, g.group)) tags.push("reasoning");
                if (CAPS.vision(it, g.group)) tags.push("vision");
                if (CAPS.agentic(it, g.group)) tags.push("agentic");
                if (!tags.length && CAPS.fast(it)) tags.push("fast");
                const hostLabel = isLocal ? "Local" : free ? "Free" : "Cloud";
                const hostColor = isLocal ? "var(--ok)" : free ? "#7ee787" : "var(--accent)";
                return (
                  <div key={it.id} title={it.name} className={`model-row ${it.id === value ? "sel" : ""}`} onClick={() => { onChange(it.id); setOpen(false); }} style={{ gap: 9 }}>
                    <Logo name={it.name} prov={it.prov || g.group} />
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.name}</span>
                    {tags.slice(0, 3).map((t) => <span key={t} style={pill(PURPOSE_COLOR[t])}>{t}</span>)}
                    <span style={pill(hostColor)}>{hostLabel}</span>
                    {it.id === value && <Check size={15} className="check" style={{ flex: "none" }} />}
                  </div>
                );
              })}
            </div>
          ))}
          {truncated && (
            <div className="model-group" style={{ textTransform: "none", color: "var(--text-2)", padding: "10px 12px" }}>
              Showing the first {MAX_RENDER} of {shown} — type in the search box to narrow down.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
