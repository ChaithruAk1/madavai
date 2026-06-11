// Madav for Chrome — side panel (agent brain) with multi-provider model picker.
// Observe → ask the active model for one action → execute via the worker → repeat.

const $ = (id) => document.getElementById(id);
const logEl = $("log");
let running = false;

// ---- providers (chrome.storage.local) ----
const DEFAULTS = {
  activeId: "openrouter",
  list: [
    { id: "openrouter", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "", model: "openai/gpt-4o-mini", models: [] },
    { id: "nim", name: "NVIDIA NIM", baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "", model: "meta/llama-3.3-70b-instruct", models: [] },
    { id: "gemini", name: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "", model: "gemini-2.0-flash", models: [] },
    { id: "deepseek", name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", apiKey: "", model: "deepseek-chat", models: [] },
    { id: "ollama", name: "Ollama (local)", baseUrl: "http://localhost:11434/v1", apiKey: "", model: "llama3.1", models: [] },
    { id: "lmstudio", name: "LM Studio (local)", baseUrl: "http://localhost:1234/v1", apiKey: "", model: "local-model", models: [] },
  ],
};

async function getStore() {
  const s = await chrome.storage.local.get("providers");
  const p = s.providers;
  if (!p || !Array.isArray(p.list)) return structuredClone(DEFAULTS);
  return p;
}
async function setStore(p) { await chrome.storage.local.set({ providers: p }); }
function activeOf(p) { return p.list.find((x) => x.id === p.activeId) || p.list[0]; }

// ---- URL resolution (same idea as the desktop app) ----
function withV1(base) {
  let b = (base || "").trim().replace(/\/+$/, "");
  if (!/\/v1$|\/v1beta|\/openai$/.test(b)) b += "/v1";
  return b;
}
function chatUrl(base) {
  let b = (base || "").trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(b)) return b;
  return withV1(b) + "/chat/completions";
}
function modelsUrl(base) { return withV1(base) + "/models"; }

// ---- header model selector ----
async function renderModelSelect() {
  const p = await getStore();
  const sel = $("modelSelect");
  sel.innerHTML = "";
  for (const prov of p.list) {
    const og = document.createElement("optgroup");
    og.label = prov.name + (prov.apiKey || /localhost|127\.0\.0\.1/.test(prov.baseUrl) ? "" : " (no key)");
    const models = prov.models && prov.models.length ? prov.models : [prov.model].filter(Boolean);
    for (const m of models) {
      const o = document.createElement("option");
      o.value = prov.id + "::" + m;
      o.textContent = m;
      if (prov.id === p.activeId && m === prov.model) o.selected = true;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  const a = activeOf(p);
  $("dot").className = "dot" + (a.apiKey || /localhost|127\.0\.0\.1/.test(a.baseUrl) ? " on" : "");
}
$("modelSelect").onchange = async (e) => {
  const [id, model] = e.target.value.split("::");
  const p = await getStore();
  p.activeId = id;
  const prov = p.list.find((x) => x.id === id);
  if (prov) prov.model = model;
  await setStore(p);
  renderModelSelect();
};

// ---- settings drawer (provider editor) ----
let editId = null;
$("gear").onclick = async () => { $("settings").classList.toggle("open"); if ($("settings").classList.contains("open")) await renderProvEditor(); };

async function renderProvEditor() {
  const p = await getStore();
  if (!editId || !p.list.find((x) => x.id === editId)) editId = p.activeId;
  const provSel = $("provSelect");
  provSel.innerHTML = "";
  for (const prov of p.list) {
    const o = document.createElement("option");
    o.value = prov.id; o.textContent = prov.name;
    if (prov.id === editId) o.selected = true;
    provSel.appendChild(o);
  }
  const prov = p.list.find((x) => x.id === editId);
  $("pName").value = prov.name; $("pBase").value = prov.baseUrl; $("pKey").value = prov.apiKey; $("pModel").value = prov.model;
}
$("provSelect").onchange = (e) => { editId = e.target.value; renderProvEditor(); };

function setStatus(t, ok) { const s = $("status"); s.textContent = t; s.style.color = ok ? "var(--ok)" : "var(--text2)"; }

$("saveProv").onclick = async () => {
  const p = await getStore();
  const prov = p.list.find((x) => x.id === editId);
  prov.name = $("pName").value.trim() || prov.name;
  prov.baseUrl = $("pBase").value.trim();
  prov.apiKey = $("pKey").value.trim();
  prov.model = $("pModel").value.trim();
  await setStore(p);
  setStatus("Saved ✓", true);
  renderModelSelect(); renderProvEditor();
};
$("addProv").onclick = async () => {
  const p = await getStore();
  const id = "p_" + Math.random().toString(36).slice(2, 7);
  p.list.push({ id, name: "New provider", baseUrl: "https://", apiKey: "", model: "", models: [] });
  editId = id; await setStore(p);
  renderModelSelect(); renderProvEditor();
};
$("delProv").onclick = async () => {
  const p = await getStore();
  if (p.list.length <= 1) { setStatus("Keep at least one provider."); return; }
  p.list = p.list.filter((x) => x.id !== editId);
  if (p.activeId === editId) p.activeId = p.list[0].id;
  editId = p.list[0].id; await setStore(p);
  renderModelSelect(); renderProvEditor();
};
$("loadModels").onclick = async () => {
  const p = await getStore();
  const prov = p.list.find((x) => x.id === editId);
  prov.baseUrl = $("pBase").value.trim(); prov.apiKey = $("pKey").value.trim();
  setStatus("Loading models…");
  try {
    const res = await fetch(modelsUrl(prov.baseUrl), { headers: prov.apiKey ? { Authorization: "Bearer " + prov.apiKey } : {} });
    if (!res.ok) throw new Error(res.status + " " + (await res.text()).slice(0, 120));
    const data = await res.json();
    const ids = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
    if (!ids.length) throw new Error("no models returned");
    prov.models = ids;
    if (!prov.model || !ids.includes(prov.model)) prov.model = ids[0];
    await setStore(p);
    setStatus(`Loaded ${ids.length} models ✓`, true);
    $("pModel").value = prov.model;
    renderModelSelect();
  } catch (e) { setStatus("Couldn't load models: " + (e.message || e)); }
};

// ---- log ----
function clearEmpty() { const e = logEl.querySelector(".empty"); if (e) e.remove(); }
function log(kind, action, text) {
  clearEmpty();
  const div = document.createElement("div");
  div.className = "step" + (kind === "answer" ? " answer" : kind === "err" ? " err" : "");
  div.innerHTML = `<div class="a"></div>` + (text ? `<div class="t"></div>` : "");
  div.querySelector(".a").textContent = action;
  if (text) div.querySelector(".t").textContent = text;
  logEl.appendChild(div); logEl.scrollTop = logEl.scrollHeight;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- LLM ----
function stripReasoning(s) {
  if (!s) return "";
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const i = s.lastIndexOf("</think>");
  if (i !== -1) s = s.slice(i + 8);
  return s.trim();
}
async function askLLM(messages) {
  const p = await getStore();
  const c = activeOf(p);
  if (!c.apiKey && !/localhost|127\.0\.0\.1/.test(c.baseUrl)) throw new Error("No API key for " + c.name + " — open ⚙ and add one.");
  const url = chatUrl(c.baseUrl);
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: "Bearer " + c.apiKey } : {}), "HTTP-Referer": "https://madav.local", "X-Title": "Madav for Chrome" },
      body: JSON.stringify({ model: c.model, messages, temperature: 0 }),
    });
  } catch (e) { throw new Error("Network error to " + url); }
  if (!res.ok) {
    const body = (await res.text()).slice(0, 240);
    throw new Error(res.status + " at " + url + (body ? " — " + body : " (empty → wrong URL or model)"));
  }
  const data = await res.json();
  return stripReasoning(data.choices?.[0]?.message?.content || "");
}
function parseAction(raw) {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { action: "done", answer: raw.slice(0, 400) };
  try { return JSON.parse(m[0]); } catch { return { action: "done", answer: raw.slice(0, 400) }; }
}

const SYSTEM = `You are Madav, a browsing agent controlling ONE Chrome tab.
Each turn you receive the page URL, title, a text excerpt, and a numbered list of interactive elements.
Reply with ONLY a JSON object, no prose, no markdown:
{"thought":"one short sentence","action":"click|type|submit|scroll|navigate|done","index":<element number or null>,"text":"text to type, or 'up'/'down' for scroll","url":"only for navigate","answer":"only for done — your final answer"}
Use the element "index" numbers exactly as listed. To search: type into the box then "submit". Use "navigate" for a URL. When done or able to answer, use "done" with a helpful "answer". Smallest reasonable step each turn.`;

function observationText(o) {
  const els = o.elements.map((e) => `[${e.i}] <${e.tag}${e.type ? " " + e.type : ""}> ${e.label || "(no label)"}`).join("\n");
  return `URL: ${o.url}\nTITLE: ${o.title}\n\nPAGE TEXT (excerpt):\n${o.text}\n\nINTERACTIVE ELEMENTS:\n${els}`;
}

async function runGoal(goal) {
  const history = [{ role: "system", content: SYSTEM }, { role: "user", content: "GOAL: " + goal }];
  for (let step = 0; step < 14 && running; step++) {
    let obs;
    try { obs = await chrome.runtime.sendMessage({ type: "observe" }); }
    catch { log("err", "error", "Couldn't read the page — reload the tab."); return; }
    if (!obs || obs.error) { log("err", "error", (obs && obs.error) || "no page"); return; }
    history.push({ role: "user", content: "OBSERVATION (step " + (step + 1) + "):\n" + observationText(obs) });

    let reply;
    try { reply = await askLLM(history); } catch (e) { log("err", "error", String(e.message || e)); return; }
    history.push({ role: "assistant", content: reply });

    const act = parseAction(reply);
    if (act.thought) log("step", (act.action || "?").toUpperCase(), act.thought);
    if (act.action === "done") { log("answer", "DONE", act.answer || "Finished."); return; }

    if (act.action === "navigate") {
      const r = await chrome.runtime.sendMessage({ type: "navigate", url: act.url || act.text || "" });
      log("step", "NAVIGATE", act.url || act.text);
      await sleep(1800);
      history.push({ role: "user", content: "RESULT: " + ((r && r.result) || "navigated") });
      continue;
    }
    const r = await chrome.runtime.sendMessage({ type: "act", cmd: { action: act.action, index: act.index, text: act.text } });
    const result = (r && (r.result || r.error)) || "done";
    log("step", "RESULT", `${act.action} → ${result}`);
    history.push({ role: "user", content: "RESULT: " + result });
    await sleep(900);
  }
  if (running) log("answer", "STOPPED", "Reached the step limit. Refine the goal and continue.");
}

async function start() {
  if (running) { running = false; $("run").textContent = "▶"; return; }
  const goal = $("goal").value.trim();
  if (!goal) return;
  $("goal").value = "";
  log("step", "GOAL", goal);
  running = true; $("run").textContent = "■";
  try { await runGoal(goal); } finally { running = false; $("run").textContent = "▶"; }
}
$("run").onclick = start;
$("goal").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); start(); } });

renderModelSelect();
