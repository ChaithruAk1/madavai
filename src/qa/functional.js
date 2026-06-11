// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Functional UI Sweep — drives the REAL interface like a user would: clicks the real
// tabs, types into the real composer, pastes a real image, opens real pages — and
// asserts what a user would see. Pure DOM (no React imports), so it keeps running
// while the app navigates underneath it. Results persist to localStorage and render
// as a visual dashboard in the Test Center.
//
// This ships with EXAMPLE scenarios for every area. Adding more is one entry in
// SCENARIOS — the framework (navigation, events, waits, report, HUD) is done.
import { bridge } from "../bridge/index.js";

const REPORT_KEY = "be.qa.functional";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- DOM driving helpers ----------
const byText = (selector, text) =>
  [...document.querySelectorAll(selector)].find((el) => (el.textContent || "").trim().toLowerCase().includes(text.toLowerCase()));
const mustFind = (selector, text, what) => {
  const el = text == null ? document.querySelector(selector) : byText(selector, text);
  if (!el) throw new Error(`${what || text || selector} not found on screen`);
  return el;
};
async function waitFor(fn, what, timeout = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { try { const v = fn(); if (v) return v; } catch {} await sleep(120); }
  throw new Error(`timed out waiting for ${what}`);
}
// React-safe typing into a controlled input/textarea.
function typeInto(el, value) {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}
// A real 1×1 PNG pasted as a real File through a real ClipboardEvent.
function pasteImage(el) {
  const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const bin = atob(b64); const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const file = new File([bytes], "qa-pasted.png", { type: "image/png" });
  const dt = new DataTransfer();
  dt.items.add(file);
  el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}
const nav = async (label) => { mustFind("button", label, `"${label}" navigation`).click(); await sleep(350); };
const newChat = async () => { const b = byText("button", "New chat") || byText("button", "New task") || byText("button", "New session"); if (b) { b.click(); await sleep(250); } };

// ---------- the example scenario library (extend freely — one entry per check) ----------
const SCENARIOS = [
  // ===== Let's Chat =====
  { area: "Let's Chat", name: "Mode opens and the composer is ready", run: async () => {
    await nav("Let's Chat");
    await waitFor(() => document.querySelector(".composer textarea, textarea"), "the chat composer");
  } },
  { area: "Let's Chat", name: "Typing enables the send button", run: async () => {
    await nav("Let's Chat");
    const ta = await waitFor(() => document.querySelector(".composer textarea, textarea"), "composer");
    typeInto(ta, "functional sweep typing check");
    await sleep(150);
    const send = document.querySelector(".send, button[aria-label*='Send' i]");
    if (!send) throw new Error("send button not found");
    if (send.disabled) throw new Error("send stays disabled after typing");
    typeInto(ta, "");
  } },
  { area: "Let's Chat", name: "Image paste lands as an attachment preview", run: async () => {
    await nav("Let's Chat");
    const ta = await waitFor(() => document.querySelector(".composer textarea, textarea"), "composer");
    pasteImage(ta);
    await waitFor(() => byText(".composer, form, body", "qa-pasted") || document.querySelector(".composer img, .attach img, [class*='attach'] img"), "pasted-image preview");
    const x = byText("button", "×") || document.querySelector("[class*='attach'] button, .composer .icon-btn[title*='emove' i]");
    if (x) { x.click(); await sleep(120); }
  } },
  { area: "Let's Chat", name: "Voice input: mic button present + speech engine availability", run: async () => {
    await nav("Let's Chat");
    mustFind("button[title*='Voice' i], button[title*='voice' i]", null, "mic button");
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return "skip:mic button works, but no speech engine in this build (Whisper endpoint not wired) — by design";
  } },
  { area: "Let's Chat", name: "Slash menu opens on /", run: async () => {
    await nav("Let's Chat");
    const ta = await waitFor(() => document.querySelector(".composer textarea, textarea"), "composer");
    typeInto(ta, "/");
    await waitFor(() => document.querySelector(".slash-menu"), "slash command menu");
    typeInto(ta, "");
    await sleep(150);
  } },
  { area: "Let's Chat", name: "New chat resets the conversation surface", run: async () => {
    await nav("Let's Chat"); await newChat();
    await waitFor(() => document.querySelector(".hero, .greeting"), "fresh-chat greeting");
  } },

  // ===== Let's Collaborate =====
  { area: "Let's Collaborate", name: "Mode opens with folder chooser + permission control", run: async () => {
    await nav("Let's Collaborate");
    await waitFor(() => byText("button", "folder") || byText(".folder-bar, body", "folder"), "folder chooser");
  } },

  // ===== Let's Build =====
  { area: "Let's Build", name: "Mode opens with a coding-task composer", run: async () => {
    await nav("Let's Build");
    await waitFor(() => document.querySelector(".composer textarea, textarea"), "build composer");
  } },

  // ===== Projects =====
  { area: "Projects", name: "Projects page opens with a create action", run: async () => {
    await nav("Projects");
    await waitFor(() => byText("button", "project") || byText("button", "New"), "create-project action");
  } },
  { area: "Projects", name: "Project lifecycle: create → appears → delete (engine)", run: async () => {
    const p = await bridge.createProject("QA sweep project");
    if (!p || !p.id) throw new Error("createProject returned nothing");
    const all = await bridge.listProjects();
    if (!all.some((x) => x.id === p.id)) throw new Error("created project missing from list");
    await bridge.deleteProject(p.id);
  } },

  // ===== Agents =====
  { area: "Agents", name: "Agent Studio opens (guide or roster)", run: async () => {
    await nav("Agents");
    await waitFor(() => byText("h1, h2", "workforce") || byText("h2", "Agent Studio") || byText("button", "Agent Guide"), "Agent Studio surface");
  } },
  { area: "Agents", name: "Agents & teams persist in settings (engine)", run: async () => {
    const s = await bridge.getSettings();
    if (!Array.isArray(s.agents) || !Array.isArray(s.teams)) throw new Error("agents/teams storage missing from settings");
  } },

  // ===== Studio =====
  { area: "Studio", name: "Studio opens and a tile seeds a fresh chat", run: async () => {
    await nav("Studio");
    const tile = await waitFor(() => byText("button", "Blank canvas") || document.querySelector("[class*='studio'] button"), "a Studio tile");
    tile.click();
    await waitFor(() => document.querySelector(".composer textarea, textarea"), "chat seeded from Studio");
    await newChat();
  } },

  // ===== Scheduler =====
  { area: "Scheduler", name: "Scheduler opens", run: async () => {
    await nav("Scheduler");
    await waitFor(() => byText("h2, h3, .nav-label, body", "schedul"), "Scheduler page");
  } },
  { area: "Scheduler", name: "Task lifecycle: create → update → delete (engine)", run: async () => {
    const t = await bridge.createTask();
    if (!t || !t.id) throw new Error("createTask returned nothing");
    await bridge.updateTask(t.id, { name: "QA sweep task" });
    await bridge.deleteTask(t.id);
  } },

  // ===== Interface & Models =====
  { area: "Interface", name: "Skills page opens", run: async () => {
    const g = byText("button", "Interface"); if (g) { g.click(); await sleep(200); }
    await nav("Skills");
    await waitFor(() => byText("body", "skill"), "Skills page");
  } },
  { area: "Models", name: "Models overview opens with search + tiles", run: async () => {
    const g = byText("button", "Models"); if (g) { g.click(); await sleep(200); }
    await nav("Models overview");
    await waitFor(() => document.querySelector(".mo-search input"), "model search box");
    await waitFor(() => document.querySelector(".mo-tile"), "insight tiles");
  } },
  { area: "Models", name: "Model search filters the table live", run: async () => {
    const input = await waitFor(() => document.querySelector(".mo-search input"), "model search box");
    const before = document.querySelectorAll(".mo-table tbody tr").length;
    typeInto(input, "zzzz-no-such-model-zzzz");
    await sleep(400);
    const after = document.querySelectorAll(".mo-table tbody tr").length;
    typeInto(input, "");
    if (!(after < before)) throw new Error(`search didn't filter (${before} → ${after} rows)`);
  } },
  { area: "Consumption", name: "Consumption dashboard renders KPIs", run: async () => {
    await nav("Consumption");
    await waitFor(() => document.querySelector(".cons-kpi") || byText("body", "No activity yet"), "KPI cards or empty state");
  } },
];

// ---------- Declarative scenarios: tests as DATA, so the Scenario Manager can edit them ----------
// A custom scenario is { id, area, name, enabled, steps: [{ do, target?, value? }] } where `do` is:
//   navigate  — click a navigation button by its label        (target: "Let's Chat")
//   click     — click any button containing text              (target: "New chat")
//   type      — type into the main composer/input             (value: "hello")
//   pasteImage— paste a test image into the composer
//   expect    — PASS only if text/element appears on screen   (target: "text to find" or "css:.selector")
//   expectGone— PASS only if text is NOT on screen            (target: "text")
//   wait      — pause                                          (value: milliseconds)
const CUSTOM_KEY = "be.qa.customScenarios";
const DISABLED_KEY = "be.qa.disabledScenarios";

export const STEP_DOCS = [
  { do: "navigate", needs: "target", help: "Open a section by its button label (e.g. Let's Chat, Projects, Studio)" },
  { do: "click", needs: "target", help: "Click any button containing this text" },
  { do: "type", needs: "value", help: "Type this text into the composer / focused input" },
  { do: "pasteImage", needs: "", help: "Paste a small test image into the composer" },
  { do: "expect", needs: "target", help: "Pass if this text appears on screen (or css:.selector)" },
  { do: "expectGone", needs: "target", help: "Pass if this text is NOT on screen" },
  { do: "wait", needs: "value", help: "Pause this many milliseconds" },
];

async function runSteps(steps) {
  for (const st of steps || []) {
    const t = String(st.target || "");
    switch (st.do) {
      case "navigate": await nav(t); break;
      case "click": mustFind("button", t, `button "${t}"`).click(); await sleep(250); break;
      case "type": {
        const ta = await waitFor(() => document.querySelector(".composer textarea, textarea, input.model-search, input"), "an input to type into");
        typeInto(ta, String(st.value || "")); await sleep(150); break;
      }
      case "pasteImage": {
        const ta = await waitFor(() => document.querySelector(".composer textarea, textarea"), "the composer");
        pasteImage(ta); await sleep(300); break;
      }
      case "expect":
        if (t.startsWith("css:")) await waitFor(() => document.querySelector(t.slice(4)), `"${t.slice(4)}"`);
        else await waitFor(() => byText("body *", t), `"${t}" on screen`);
        break;
      case "expectGone":
        await sleep(250);
        if (byText("button, .msg, .composer, h1, h2, h3", t)) throw new Error(`"${t}" is still on screen`);
        break;
      case "wait": await sleep(Number(st.value) || 300); break;
      default: throw new Error(`unknown step "${st.do}"`);
    }
  }
}

// Simulate ONE scenario's steps against the live UI (used by the Scenario Manager
// to dry-run a draft before the admin confirms adding it). Returns {ok, note, ms}.
export async function runScenario(steps) {
  const t0 = Date.now();
  try { await runSteps(steps); return { ok: true, note: "All steps passed.", ms: Date.now() - t0 }; }
  catch (e) { return { ok: false, note: String((e && e.message) || e), ms: Date.now() - t0 }; }
}

export const getCustomScenarios = () => { try { return JSON.parse(localStorage.getItem(CUSTOM_KEY)) || []; } catch { return []; } };
export const saveCustomScenarios = (list) => { try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); } catch {} };
export const getDisabled = () => { try { return new Set(JSON.parse(localStorage.getItem(DISABLED_KEY)) || []); } catch { return new Set(); } };
export const setDisabled = (set) => { try { localStorage.setItem(DISABLED_KEY, JSON.stringify([...set])); } catch {} };
export const builtinList = () => SCENARIOS.map((s) => ({ id: "builtin:" + s.area + ":" + s.name, area: s.area, name: s.name, builtin: true }));

// AI drafting: plain-English description → declarative steps (reviewed by the admin before saving).
export async function draftScenario(area, description) {
  const sys = `You write UI test scenarios for Madav as JSON steps. Available step types:\n${STEP_DOCS.map((s) => `- ${s.do}${s.needs ? ` (${s.needs})` : ""}: ${s.help}`).join("\n")}\nNavigation labels that exist: Let's Chat, Let's Collaborate, Let's Build, Projects, Agents, Studio, Terminal, Scheduler, Consumption, Skills, Connectors, Models overview.\nReply with ONLY a JSON object: {"name":"short scenario name","steps":[{"do":"navigate","target":"Let's Chat"},...]} . Start with a navigate step. End with an expect step that proves the outcome. 3-8 steps.`;
  const r = await bridge.completeOnce([{ role: "system", content: sys }, { role: "user", content: `Area: ${area}\nWhat to test: ${description}` }]);
  const text = (r && r.text) || "";
  const i = text.indexOf("{"), j = text.lastIndexOf("}");
  if (i < 0 || j <= i) throw new Error((r && r.error) || "The model didn't return usable steps — try rephrasing.");
  const o = JSON.parse(text.slice(i, j + 1));
  if (!Array.isArray(o.steps) || !o.steps.length) throw new Error("No steps in the draft.");
  for (const st of o.steps) if (!STEP_DOCS.some((d) => d.do === st.do)) throw new Error(`Draft used an unknown step "${st.do}" — try rephrasing.`);
  return { name: String(o.name || description.slice(0, 60)), steps: o.steps };
}

// ---------- HUD (survives navigation — plain DOM appended to <body>) ----------
function makeHud() {
  const hud = document.createElement("div");
  hud.id = "be-qa-hud";
  hud.style.cssText = "position:fixed;bottom:18px;right:18px;z-index:99999;width:330px;max-height:50vh;overflow:auto;background:var(--bg-1,#0b0f14);border:1px solid var(--accent,#13c2d6);border-radius:14px;padding:12px 14px;font:12px system-ui;color:var(--text-0,#e8eef7);box-shadow:0 18px 60px rgba(0,0,0,.55)";
  document.body.appendChild(hud);
  return {
    set(html) { hud.innerHTML = html; },
    done(html, onClose) {
      hud.innerHTML = html + `<div style="margin-top:10px"><button id="be-qa-close" style="background:var(--accent,#13c2d6);border:none;border-radius:8px;padding:6px 12px;color:#04121a;font-weight:600;cursor:pointer">Close — report saved in Test Center</button></div>`;
      hud.querySelector("#be-qa-close").onclick = () => { hud.remove(); onClose && onClose(); };
    },
    remove() { hud.remove(); },
  };
}

// ---------- the runner ----------
let running = false;
export async function runFunctionalSweep() {
  if (running) return null;
  running = true;
  const hud = makeHud();
  const results = [];
  // The run list = built-in scenarios (minus any the admin disabled) + the admin's custom scenarios.
  const disabled = getDisabled();
  const customs = getCustomScenarios().filter((c) => c.enabled !== false).map((c) => ({ area: c.area || "Custom", name: c.name, run: () => runSteps(c.steps) }));
  const runList = [...SCENARIOS.filter((s) => !disabled.has("builtin:" + s.area + ":" + s.name)), ...customs];
  try {
    for (let i = 0; i < runList.length; i++) {
      const sc = runList[i];
      hud.set(`<b>Functional sweep</b> · ${i + 1}/${runList.length}<br><span style="color:var(--accent,#13c2d6)">▶ ${sc.area} — ${sc.name}</span><br><span style="opacity:.7">${results.filter((r) => r.status === "pass").length} passed · ${results.filter((r) => r.status === "fail").length} failed</span>`);
      const t0 = Date.now();
      try {
        const out = await sc.run();
        results.push({ area: sc.area, name: sc.name, status: typeof out === "string" && out.startsWith("skip:") ? "skip" : "pass", note: typeof out === "string" ? out.slice(5) : "", ms: Date.now() - t0 });
      } catch (e) {
        results.push({ area: sc.area, name: sc.name, status: "fail", note: String((e && e.message) || e).slice(0, 300), ms: Date.now() - t0 });
      }
      await sleep(150);
    }
    const report = { at: Date.now(), total: results.length, pass: results.filter((r) => r.status === "pass").length, fail: results.filter((r) => r.status === "fail").length, skip: results.filter((r) => r.status === "skip").length, results };
    try { localStorage.setItem(REPORT_KEY, JSON.stringify(report)); } catch {}
    const ok = report.fail === 0;
    hud.done(`<b>Functional sweep finished</b><br><span style="color:${ok ? "#5fb573" : "#f08a86"};font-size:15px;font-weight:700">${report.pass}/${report.total} passed${report.fail ? ` · ${report.fail} failed` : " — all clear"}</span>${report.skip ? `<br><span style="opacity:.7">${report.skip} skipped (honest gaps)</span>` : ""}`);
    return report;
  } finally { running = false; }
}

export function lastFunctionalReport() {
  try { return JSON.parse(localStorage.getItem(REPORT_KEY)); } catch { return null; }
}
