import { useEffect, useState, useRef } from "react";
import { Zap, Play, Square, AlertCircle, Search, Gauge, Timer, Clock, DollarSign, CheckCircle2, Award, Boxes, PanelLeftClose, PanelLeftOpen, Code2, Brain, Wrench, Image, ChevronDown, ChevronRight, GripVertical, EyeOff, Plus, RotateCcw, Maximize2, X, Info, ListChecks, Braces, ShieldCheck, Wallet } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { MODELS } from "../data/modelCatalog.js";
import { classifyProvider, isModelFree } from "../data/providerRules.js";

// Quiz PROMPTS only — used to ask each model the questions. The ANSWER KEY + scoring live on the
// server (server/quiz.mjs via POST /score-quiz), so this app never ships them. `cat` stays for grouping.
const QUIZ = [
  { id: "math", cat: "reasoning", prompt: "What is 17 multiplied by 23? Reply with only the number." },
  { id: "reason", cat: "reasoning", prompt: "A train travels 90 km in 1.5 hours at constant speed. What is its speed in km/h? Reply with only the number." },
  { id: "reason_machines", cat: "reasoning", prompt: "If 3 machines make 3 widgets in 3 minutes, how many minutes do 100 machines need to make 100 widgets? Reply with only the number." },
  { id: "reason_batball", cat: "reasoning", prompt: "A bat and a ball cost $1.10 together. The bat costs $1.00 more than the ball. How many cents does the ball cost? Reply with only the number." },
  { id: "capital", cat: "knowledge", prompt: "What is the capital city of Japan? Reply with only the city name." },
  { id: "format", cat: "instruction", prompt: "Reply with exactly this word in all capital letters and nothing else: banana" },
  { id: "inst_jsononly", cat: "instruction", prompt: 'Reply with ONLY valid JSON and nothing else — no markdown, no explanation: {"status":"ok"}' },
  { id: "extract_person", cat: "extract", prompt: 'Extract the name and age from this text into JSON. Text: "Maya Rodriguez, a 34-year-old engineer, joined in 2019." Reply with ONLY: {"name":"Maya Rodriguez","age":34}' },
  { id: "extract_total", cat: "extract", prompt: 'From "Apples: 3, Pears: 5, Plums: 2", reply with ONLY the JSON total of all items: {"total":10}' },
  { id: "honesty_country", cat: "honesty", prompt: "What is the capital city of the country Zembudia? If you do not know or it is not a real country, reply with only the single word: UNKNOWN" },
  { id: "honesty_premise", cat: "honesty", prompt: "In which year did Albert Einstein win the Nobel Prize specifically for the theory of general relativity? If the premise is false, reply with only the single word: NONE" },
  { id: "code_fib", cat: "coding", prompt: "What does this Python print?\n\ndef f(n):\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a\nprint(f(10))\n\nReply with only the number." },
  { id: "code_count", cat: "coding", prompt: "What is the output of this Python?\n\nprint(len([x for x in range(50) if x % 3 == 0 or x % 5 == 0]))\n\nReply with only the number." },
  { id: "code_str", cat: "coding", prompt: "What does this Python print?\n\ns = 'banana'\nprint(s.replace('a', 'o').upper())\n\nReply with only the resulting text." },
  { id: "code_digits", cat: "coding", prompt: "What does this Python print?\n\nprint(sum(int(d) for d in str(2 ** 10)))\n\nReply with only the number." },
  { id: "agent_tool", cat: "agentic", prompt: 'You can call a tool get_weather(city). The user asks for the weather in Paris. Reply with ONLY this JSON and nothing else: {"tool":"get_weather","args":{"city":"Paris"}}' },
  { id: "agent_steps", cat: "agentic", prompt: "Follow these steps in order and reply with only the final number. Start with 3. Multiply by 4. Add 10. Divide by 2." },
  { id: "agent_json", cat: "agentic", prompt: 'From the list [3, 4, 7, 8], reply with ONLY this JSON and nothing else, containing the even numbers in order: {"evens":[4,8]}' },
  { id: "agent_fmt", cat: "agentic", prompt: "Reply with exactly three uppercase words separated by single spaces, in this order, nothing else: RED GREEN BLUE" },
];

// Turn a raw provider error into a short, plain-language explanation.
function friendlyError(raw) {
  const s = String(raw || "");
  let msg = s;
  try { const m = s.match(/\{[\s\S]*\}/); if (m) { const o = JSON.parse(m[0]); msg = (o.error && (o.error.message || o.error)) || o.message || msg; } } catch {}
  const code = (s.match(/\b(40\d|41\d|429|50\d)\b/) || [])[1];
  const low = s.toLowerCase();
  if (low.includes("cancel")) return "Cancelled.";
  if (low.includes("timeout") || low.includes("etimedout")) return "Timed out reaching the provider.";
  if (low.includes("fetch failed") || low.includes("network") || low.includes("enotfound") || low.includes("econnrefused")) return "Couldn’t reach the provider (network).";
  if (code === "401" || low.includes("unauthor") || low.includes("invalid api key") || low.includes("no auth")) return "Invalid or missing API key for this provider.";
  if (code === "402" || low.includes("balance") || low.includes("insufficient") || low.includes("credit") || low.includes("payment required")) return "Out of credit — add billing/credit on this provider.";
  if (code === "403" || low.includes("forbidden") || low.includes("not allowed") || low.includes("permission")) return "Your key isn’t allowed to use this model.";
  if (code === "404" || low.includes("no endpoints") || low.includes("not found") || low.includes("does not exist")) return "Model not available on this provider right now.";
  if (code === "429" || low.includes("rate limit") || low.includes("rate-limit") || low.includes("quota") || low.includes("too many")) return "Rate-limited / quota reached — try again shortly.";
  if (low.includes("context") && low.includes("length")) return "Prompt is too long for this model’s context.";
  if (code && code[0] === "5") return "Provider server error — try again later.";
  return (typeof msg === "string" ? msg : JSON.stringify(msg)).replace(/\s+/g, " ").trim().slice(0, 120) || "Unknown error.";
}

const CAPS = [
  { key: "coding", scoreKey: "coding", label: "Coding", icon: Code2 },
  { key: "reasoning", scoreKey: "reasoning", label: "Reasoning", icon: Brain },
  { key: "agentic", scoreKey: "agentic", label: "Agentic / tools", icon: Wrench },
  { key: "instruction", scoreKey: "instruction", label: "Instruction following", icon: ListChecks },
  { key: "extract", scoreKey: "extract", label: "Structured extraction", icon: Braces },
  { key: "honesty", scoreKey: "honesty", label: "Honesty", icon: ShieldCheck },
  { key: "vision", scoreKey: null, label: "Image / vision", icon: Image },
];

// "Best value" — reuses measured quality + known cost (no extra prompts): quality per dollar.
function ValuePanel({ ok }) {
  const rows = ok.filter((r) => r.qPct != null && r.estCost != null && r.estCost > 0)
    .map((r) => ({ r, val: r.qPct / r.estCost })).sort((a, b) => b.val - a.val).slice(0, 5);
  return (
    <div className="cap">
      <div className="cap-h"><Wallet size={13} /> Best value <span className="cap-sub">quality ÷ cost</span></div>
      {rows.length === 0
        ? <div className="cap-empty">Needs both a measured quality score and a known price.</div>
        : <ol className="cap-list">{rows.map(({ r }) => <li key={r.label} title={`${r.qPct}% quality · ${fmtUsd(r.estCost)}/run · ${r.tps} tok/s · ${r.provider}`}><span className="cap-n">{r.name}</span><span className="cap-v">{r.qPct}% · {fmtUsd(r.estCost)}</span></li>)}</ol>}
    </div>
  );
}

// Top-5 models for a capability: ranked by MEASURED score when quality scoring is on,
// otherwise by catalog tag + speed.
function CapPanel({ cap, ok }) {
  const I = cap.icon;
  const scored = cap.scoreKey && ok.some((r) => r.scores && r.scores[cap.scoreKey] != null);
  const nTests = cap.scoreKey ? QUIZ.filter((q) => q.cat === cap.scoreKey).length : 0;
  let rows, fmt, tip, sub;
  if (scored) {
    // Rank by capability score, then break ties by overall quality, then speed.
    rows = ok.filter((r) => r.scores && r.scores[cap.scoreKey] != null)
      .sort((a, b) => (b.scores[cap.scoreKey] - a.scores[cap.scoreKey]) || ((b.qPct || 0) - (a.qPct || 0)) || (b.tps - a.tps)).slice(0, 5);
    fmt = (r) => r.scores[cap.scoreKey] + "%";
    tip = (r) => `${(r.scores.counts && r.scores.counts[cap.scoreKey]) || ""} correct · overall quality ${r.qPct}% · ${r.tps} tok/s · ${r.provider}`;
    sub = `${nTests} tests`;
  } else {
    rows = ok.filter((r) => r.caps && r.caps[cap.key]).sort((a, b) => b.tps - a.tps).slice(0, 5);
    fmt = (r) => r.tps + " tok/s";
    tip = (r) => `tagged from catalog · ${r.tps} tok/s · ${r.provider}`;
    sub = "tagged";
  }
  return (
    <div className="cap">
      <div className="cap-h"><I size={13} /> {cap.label} <span className="cap-sub">{sub}</span></div>
      {rows.length === 0
        ? <div className="cap-empty">{cap.scoreKey ? `Turn on “score answer quality” to rank by tested ${cap.label.toLowerCase()}.` : `No tested model is tagged ${cap.label.toLowerCase()}.`}</div>
        : <ol className="cap-list">{rows.map((r) => <li key={r.label} title={tip(r)}><span className="cap-n">{r.name}</span><span className="cap-v">{fmt(r)}</span></li>)}</ol>}
    </div>
  );
}

const fmtCtx = (k) => (!k ? "—" : k >= 1000 ? (k / 1000) + "M" : k + "K");
const fmtUsd = (v) => (v == null ? "—" : v < 0.01 ? "$" + v.toFixed(4) : "$" + v.toFixed(3));

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const PRESETS = [
  { label: "Short", text: "Write a haiku about the ocean." },
  { label: "Medium", text: "In about 150 words, explain what makes a good API design." },
  { label: "Long", text: "Write ~300 words explaining how large language models generate text, step by step, for a smart beginner." },
  { label: "Code", text: "Write a Python function that returns the nth Fibonacci number iteratively, with a docstring." },
];

// Map a catalog provider name to one of the user's configured profiles (cloud + local).
function matchProfile(profiles, providerName) {
  const hints = {
    "Anthropic": (p) => p.kind === "anthropic",
    "OpenAI": (p) => /openai\.com/i.test(p.baseUrl),
    "OpenRouter": (p) => /openrouter/i.test(p.baseUrl),
    "Google AI Studio": (p) => /generativelanguage|googleapis/i.test(p.baseUrl),
    "DeepSeek API": (p) => /deepseek/i.test(p.baseUrl),
    "NVIDIA NIM": (p) => /nvidia/i.test(p.baseUrl),
    "Mistral API": (p) => /mistral/i.test(p.baseUrl),
    "Cohere": (p) => /cohere/i.test(p.baseUrl),
    "xAI": (p) => /x\.ai|xai/i.test(p.baseUrl),
    "Ollama": (p) => /11434|ollama/i.test(p.baseUrl),
    "LM Studio": (p) => /1234/i.test(p.baseUrl) || /lm ?studio/i.test(p.name),
    "llama.cpp": (p) => /8080|llama\.?cpp/i.test(p.baseUrl) || /llama\.?cpp/i.test(p.name),
  };
  const h = hints[providerName];
  return h ? profiles.find(h) : null;
}
// Cloud only. Pick the first provider the user can actually authenticate, and resolve a
// model id the provider will accept (OpenRouter needs its namespaced id from the loaded list).
function resolve(m, profiles, cfg) {
  for (const pn of m.providers.map((x) => x.name)) {
    const prof = matchProfile(profiles, pn);
    if (!prof) continue;
    const keyed = !!(prof.apiKey || "").trim();
    const sub = prof.kind === "anthropic" && cfg.anthropicUseSubscription;
    if (!(keyed || sub)) continue; // cloud needs a key (or Claude subscription)
    const cm = prof.cachedModels || [];
    const want = norm(m.run), wantName = norm(m.name);
    const id = cm.find((x) => { const nx = norm(x); return nx.includes(want) || want.includes(nx) || nx.includes(wantName); });
    const isOR = /openrouter/i.test(prof.baseUrl);
    if (!id) {
      if (isOR) continue;            // bare catalog id won't work on OpenRouter → "Save & load models" first
      return { profileId: prof.id, modelId: m.run, provider: prof.name }; // native APIs accept the bare id
    }
    return { profileId: prof.id, modelId: id, provider: prof.name };
  }
  return null;
}
// Resolve the same model on a specific fallback provider (needs a keyed provider + a cached id match).
function resolveVia(m, profiles, providerNames) {
  for (const pn of providerNames) {
    const prof = profiles.find((p) => matchProfile([p], pn));
    if (!prof || !(prof.apiKey || "").trim()) continue;
    const cm = prof.cachedModels || [];
    const want = norm(m.run), wantName = norm(m.name);
    const id = cm.find((x) => { const nx = norm(x); return nx.includes(want) || want.includes(nx) || nx.includes(wantName); });
    if (id) return { profileId: prof.id, modelId: id, provider: prof.name };
  }
  return null;
}

export default function ModelSpeedCheck() {
  const [cfg, setCfg] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [prompt, setPrompt] = useState(PRESETS[1].text);
  const [q, setQ] = useState("");
  const [showUnavail, setShowUnavail] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [orCat, setOrCat] = useState(null);
  const [quality, setQuality] = useState(true); // score coding/reasoning/agentic by default
  const [paneOpen, setPaneOpen] = useState(true);
  const [failOpen, setFailOpen] = useState(false);
  const [kpiLayout, setKpiLayout] = useState(() => { try { return JSON.parse(localStorage.getItem("brainedge.speedKpiLayout.v1")) || null; } catch { return null; } });
  const dragKpi = useRef(null);
  const [zoom, setZoom] = useState(null); // {kind:"kpi"|"scatter", ...}
  const [tier, setTier] = useState("all"); // all | free | paid
  const [host, setHost] = useState("all"); // all | cloud | local
  const [provFilter, setProvFilter] = useState("all"); // provider name filter
  const [infoOpen, setInfoOpen] = useState(false);

  const pollRef = useRef(null);
  const stopPoll = () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // Drive the UI from the main-process run status, so the test keeps going (and
  // results still appear) even if you leave this view and come back.
  const startPoll = () => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      const s = await bridge.getSpeedTestStatus?.().catch(() => null);
      const r = await bridge.getSpeedTestLast().catch(() => null);
      if (r) setResult(r);            // show results as they stream in (partial while running)
      if (!s || !s.running) { stopPoll(); setRunning(false); }
    }, 1200);
  };

  useEffect(() => {
    let alive = true;
    bridge.getSettings().then(setCfg);
    bridge.getSpeedTestLast().then((r) => { if (alive && r) setResult(r); });
    bridge.getSpeedTestStatus?.().then((s) => { if (alive && s && s.running) { setRunning(true); startPoll(); } });
    bridge.getOpenRouterCatalog?.().then((c) => { if (alive) setOrCat(c); }).catch(() => {});
    return () => { alive = false; stopPoll(); };
  }, []);

  const profiles = cfg ? Object.values(cfg.profiles) : [];
  // Every model loaded on a configured provider (cloud or local), same source as the top-bar selector.
  const all = [];
  if (cfg) {
    for (const p of profiles) {
      // Provider classification is data-driven (src/data/providerRules.js) so it covers every
      // current provider and any new one the user adds later — extend that file, not this loop.
      const cls = classifyProvider(p);
      const isLocal = cls.host === "local";
      const auth = !!(p.apiKey || "").trim();
      const testable = auth || isLocal; // local endpoints (Ollama/LM Studio) don't need a key
      const ids = (p.cachedModels && p.cachedModels.length) ? p.cachedModels : (p.model ? [p.model] : []);
      for (const id of ids) {
        const k = norm(id);
        const match = MODELS.find((mm) => { const r = norm(mm.run), n = norm(mm.name); return k === r || (r && (k.includes(r) || r.includes(k))) || (n && k.includes(n)); });
        const orm = orCat && orCat[id];
        const free = isModelFree({ profile: p, modelId: id, orFree: orm ? !!orm.free : null });
        all.push({ key: p.id + "::" + id, name: match ? match.name : id, maker: match ? match.maker : p.name, provider: p.name, free, host: cls.host, spec: testable ? { profileId: p.id, modelId: id, provider: p.name } : null });
      }
    }
  }
  const testableAll = all.filter((e) => e.spec);
  const providerList = [...new Set(all.map((e) => e.provider))].sort();
  const filtered = all.filter((e) => {
    if (!showUnavail && !e.spec) return false;
    if (provFilter !== "all" && e.provider !== provFilter) return false;
    if (host !== "all" && (e.host || "cloud") !== host) return false;
    if (tier === "free" && e.free !== true) return false;       // only confirmed-free
    if (tier === "paid" && e.free === true) return false;       // everything not confirmed-free
    if (q) { const t = (e.name + " " + e.maker + " " + e.provider).toLowerCase(); if (!t.includes(q.toLowerCase())) return false; }
    return true;
  }).sort((a, b) => (a.spec ? 0 : 1) - (b.spec ? 0 : 1));

  const toggle = (key) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selectAll = () => setSel(new Set(filtered.filter((e) => e.spec).map((e) => e.key)));
  const clearAll = () => setSel(new Set());
  const selectedSpecs = all.filter((e) => e.spec && sel.has(e.key));

  const run = async () => {
    if (!selectedSpecs.length || running) return;
    setRunning(true);
    const tests = selectedSpecs.map((e) => ({ label: `${e.name} · ${e.provider}`, profileId: e.spec.profileId, modelId: e.spec.modelId, fallbacks: [] }));
    startPoll(); // keeps the run alive across navigation; results load via status polling
    const quiz = quality ? QUIZ.map((q) => ({ id: q.id, prompt: q.prompt })) : undefined;
    try {
      const r = await bridge.runSpeedTest({ tests, prompt, maxTokens: 256, quiz });
      // Grade the quiz answers on the server (the answer key + scoring live there, not in this app).
      if (quality && bridge.scoreQuiz && r && r.results) {
        const batch = {};
        for (const res of r.results) if (res.ok && res.quizAnswers) batch[res.label] = res.quizAnswers;
        try { const scores = await bridge.scoreQuiz(batch); if (scores) r.results = r.results.map((res) => (scores[res.label] ? { ...res, scores: scores[res.label] } : res)); } catch {}
      }
      setResult(r);
    }
    catch {}
    finally { stopPoll(); setRunning(false); }
  };

  // Enrich each result with context window + price (OpenRouter) + an estimated run cost + a
  // deterministic quality score, so models can be compared across every KPI at once.
  const promptInTok = Math.max(1, Math.ceil((prompt || "").length / 4));
  const labelInfo = {};
  for (const e of all) {
    const lbl = `${e.name} · ${e.provider}`;
    const mid = e.spec ? e.spec.modelId : "";
    const orm = orCat && mid ? orCat[mid] : null;
    const cat = MODELS.find((mm) => norm(mm.run) === norm(mid) || norm(mm.name) === norm(e.name));
    const caps = {
      reasoning: !!((cat && cat.thinking) || (orm && orm.reasoning)),
      vision: !!((cat && cat.vision) || (orm && orm.image)),
      agentic: !!(cat && cat.agentic) || /agent/i.test(e.name),
      coding: !!(cat && cat.cat === "Coding") || /cod(e|er|ing)|coder|devstral|codestral/i.test(e.name + " " + mid),
    };
    labelInfo[lbl] = { ctxK: (orm && orm.ctx) || (cat && cat.ctx) || 0, priceIn: orm ? orm.priceIn : null, priceOut: orm ? orm.priceOut : null, caps };
  }
  const enrich = (r) => {
    const inf = labelInfo[r.label] || {};
    const estCost = (inf.priceIn != null && inf.priceOut != null) ? (promptInTok * inf.priceIn + (r.tokens || 0) * inf.priceOut) : null;
    const sc = r.scores || null;   // graded on the server (see run handler); answer key is not in this app
    return { ...r, name: r.label.split(" · ")[0], ctxK: inf.ctxK || 0, estCost, qPct: sc ? sc.overall : null, scores: sc, caps: inf.caps || {} };
  };
  const allOk = result ? result.results.filter((r) => r.ok).map(enrich).sort((a, b) => b.tps - a.tps) : [];
  const ok = allOk.slice(0, 15);            // compare up to 15 models at a time
  const moreCount = allOk.length - ok.length;
  const failed = result ? result.results.filter((r) => !r.ok) : [];
  const anyCost = ok.some((r) => r.estCost != null);
  const anyQuality = ok.some((r) => r.qPct != null);

  // KPI definitions drive both the comparison table and the per-KPI charts.
  const KPIS = [
    { key: "tps", label: "Throughput", unit: "tok/s", better: "high", icon: Gauge, get: (r) => r.tps, fmt: (v) => String(v) },
    { key: "ttftMs", label: "First token", unit: "ms", better: "low", icon: Timer, get: (r) => r.ttftMs, fmt: (v) => String(Math.round(v)) },
    { key: "totalMs", label: "Total time", unit: "s", better: "low", icon: Clock, get: (r) => r.totalMs / 1000, fmt: (v) => v.toFixed(1) },
    ...(anyQuality ? [{ key: "qPct", label: "Quality", unit: "%", better: "high", icon: Award, get: (r) => r.qPct, fmt: (v) => String(v) }] : []),
    ...(anyCost ? [{ key: "estCost", label: "Cost / run", unit: "$", better: "low", icon: DollarSign, get: (r) => r.estCost, fmt: (v) => fmtUsd(v) }] : []),
    { key: "ctxK", label: "Context", unit: "", better: "high", icon: Boxes, get: (r) => r.ctxK, fmt: (v) => fmtCtx(v) },
  ];

  // Customizable per-KPI panel layout (order + hidden), persisted in localStorage.
  const kpiKeysStr = KPIS.map((k) => k.key).join(",");
  useEffect(() => {
    const keys = KPIS.map((k) => k.key);
    setKpiLayout((L) => {
      const prev = Array.isArray(L) ? L : [];
      const kept = prev.filter((e) => keys.includes(e.key));
      const have = new Set(kept.map((e) => e.key));
      const added = keys.filter((k) => !have.has(k)).map((k) => ({ key: k, hidden: false }));
      const next = [...kept, ...added];
      const same = prev.length === next.length && next.every((e, i) => prev[i] && prev[i].key === e.key && prev[i].hidden === e.hidden);
      return same ? prev : next;
    });
  }, [kpiKeysStr]); // eslint-disable-line
  useEffect(() => { if (kpiLayout) { try { localStorage.setItem("brainedge.speedKpiLayout.v1", JSON.stringify(kpiLayout)); } catch {} } }, [kpiLayout]);
  const toggleKpi = (key) => setKpiLayout((L) => (L || []).map((e) => e.key === key ? { ...e, hidden: !e.hidden } : e));
  const reorderKpi = (fromKey, toKey) => setKpiLayout((L) => {
    const arr = [...(L || [])]; const fi = arr.findIndex((e) => e.key === fromKey), ti = arr.findIndex((e) => e.key === toKey);
    if (fi < 0 || ti < 0 || fi === ti) return L; const [m] = arr.splice(fi, 1); arr.splice(ti, 0, m); return arr;
  });
  const resetKpiLayout = () => setKpiLayout(KPIS.map((k) => ({ key: k.key, hidden: false })));
  const kpiByKey = Object.fromEntries(KPIS.map((k) => [k.key, k]));
  const kpiVisible = (kpiLayout || KPIS.map((k) => ({ key: k.key, hidden: false }))).filter((e) => !e.hidden && kpiByKey[e.key]);
  const kpiHidden = (kpiLayout || []).filter((e) => e.hidden && kpiByKey[e.key]);
  const pickBy = (sel, dir) => ok.length ? ok.reduce((a, b) => (dir === "high" ? sel(b) > sel(a) : sel(b) < sel(a)) ? b : a) : null;
  const fastest = pickBy((r) => r.tps, "high");
  const snappiest = pickBy((r) => r.ttftMs, "low");
  const quickest = pickBy((r) => r.totalMs, "low");
  const cheapest = anyCost ? ok.filter((r) => r.estCost != null).reduce((a, b) => (b.estCost < a.estCost ? b : a)) : null;
  const smartest = anyQuality ? ok.filter((r) => r.qPct != null).reduce((a, b) => (b.qPct > a.qPct ? b : a)) : null;

  return (
    <div className="sc-page">
      <h2 style={{ margin: "0 0 4px", fontSize: 18, display: "flex", alignItems: "center", gap: 8 }}><Zap size={18} style={{ color: "var(--accent-2)" }} /> Models speed check</h2>
      <p style={{ color: "var(--text-2)", fontSize: 12, margin: "4px 0 16px" }}>
        Sends one prompt to each selected model (<b>cloud or local</b>) in parallel and compares <b>throughput</b> (tok/s), <b>time‑to‑first‑token</b>, <b>total time</b>, <b>estimated cost</b>, <b>context window</b>, measured <b>quality</b>, and <b>success rate</b> — so you can weigh speed against cost and capability. Filter by <b>Host</b> (Cloud/Local) and <b>Price</b> (Free/Paid). Cloud models need an API key; local ones (Ollama/LM Studio) just need to be running. Capped at 256 output tokens. Cost shows where pricing is known (OpenRouter); tip: click "Save &amp; load models" on each provider so models resolve to valid ids.
      </p>

      <button className="sc-info-toggle" onClick={() => setInfoOpen((o) => !o)}>
        {infoOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Info size={14} /> How this works — what's measured & how we arrive at each number
      </button>
      {infoOpen && (
        <div className="sc-info">
          <div className="sc-info-sec">
            <h4>Which model should you pick?</h4>
            <p>There's no single "best" model — pick the one that fits your job. A fast, cheap model that gets the answer wrong is no use, so treat <b>quality as your minimum bar</b>, then optimise for what you care about:</p>
            <ul className="sc-rec">
              <li><b>Chat / interactive assistant</b> → lowest <b>First token</b> + decent <b>Quality</b> (it should feel snappy and be correct). Raw throughput matters less.</li>
              <li><b>Generating lots of code or text</b> → highest <b>Throughput</b> + best <b>Coding / Reasoning</b> score, then lowest <b>Cost</b>. First‑token barely matters.</li>
              <li><b>Big documents or whole codebases</b> → largest <b>Context</b> first, then <b>Quality</b>.</li>
              <li><b>High‑volume / production</b> → lowest <b>Cost</b> + high <b>success rate</b>, with quality as the floor.</li>
            </ul>
            <p>Quick way to read it: in the <b>Trade‑offs</b> charts, whichever model sits alone in the highlighted corner (top‑left = fast & responsive, top‑right = fast & accurate) is your winner for that priority.</p>
          </div>
          <div className="sc-info-sec">
            <h4>How a test runs</h4>
            <p>Every model you select is sent the <b>same single prompt at the same time</b> (in parallel) and we time the streamed reply. Each reply is capped at <b>256 output tokens</b> to keep it fast and cheap. A model is testable if its cloud provider has an API key, or it's a local endpoint (Ollama / LM Studio) that's currently running. Results are sorted and the <b>top 15</b> are shown side by side.</p>
          </div>
          <div className="sc-info-sec">
            <h4>What each number means</h4>
            <dl className="sc-defs">
              <div><dt>Throughput (tok/s)</dt><dd>Output tokens ÷ generation time (from the first token to the last). If a reply arrives in one burst too fast to time, we fall back to the full round‑trip so the rate stays realistic. Higher is better.</dd></div>
              <div><dt>First token (ms)</dt><dd>Time from sending the request to the <b>first</b> piece of the reply arriving — the responsiveness you feel. Lower is better.</dd></div>
              <div><dt>Total time (s)</dt><dd>Full round‑trip for this one 256‑token reply: request sent → last token received. Lower is better.</dd></div>
              <div><dt>Context</dt><dd>The model's maximum context window, read from catalog / OpenRouter metadata. It's a capability, not a measurement.</dd></div>
              <div><dt>Cost / run</dt><dd>Estimated cost of this single run = input tokens × input price + output tokens × output price, using OpenRouter's published per‑token pricing. Shows "—" when we don't have a price.</dd></div>
              <div><dt>Quality &amp; the skills</dt><dd>Each model answers a set of <b>auto‑graded questions with exact answers</b> (no AI judge), grouped by skill: <b>reasoning</b>, <b>coding</b> (predict a Python snippet's output), <b>agentic</b> (tool‑call JSON, ordered steps), <b>instruction‑following</b> (obey strict output rules), <b>structured extraction</b> (text → exact JSON), and <b>honesty</b> (say UNKNOWN / reject a false premise instead of inventing). "Quality" is the overall % correct; each panel shows the % for just that skill (e.g. 3/4 = 75%). <b>Best value</b> ranks by quality ÷ cost.</dd></div>
              <div><dt>Tokens &amp; "(est)"</dt><dd>Output token counts come from the provider's usage report when given; otherwise we estimate as characters ÷ 4 and mark it "(est)".</dd></div>
            </dl>
          </div>
          <div className="sc-info-sec">
            <h4>How the "best" is chosen</h4>
            <p>In the table, the <b>best value in each column is highlighted</b> in cyan (highest for throughput / quality / context, lowest for time / cost). In <b>Best for…</b>, models are ranked by their <b>measured score for that skill</b>; ties are broken by overall quality, then by throughput — so the top isn't just the fastest model that passed a couple of questions.</p>
          </div>
          <div className="sc-info-sec">
            <h4>Good to know</h4>
            <p>These are a <b>snapshot of one request</b> and vary run‑to‑run with network and provider load — run a few times for a feel. The <b>same model via OpenRouter vs its native API</b> can differ (extra hop), so test on the provider you actually care about. The quiz is a quick, deterministic <b>smoke test, not a full benchmark</b>. Nothing is fabricated — unknown values show "—" and estimates are marked.</p>
          </div>
        </div>
      )}

      <div className={`sc-grid ${paneOpen ? "" : "pane-collapsed"}`}>
        {paneOpen && (
        <div className="sc-left">
          <div className="nav-label" style={{ paddingLeft: 0 }}>Prompt</div>
          <div className="sc-presets">
            {PRESETS.map((p) => (
              <button key={p.label} className={`mo-chip ${prompt === p.text ? "on" : ""}`} onClick={() => setPrompt(prompt === p.text ? "" : p.text)}>{p.label}</button>
            ))}
          </div>
          <textarea className="model-search" rows={4} style={{ resize: "vertical", width: "100%", fontFamily: "inherit", marginTop: 8 }} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Type a prompt to send to every selected model…" />

          <div className="sc-modelhead">
            <span className="nav-label" style={{ padding: 0 }}>Models</span>
            <span className="mo-sub">{testableAll.length} available · {sel.size} selected</span>
          </div>
          <div className="sc-search">
            <Search size={13} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter models…" />
          </div>
          <div className="sc-tier">
            <span className="sc-flabel">Provider</span>
            <select className="model-search sc-provsel" value={provFilter} onChange={(e) => setProvFilter(e.target.value)}>
              <option value="all">All providers</option>
              {providerList.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="sc-fsep" />
            <span className="sc-flabel">Host</span>
            <select className="model-search sc-fsel" value={host} onChange={(e) => setHost(e.target.value)}>
              <option value="all">All</option>
              <option value="cloud">Cloud</option>
              <option value="local">Local</option>
            </select>
            <span className="sc-fsep" />
            <span className="sc-flabel">Price</span>
            <select className="model-search sc-fsel" value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="all">All</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="sc-actions">
            <button className="btn" onClick={selectAll}>Select all</button>
            <button className="btn" onClick={clearAll}>Clear</button>
            <label className="sc-toggle"><input type="checkbox" checked={showUnavail} onChange={(e) => setShowUnavail(e.target.checked)} /> Show unavailable</label>
          </div>

          <div className="sc-models scroll">
            {filtered.length === 0 && <div className="sb-empty" style={{ padding: "8px 10px" }}>No models. Configure a provider + key in Settings.</div>}
            {filtered.map((e) => (
              <label key={e.key} className={`sc-model ${e.spec ? "" : "off"}`} title={e.spec ? `via ${e.provider} · ${e.spec.modelId}` : "this provider has no key"}>
                <input type="checkbox" disabled={!e.spec} checked={sel.has(e.key)} onChange={() => toggle(e.key)} />
                <span className="sc-model-name">{e.name}</span>
                <span className="sc-model-prov">{e.provider}</span>
              </label>
            ))}
          </div>

          <label className="sc-toggle" style={{ marginTop: 12 }} title="Also asks each model 6 short, auto-scored questions (math, reasoning, code, a fact, JSON, instruction-following) and reports % correct. Adds a few small extra calls per model.">
            <input type="checkbox" checked={quality} onChange={(e) => setQuality(e.target.checked)} /> Also score answer quality
          </label>
          {running ? (
            <button className="btn" style={{ marginTop: 10, width: "100%", justifyContent: "center", borderColor: "var(--danger)", color: "var(--danger)" }} onClick={() => bridge.cancelSpeedTest()}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="btn primary" style={{ marginTop: 10, width: "100%", justifyContent: "center" }} onClick={run} disabled={!selectedSpecs.length}>
              <Play size={14} /> Run speed test ({selectedSpecs.length})
            </button>
          )}
        </div>
        )}

        <div className="sc-right">
          <div className="sc-resulthead">
            <button className="icon-btn sc-panetoggle" title={paneOpen ? "Hide the models panel for a wider view" : "Show the models panel"} onClick={() => setPaneOpen((o) => !o)}>
              {paneOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <span>{result ? "Results" : "Speed check"}</span>
            {result && <span className="mo-sub">{new Date(result.at).toLocaleString()} · {ok.length} model{ok.length !== 1 ? "s" : ""}{moreCount > 0 ? ` · top 15 of ${allOk.length}` : ""}</span>}
          </div>

          {!result ? (
            <div className="sk-empty" style={{ marginTop: 40, textAlign: "center" }}>Pick models and run a test to see results.</div>
          ) : ok.length === 0 ? (
            <div className="sk-empty" style={{ marginTop: 20, textAlign: "center" }}>No successful results.</div>
          ) : (
            <>
              <div className="sc-cards">
                <div className="sc-card"><div className="sc-card-h"><Gauge size={13} /> Fastest</div><div className="sc-card-v">{fastest.tps} <span>tok/s</span></div><div className="sc-card-s">{fastest.name}</div></div>
                <div className="sc-card"><div className="sc-card-h"><Timer size={13} /> Snappiest</div><div className="sc-card-v">{snappiest.ttftMs} <span>ms</span></div><div className="sc-card-s">{snappiest.name}</div></div>
                {smartest
                  ? <div className="sc-card"><div className="sc-card-h"><Award size={13} /> Most accurate</div><div className="sc-card-v">{smartest.qPct}<span>%</span></div><div className="sc-card-s">{smartest.name}</div></div>
                  : cheapest
                    ? <div className="sc-card"><div className="sc-card-h"><DollarSign size={13} /> Cheapest</div><div className="sc-card-v">{fmtUsd(cheapest.estCost)}</div><div className="sc-card-s">{cheapest.name}</div></div>
                    : <div className="sc-card"><div className="sc-card-h"><Clock size={13} /> Quickest</div><div className="sc-card-v">{(quickest.totalMs / 1000).toFixed(1)}<span>s</span></div><div className="sc-card-s">{quickest.name}</div></div>}
                <div className="sc-card"><div className="sc-card-h"><CheckCircle2 size={13} /> Succeeded</div><div className="sc-card-v">{allOk.length}<span>/{allOk.length + failed.length}</span></div><div className="sc-card-s">{failed.length ? `${failed.length} failed` : "all passed"}</div></div>
              </div>

              <div className="nav-label" style={{ paddingLeft: 0, marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
                Top 10 per KPI <span className="sc-hint">drag to reorder · hide/zoom per panel</span>
                <span style={{ flex: 1 }} />
                <button className="sc-resetlayout" onClick={resetKpiLayout} title="Reset layout"><RotateCcw size={12} /> Reset</button>
              </div>
              <div className="sc-charts" onDragOver={(e) => e.preventDefault()}>
                {kpiVisible.map((e) => (
                  <div key={e.key} className="kl-wrap" draggable
                    onDragStart={() => { dragKpi.current = e.key; }}
                    onDragOver={(ev) => ev.preventDefault()}
                    onDrop={() => { if (dragKpi.current && dragKpi.current !== e.key) reorderKpi(dragKpi.current, e.key); dragKpi.current = null; }}>
                    <KpiList kpi={kpiByKey[e.key]} rows={ok} onHide={() => toggleKpi(e.key)} onExpand={() => setZoom({ kind: "kpi", key: e.key })} />
                  </div>
                ))}
              </div>
              {kpiHidden.length > 0 && (
                <div className="kl-hiddenrow">
                  <span className="mo-sub">Hidden:</span>
                  {kpiHidden.map((e) => <button key={e.key} className="kl-chip" onClick={() => toggleKpi(e.key)} title="Show panel"><Plus size={11} /> {kpiByKey[e.key].label}</button>)}
                </div>
              )}

              <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>Best for… <span className="sc-hint">{anyQuality ? "skills measured by auto-graded score · best value = quality ÷ cost" : "turn on “score answer quality” to measure these"}</span></div>
              <div className="cap-grid">
                {CAPS.map((c) => <CapPanel key={c.key} cap={c} ok={ok} />)}
                {anyCost && anyQuality && <ValuePanel ok={ok} />}
              </div>

              {ok.length > 1 && (
                <>
                  <div className="nav-label" style={{ paddingLeft: 0, marginTop: 18 }}>Trade‑offs <span className="sc-hint">hover a point · click ⤢ to zoom</span></div>
                  <div className="sc-charts sc-scatters">
                    <Scatter rows={ok} xk={KPIS.find((k) => k.key === "ttftMs")} yk={KPIS.find((k) => k.key === "tps")} note="top‑left = best" onExpand={() => setZoom({ kind: "scatter", xkey: "ttftMs", ykey: "tps", note: "top‑left = best" })} />
                    {anyQuality && <Scatter rows={ok} xk={KPIS.find((k) => k.key === "tps")} yk={KPIS.find((k) => k.key === "qPct")} note="top‑right = best" onExpand={() => setZoom({ kind: "scatter", xkey: "tps", ykey: "qPct", note: "top‑right = best" })} />}
                    {anyQuality && <Scatter rows={ok} xk={KPIS.find((k) => k.key === "ttftMs")} yk={KPIS.find((k) => k.key === "qPct")} note="top‑left = best" onExpand={() => setZoom({ kind: "scatter", xkey: "ttftMs", ykey: "qPct", note: "top‑left = best" })} />}
                    {anyCost && anyQuality && <Scatter rows={ok} xk={KPIS.find((k) => k.key === "estCost")} yk={KPIS.find((k) => k.key === "qPct")} note="top‑left = best" onExpand={() => setZoom({ kind: "scatter", xkey: "estCost", ykey: "qPct", note: "top‑left = best" })} />}
                  </div>
                </>
              )}

              {failed.length > 0 && (
                <div className="sc-failed">
                  <button className="sc-failed-h" onClick={() => setFailOpen((o) => !o)}>
                    {failOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<AlertCircle size={13} /> {failed.length} failed <span className="sc-hint">{failOpen ? "hide" : "show"}</span>
                  </button>
                  {failOpen && (
                    <div className="sc-faillist">
                      {failed.map((r) => (
                        <div key={r.label} className="sc-failrow"><span>{r.name || r.label.split(" · ")[0]}</span><span className="mo-sub" title={r.error}>{friendlyError(r.error)}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {zoom && (
                <div className="scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) setZoom(null); }}>
                  <div className={`sc-zoom ${zoom.kind === "scatter" ? "wide" : ""}`}>
                    <button className="icon-btn sc-zoom-x" onClick={() => setZoom(null)} title="Close"><X size={16} /></button>
                    {zoom.kind === "kpi" && kpiByKey[zoom.key] && <KpiList kpi={kpiByKey[zoom.key]} rows={ok} top={15} big />}
                    {zoom.kind === "scatter" && KPIS.find((k) => k.key === zoom.xkey) && KPIS.find((k) => k.key === zoom.ykey) &&
                      <Scatter rows={ok} xk={KPIS.find((k) => k.key === zoom.xkey)} yk={KPIS.find((k) => k.key === zoom.ykey)} note={zoom.note} big />}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// One KPI panel as a ranked numeric list (top N models for that metric). #1 is accent-cyan.
function KpiList({ kpi, rows, top = 10, onHide, onExpand, big }) {
  const data = [...rows].filter((r) => kpi.get(r) != null && !isNaN(kpi.get(r)))
    .sort((a, b) => kpi.better === "high" ? kpi.get(b) - kpi.get(a) : kpi.get(a) - kpi.get(b)).slice(0, top);
  const vals = data.map((r) => kpi.get(r));
  const maxV = Math.max(1e-9, ...vals), minV = Math.min(...vals);
  const barW = (r) => { const v = kpi.get(r); const f = kpi.better === "high" ? (maxV > 0 ? v / maxV : 0) : (v > 0 ? minV / v : 0); return `${Math.max(5, Math.min(100, f * 100))}%`; };
  return (
    <div className={`kl ${big ? "big" : ""}`}>
      <div className="kl-h">
        {!big && <GripVertical size={13} className="kl-grip" />}
        <span className="kl-title">{kpi.label}{kpi.unit ? ` · ${kpi.unit}` : ""}</span>
        <span className="kl-meta">top {data.length} · {kpi.better === "high" ? "↑ better" : "↓ better"}</span>
        {onExpand && <button className="kl-ico" title="Open in a bigger view" onClick={onExpand}><Maximize2 size={12} /></button>}
        {onHide && <button className="kl-ico" title="Hide this panel" onClick={onHide}><EyeOff size={13} /></button>}
      </div>
      <ol className="kl-list">
        {data.map((r, i) => (
          <li key={r.label} className={i === 0 ? "best" : ""}>
            <span className="kl-rank">{i + 1}</span>
            <span className="kl-n" title={`${r.name} · ${r.provider}`}>{r.name}</span>
            <span className="kl-bar"><span className="kl-bar-fill" style={{ width: barW(r) }} /></span>
            <span className="kl-v">{kpi.fmt(kpi.get(r))}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// Interactive scatter for weighing two KPIs against each other.
function Scatter({ rows, xk, yk, note, onExpand, big }) {
  const [hi, setHi] = useState(-1);
  // Bigger coordinate space when zoomed → points spread out and labels overlap far less.
  const W = big ? 680 : 320, H = big ? 460 : 210;
  const pl = big ? 56 : 30, pr = big ? 26 : 14, pt = big ? 22 : 14, pb = big ? 48 : 34;
  const fs = big ? 11 : 9, lfs = big ? 9 : 8, rad = big ? 5 : 4;
  const xs = rows.map(xk.get), ys = rows.map(yk.get);
  // Adaptive axis scaling: use log when the values span a wide range (e.g. first-token ms),
  // so a few big outliers don't crush everyone else into a corner. Pixels map px0→px1 as value lo→hi.
  const axisScale = (vals, px0, px1) => {
    const f = vals.filter((v) => v != null && isFinite(v));
    let lo = Math.min(...f), hi = Math.max(...f);
    if (lo > 0 && hi / lo > 20) { const l0 = Math.log10(lo), l1 = Math.log10(hi); return (v) => px0 + ((Math.log10(Math.max(v, lo)) - l0) / ((l1 - l0) || 1)) * (px1 - px0); }
    const pad = (hi - lo) * 0.05 || 1; lo -= pad; hi += pad;
    return (v) => px0 + ((v - lo) / ((hi - lo) || 1)) * (px1 - px0);
  };
  const sx = axisScale(xs, pl, W - pr);
  const sy = axisScale(ys, H - pb, pt); // inverted: low value → bottom, high → top
  const isLog = (vals) => { const f = vals.filter((v) => v != null && isFinite(v)); const lo = Math.min(...f), hi = Math.max(...f); return lo > 0 && hi / lo > 20; };
  const xLog = isLog(xs), yLog = isLog(ys);
  const hov = hi >= 0 ? rows[hi] : null;
  // Deterministic jitter so models that share a coordinate (e.g. many at quality 0%) don't perfectly overlap.
  const jit = (n) => (Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1) * 6 - 3;
  const pts = rows.map((r, i) => ({ r, i, cx: sx(xk.get(r)) + jit(i + 1), cy: sy(yk.get(r)) + jit(i + 101) }));
  // Greedy de-clutter: give labels to higher-value points first; skip a label if it would collide.
  const labelShow = new Set();
  { const placed = []; const dx = big ? 70 : 46, dy = big ? 15 : 11;
    for (const p of [...pts].sort((a, b) => yk.get(b.r) - yk.get(a.r))) {
      if (!placed.some((q) => Math.abs(p.cx - q.cx) < dx && Math.abs(p.cy - q.cy) < dy)) { labelShow.add(p.i); placed.push(p); }
    } }
  return (
    <div className={`vb scatter ${big ? "big" : ""}`}>
      <div className="vb-h">{yk.label} vs {xk.label} <span>{note}</span>{onExpand && <button className="kl-ico" title="Open in a bigger view" onClick={onExpand}><Maximize2 size={12} /></button>}</div>
      <div className="vb-plot">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet">
          <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="var(--line)" />
          <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="var(--line)" />
          <text x={(pl + W - pr) / 2} y={H - (big ? 12 : 4)} fontSize={fs} fill="var(--text-2)" textAnchor="middle">{xk.label}{xk.unit ? ` (${xk.unit})` : ""}{xLog ? " · log" : ""} →</text>
          <text x={big ? 16 : 9} y={(pt + H - pb) / 2} fontSize={fs} fill="var(--text-2)" textAnchor="middle" transform={`rotate(-90 ${big ? 16 : 9} ${(pt + H - pb) / 2})`}>{yk.label}{yLog ? " · log" : ""} ↑</text>
          {pts.map(({ r, i, cx, cy }) => {
            const on = hi === i;
            const right = cx > (pl + W - pr) / 2; // flip label to the left for right-side points
            const showLabel = on || labelShow.has(i);
            return (
              <g key={r.label} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi((c) => (c === i ? -1 : c))} style={{ cursor: "default" }}>
                <circle cx={cx} cy={cy} r={on ? rad + 1.5 : rad} fill={on ? "var(--accent-2)" : "var(--accent)"} opacity={on ? 1 : 0.82} />
                {showLabel && <text x={right ? cx - (rad + 2) : cx + (rad + 2)} y={cy + 3} fontSize={lfs} textAnchor={right ? "end" : "start"} fill={on ? "var(--text-0)" : "var(--text-1)"} style={{ opacity: on ? 1 : 0.85 }}>{r.name.slice(0, big ? 22 : 14)}</text>}
              </g>
            );
          })}
        </svg>
        {hov && <div className="vb-tip"><b>{hov.name}</b> · {yk.label} {yk.fmt(yk.get(hov))}{yk.unit ? " " + yk.unit : ""} · {xk.label} {xk.fmt(xk.get(hov))}{xk.unit ? " " + xk.unit : ""}</div>}
      </div>
    </div>
  );
}
