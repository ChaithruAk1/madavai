// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Flow Recorder — teach-by-demonstration (Playwright codegen, the Madav way).
//
// The user opens a real browser window, performs a workflow by hand, and stops; the
// recorded steps (clicks by role+name, fills by field label, navigations) are distilled
// by the active model into a DRAFT skill that lands in the Skill Forge approval queue
// (Skills screen → "Learned drafts") — same human-click rule as everything else.
//
// Privacy: values typed into password/credential/payment fields are NEVER recorded
// (same FORBIDDEN pattern as the agent fill guard); other values are kept so the skill
// can describe the workflow concretely. The window is USER-driven — no allowlist applies.
const { BrowserWindow } = require("electron");

const FORBIDDEN_SRC = "passw|cvv|cvc|card.?num|cardnumber|ccnum|cc-(number|exp|csc)|expir|ssn|social.?sec|secret|otp|\\bpin\\b";

// Injected on every page while recording: capture clicks/changes/submits into
// sessionStorage (survives same-origin navigation), drained by a main-process poll.
const REC_JS = `(() => {
  if (window.__beRecOn) return "already";
  window.__beRecOn = true;
  const FORBIDDEN = new RegExp(${JSON.stringify(FORBIDDEN_SRC)}, "i");
  const push = (e) => {
    try {
      const buf = JSON.parse(sessionStorage.getItem("__beRec") || "[]");
      buf.push(e);
      sessionStorage.setItem("__beRec", JSON.stringify(buf.slice(-120)));
    } catch {}
  };
  const nameOf = (el) => {
    let s = el.getAttribute && (el.getAttribute("aria-label") || "");
    if (!s && el.labels && el.labels[0]) s = el.labels[0].innerText;
    if (!s) s = (el.innerText || el.value || el.placeholder || el.title || el.name || "").trim();
    return String(s).replace(/\\s+/g, " ").slice(0, 70);
  };
  document.addEventListener("click", (ev) => {
    const el = ev.target && ev.target.closest && ev.target.closest("a,button,[role=button],[role=link],[role=tab],input[type=submit],input[type=checkbox],input[type=radio],select,[onclick]");
    if (!el) return;
    push({ t: "click", role: el.tagName.toLowerCase(), name: nameOf(el), at: Date.now() });
  }, { capture: true, passive: true });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (!el || !el.tagName || !/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
    const meta = [(el.type || ""), el.name || "", el.id || "", el.placeholder || "", (el.labels && el.labels[0] && el.labels[0].innerText) || ""].join(" ");
    const secret = el.type === "password" || FORBIDDEN.test(meta);
    push({ t: "fill", field: nameOf(el) || el.name || el.type, value: secret ? "(redacted — credential field)" : String(el.value || "").slice(0, 80), at: Date.now() });
  }, { capture: true, passive: true });
  push({ t: "page", url: location.href, title: document.title, at: Date.now() });
  return "on";
})()`;

const DRAIN_JS = `(() => { try { const b = JSON.parse(sessionStorage.getItem("__beRec") || "[]"); sessionStorage.setItem("__beRec", "[]"); return b; } catch { return []; } })()`;

let active = null; // { win, steps, timer }

function start() {
  if (active) { try { active.win.focus(); } catch {} return { already: true }; }
  const win = new BrowserWindow({
    width: 1100, height: 800, title: "Madav — Recording your workflow (close this window to finish)",
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  });
  const steps = [];
  const inject = () => { win.webContents.executeJavaScript(REC_JS, true).catch(() => {}); };
  win.webContents.on("did-finish-load", inject);
  const timer = setInterval(async () => {
    try {
      const batch = await win.webContents.executeJavaScript(DRAIN_JS, true);
      if (Array.isArray(batch) && batch.length) steps.push(...batch);
      if (steps.length > 300) steps.splice(0, steps.length - 300);
    } catch {}
  }, 600);
  win.loadURL("https://duckduckgo.com");
  active = { win, steps, timer };
  // Closing the window = "stop": distill whatever was recorded.
  win.on("closed", () => { const a = active; active = null; clearInterval(a.timer); distill(a.steps).catch(() => {}); });
  return { recording: true };
}

function status() { return { recording: !!active, steps: active ? active.steps.length : 0 }; }

function stop() {
  if (!active) return { recording: false };
  try { active.win.close(); } catch {} // 'closed' handler does the distilling
  return { stopping: true };
}

// Turn raw steps into a Skill Forge DRAFT via the active model (approval still required).
async function distill(steps) {
  if (!steps || steps.length < 3) return;
  const settings = require("./settings.cjs");
  const profile = settings.activeProfile();
  if (!profile || !profile.baseUrl || !profile.model) return;
  const { streamChat } = require("./providers.cjs");
  const lines = steps.map((s) =>
    s.t === "page" ? `OPENED ${s.url} ("${s.title || ""}")`
    : s.t === "click" ? `CLICKED ${s.role} "${s.name}"`
    : `FILLED "${s.field}" with "${s.value}"`).join("\n");
  const sys = `The user DEMONSTRATED a browser workflow by hand; you turn it into a reusable SKILL for an agent with browse_open/browse_read/browse_click/browse_fill tools. Reply with ONLY the file content, no fence:
---
name: <kebab-case-short-name>
description: <one sentence: when Madav should use this workflow>
---

# <Title>

<Numbered steps an agent should follow to repeat this workflow: which site to open, what to look for on each page (by the visible labels the user clicked), what to fill where. Generalize obvious specifics (search terms, dates) into <placeholders>. Note that credential fields must be left for the human. Max 300 words.>`;
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 90000);
  let text = "";
  try { text = (await streamChat({ ...profile }, [{ role: "system", content: sys }, { role: "user", content: "RECORDED STEPS:\n" + lines.slice(0, 8000) }], { signal: ac.signal, onDelta: () => {} })).text || ""; }
  catch { return; } finally { clearTimeout(to); }
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text.trim().replace(/^```[a-z]*\n|```$/g, ""));
  if (!m) return;
  const name = ((/name:\s*(.+)/.exec(m[1]) || [])[1] || "").trim().replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const description = ((/description:\s*(.+)/.exec(m[1]) || [])[1] || "").trim();
  if (!name || !description) return;
  // Reuse the Skill Forge draft queue + approval UI.
  const fs = require("fs");
  const path = require("path");
  const dataFile = path.join(require("electron").app.getPath("userData"), "skill-forge.json");
  let st; try { st = JSON.parse(fs.readFileSync(dataFile, "utf8")); } catch { st = { obs: [], drafts: {}, lastForge: 0 }; }
  st.drafts = st.drafts || {};
  st.drafts[name] = { name, description, body: text.trim(), evidence: ["(recorded by you in the Flow Recorder — " + steps.length + " steps)"], at: Date.now() };
  try { fs.writeFileSync(dataFile, JSON.stringify(st, null, 2)); } catch {}
}

module.exports = { start, stop, status, distill }; // distill is reused by /hook/flow (Chrome-extension recordings)
