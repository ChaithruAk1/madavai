import { useMemo, useState, useEffect } from "react";
import { Check, X, Search, ChevronUp, ChevronDown, Download, Brain, Image as ImageIcon, ScrollText, Bot, Wrench } from "lucide-react";
import { MODELS, CATEGORIES, freeInfo } from "../data/modelCatalog.js";
import { classifyProvider, isModelFree } from "../data/providerRules.js";
import { bridge } from "../bridge/index.js";

// Each capability tag gets a distinct colour + a widely-recognised icon.
const CAP_META = {
  "Reasoning": { icon: Brain, color: "#f5c044" },        // brain = reasoning/thinking
  "Image": { icon: ImageIcon, color: "#4fc98a" },        // image/vision
  "Long context": { icon: ScrollText, color: "#5aa0ff" },// long document
  "Agentic": { icon: Bot, color: "#f0823c" },            // robot = agent
  "Tools": { icon: Wrench, color: "#e87aa8" },           // tool calling
};

// Open-weight & where to get it. Proprietary models are API-only (no download).
// Returns every place a user can grab the weights, so the UI can offer a chooser.
function dl(m) {
  if (/proprietary/i.test(m.license)) return { open: false, targets: [] };
  const base = (m.run || m.name || "").split(":")[0].split("/").pop();
  const nameQ = encodeURIComponent(m.name);
  const knownOllama = (m.providers || []).some((p) => p.name === "Ollama");
  const ollama = knownOllama ? `https://ollama.com/library/${base}` : `https://ollama.com/search?q=${nameQ}`;
  const hf = `https://huggingface.co/models?search=${nameQ}`;
  const lmstudio = `https://lmstudio.ai/models?search=${nameQ}`;
  const targets = [
    { id: "hf", label: "Hugging Face", note: "Original & GGUF weights", url: hf },
    { id: "ollama", label: "Ollama", note: knownOllama ? "One-command local run" : "Search the library", url: ollama },
    { id: "lmstudio", label: "LM Studio", note: "Desktop GUI · GGUF", url: lmstudio },
  ];
  return { open: true, ollama, hf, lmstudio, targets };
}
const openExt = (url) => url && bridge.openExternal && bridge.openExternal(url);

const costRank = (m) => { const c = freeInfo(m).cost; return c === "Free (local)" ? 0 : c === "Free tier" ? 1 : 2; };

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function Cap({ v }) {
  // "toggle" (optional capability) is shown as a yes indicator.
  return v ? <Check size={15} className="mo-yes" /> : <X size={15} className="mo-no" />;
}

// Host availability: Cloud, Local, or both.
// Union of where the model can run: catalog availability + the provider it's loaded from.
function hostFlags(m) {
  const types = new Set((m.providers || []).map((p) => (p.type === "local" ? "local" : "cloud")));
  const hs = m._hostSet || new Set();
  const hasLocal = types.has("local") || m.host === "local" || hs.has("local");
  const hasCloud = types.has("cloud") || (m.host && m.host !== "local") || hs.has("cloud");
  return { hasLocal, hasCloud };
}
function hostLabel(m) {
  const { hasLocal, hasCloud } = hostFlags(m);
  if (hasLocal && hasCloud) return "Cloud & Local";
  if (hasLocal) return "Local";
  return "Cloud";
}
// Which hosts a model is available on, as separate labels (both when it runs cloud AND local).
function hostsOf(m) {
  const { hasLocal, hasCloud } = hostFlags(m);
  const out = [];
  if (hasCloud) out.push("Cloud");
  if (hasLocal) out.push("Local");
  return out.length ? out : ["Cloud"];
}
// Free/paid: provider-rule verdict wins when known, else fall back to the catalog's freeInfo.
const isFree = (m) => (m._free != null ? m._free : freeInfo(m).has);

const COLS = [
  { key: "name", label: "Model", sort: (m) => m.name },
  { key: "bestFor", label: "Best for", sort: (m) => m.bestFor },
  { key: "ctx", label: "Context", sort: (m) => m.ctx },
  { key: "host", label: "Host", sort: (m) => hostLabel(m) },
  { key: "cost", label: "Cost", sort: (m) => (isFree(m) ? 0 : 1) },
  { key: "thinking", label: "Reasoning", sort: (m) => String(m.thinking) },
  { key: "vision", label: "Image", sort: (m) => Number(m.vision) },
  { key: "size", label: "Params", sort: (m) => sizeNum(m.size) },
  { key: "download", label: "Download available", sort: (m) => (dl(m).open ? 0 : 1) },
];

function Stars({ value }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span className="stars" title={value.toFixed(1) + " / 5 (approx. reputation)"}>
      <span className="stars-bg">★★★★★</span>
      <span className="stars-fg" style={{ width: pct + "%" }}>★★★★★</span>
    </span>
  );
}

const fmtCtx = (k) => (!k ? "—" : k >= 1000 ? (k / 1000) + "M" : k + "K");
// Parameter count for sorting: "32B" → 32, "671B MoE" → 671, "—"/unknown → -1 (sorts last).
const sizeNum = (s) => { const m = String(s || "").match(/(\d+(?:\.\d+)?)\s*[bB]/); return m ? parseFloat(m[1]) : -1; };

// Infer capabilities + a readable type from a model id when no catalog / API metadata exists
// (e.g. NVIDIA NIM models). Reliable because the id usually encodes the type and size.
function inferMeta(id) {
  const s = String(id || "").toLowerCase();
  const m = s.match(/(\d+(?:\.\d+)?)\s*b\b/);
  return {
    vision: /\bvl\b|vlm|vision|multimodal|-mm\b|image|cosmos/.test(s),
    reasoning: /reason|reasoner|-r1\b|think|deepseek-r|\bqwq\b|nemotron-(super|ultra)/.test(s),
    coding: /cod(e|er|ing)|coder|devstral|codestral/.test(s),
    embed: /embed|retriever|embedqa|rerank/.test(s),
    guard: /guard|safety|moderation|content-safety/.test(s),
    size: m ? m[1].toUpperCase() + "B" : "",
  };
}

const TOP = new Set(["Qwen2.5-Coder 32B", "Qwen3 32B", "Claude Sonnet"]);

function capsFor(m) {
  const c = [];
  if (m.agentic) c.push("Agentic");
  if (m.thinking) c.push("Reasoning");
  if (m.vision) c.push("Image");
  if (m.tools) c.push("Tools");
  if (m.ctx >= 200) c.push("Long context");
  return c;
}
function tagsFor(m) {
  const t = [m.cat];
  if (m.agentic) t.push("Agentic");
  if (m.thinking) t.push("Thinking");
  if (m.vision) t.push("Vision");
  return t;
}
function blurbFor(m) {
  if (m.sparse) return `Live model from ${m.maker}. It isn't in the curated catalog yet, so detailed specs (context, VRAM, license, capabilities) aren't available — only that it's offered by ${m.maker}.`;
  const where = m.host === "local" ? `Runs locally in ~${m.vram} GB VRAM (≈Q4)` : `Served via the ${m.host} API`;
  const think = m.thinking === "toggle" ? ", hybrid thinking mode" : m.thinking ? ", step-by-step reasoning" : "";
  return `${m.bestFor}. ${where}, ${fmtCtx(m.ctx)} context${think}. ${m.size !== "—" ? m.size + " parameters, " : ""}licensed ${m.license}.`;
}
function winsFor(m) {
  const w = [];
  if (/apache|mit/i.test(m.license)) w.push(`${m.license} — no usage restrictions`);
  if (m.host === "local") w.push(`Runs fully offline (~${m.vram} GB, ≈Q4)`);
  if (m.ctx >= 128) w.push(`${fmtCtx(m.ctx)} context — large repos/docs fit`);
  if (m.tools) w.push("Native tool calling — agent ready");
  if (m.vision) w.push("Understands images & documents");
  if (m.thinking === true) w.push("Always-on reasoning");
  return w.slice(0, 4);
}
function missesFor(m) {
  const x = [];
  if (m.host !== "local") x.push("Cloud only — needs API key + network");
  if (/proprietary/i.test(m.license)) x.push("Closed weights / proprietary");
  if (!m.vision) x.push("No vision / image input");
  if (m.thinking === "toggle") x.push("Thinking is a toggle, not always-on");
  if (m.host === "local" && m.vram >= 24) x.push(`Needs a large GPU (~${m.vram} GB)`);
  if (m.ctx <= 32) x.push("Smaller context window");
  if (!m.tools) x.push("No native tool calling");
  return x.slice(0, 4);
}

export default function ModelsOverview({ activeModel }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [hostFilter, setHostFilter] = useState("All"); // All | local | cloud
  const [caps, setCaps] = useState({ tools: false, vision: false, thinking: false, agentic: false, downloadable: false });
  const [freeOnly, setFreeOnly] = useState(false);
  const [sortKey, setSortKey] = useState("ctx");
  const [dir, setDir] = useState("desc");
  const [detail, setDetail] = useState(null);
  const [copied, setCopied] = useState("");
  const [cfg, setCfg] = useState(null);
  const [orCat, setOrCat] = useState(null);
  const [dlMenu, setDlMenu] = useState(null); // model name whose download-source chooser is open
  const copy = (text, label) => { try { navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1400); } catch {} };

  // Close the download chooser on any outside click or Escape.
  useEffect(() => {
    if (!dlMenu) return;
    const close = () => setDlMenu(null);
    const onKey = (e) => { if (e.key === "Escape") setDlMenu(null); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", onKey); };
  }, [dlMenu]);

  useEffect(() => { bridge.getSettings().then(setCfg).catch(() => {}); }, []);
  useEffect(() => {
    if (cfg && Object.values(cfg.profiles || {}).some((p) => /openrouter/i.test(p.baseUrl || "")) && bridge.getOpenRouterCatalog) {
      bridge.getOpenRouterCatalog().then(setOrCat).catch(() => {});
    }
  }, [cfg]);

  // The list mirrors the top-bar model selector: every model loaded on a configured
  // provider. Matched to the curated catalog for rich details; otherwise a basic row.
  const allModels = useMemo(() => {
    if (!cfg || !cfg.profiles) return MODELS;
    const out = []; const seenId = new Set(); const byName = new Map();
    for (const p of Object.values(cfg.profiles)) {
      // Host + free/paid are decided by the shared, data-driven provider rules (providerRules.js).
      const cls = classifyProvider(p);
      const isLocal = cls.host === "local";
      const ids = (p.cachedModels && p.cachedModels.length) ? p.cachedModels : (p.model ? [p.model] : []);
      for (const id of ids) {
        const key = norm(id);
        // Per-provider dedupe (so the SAME model on a cloud AND a local provider is both processed).
        if (!key || seenId.has(p.id + "::" + key)) continue; seenId.add(p.id + "::" + key);
        const match = MODELS.find((m) => { const r = norm(m.run), n = norm(m.name); return key === r || (r && (key.includes(r) || r.includes(key))) || (n && key.includes(n)); });
        const orm = orCat && orCat[id];
        let entry;
        if (match) entry = { ...match, run: id };
        else {
          entry = { name: id, run: id, maker: id.includes("/") ? id.split("/")[0] : p.name, host: isLocal ? "local" : p.name, sparse: true, rating: 0, ctx: 0, vram: 0, size: "—", license: "—", cat: "General", tools: false, vision: false, thinking: false, agentic: false, year: "", bestFor: `Available via ${p.name}`, providers: [{ name: p.name, type: isLocal ? "local" : "cloud", tier: "paid" }] };
          if (orm) { // enrich OpenRouter-sourced models with real metadata
            entry.ctx = orm.ctx || 0;
            entry.vision = !!orm.image;
            entry.thinking = !!orm.reasoning;
            if (orm.desc) { entry.bestForFull = orm.desc; entry.bestFor = orm.desc.split(". ")[0].slice(0, 220); }
            entry.providers = [{ name: p.name, type: "cloud", tier: orm.free ? "freemium" : "paid" }];
          } else { // no catalog/API data (e.g. NVIDIA NIM) → infer type + capabilities from the id
            const inf = inferMeta(id);
            entry.vision = inf.vision;
            entry.thinking = inf.reasoning;
            if (inf.size) entry.size = inf.size;
            if (inf.coding) entry.cat = "Coding";
            if (inf.embed) entry.cat = "Embedding";
            const kind = inf.embed ? "Embedding model" : inf.guard ? "Safety / guardrail model" : inf.vision ? "Vision-language model" : inf.reasoning ? "Reasoning model" : inf.coding ? "Coding model" : "Chat model";
            entry.bestFor = `${kind}${inf.size ? ` · ${inf.size}` : ""} · available via ${p.name} (details not published by the provider)`;
          }
        }
        const thisFree = isModelFree({ profile: p, modelId: id, orFree: orm ? !!orm.free : null });
        const nkey = norm(entry.name);
        const dup = byName.get(nkey);
        if (dup) {
          // Same model from another provider → merge hosts (so it can read "Cloud & Local") and
          // keep the more favourable free verdict, instead of dropping the duplicate.
          dup._hostSet.add(cls.host);
          if (dup._free !== true && thisFree === true) dup._free = true;
          continue;
        }
        entry._hostSet = new Set([cls.host]); // hosts this model is available on, unioned across providers
        entry._free = thisFree;
        byName.set(nkey, entry);
        out.push(entry);
      }
    }
    return out.length ? out : MODELS;
  }, [cfg, orCat]);

  const activeNorm = norm(activeModel);
  const isActive = (m) => activeNorm && (activeNorm.includes(norm(m.run)) || activeNorm.includes(norm(m.name)) || norm(m.run).includes(activeNorm));

  const rows = useMemo(() => {
    let r = allModels.filter((m) => {
      if (cat !== "All" && m.cat !== cat) return false;
      const hl = hostLabel(m);
      if (hostFilter === "local" && hl === "Cloud") return false;   // keep Local + Cloud & Local
      if (hostFilter === "cloud" && hl === "Local") return false;   // keep Cloud + Cloud & Local
      if (caps.tools && !m.tools) return false;
      if (caps.vision && !m.vision) return false;
      if (caps.thinking && !m.thinking) return false;
      if (caps.agentic && !m.agentic) return false;
      if (caps.downloadable && !dl(m).open) return false;
      if (freeOnly && !isFree(m)) return false;
      if (q) { const t = (m.name + " " + m.maker + " " + m.bestFor + " " + m.run).toLowerCase(); if (!t.includes(q.toLowerCase())) return false; }
      return true;
    });
    const col = COLS.find((c) => c.key === sortKey) || COLS[0];
    r = [...r].sort((a, b) => {
      const va = col.sort(a), vb = col.sort(b);
      const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return dir === "asc" ? cmp : -cmp;
    });
    return r;
  }, [allModels, q, cat, hostFilter, caps, freeOnly, sortKey, dir]);

  const setSort = (key) => { if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setDir(key === "ctx" || key === "vram" ? "desc" : "asc"); } };
  const toggleCap = (k) => setCaps((c) => ({ ...c, [k]: !c[k] }));
  const noFilters = cat === "All" && hostFilter === "All" && !freeOnly && !Object.values(caps).some(Boolean);
  const resetFilters = () => { setCat("All"); setHostFilter("All"); setFreeOnly(false); setCaps({ tools: false, vision: false, thinking: false, agentic: false, downloadable: false }); };

  return (
    <div className="mo scroll">
      <div className="mo-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Models overview</h2>
          <p style={{ color: "var(--text-2)", fontSize: 12, margin: "4px 0 0" }}>
            Models loaded on your configured providers (same as the top-bar selector). {rows.length} of {allModels.length} shown.
          </p>
        </div>
      </div>

      <div className="mo-filters">
        <div className="mo-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" />
        </div>
        <div className="mo-chips">
          {/* "All" is a master reset; it highlights only when nothing is filtered. */}
          <button className={`mo-chip ${noFilters ? "on" : ""}`} onClick={resetFilters}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c} className={`mo-chip ${cat === c ? "on" : ""}`} onClick={() => setCat(cat === c ? "All" : c)}>{c}</button>
          ))}
          <span className="mo-sep" />
          {["local", "cloud"].map((h) => (
            <button key={h} className={`mo-chip ${hostFilter === h ? "on" : ""}`} onClick={() => setHostFilter(hostFilter === h ? "All" : h)}>{h === "local" ? "Local" : "Cloud"}</button>
          ))}
          <span className="mo-sep" />
          <button className={`mo-chip ${caps.agentic ? "on" : ""}`} onClick={() => toggleCap("agentic")}>Agentic</button>
          <button className={`mo-chip ${caps.vision ? "on" : ""}`} onClick={() => toggleCap("vision")}>Image</button>
          <button className={`mo-chip ${caps.downloadable ? "on" : ""}`} onClick={() => toggleCap("downloadable")}>Download</button>
          <button className={`mo-chip ${freeOnly ? "on" : ""}`} onClick={() => setFreeOnly((v) => !v)}>Free</button>
        </div>
      </div>

      <div className="mo-tablewrap">
        <table className="mo-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} onClick={() => setSort(c.key)} className={sortKey === c.key ? "sorted" : ""}>
                  <span>{c.label}</span>
                  {sortKey === c.key && (dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.name} className={isActive(m) ? "active" : ""} onClick={() => setDetail(m)} style={{ cursor: "pointer" }}>
                <td><div className="mo-name">{m.name}{isActive(m) && <span className="mo-activebadge">active</span>}</div><div className="mo-sub">{m.maker}{m.year ? " · " + m.year : ""}</div></td>
                <td>
                  <div className="mo-best" title={m.bestForFull || m.bestFor}>{m.bestFor}</div>
                  <div className="mo-caps">{capsFor(m).map((c) => { const meta = CAP_META[c] || {}; const I = meta.icon; return <span key={c} className="mo-captag" style={meta.color ? { color: meta.color } : undefined}>{I && <I size={11} />}{c}</span>; })}</div>
                </td>
                <td className="mo-num">{fmtCtx(m.ctx)}</td>
                <td><span className="mo-hosts">{hostsOf(m).map((h) => <span key={h} className={`mo-pill ${h === "Local" ? "local" : "cloud"}`}>{h}</span>)}</span></td>
                <td><span className={`mo-cost ${isFree(m) ? "free" : "paid"}`}>{isFree(m) ? "Free" : "Paid"}</span></td>
                <td><Cap v={m.thinking} /></td>
                <td><Cap v={m.vision} /></td>
                <td className="mo-num">{m.size && m.size !== "—" ? m.size : "—"}</td>
                <td>{dl(m).open
                  ? <div className="mo-dlwrap" onClick={(e) => e.stopPropagation()}>
                      <button className="mo-dlink" title="Open weights — choose a source" onClick={(e) => { e.stopPropagation(); setDlMenu(dlMenu === m.name ? null : m.name); }}><Download size={12} /> Download <ChevronDown size={11} /></button>
                      {dlMenu === m.name && (
                        <div className="mo-dlmenu">
                          <div className="mo-dlmenu-h">Get {m.name} from</div>
                          {dl(m).targets.map((t) => (
                            <button key={t.id} className="mo-dlmenu-item" onClick={() => { openExt(t.url); setDlMenu(null); }}>
                              <Download size={13} /><span><b>{t.label}</b><span className="mo-dlmenu-note">{t.note}</span></span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  : <span className="mo-sub">API only</span>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={COLS.length} style={{ textAlign: "center", color: "var(--text-2)", padding: 24 }}>No models match your filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div className="mo-card">
            <div className="mo-card-head">
              <div>
                <div className="mo-card-title">{detail.name}{TOP.has(detail.name) && <span className="mo-pick">Top pick</span>}</div>
                <div className="mo-sub">{detail.maker}{detail.year ? " · " + detail.year : ""}</div>
              </div>
              <button className="icon-btn" onClick={() => setDetail(null)}><X size={16} /></button>
            </div>

            <div className="mo-badges">
              {detail.host === "local" && detail.vram
                ? <span className="mo-badge green">{detail.vram} GB VRAM ✓</span>
                : <span className="mo-badge blue">{detail.host === "local" ? "Local" : detail.host} {detail.host === "local" ? "" : "API"}</span>}
              {detail.ctx ? <span className="mo-badge">{fmtCtx(detail.ctx)} context</span> : null}
              {detail.size !== "—" && <span className="mo-badge">{detail.size}</span>}
              {detail.license !== "—" && <span className="mo-badge gray">{detail.license}</span>}
            </div>
            <div className="mo-badges">
              {tagsFor(detail).map((t) => <span key={t} className="mo-badge tag">{t}</span>)}
            </div>

            <p className="mo-blurb">{blurbFor(detail)}</p>

            <div className="mo-avail">
              <div className="mo-wmhead">Available on {(() => { const f = freeInfo(detail); return f.has ? <span className="mo-freetag">free endpoint available</span> : <span className="mo-paidtag">paid only</span>; })()}</div>
              <div className="mo-provs">
                {detail.providers.map((p) => (
                  <span key={p.name} className={`mo-prov ${p.tier}`}>
                    {p.name}
                    <span className="mo-prov-meta">{p.type === "local" ? "local" : "cloud"} · {p.tier === "freemium" ? "free tier" : p.tier}</span>
                  </span>
                ))}
              </div>
            </div>

            {!detail.sparse && (
              <div className="mo-wm">
                <div className="mo-wmcol">
                  <div className="mo-wmhead">Wins</div>
                  <ul>{winsFor(detail).map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
                <div className="mo-wmcol">
                  <div className="mo-wmhead">Misses</div>
                  <ul>{missesFor(detail).map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              </div>
            )}

            <div className="mo-wmhead" style={{ marginTop: 16 }}>Available for Download {dl(detail).open ? <span className="mo-freetag">open weights</span> : <span className="mo-paidtag">API only — no download</span>}</div>
            <div className="mo-dl">
              {dl(detail).open ? (
                <>
                  <button className="btn" onClick={() => openExt(dl(detail).hf)}><Download size={13} /> Hugging Face</button>
                  <button className="btn" onClick={() => openExt(dl(detail).ollama)}><Download size={13} /> Ollama</button>
                  <button className="btn" onClick={() => openExt(dl(detail).lmstudio)}><Download size={13} /> LM Studio</button>
                  <button className="btn ghost" onClick={() => copy(detail.host === "local" ? `ollama run ${detail.run}` : detail.run, "cmd")}>{copied === "cmd" ? "Copied!" : "Copy run id"}</button>
                </>
              ) : (
                <span className="mo-sub">Closed weights — available only through the {detail.host} API.</span>
              )}
            </div>
            {dl(detail).open && <pre className="mo-runcmd">{detail.host === "local" ? `ollama run ${detail.run}` : `model: ${detail.run}`}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}
