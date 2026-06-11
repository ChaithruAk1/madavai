import { useMemo, useState, useEffect, Fragment } from "react";
import { Check, X, Search, ChevronUp, ChevronDown, Download, Brain, Image as ImageIcon, ScrollText, Bot, Wrench, Scale, Gauge, Gift, Cpu, Layers, ChevronRight } from "lucide-react";
import { MODELS, CATEGORIES, freeInfo } from "../data/modelCatalog.js";
import { classifyProvider, isModelFree } from "../data/providerRules.js";
import { benchFor, AGENTIC_RANK, agenticTone, thinkingTone } from "../data/benchmarks.js";
import { classify } from "./ModelPicker.jsx";
import { localCaps } from "../data/localModels.js";
import { bridge } from "../bridge/index.js";

// Provider → domain, for real logos (served as site favicons). Unknown makers fall back to a monogram.
const MAKER_DOMAIN = {
  openai: "openai.com", anthropic: "anthropic.com", google: "google.com", "google-deepmind": "deepmind.com",
  meta: "meta.ai", "meta-llama": "meta.ai", mistralai: "mistral.ai", mistral: "mistral.ai", deepseek: "deepseek.com",
  qwen: "qwen.ai", alibaba: "alibabacloud.com", "x-ai": "x.ai", xai: "x.ai", nvidia: "nvidia.com", openrouter: "openrouter.ai",
  cohere: "cohere.com", microsoft: "microsoft.com", perplexity: "perplexity.ai", moonshotai: "moonshot.ai",
  moonshot: "moonshot.ai", stepfun: "stepfun.com", "stepfun-ai": "stepfun.com", "01-ai": "01.ai", databricks: "databricks.com",
  ai21: "ai21.com", amazon: "amazon.com", ibm: "ibm.com", "ibm-granite": "ibm.com", arcee: "arcee.ai", "arcee-ai": "arcee.ai",
  morph: "morphllm.com", kwaipilot: "kuaishou.com", allenai: "allenai.org", nous: "nousresearch.com", "nousresearch": "nousresearch.com",
  liquid: "liquid.ai", inflection: "inflection.ai", reka: "reka.ai", thudm: "z.ai", zhipu: "z.ai", baidu: "baidu.com", minimax: "minimaxi.com",
};
function MakerLogo({ maker }) {
  const [err, setErr] = useState(false);
  const key = String(maker || "").toLowerCase().trim();
  const domain = MAKER_DOMAIN[key] || MAKER_DOMAIN[key.split("/")[0]] || MAKER_DOMAIN[key.split("-")[0]];
  if (domain && !err) return <img className="mo-logo" src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt="" width={16} height={16} loading="lazy" onError={() => setErr(true)} />;
  const hue = [...key].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0) % 360;
  return <span className="mo-logo mo-logofallback" style={{ background: `hsl(${hue} 55% 55% / .2)`, color: `hsl(${hue} 70% 72%)` }}>{(key.replace(/^[~@]/, "")[0] || "?").toUpperCase()}</span>;
}

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

// Capability derivations (used for the dedicated ✓/✗ columns).
const capCoding = (m) => !!(m.coding || m.cat === "Coding") || /cod(er|e)\b|coder|codestral|devstral|deepseek-coder/i.test((m.run || m.name || "") + " " + (m.bestForFull || ""));
const capAgentic = (m) => !!(m.agentic || m.tools);

// Real price (per 1M tokens, input / output) when the provider publishes it; else Free/Paid.
const per1M = (v) => (v == null ? null : v * 1e6);
function priceLabel(m) {
  // OpenRouter returns -1 for variable/router pricing — don't render it as a giant negative number.
  if ((m.priceIn != null && m.priceIn < 0) || (m.priceOut != null && m.priceOut < 0)) return { text: "Variable", free: false };
  const pin = per1M(m.priceIn), pout = per1M(m.priceOut);
  if (pin == null && pout == null) return { text: isFree(m) ? "Free" : "Paid", free: isFree(m) };
  if ((pin || 0) === 0 && (pout || 0) === 0) return { text: "Free", free: true };
  const f = (v) => (v == null ? "?" : v >= 1 ? "$" + v.toFixed(2) : "$" + v.toFixed(v >= 0.1 ? 2 : 3));
  return { text: `${f(pin)} / ${f(pout)}`, free: false };
}
// A short, crisp "best for" — first sentence, capped.
function crisp(m) {
  let s = String(m.bestFor || "").replace(/\s+/g, " ").trim();
  if (s.length > 160) s = s.slice(0, 159).trimEnd() + "…";
  return s || "—";
}
// Design: each capability owns one accent that ONLY shows when present; absence is a quiet dash (no red noise).
const CAP_TONE = { coding: "#3ecf8e", reasoning: "#b692f6", image: "#5aa0ff", agentic: "#f0883e" };
function CapDot({ on, tone }) {
  return on
    ? <span className="cap-on" style={{ color: tone, background: tone + "22", borderColor: tone + "55" }}>✓</span>
    : <span className="cap-off">–</span>;
}
// A stable color per maker — turns the left column into a scannable anchor.
function makerColors(name) {
  const s = String(name || "?"); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return { fg: `hsl(${hue} 70% 70%)`, bg: `hsl(${hue} 60% 60% / 0.16)` };
}
const initial = (m) => String(m.maker || m.name || "?").replace(/^[~@]/, "").slice(0, 1).toUpperCase();
// Cost tier for color-coding (one calm green→amber scale).
function costTier(m) {
  const p = m.priceIn == null ? null : m.priceIn * 1e6;
  if (isFree(m) || p === 0) return "free";
  if (p == null) return "paid";
  if (p <= 1) return "low"; if (p <= 5) return "mid"; return "high";
}
// Curated benchmark + qualitative behaviour (falls back to derived flags when not in the curated set).
const sweFor = (m) => { const b = benchFor(m.run || m.name); return b ? b.swe : "—"; };
const humanFor = (m) => { const b = benchFor(m.run || m.name); return b ? b.humaneval : "—"; };
const agenticLabel = (m) => { const b = benchFor(m.run || m.name); if (b) return b.agentic; return capAgentic(m) ? "Yes" : "—"; };
const thinkingLabel = (m) => { const b = benchFor(m.run || m.name); if (b) return b.thinking; return m.thinking === true ? "Always-on" : m.thinking === "toggle" ? "Toggle" : "—"; };
const pctNum = (s) => { const n = parseFloat(String(s || "").replace(/[~%]/g, "")); return isNaN(n) ? -1 : n; };
const relTime = (unixSec) => { if (!unixSec) return ""; const days = Math.floor((Date.now() - unixSec * 1000) / 864e5); if (days < 1) return "today"; if (days < 30) return days + "d ago"; if (days < 365) return Math.floor(days / 30) + "mo ago"; return (days / 365).toFixed(1) + "y ago"; };
const THINK_RANK = { "Always-on": 2, "Toggle": 1, "No": 0, "—": -1 };


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

// Flat, combinable filter chips. Each is a predicate; multiple active = AND.
const FILTERS = [
  { key: "local", label: "Local", test: (m) => hostLabel(m) !== "Cloud" },
  { key: "cloud", label: "Cloud", test: (m) => hostLabel(m) !== "Local" },
  { key: "free", label: "Free", test: (m) => isFree(m) },
  { key: "agentic", label: "Agentic", test: (m) => capAgentic(m) },
  { key: "coding", label: "Coding", test: (m) => capCoding(m) },
  { key: "image", label: "Image", test: (m) => !!m.vision },
  { key: "reasoning", label: "Reasoning", test: (m) => !!m.thinking },
  { key: "fast", label: "Fast", test: (m) => /flash|mini|lite|haiku|tiny|small|turbo|nano/i.test(m.run || m.name || "") || (sizeNum(m.size) > 0 && sizeNum(m.size) <= 9) },
  { key: "general", label: "General", test: (m) => (m.cat || "") === "General" },
  { key: "open", label: "Open-weight", test: (m) => dl(m).open },
];

// Tiny in-cell meter — turns numbers into instantly comparable visuals.
function Meter({ pct, tone = "var(--accent)" }) {
  if (pct == null || pct < 0) return null;
  return <span className="mo-meter"><span style={{ width: Math.max(2, Math.min(100, pct)) + "%", background: tone }} /></span>;
}
const ctxPct = (k) => (!k ? -1 : Math.min(100, (Math.log10(k) / 4) * 100)); // log scale: 10K→25%, 10M→100%

export default function ModelsOverview({ activeModel }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(() => new Set()); // active filter keys (AND-combined)
  const [sortKey, setSortKey] = useState("ctx");
  const [dir, setDir] = useState("desc");
  const [detail, setDetail] = useState(null);
  const [copied, setCopied] = useState("");
  const [cfg, setCfg] = useState(null);
  const [orCat, setOrCat] = useState(null);
  const [dlMenu, setDlMenu] = useState(null); // model name whose download-source chooser is open
  const [speedMap, setSpeedMap] = useState({}); // measured tokens/sec from the Speed Check, by model id
  const [harnessMap, setHarnessMap] = useState({}); // measured tool discipline (agent missions), by model id
  const [expanded, setExpanded] = useState(null); // row name expanded inline (learn without leaving the screen)
  const [cmp, setCmp] = useState(() => new Set()); // models picked for side-by-side compare (max 4)
  const [cmpOpen, setCmpOpen] = useState(false);
  const toggleCmp = (name) => setCmp((s) => { const n = new Set(s); if (n.has(name)) n.delete(name); else if (n.size < 4) n.add(name); return n; });
  const copy = (text, label) => { try { navigator.clipboard.writeText(text); setCopied(label); setTimeout(() => setCopied(""), 1400); } catch {} };

  // Pull measured speeds from the last Speed Check run (real tokens/sec where the user has tested).
  useEffect(() => { bridge.getSpeedTestLast?.().then((r) => {
    if (!r || !r.results) return; const map = {};
    for (const x of r.results) { if (x && x.model && x.ok && x.tps) map[norm(x.model)] = x.tps; }
    setSpeedMap(map);
  }).catch(() => {}); }, []);

  // Pull measured harness stats (tool discipline from real agent missions, desktop engine).
  useEffect(() => { bridge.getModelStats?.().then((m) => setHarnessMap(m || {})).catch(() => {}); }, []);
  const harnessFor = (m) => harnessMap[m.run] || harnessMap[norm(m.run)] || null;
  const harnessText = (m) => {
    const h = harnessFor(m);
    if (!h) return "not measured";
    if (h.score == null) return `measuring… (${h.toolCalls || 0} calls)`;
    return `${h.score}/10 · ${h.toolCalls || 0} calls`;
  };

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
        // Attach real pricing + capabilities from the OpenRouter catalog (works for matched & sparse rows).
        if (orm) {
          if (orm.priceIn != null) entry.priceIn = orm.priceIn;
          if (orm.priceOut != null) entry.priceOut = orm.priceOut;
          if (orm.tools) entry.tools = true;
          if (orm.image) entry.vision = true;
          if (orm.reasoning) entry.thinking = true;
          if (orm.created) entry.created = orm.created;
          if (orm.ctx && !entry.ctx) entry.ctx = orm.ctx;
        }
        // Local providers publish no capability metadata — OR-in the curated family
        // registry (localModels.js) so local models get their real coding/reasoning/
        // vision/agentic columns. Only ever ADDS capabilities, never removes.
        if (isLocal) {
          const lc = localCaps(id);
          if (lc) {
            if (lc.tools) entry.tools = true;       // capAgentic reads m.tools
            if (lc.coding) entry.coding = true;     // capCoding reads m.coding
            if (lc.vision) entry.vision = true;
            if (lc.reasoning && !entry.thinking) entry.thinking = true; // keep "toggle" if set
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
  const speedVal = (m) => speedMap[norm(m.run)] ?? speedMap[norm(m.name)] ?? null;
  const maxSpeed = useMemo(() => Math.max(1, ...Object.values(speedMap)), [speedMap]);

  // Insight band — live stats that are also one-click filters. The dashboard answers
  // "what do I have?" before the user reads a single row.
  const stats = useMemo(() => ({
    total: allModels.length,
    free: allModels.filter((m) => isFree(m)).length,
    agentic: allModels.filter((m) => capAgentic(m)).length,
    open: allModels.filter((m) => dl(m).open).length,
    tested: allModels.filter((m) => speedVal(m) != null).length,
  }), [allModels, speedMap]); // eslint-disable-line react-hooks/exhaustive-deps

  const COLS = [
    { key: "name", label: "Model", sort: (m) => m.name },
    { key: "bestFor", label: "Best for", sort: (m) => m.bestFor },
    { key: "ctx", label: "Context", hint: "Maximum context window", sort: (m) => m.ctx },
    { key: "cost", label: "Cost · $/1M", hint: "Price per 1M tokens (input / output).", sort: (m) => (m.priceIn != null ? m.priceIn : (isFree(m) ? -1 : 9e9)) },
    { key: "swe", label: "SWE-bench", hint: "SWE-bench Verified — approximate, curated for well-known models.", sort: (m) => pctNum(sweFor(m)) },
    { key: "humaneval", label: "HumanEval", hint: "HumanEval pass@1 — approximate, curated for well-known models.", sort: (m) => pctNum(humanFor(m)) },
    { key: "speed", label: "Speed", hint: "Measured tokens/sec from your Speed Check. Run a speed test to fill this in.", sort: (m) => (speedVal(m) ?? -1) },
    { key: "coding", label: "Coding", hint: "Strong at writing/editing code", sort: (m) => Number(capCoding(m)) },
    { key: "thinking", label: "Thinking", hint: "Reasoning mode: Always-on, Toggle, or none.", sort: (m) => (THINK_RANK[thinkingLabel(m)] ?? -1) },
    { key: "vision", label: "Image", hint: "Accepts image input", sort: (m) => Number(!!m.vision) },
    { key: "agentic", label: "Agentic", hint: "Tool-calling / agent capability.", sort: (m) => (AGENTIC_RANK[agenticLabel(m)] ?? -1) },
    { key: "host", label: "Host", sort: (m) => hostLabel(m) },
    { key: "size", label: "Params", hint: "Parameter count. Blank when the provider doesn't publish it.", sort: (m) => sizeNum(m.size) },
    { key: "download", label: "Download", hint: "Open-weight models you can download and run locally", sort: (m) => (dl(m).open ? 0 : 1) },
  ];

  const rows = useMemo(() => {
    let r = allModels.filter((m) => {
      for (const key of active) { const f = FILTERS.find((x) => x.key === key); if (f && !f.test(m)) return false; }
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
  }, [allModels, q, active, sortKey, dir, speedMap]);

  const setSort = (key) => { if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc")); else { setSortKey(key); setDir(key === "ctx" || key === "vram" ? "desc" : "asc"); } };
  const toggle = (key) => setActive((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const noFilters = active.size === 0;
  const resetFilters = () => setActive(new Set());

  return (
    <div className="mo scroll">
      <div className="mo-head">
        <div>
          <h2 style={{ margin: 0, fontSize: 18 }}>Models overview</h2>
          <p style={{ color: "var(--text-2)", fontSize: 12, margin: "4px 0 0" }}>
            Models loaded on your configured providers (same as the top-bar selector). {rows.length} of {allModels.length} shown.
          </p>
          <p style={{ color: "var(--text-3)", fontSize: 11, margin: "3px 0 0" }}>
            SWE‑bench &amp; HumanEval are approximate, curated figures for well‑known models (others show —). Speed is your measured tokens/sec from the Speed Check.
          </p>
        </div>
      </div>

      {/* Insight band — every tile is a live stat AND a one-click filter */}
      <div className="mo-tiles">
        {[
          { k: "total", n: stats.total, label: "Models loaded", icon: Layers, act: resetFilters, on: noFilters },
          { k: "free", n: stats.free, label: "Free to use", icon: Gift, act: () => toggle("free"), on: active.has("free") },
          { k: "agentic", n: stats.agentic, label: "Agent-ready", icon: Bot, act: () => toggle("agentic"), on: active.has("agentic") },
          { k: "open", n: stats.open, label: "Open-weight", icon: Download, act: () => toggle("open"), on: active.has("open") },
          { k: "tested", n: stats.tested, label: "Speed-tested by you", icon: Gauge, act: () => { setSortKey("speed"); setDir("desc"); }, on: sortKey === "speed" },
        ].map((t) => { const I = t.icon; return (
          <button key={t.k} className={`mo-tile ${t.on ? "on" : ""}`} onClick={t.act} title={t.k === "tested" ? "Sort by your measured speed" : "Click to filter"}>
            <span className="mo-tile-ico"><I size={15} /></span>
            <span className="mo-tile-n">{t.n}</span>
            <span className="mo-tile-k">{t.label}</span>
          </button>
        ); })}
      </div>

      <div className="mo-filters">
        <div className="mo-search">
          <Search size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search models…" />
        </div>
        <div className="mo-chips">
          {/* "All" is a master reset; it highlights only when nothing is filtered. */}
          <button className={`mo-chip ${noFilters ? "on" : ""}`} onClick={resetFilters}>All</button>
          {FILTERS.map((f) => (
            <button key={f.key} className={`mo-chip ${active.has(f.key) ? "on" : ""}`} onClick={() => toggle(f.key)}>{f.label}</button>
          ))}
        </div>
      </div>

      <div className="mo-tablewrap">
        <table className="mo-table">
          <thead>
            <tr>
              <th title="Pick up to 4 models to compare side by side"><Scale size={13} /></th>
              {COLS.map((c) => (
                <th key={c.key} onClick={() => setSort(c.key)} className={sortKey === c.key ? "sorted" : ""} title={c.hint || ""}>
                  <span>{c.label}</span>
                  {sortKey === c.key && (dir === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <Fragment key={m.name}>
              <tr className={`${isActive(m) ? "active" : ""} ${expanded === m.name ? "expanded" : ""}`} onClick={() => setExpanded(expanded === m.name ? null : m.name)} style={{ cursor: "pointer" }}>
                <td onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="mo-cmpck" title="Compare" checked={cmp.has(m.name)} disabled={!cmp.has(m.name) && cmp.size >= 4} onChange={() => toggleCmp(m.name)} />
                </td>
                <td><div className="mo-name"><ChevronRight size={12} className={`mo-caret ${expanded === m.name ? "open" : ""}`} />{m.name}{isActive(m) && <span className="mo-activebadge">active</span>}</div><div className="mo-sub"><MakerLogo maker={m.maker} /> {m.maker}{m.year ? " · " + m.year : ""}</div></td>
                <td><div className="mo-best">{m.bestForFull || m.bestFor}</div></td>
                <td className="mo-num" title={m.ctx ? fmtCtx(m.ctx) + " tokens" : ""}>{fmtCtx(m.ctx)}<Meter pct={ctxPct(m.ctx)} tone="#5aa0ff" /></td>
                <td>{(() => { const p = priceLabel(m); return <span className={`mo-cost tier-${costTier(m)}`} title={p.free ? "Free to use" : "Per 1M tokens — input / output"}>{p.text}</span>; })()}</td>
                <td className="mo-num">{sweFor(m)}<Meter pct={pctNum(sweFor(m))} tone="#3ecf8e" /></td>
                <td className="mo-num">{humanFor(m)}<Meter pct={pctNum(humanFor(m))} tone="#b692f6" /></td>
                <td className="mo-num" title={speedVal(m) != null ? "measured" : "run a Speed Check to measure"}>{speedVal(m) != null ? speedVal(m) + " t/s" : "—"}{speedVal(m) != null && <Meter pct={(speedVal(m) / maxSpeed) * 100} tone="var(--accent)" />}</td>
                <td><Cap v={capCoding(m)} /></td>
                <td><span className="mo-qual" style={{ color: thinkingTone(thinkingLabel(m)) }}>{thinkingLabel(m)}</span></td>
                <td><Cap v={m.vision} /></td>
                <td><span className="mo-qual" style={{ color: agenticTone(agenticLabel(m)) }}>{agenticLabel(m)}</span></td>
                <td><span className="mo-hosts">{hostsOf(m).map((h) => <span key={h} className={`mo-pill ${h === "Local" ? "local" : "cloud"}`}>{h}</span>)}</span></td>
                <td className="mo-num" title={m.size && m.size !== "—" ? "" : "Provider doesn't publish a parameter count"}>{m.size && m.size !== "—" ? m.size : "—"}</td>
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
              {expanded === m.name && (
                <tr className="mo-exp">
                  <td colSpan={COLS.length + 1}>
                    <div className="mo-exp-grid">
                      <div className="mo-exp-main">
                        <div className="mo-exp-desc">{m.bestForFull || blurbFor(m)}</div>
                        {!m.sparse && (
                          <div className="mo-exp-wm">
                            {winsFor(m).map((w, i) => <span key={"w" + i} className="mo-exp-chip win"><Check size={11} /> {w}</span>)}
                            {missesFor(m).map((w, i) => <span key={"m" + i} className="mo-exp-chip miss"><X size={11} /> {w}</span>)}
                          </div>
                        )}
                        <div className="mo-exp-acts">
                          <button className="btn ghost" onClick={(e) => { e.stopPropagation(); setDetail(m); }}>Full details</button>
                          <button className="btn ghost" onClick={(e) => { e.stopPropagation(); copy(m.run, m.name); }}>{copied === m.name ? "Copied ✓" : "Copy model id"}</button>
                          {dl(m).open && dl(m).targets.map((t) => (
                            <button key={t.id} className="btn ghost" onClick={(e) => { e.stopPropagation(); openExt(t.url); }}><Download size={12} /> {t.label}</button>
                          ))}
                          <button className="btn ghost" disabled={!cmp.has(m.name) && cmp.size >= 4} onClick={(e) => { e.stopPropagation(); toggleCmp(m.name); }}><Scale size={12} /> {cmp.has(m.name) ? "Remove from compare" : "Add to compare"}</button>
                        </div>
                      </div>
                      <div className="mo-exp-side">
                        {[["Context", fmtCtx(m.ctx), ctxPct(m.ctx), "#5aa0ff"], ["SWE-bench", sweFor(m), pctNum(sweFor(m)), "#3ecf8e"], ["HumanEval", humanFor(m), pctNum(humanFor(m)), "#b692f6"], ["Your speed", speedVal(m) != null ? speedVal(m) + " t/s" : "not tested", speedVal(m) != null ? (speedVal(m) / maxSpeed) * 100 : -1, "var(--accent)"]].map(([k, v, pct, tone]) => (
                          <div key={k} className="mo-exp-stat"><span className="mo-exp-k">{k}</span><span className="mo-exp-v">{v}</span><Meter pct={pct} tone={tone} /></div>
                        ))}
                        <div className="mo-exp-stat"><span className="mo-exp-k">Thinking</span><span className="mo-exp-v" style={{ color: thinkingTone(thinkingLabel(m)) }}>{thinkingLabel(m)}</span></div>
                        <div className="mo-exp-stat"><span className="mo-exp-k">Agentic</span><span className="mo-exp-v" style={{ color: agenticTone(agenticLabel(m)) }}>{agenticLabel(m)}</span></div>
                        <div className="mo-exp-stat" title="Measured tool discipline from your real agent missions: JSON accuracy, retries, failures, finished vs stalled. Builds up as you use agents on this model.">
                          <span className="mo-exp-k">Harness</span>
                          <span className="mo-exp-v">{harnessText(m)}</span>
                          <Meter pct={harnessFor(m) && harnessFor(m).score != null ? harnessFor(m).score * 10 : -1} tone="#f5a623" />
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={COLS.length + 1} style={{ textAlign: "center", color: "var(--text-2)", padding: 24 }}>No models match your filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Floating compare bar — appears once 2+ models are picked */}
      {cmp.size >= 2 && !cmpOpen && (
        <div className="mo-cmpbar">
          <Scale size={14} /> {cmp.size} models selected
          <button className="btn primary" onClick={() => setCmpOpen(true)}>Compare side by side</button>
          <button className="btn ghost" onClick={() => setCmp(new Set())}>Clear</button>
        </div>
      )}

      {/* Side-by-side comparison — the best value in each row is highlighted */}
      {cmpOpen && (() => {
        const picks = allModels.filter((m) => cmp.has(m.name)).slice(0, 4);
        const metrics = [
          { k: "Context", v: (m) => fmtCtx(m.ctx), n: (m) => m.ctx || -1, best: "max" },
          { k: "Cost · $/1M", v: (m) => priceLabel(m).text, n: (m) => (isFree(m) ? 0 : (m.priceIn != null && m.priceIn >= 0 ? m.priceIn : 9e9)), best: "min" },
          { k: "SWE-bench", v: (m) => sweFor(m), n: (m) => pctNum(sweFor(m)), best: "max" },
          { k: "HumanEval", v: (m) => humanFor(m), n: (m) => pctNum(humanFor(m)), best: "max" },
          { k: "Your speed", v: (m) => (speedVal(m) != null ? speedVal(m) + " t/s" : "—"), n: (m) => speedVal(m) ?? -1, best: "max" },
          { k: "Thinking", v: (m) => thinkingLabel(m), n: () => null },
          { k: "Agentic", v: (m) => agenticLabel(m), n: () => null },
          { k: "Host", v: (m) => hostLabel(m), n: () => null },
          { k: "Params", v: (m) => (m.size && m.size !== "—" ? m.size : "—"), n: (m) => sizeNum(m.size), best: "max" },
          { k: "License", v: (m) => m.license || "—", n: () => null },
        ];
        const bestIdx = (met) => {
          if (!met.best) return -1;
          const vals = picks.map((m) => met.n(m));
          if (vals.every((x) => x == null || x < 0 || x === 9e9)) return -1;
          let bi = -1, bv = met.best === "max" ? -Infinity : Infinity;
          vals.forEach((x, i) => { if (x == null || x < 0) return; if (met.best === "max" ? x > bv : x < bv) { bv = x; bi = i; } });
          return bi;
        };
        return (
          <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setCmpOpen(false); }}>
            <div className="mo-cmpcard">
              <div className="mo-card-head">
                <div className="mo-card-title"><Scale size={16} /> Compare models</div>
                <button className="icon-btn" onClick={() => setCmpOpen(false)}><X size={16} /></button>
              </div>
              <div className="mo-cmpwrap">
                <table className="mo-cmptable">
                  <thead><tr><th></th>{picks.map((m) => (
                    <th key={m.name}><div className="mo-name" style={{ fontSize: 13 }}>{m.name}</div><div className="mo-sub"><MakerLogo maker={m.maker} /> {m.maker}</div></th>
                  ))}</tr></thead>
                  <tbody>
                    {metrics.map((met) => { const bi = bestIdx(met); return (
                      <tr key={met.k}><td className="mo-cmpk">{met.k}</td>
                        {picks.map((m, i) => <td key={m.name} className={i === bi ? "best" : ""}>{met.v(m)}{i === bi && <span className="mo-cmpbest">best</span>}</td>)}
                      </tr>
                    ); })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}

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
              {detail.created && <span className="mo-badge gray">released {relTime(detail.created)}</span>}
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
