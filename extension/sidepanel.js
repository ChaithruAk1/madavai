// Madav for Chrome — side panel (agent brain) with multi-provider model picker.
// Observe → ask the active model for one action → execute via the worker → repeat.

const $ = (id) => document.getElementById(id);
const logEl = $("log");
let running = false;

// ---- providers (chrome.storage.local) ----
const DEFAULTS = {
  activeId: "madav",
  list: [
    // "Madav (desktop)" = the SAME models as your desktop app, run BY the desktop app
    // over the local link (⚙ → Madav link). Keys never enter Chrome. "Load models"
    // pulls the desktop's full catalog; ids are "profileId::model".
    { id: "madav", name: "Madav (desktop)", baseUrl: "http://127.0.0.1:8765", apiKey: "", model: "", models: [] },
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
  let p = s.providers;
  if (!p || !Array.isArray(p.list)) p = structuredClone(DEFAULTS);
  // Models come from the desktop app: make sure the "Madav (desktop)" provider exists
  // and is the default the first time, so the agent runs ON the app (no Chrome setup).
  if (!p.list.find((x) => x.id === "madav")) p.list.unshift(structuredClone(DEFAULTS.list[0]));
  if (!p.migratedDerive) { p.activeId = "madav"; p.migratedDerive = true; await chrome.storage.local.set({ providers: p }); }
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
// The dropdown is DERIVED FROM THE DESKTOP APP: it lists the exact same providers
// and models you configured in Madav (pulled over the local link via /hook/models).
// Nothing to set up in Chrome — pick a model and it runs ON the app (keys never leave it).
async function renderModelSelect() {
  const p = await getStore();
  const sel = $("modelSelect");
  sel.innerHTML = "";
  const madav = p.list.find((x) => x.id === "madav");
  const groups = (madav && madav.groups) || [];
  if (groups.length) {
    // mirror the application's own model picker: one optgroup per app profile
    for (const g of groups) {
      const og = document.createElement("optgroup");
      og.label = g.name + (g.kind ? "" : "");
      for (const m of g.models) {
        const o = document.createElement("option");
        o.value = "madav::" + g.id + "::" + m;     // pid::model handled by /hook/chat
        o.textContent = m;
        if (p.activeId === "madav" && madav.model === g.id + "::" + m) o.selected = true;
        og.appendChild(o);
      }
      sel.appendChild(og);
    }
    $("dot").className = "dot on";
    return;
  }
  // Not linked yet — one hint row (set the link token in ⚙ once).
  const o = document.createElement("option");
  o.value = ""; o.textContent = "Open the Madav app — your models load automatically";
  sel.appendChild(o);
  $("dot").className = "dot";
}
$("modelSelect").onchange = async (e) => {
  const v = e.target.value;
  if (!v) return;
  const i = v.indexOf("::");          // value = "madav::pid::model"
  const id = v.slice(0, i), model = v.slice(i + 2);
  const p = await getStore();
  p.activeId = id;
  const prov = p.list.find((x) => x.id === id);
  if (prov) prov.model = model;        // for madav, model = "pid::model"
  await setStore(p);
  renderModelSelect();
};

// Pull the app's whole catalog (same options as the application) over the local link.
async function loadAppCatalog(silent) {
  const link = await chrome.storage.local.get(["madavPort", "madavToken"]);
  const port = link.madavPort || "8765";
  const headers = link.madavToken ? { Authorization: "Bearer " + link.madavToken } : {};
  try {
    const res = await fetch(`http://127.0.0.1:${port}/hook/models`, { headers });
    if (!res.ok) throw new Error(res.status + " from Madav");
    const j = await res.json();
    const groups = (j.groups || []).filter((g) => g.models && g.models.length);
    if (!groups.length) throw new Error("no models from the app");
    const p = await getStore();
    const madav = p.list.find((x) => x.id === "madav");
    madav.groups = groups;
    madav.models = groups.flatMap((g) => g.models.map((m) => g.id + "::" + m));
    // default to the app's active model the first time
    const activeFlat = j.active && groups.find((g) => g.id === j.active) ? (j.active + "::" + groups.find((g) => g.id === j.active).models[0]) : madav.models[0];
    if (!madav.model || !madav.models.includes(madav.model)) madav.model = activeFlat;
    p.activeId = "madav";
    await setStore(p);
    renderModelSelect();
    if (!silent) setStatus(`Loaded ${madav.models.length} models from the app ✓`, true);
    return true;
  } catch (e) { if (!silent) setStatus("Couldn't reach the Madav app — make sure it's open, then try again."); return false; }
}

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
    let ids;
    if (prov.id === "madav") {
      // Pull the DESKTOP APP's whole catalog over the local link (ids: "profileId::model").
      const link = await chrome.storage.local.get(["madavPort", "madavToken"]);
      if (!link.madavToken) throw new Error("set the Madav webhook token below first");
      const res = await fetch(`http://127.0.0.1:${link.madavPort || "8765"}/hook/models`, { headers: { Authorization: "Bearer " + link.madavToken } });
      if (!res.ok) throw new Error(res.status + " from Madav — app running with webhooks on?");
      const j = await res.json();
      ids = (j.groups || []).flatMap((g) => g.models.map((m) => g.id + "::" + m));
    } else {
      const res = await fetch(modelsUrl(prov.baseUrl), { headers: prov.apiKey ? { Authorization: "Bearer " + prov.apiKey } : {} });
      if (!res.ok) throw new Error(res.status + " " + (await res.text()).slice(0, 120));
      const data = await res.json();
      ids = (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean).sort();
    }
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
  // "Madav (desktop)" provider: the desktop app runs the completion with ITS providers
  // and keys (which never enter Chrome). Model ids look like "pid::model".
  if (c.id === "madav") {
    const link = await chrome.storage.local.get(["madavPort", "madavToken"]);
    const headers = { "Content-Type": "application/json", ...(link.madavToken ? { Authorization: "Bearer " + link.madavToken } : {}) };
    const r = await fetch(`http://127.0.0.1:${link.madavPort || "8765"}/hook/chat`, {
      method: "POST", headers,
      body: JSON.stringify({ model: c.model, messages }),
    }).catch(() => { throw new Error("Couldn't reach the Madav desktop app — please open it, then try again."); });
    const j = await r.json().catch(() => ({}));
    if (!j.ok) throw new Error(j.error || ("Madav said " + r.status));
    return stripReasoning(j.text || "");
  }
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

// ---- Flow Recorder: record THIS tab's workflow → Madav drafts a skill from it ----
async function refreshRec() {
  const st = await chrome.runtime.sendMessage({ type: "rec-status" }).catch(() => null);
  const on = st && st.recording;
  $("recBtn").textContent = on ? `■ Stop — send to Madav (${st.steps} steps)` : "⏺ Record workflow → Madav skill";
  return on;
}
$("recBtn").onclick = async () => {
  const on = await refreshRec();
  if (!on) {
    const r = await chrome.runtime.sendMessage({ type: "rec-start" }).catch(() => null);
    $("recStatus").textContent = r && r.ok ? "Recording this tab — do the workflow, then Stop." : (r && r.error) || "couldn't start";
  } else {
    $("recStatus").textContent = "Sending to Madav…";
    const r = await chrome.runtime.sendMessage({ type: "rec-stop" }).catch(() => null);
    $("recStatus").textContent = (r && (r.note || r.error)) || "no reply";
  }
  refreshRec();
};
setInterval(refreshRec, 2500);

// Madav link settings (port + webhook token for /hook/flow)
(async () => {
  const c = await chrome.storage.local.get(["madavPort", "madavToken"]);
  if ($("mPort")) $("mPort").value = c.madavPort || "8765";
  if ($("mToken")) $("mToken").value = c.madavToken || "";
})();
if ($("saveMadav")) $("saveMadav").onclick = async () => {
  let port = "8765", token = "";
  const conn = (($("mConn") && $("mConn").value) || "").trim();
  if (conn) {                                   // "madav:<port>:<token>" from the app
    const parts = conn.replace(/^madav:/i, "").split(":");
    port = (parts[0] || "8765").trim(); token = (parts[1] || "").trim();
  } else {
    port = (($("mPort") && $("mPort").value) || "8765").trim();
    token = (($("mToken") && $("mToken").value) || "").trim();
  }
  await chrome.storage.local.set({ madavPort: port, madavToken: token });
  $("status").textContent = "Saved.";
  await loadAppCatalog(false);
};

renderModelSelect();
loadAppCatalog(true);                                  // auto-connect on open
setTimeout(() => loadAppCatalog(true), 2500);          // retry if the app was still starting
setTimeout(() => loadAppCatalog(true), 6000);
refreshRec();
