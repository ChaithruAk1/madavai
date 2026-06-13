import { useEffect, useState, useRef } from "react";
import { Zap, Play, Square, AlertCircle, Search, Gauge, Timer, Clock, DollarSign, CheckCircle2, Award, Boxes, PanelLeftClose, PanelLeftOpen, Code2, Brain, Wrench, Image, ChevronDown, ChevronRight, Info, ListChecks, Braces, ShieldCheck, Wallet } from "lucide-react";
import { bridge } from "../bridge/index.js";
import { MODELS } from "../data/modelCatalog.js";
import { classifyProvider, isModelFree } from "../data/providerRules.js";
import "../speedcheck.css";

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
    if (!keyed) continue; // cloud needs a key (API-key access only)
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
  const [kpiLayout, setKpiLayout] = useState(() => {
    try {
      const KEY = "madav.speedKpiLayout.v1";
      let raw = localStorage.getItem(KEY);
      if (raw == null) { // one-time copy migration from the legacy key
        const legacy = localStorage.getItem(("brain" + "edge") + ".speedKpiLayout.v1");
        if (legacy != null) { try { localStorage.setItem(KEY, legacy); } catch {} raw = legacy; }
      }
      return JSON.parse(raw) || null;
    } catch { return null; }
  });
  const dragKpi = useRef(null); // eslint-disable-line no-unused-vars
  const [zoom, setZoom] = useState(null); // {kind:"kpi"|"scatter", ...} // eslint-disable-line no-unused-vars
  const [tier, setTier] = useState("all"); // all | free | paid
  const [host, setHost] = useState("all"); // all | cloud | local
  const [provFilter, setProvFilter] = useState("all"); // provider name filter
  const [infoOpen, setInfoOpen] = useState(false);
  // Presentation-only state for the dashboard (no effect on the run / data pipeline).
  const [chartKpi, setChartKpi] = useState("tps");   // which KPI the big ranked chart shows
  const [expanded, setExpanded] = useState(null);    // expanded detail-table row (label)
  const [picked, setPicked] = useState(null);        // model highlighted from scatter / tiles (label)

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
  useEffect(() => { if (kpiLayout) { try { localStorage.setItem("madav.speedKpiLayout.v1", JSON.stringify(kpiLayout)); } catch {} } }, [kpiLayout]);
  const kpiByKey = Object.fromEntries(KPIS.map((k) => [k.key, k]));
  const pickBy = (sel, dir) => ok.length ? ok.reduce((a, b) => (dir === "high" ? sel(b) > sel(a) : sel(b) < sel(a)) ? b : a) : null;
  const fastest = pickBy((r) => r.tps, "high");
  const snappiest = pickBy((r) => r.ttftMs, "low");
  const quickest = pickBy((r) => r.totalMs, "low");
  const cheapest = anyCost ? ok.filter((r) => r.estCost != null).reduce((a, b) => (b.estCost < a.estCost ? b : a)) : null;
  const smartest = anyQuality ? ok.filter((r) => r.qPct != null).reduce((a, b) => (b.qPct > a.qPct ? b : a)) : null;

  /* ------------------------------------------------------------------ */
  /* Presentation-only derivations (render layer — no data logic below)  */
  /* ------------------------------------------------------------------ */

  // Best value = measured quality per dollar (same definition as before: quality ÷ cost).
  const bestValue = (anyCost && anyQuality)
    ? (ok.filter((r) => r.qPct != null && r.estCost != null && r.estCost > 0)
        .sort((a, b) => (b.qPct / b.estCost) - (a.qPct / a.estCost))[0] || null)
    : null;
  // Winner spotlight: quality first (speed as tiebreak) when measured; otherwise raw throughput.
  const winner = anyQuality && smartest
    ? [...ok].sort((a, b) => ((b.qPct || 0) - (a.qPct || 0)) || (b.tps - a.tps))[0]
    : fastest;
  const whyWon = !winner ? "" : (anyQuality && winner.qPct != null)
    ? (winner === fastest
      ? "Top graded quality and the highest throughput of this run — accurate and quick."
      : `Highest graded quality of this run (${winner.qPct}% correct), with speed as the tiebreak.`)
    : (winner === snappiest
      ? "Highest throughput and the quickest first token — no contest this run."
      : "Highest measured throughput of this run.");

  // The big ranked chart follows chartKpi; fall back if that KPI vanished (e.g. quality off).
  const chartK = kpiByKey[chartKpi] || kpiByKey.tps;
  // The detail table sorts by the same KPI, so the tiles "sort/jump" everywhere at once.
  const colVal = (k, r) => { const v = k.get(r); return (v == null || isNaN(v)) ? null : v; };
  const tableRows = [...ok].sort((a, b) => {
    const va = colVal(chartK, a), vb = colVal(chartK, b);
    if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
    return chartK.better === "high" ? vb - va : va - vb;
  });
  const tableCols = [kpiByKey.tps, kpiByKey.ttftMs, kpiByKey.totalMs, ...(anyQuality ? [kpiByKey.qPct] : []), ...(anyCost ? [kpiByKey.estCost] : [])];
  // Fastest by capability: for each skill, the model that scores best on it, then fastest.
  const byCap = CAPS.filter((c) => c.scoreKey).map((c) => {
    const cand = ok.filter((r) => r.scores && r.scores[c.scoreKey] != null);
    if (!cand.length) return null;
    const model = [...cand].sort((a, b) => (b.scores[c.scoreKey] - a.scores[c.scoreKey]) || (b.tps - a.tps))[0];
    return { cap: c, model };
  }).filter(Boolean);
  const bestOf = {};
  for (const k of tableCols) { const vals = ok.map((r) => colVal(k, r)).filter((v) => v != null); bestOf[k.key] = vals.length ? (k.better === "high" ? Math.max(...vals) : Math.min(...vals)) : null; }
  const meterW = (k, v) => {
    if (v == null) return "0%";
    const vals = ok.map((r) => colVal(k, r)).filter((x) => x != null);
    if (!vals.length) return "0%";
    const max = Math.max(...vals), min = Math.min(...vals);
    const f = k.better === "high" ? (max > 0 ? v / max : 0) : (v > 0 ? min / v : 0);
    return `${Math.max(4, Math.min(100, f * 100))}%`;
  };

  // KPI hero tiles — each one jumps the chart + table to its metric and spotlights its model.
  const tiles = [];
  if (fastest) tiles.push({ id: "fast", icon: Gauge, h: "Fastest", v: String(fastest.tps), u: "tok/s", s: fastest.name, k: "tps", label: fastest.label });
  if (smartest) tiles.push({ id: "qual", icon: Award, h: "Best quality", v: String(smartest.qPct), u: "%", s: smartest.name, k: "qPct", label: smartest.label });
  if (bestValue) tiles.push({ id: "value", icon: Wallet, h: "Best value", v: `${bestValue.qPct}%`, u: ` · ${fmtUsd(bestValue.estCost)}`, s: bestValue.name, k: anyQuality ? "qPct" : "tps", label: bestValue.label });
  if (cheapest && tiles.length < 4) tiles.push({ id: "cheap", icon: DollarSign, h: "Cheapest", v: fmtUsd(cheapest.estCost), u: "/run", s: cheapest.name, k: "estCost", label: cheapest.label });
  if (snappiest && tiles.length < 4) tiles.push({ id: "snap", icon: Timer, h: "Quickest start", v: String(Math.round(snappiest.ttftMs)), u: "ms", s: snappiest.name, k: "ttftMs", label: snappiest.label });
  if (quickest && tiles.length < 4) tiles.push({ id: "tot", icon: Clock, h: "Quickest overall", v: (quickest.totalMs / 1000).toFixed(1), u: "s", s: quickest.name, k: "totalMs", label: quickest.label });
  const heroTiles = tiles.slice(0, 4);

  const pickModel = (label) => {
    setPicked((p) => (p === label ? null : label));
    setExpanded(label);
    requestAnimationFrame(() => {
      const el = document.getElementById("spx-r-" + norm(label));
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };
  const jumpKpi = (key, label) => {
    if (kpiByKey[key]) setChartKpi(key);
    if (label) setPicked(label);
    requestAnimationFrame(() => {
      const el = document.getElementById("spx-chart-anchor");
      if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
  };

  // "The race" lanes while a run is in flight: selected models + whatever partial results exist.
  const laneRows = (() => {
    if (!running) return [];
    const m = new Map();
    for (const e of selectedSpecs) m.set(`${e.name} · ${e.provider}`, null);
    const onlySelected = m.size > 0;
    const rs = result && result.results ? result.results : [];
    for (const r of rs) { if (!onlySelected || m.has(r.label)) m.set(r.label, r); }
    return [...m.entries()].map(([label, r]) => ({ label, r }));
  })();
  const laneStatus = (r) => !r ? "streaming" : (r.ok ? (quality && !r.scores ? "scoring" : "done") : "failed");
  const laneDone = laneRows.filter((l) => l.r).length;

  // Scatter axes: speed vs quality when measured, otherwise responsiveness vs speed.
  const scX = anyQuality ? kpiByKey.tps : kpiByKey.ttftMs;
  const scY = anyQuality ? (kpiByKey.qPct || kpiByKey.tps) : kpiByKey.tps;
  const scQuads = anyQuality
    ? { tl: "smart, but slower", tr: "fast & smart", bl: "slow & shaky", br: "fast, less accurate" }
    : { tl: "responsive & fast", tr: "fast, slow to start", bl: "responsive, lower throughput", br: "slow on both" };

  const STATUS_TEXT = { streaming: "streaming", scoring: "scoring", done: "done", failed: "failed" };

  return (
    <div className="spx-page">
      <div className="spx-head">
        <h2><Zap size={18} /> Models speed check</h2>
      </div>
      <p className="spx-sub">
        Sends one prompt to every selected model (<b>cloud or local</b>) in parallel and compares <b>throughput</b>, <b>time-to-first-token</b>, <b>total time</b>, <b>estimated cost</b>, <b>context window</b>, measured <b>quality</b>, and <b>success rate</b> — so you can weigh speed against cost and capability. Cloud models need an API key; local ones (Ollama / LM Studio) just need to be running. Replies are capped at 256 output tokens; cost shows where pricing is known (OpenRouter).
      </p>

      <button className="spx-info-toggle" onClick={() => setInfoOpen((o) => !o)}>
        {infoOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}<Info size={14} /> How this works — what's measured &amp; how we arrive at each number
      </button>
      {infoOpen && (
        <div className="spx-info spx-card">
          <div className="spx-info-sec">
            <h4>Which model should you pick?</h4>
            <p>There's no single "best" model — pick the one that fits your job. A fast, cheap model that gets the answer wrong is no use, so treat <b>quality as your minimum bar</b>, then optimise for what you care about:</p>
            <ul className="spx-rec">
              <li><b>Chat / interactive assistant</b> → lowest <b>First token</b> + decent <b>Quality</b> (it should feel snappy and be correct). Raw throughput matters less.</li>
              <li><b>Generating lots of code or text</b> → highest <b>Throughput</b> + best <b>Coding / Reasoning</b> score, then lowest <b>Cost</b>. First-token barely matters.</li>
              <li><b>Big documents or whole codebases</b> → largest <b>Context</b> first, then <b>Quality</b>.</li>
              <li><b>High-volume / production</b> → lowest <b>Cost</b> + high <b>success rate</b>, with quality as the floor.</li>
            </ul>
            <p>Quick way to read it: in the <b>Trade-offs</b> chart, whichever model sits alone in the best-labelled corner (e.g. "fast &amp; smart") is your winner for that priority.</p>
          </div>
          <div className="spx-info-sec">
            <h4>How a test runs</h4>
            <p>Every model you select is sent the <b>same single prompt at the same time</b> (in parallel) and we time the streamed reply. Each reply is capped at <b>256 output tokens</b> to keep it fast and cheap. A model is testable if its cloud provider has an API key, or it's a local endpoint (Ollama / LM Studio) that's currently running. Results are sorted and the <b>top 15</b> are shown side by side.</p>
          </div>
          <div className="spx-info-sec">
            <h4>What each number means</h4>
            <dl className="spx-defs">
              <div><dt>Throughput (tok/s)</dt><dd>Output tokens ÷ generation time (from the first token to the last). If a reply arrives in one burst too fast to time, we fall back to the full round-trip so the rate stays realistic. Higher is better.</dd></div>
              <div><dt>First token (ms)</dt><dd>Time from sending the request to the <b>first</b> piece of the reply arriving — the responsiveness you feel. Lower is better.</dd></div>
              <div><dt>Total time (s)</dt><dd>Full round-trip for this one 256-token reply: request sent → last token received. Lower is better.</dd></div>
              <div><dt>Context</dt><dd>The model's maximum context window, read from catalog / OpenRouter metadata. It's a capability, not a measurement.</dd></div>
              <div><dt>Cost / run</dt><dd>Estimated cost of this single run = input tokens × input price + output tokens × output price, using OpenRouter's published per-token pricing. Shows "—" when we don't have a price.</dd></div>
              <div><dt>Quality &amp; the skills</dt><dd>Each model answers a set of <b>auto-graded questions with exact answers</b> (no AI judge), grouped by skill: <b>reasoning</b>, <b>coding</b> (predict a Python snippet's output), <b>agentic</b> (tool-call JSON, ordered steps), <b>instruction-following</b> (obey strict output rules), <b>structured extraction</b> (text → exact JSON), and <b>honesty</b> (say UNKNOWN / reject a false premise instead of inventing). "Quality" is the overall % correct; the expanded row shows the % for each skill (e.g. 3/4 = 75%). <b>Best value</b> ranks by quality ÷ cost.</dd></div>
              <div><dt>Tokens &amp; "(est)"</dt><dd>Output token counts come from the provider's usage report when given; otherwise we estimate as characters ÷ 4 and mark it "(est)".</dd></div>
            </dl>
          </div>
          <div className="spx-info-sec">
            <h4>How the "best" is chosen</h4>
            <p>In the table, the <b>best value in each column is highlighted</b> in the accent colour (highest for throughput / quality, lowest for time / cost). The spotlight winner is the model with the <b>best measured quality</b>, with ties broken by throughput — so the top isn't just the fastest model that passed a couple of questions. Without quality scoring, the fastest model wins.</p>
          </div>
          <div className="spx-info-sec">
            <h4>Good to know</h4>
            <p>These are a <b>snapshot of one request</b> and vary run-to-run with network and provider load — run a few times for a feel. The <b>same model via OpenRouter vs its native API</b> can differ (extra hop), so test on the provider you actually care about. The quiz is a quick, deterministic <b>smoke test, not a full benchmark</b>. Nothing is fabricated — unknown values show "—" and estimates are marked.</p>
          </div>
        </div>
      )}

      <div className={`spx-grid ${paneOpen ? "" : "spx-pane-collapsed"}`}>
        {paneOpen && (
        <div className="spx-left">
          <div className="spx-sec"><span className="spx-label">Prompt</span></div>
          <div className="spx-presets">
            {PRESETS.map((p) => (
              <button key={p.label} className={`spx-chip ${prompt === p.text ? "spx-on" : ""}`} onClick={() => setPrompt(prompt === p.text ? "" : p.text)}>{p.label}</button>
            ))}
          </div>
          <textarea className="spx-textarea" rows={4} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Type a prompt to send to every selected model…" />

          <div className="spx-sec">
            <span className="spx-label">Models</span>
            <span className="spx-dim spx-num">{testableAll.length} available · {sel.size} selected</span>
          </div>
          <div className="spx-search">
            <Search size={13} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter models…" />
          </div>
          <div className="spx-filters">
            <span className="spx-label">Provider</span>
            <select value={provFilter} onChange={(e) => setProvFilter(e.target.value)}>
              <option value="all">All providers</option>
              {providerList.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="spx-label">Host</span>
            <select value={host} onChange={(e) => setHost(e.target.value)}>
              <option value="all">All</option>
              <option value="cloud">Cloud</option>
              <option value="local">Local</option>
            </select>
            <span className="spx-label">Price</span>
            <select value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="all">All</option>
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="spx-actions">
            <button className="spx-link" onClick={selectAll}>Select all</button>
            <button className="spx-link" onClick={clearAll}>Clear</button>
            <span style={{ flex: 1 }} />
            <label className="spx-check"><input type="checkbox" checked={showUnavail} onChange={(e) => setShowUnavail(e.target.checked)} /> Show unavailable</label>
          </div>

          <div className="spx-models scroll">
            {filtered.length === 0 && <div className="spx-models-empty">No models. Configure a provider + key in Settings.</div>}
            {filtered.map((e) => (
              <label key={e.key} className={`spx-model ${e.spec ? "" : "spx-off"}`} title={e.spec ? `via ${e.provider} · ${e.spec.modelId}` : "this provider has no key"}>
                <input type="checkbox" disabled={!e.spec} checked={sel.has(e.key)} onChange={() => toggle(e.key)} />
                <span className="spx-model-name">{e.name}</span>
                <span className="spx-model-prov">{e.provider}</span>
              </label>
            ))}
          </div>

          <label className="spx-check" style={{ marginTop: 12 }} title="Also asks each model a set of short, auto-scored questions (math, reasoning, code, facts, JSON, instruction-following) and reports % correct. Adds a few small extra calls per model.">
            <input type="checkbox" checked={quality} onChange={(e) => setQuality(e.target.checked)} /> Also score answer quality
          </label>
          {running ? (
            <button className="spx-run spx-stop" onClick={() => bridge.cancelSpeedTest()}>
              <Square size={14} /> Stop
            </button>
          ) : (
            <button className="spx-run" onClick={run} disabled={!selectedSpecs.length}>
              <Play size={14} /> Run speed test ({selectedSpecs.length})
            </button>
          )}
        </div>
        )}

        <div className="spx-right">
          <div className="spx-righthead">
            <button className="icon-btn" title={paneOpen ? "Hide the models panel for a wider view" : "Show the models panel"} onClick={() => setPaneOpen((o) => !o)}>
              {paneOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <span className="spx-label">{running ? "Run in progress" : result ? "Results" : "Speed check"}</span>
            {result && !running && <span className="spx-dim spx-num">{new Date(result.at).toLocaleString()} · {ok.length} model{ok.length !== 1 ? "s" : ""}{moreCount > 0 ? ` · top 15 of ${allOk.length}` : ""}{failed.length ? ` · ${allOk.length}/${allOk.length + failed.length} succeeded` : ""}</span>}
          </div>

          {/* ---- the race: live lanes while the test is running ---- */}
          {running && laneRows.length > 0 && (
            <div className="spx-race spx-card spx-anim">
              <div className="spx-race-head">
                <span className="spx-race-dot" />
                <span className="spx-label">Racing {laneRows.length} model{laneRows.length !== 1 ? "s" : ""}</span>
                <span className="spx-dim spx-num">{laneDone}/{laneRows.length} finished</span>
              </div>
              {laneRows.map(({ label, r }) => {
                const st = laneStatus(r);
                const pct = r ? Math.max(6, Math.min(100, ((r.tokens || 0) / 256) * 100)) : 0;
                return (
                  <div key={label} className={`spx-lane spx-st-${st}`}>
                    <span className="spx-lane-name">{label.split(" · ")[0]}<small>{label.split(" · ")[1] || ""}</small></span>
                    <span className="spx-lane-track">
                      <span className="spx-lane-fill" style={st === "streaming" ? undefined : { width: `${r && !r.ok ? 100 : pct}%` }} />
                    </span>
                    <span className="spx-lane-tps spx-num">{r && r.ok && r.tps != null ? <>{r.tps} <i>tok/s</i></> : "—"}</span>
                    <span className={`spx-status spx-st-${st}`}>{STATUS_TEXT[st]}</span>
                  </div>
                );
              })}
            </div>
          )}

          {!result ? (
            !running && (
              <div className="spx-empty spx-anim">
                <div className="spx-empty-ic"><Zap size={26} /></div>
                <h3>Race your models, head to head</h3>
                <p>One prompt goes to every model you pick — at the same time. You get speed, responsiveness, cost and a graded quality score back, side by side, so the right model for the job is obvious.</p>
                <div className="spx-steps">
                  <div className="spx-step spx-card"><span className="spx-step-n spx-num">01</span><b>Pick models</b><span>Choose any mix of cloud and local models from the panel.</span></div>
                  <div className="spx-step spx-card"><span className="spx-step-n spx-num">02</span><b>One prompt, in parallel</b><span>Each model streams the same 256-token reply while we time it.</span></div>
                  <div className="spx-step spx-card"><span className="spx-step-n spx-num">03</span><b>Graded &amp; ranked</b><span>Auto-scored quiz, KPI charts and a winner spotlight — no AI judge.</span></div>
                </div>
                <button className="spx-run" onClick={run} disabled={!selectedSpecs.length}>
                  <Play size={14} /> {selectedSpecs.length ? `Run speed test (${selectedSpecs.length})` : "Run speed test"}
                </button>
                {!selectedSpecs.length && <div className="spx-empty-hint">Select at least one model on the left to start.</div>}
              </div>
            )
          ) : ok.length === 0 ? (
            <>
              {!running && <div className="spx-empty spx-anim"><div className="spx-empty-ic"><AlertCircle size={26} /></div><h3>No successful results</h3><p>Every tested model failed this run — open the list below for the reasons, then check keys, credit and model availability.</p></div>}
            </>
          ) : (
            <>
              {/* ---- hero band: winner spotlight + KPI tiles ---- */}
              <div className="spx-hero">
                <div className="spx-winner">
                  <div className="spx-winner-tag"><Award size={14} /><span className="spx-label" style={{ color: "inherit" }}>Winner of this run</span></div>
                  <div className="spx-winner-name">{winner.name}<small>{winner.provider}</small></div>
                  <p className="spx-winner-why">{whyWon}</p>
                  <div className="spx-winner-nums spx-num">
                    <div className="spx-winner-num"><b>{winner.tps}<i>tok/s</i></b><span>throughput</span></div>
                    <div className="spx-winner-num"><b>{Math.round(winner.ttftMs)}<i>ms</i></b><span>first token</span></div>
                    {winner.qPct != null
                      ? <div className="spx-winner-num"><b>{winner.qPct}<i>%</i></b><span>quality</span></div>
                      : <div className="spx-winner-num"><b>{(winner.totalMs / 1000).toFixed(1)}<i>s</i></b><span>total time</span></div>}
                  </div>
                </div>
                <div className="spx-tiles">
                  {heroTiles.map((t) => { const I = t.icon; return (
                    <button key={t.id} className={`spx-tile ${chartKpi === t.k && picked === t.label ? "spx-on" : ""}`} onClick={() => jumpKpi(t.k, t.label)} title={`Sort the chart and table by ${kpiByKey[t.k] ? kpiByKey[t.k].label.toLowerCase() : t.h.toLowerCase()}`}>
                      <span className="spx-tile-h"><I size={13} /><span className="spx-label">{t.h}</span></span>
                      <span className="spx-tile-v spx-num">{t.v}<i>{t.u}</i></span>
                      <span className="spx-tile-s">{t.s}</span>
                    </button>
                  ); })}
                </div>
              </div>

              {/* ---- ranked bar chart with KPI switcher ---- */}
              <div className="spx-sechead" id="spx-chart-anchor">
                <span className="spx-label">Ranking</span>
                <span className="spx-dim">{chartK.better === "high" ? "higher is better" : "lower is better"} · click a bar to open its row</span>
              </div>
              <div className="spx-chartcard spx-card">
                <div className="spx-seg">
                  {KPIS.map((k) => (
                    <button key={k.key} className={chartK.key === k.key ? "spx-on" : ""} onClick={() => setChartKpi(k.key)}>{k.label}</button>
                  ))}
                </div>
                <SpxBarChart rows={ok} kpi={chartK} picked={picked} onPickModel={pickModel} />
              </div>

              {/* ---- fastest model per capability ---- */}
              {anyQuality && byCap.length > 0 && (
                <>
                  <div className="spx-sechead">
                    <span className="spx-label">Fastest by capability</span>
                    <span className="spx-dim">the quickest model that's also strongest at each skill · click a card to open its row</span>
                  </div>
                  <div className="spx-capgrid spx-card">
                    {byCap.map(({ cap, model }) => { const I = cap.icon; return (
                      <button key={cap.key} type="button" className={`spx-capcard ${picked === model.label ? "spx-picked" : ""}`} onClick={() => pickModel(model.label)}>
                        <div className="spx-capcard-h"><I size={13} /> {cap.label}</div>
                        <div className="spx-capcard-model" title={model.name}>{model.name}</div>
                        <div className="spx-capcard-nums spx-num"><b>{model.tps}</b> tok/s · <span>{model.scores[cap.scoreKey]}%</span></div>
                      </button>
                    ); })}
                  </div>
                </>
              )}

              {/* ---- detail table ---- */}
              <div className="spx-sechead">
                <span className="spx-label">All measurements</span>
                <span className="spx-dim">sorted by {chartK.label.toLowerCase()} · click a row for the full breakdown</span>
              </div>
              <div className={`spx-table spx-card spx-cols-${tableCols.length}`}>
                <div className="spx-tr spx-thead">
                  <span />
                  <span>Model</span>
                  {tableCols.map((k) => <span key={k.key} className="spx-num">{k.label}{k.unit ? ` · ${k.unit}` : ""}</span>)}
                  <span />
                </div>
                {tableRows.map((r, i) => {
                  const open = expanded === r.label;
                  return (
                    <div key={r.label} id={"spx-r-" + norm(r.label)}>
                      <div className={`spx-tr spx-click ${picked === r.label ? "spx-picked" : ""}`} onClick={() => setExpanded(open ? null : r.label)}>
                        <span className="spx-rank spx-num">{i + 1}</span>
                        <span className="spx-td-model"><b>{r.name}</b><small>{r.provider}</small></span>
                        {tableCols.map((k) => {
                          const v = colVal(k, r);
                          const best = v != null && bestOf[k.key] != null && v === bestOf[k.key];
                          return (
                            <span key={k.key} className={`spx-cell spx-num ${best ? "spx-best" : ""}`}>
                              <span className="spx-cell-v">{v == null ? "—" : k.fmt(v)}</span>
                              <span className="spx-meter"><span style={{ width: meterW(k, v) }} /></span>
                            </span>
                          );
                        })}
                        <span className="spx-chev">{open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
                      </div>
                      {open && (
                        <div className="spx-detail">
                          <div className="spx-detail-grid spx-num">
                            <div className="spx-fact"><span>Throughput</span><b>{r.tps} <i>tok/s</i></b></div>
                            <div className="spx-fact"><span>First token</span><b>{Math.round(r.ttftMs)} <i>ms</i></b></div>
                            <div className="spx-fact"><span>Total time</span><b>{(r.totalMs / 1000).toFixed(2)} <i>s</i></b></div>
                            <div className="spx-fact"><span>Output tokens</span><b>{r.tokens != null ? r.tokens : "—"}</b></div>
                            <div className="spx-fact"><span>Quality</span><b>{r.qPct != null ? r.qPct + "%" : "—"}</b></div>
                            <div className="spx-fact"><span>Cost / run</span><b>{fmtUsd(r.estCost)}</b></div>
                            <div className="spx-fact"><span>Context</span><b>{fmtCtx(r.ctxK)}</b></div>
                            <div className="spx-fact"><span>Provider</span><b>{r.provider}</b></div>
                          </div>
                          {r.scores && (
                            <div className="spx-skills">
                              {CAPS.filter((c) => c.scoreKey && r.scores[c.scoreKey] != null).map((c) => {
                                const I = c.icon; const v = r.scores[c.scoreKey];
                                const cnt = r.scores.counts && r.scores.counts[c.scoreKey];
                                return (
                                  <div key={c.key} className="spx-skill" title={cnt ? `${cnt} correct` : undefined}>
                                    <I size={12} /><span>{c.label}</span>
                                    <span className="spx-meter"><span style={{ width: `${Math.max(3, v)}%` }} /></span>
                                    <em>{v}%</em>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {r.caps && Object.values(r.caps).some(Boolean) && (
                            <div className="spx-dim" style={{ marginTop: 9, fontSize: 11 }}>
                              Catalog tags: {Object.entries(r.caps).filter(([, v]) => v).map(([k]) => k).join(" · ")}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ---- failed models, quiet and collapsed ---- */}
          {result && failed.length > 0 && (
            <div className="spx-failed">
              <button className="spx-failed-h" onClick={() => setFailOpen((o) => !o)}>
                {failOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<AlertCircle size={13} /> {failed.length} model{failed.length !== 1 ? "s" : ""} failed
              </button>
              {failOpen && (
                <div className="spx-faillist">
                  {failed.map((r) => (
                    <div key={r.label} className="spx-failrow"><span>{r.name || r.label.split(" · ")[0]}</span><span title={r.error}>{friendlyError(r.error)}</span></div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && ok.length > 0 && !running && (
            <div className="spx-sechead" style={{ marginTop: 16 }}>
              <CheckCircle2 size={12} style={{ color: "var(--ok)" }} />
              <span className="spx-dim spx-num">{allOk.length}/{allOk.length + failed.length} models completed this run · results are a snapshot of one request — run again for a steadier picture</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Presentation components                                                    */
/* ------------------------------------------------------------------------- */

// Large ranked bar chart. Rows keep a stable element identity (key = label) and are
// positioned by rank via transform, so switching KPIs animates both order and width.
function SpxBarChart({ rows, kpi, picked, onPickModel }) {
  const ROW = 32;
  const data = rows.filter((r) => { const v = kpi.get(r); return v != null && !isNaN(v); });
  const sorted = [...data].sort((a, b) => kpi.better === "high" ? kpi.get(b) - kpi.get(a) : kpi.get(a) - kpi.get(b));
  const rankOf = {};
  sorted.forEach((r, i) => { rankOf[r.label] = i; });
  const vals = sorted.map((r) => kpi.get(r));
  const maxV = Math.max(1e-9, ...vals), minV = Math.min(...vals);
  const frac = (v) => kpi.better === "high" ? (maxV > 0 ? v / maxV : 0) : (v > 0 ? minV / v : 0);
  if (!sorted.length) return <div className="spx-models-empty">No model has a value for {kpi.label.toLowerCase()} this run.</div>;
  return (
    <div className="spx-chart">
      <div className="spx-chart-body" style={{ height: sorted.length * ROW }}>
        {rows.filter((r) => rankOf[r.label] != null).map((r) => {
          const i = rankOf[r.label];
          const v = kpi.get(r);
          return (
            <button key={r.label} type="button"
              className={`spx-bar-row ${i === 0 ? "spx-lead" : ""} ${picked === r.label ? "spx-picked" : ""}`}
              style={{ transform: `translateY(${i * ROW}px)` }}
              onClick={() => onPickModel(r.label)}
              title={`${r.name} · ${r.provider} — open in the table`}>
              <span className="spx-rank spx-num">{i + 1}</span>
              <span className="spx-bar-name">{r.name}</span>
              <span className="spx-bar-track"><span className="spx-bar-fill" style={{ width: `${Math.max(4, Math.min(100, frac(v) * 100))}%` }} /></span>
              <span className="spx-bar-val spx-num">{kpi.fmt(v)}{kpi.unit ? <i> {kpi.unit}</i> : null}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Speed-vs-quality scatter. Dot size encodes cost per run (when known); quadrant hints
// label the corners; hovering names a model and clicking jumps to its table row.
function SpxScatter({ rows, xk, yk, quads, picked, onPick }) {
  const [hi, setHi] = useState(-1);
  const W = 720, H = 360;
  const pl = 48, pr = 18, pt = 24, pb = 42;
  const xs = rows.map(xk.get), ys = rows.map(yk.get);
  // Adaptive axis scaling: use log when the values span a wide range (e.g. first-token ms),
  // so a few big outliers don't crush everyone else into a corner.
  const axisScale = (vals, px0, px1) => {
    const f = vals.filter((v) => v != null && isFinite(v));
    let lo = Math.min(...f), hiV = Math.max(...f);
    if (lo > 0 && hiV / lo > 20) { const l0 = Math.log10(lo), l1 = Math.log10(hiV); return (v) => px0 + ((Math.log10(Math.max(v, lo)) - l0) / ((l1 - l0) || 1)) * (px1 - px0); }
    const pad = (hiV - lo) * 0.05 || 1; lo -= pad; hiV += pad;
    return (v) => px0 + ((v - lo) / ((hiV - lo) || 1)) * (px1 - px0);
  };
  const isLog = (vals) => { const f = vals.filter((v) => v != null && isFinite(v)); const lo = Math.min(...f), hiV = Math.max(...f); return lo > 0 && hiV / lo > 20; };
  const sx = axisScale(xs, pl, W - pr);
  const sy = axisScale(ys, H - pb, pt); // inverted: low value → bottom, high → top
  const xLog = isLog(xs), yLog = isLog(ys);
  // Cost → dot radius (sqrt scale so area reads roughly linearly).
  const costs = rows.map((r) => r.estCost).filter((v) => v != null && v > 0);
  const cMin = costs.length ? Math.min(...costs) : 0, cMax = costs.length ? Math.max(...costs) : 0;
  const radOf = (r) => {
    if (r.estCost == null || !costs.length || cMax <= cMin) return 5.5;
    const f = (Math.sqrt(r.estCost) - Math.sqrt(cMin)) / ((Math.sqrt(cMax) - Math.sqrt(cMin)) || 1);
    return 4 + f * 7;
  };
  // Deterministic jitter so models that share a coordinate don't perfectly overlap.
  const jit = (n) => (Math.abs(Math.sin(n * 12.9898) * 43758.5453) % 1) * 6 - 3;
  const pts = rows.map((r, i) => ({ r, i, cx: sx(xk.get(r)) + jit(i + 1), cy: sy(yk.get(r)) + jit(i + 101) }));
  // Greedy de-clutter: label higher-value points first; skip a label if it would collide.
  const labelShow = new Set();
  { const placed = []; const dx = 72, dy = 14;
    for (const p of [...pts].sort((a, b) => yk.get(b.r) - yk.get(a.r))) {
      if (!placed.some((q2) => Math.abs(p.cx - q2.cx) < dx && Math.abs(p.cy - q2.cy) < dy)) { labelShow.add(p.i); placed.push(p); }
    } }
  const hov = hi >= 0 ? rows[hi] : null;
  const midX = (pl + W - pr) / 2, midY = (pt + H - pb) / 2;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <line x1={pl} y1={pt} x2={pl} y2={H - pb} stroke="var(--line)" />
        <line x1={pl} y1={H - pb} x2={W - pr} y2={H - pb} stroke="var(--line)" />
        <line x1={midX} y1={pt} x2={midX} y2={H - pb} stroke="var(--line)" strokeDasharray="3 5" opacity="0.6" />
        <line x1={pl} y1={midY} x2={W - pr} y2={midY} stroke="var(--line)" strokeDasharray="3 5" opacity="0.6" />
        <text className="spx-quad" x={pl + 8} y={pt + 13} textAnchor="start">{quads.tl}</text>
        <text className="spx-quad" x={W - pr - 8} y={pt + 13} textAnchor="end">{quads.tr}</text>
        <text className="spx-quad" x={pl + 8} y={H - pb - 8} textAnchor="start">{quads.bl}</text>
        <text className="spx-quad" x={W - pr - 8} y={H - pb - 8} textAnchor="end">{quads.br}</text>
        <text className="spx-axis" x={(pl + W - pr) / 2} y={H - 10} textAnchor="middle">{xk.label}{xk.unit ? ` (${xk.unit})` : ""}{xLog ? " · log" : ""} →</text>
        <text className="spx-axis" x={14} y={(pt + H - pb) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(pt + H - pb) / 2})`}>{yk.label}{yk.unit ? ` (${yk.unit})` : ""}{yLog ? " · log" : ""} ↑</text>
        {pts.map(({ r, i, cx, cy }) => {
          const on = hi === i;
          const isPicked = picked === r.label;
          const right = cx > midX; // flip label to the left for right-side points
          const showLabel = on || isPicked || labelShow.has(i);
          const rad = radOf(r);
          return (
            <g key={r.label} className={`spx-dot ${on ? "spx-hot" : ""} ${isPicked ? "spx-picked" : ""}`}
              onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi((c) => (c === i ? -1 : c))}
              onClick={() => onPick(r.label)}>
              <circle cx={cx} cy={cy} r={on || isPicked ? rad + 1.5 : rad} />
              {showLabel && <text x={right ? cx - (rad + 4) : cx + (rad + 4)} y={cy + 3} textAnchor={right ? "end" : "start"}>{r.name.slice(0, 22)}</text>}
            </g>
          );
        })}
      </svg>
      {hov && (
        <div className="spx-tip spx-num">
          <b>{hov.name}</b> · {yk.label} {yk.fmt(yk.get(hov))}{yk.unit ? " " + yk.unit : ""} · {xk.label} {xk.fmt(xk.get(hov))}{xk.unit ? " " + xk.unit : ""}{hov.estCost != null ? ` · ${fmtUsd(hov.estCost)}/run` : ""}
        </div>
      )}
    </>
  );
}
