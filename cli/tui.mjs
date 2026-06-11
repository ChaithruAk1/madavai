// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// BrainEdge CLI — Ink (React-for-terminal) UI, modeled on top agent CLIs: a persistent rounded input box,
// a floating slash-command menu, bordered permission panels, live streaming, a spinner you can interrupt
// with Esc, and an arrow-key model picker. Written with React.createElement so it runs without a build.
import React from "react";
import path from "node:path";
import fs from "node:fs";
import { render, Box, Text, Static, useApp, useInput } from "ink";
import * as core from "./agent-core.mjs";

const h = React.createElement;
const { useState, useRef, useEffect } = React;

const TEAL = "#13c4d8", VIOLET = "#9280f8", DIM = "#7884a0", GREEN = "#3ecf8e", GOLD = "#e0b341", CORAL = "#e06c5b", LINE = "#33405a";
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const ICON = { read_file: "▤", list_files: "▦", search: "⌕", write_file: "✎", edit_file: "✎", run_command: "❯", web_fetch: "⊕", web_search: "⌕", spawn_subagent: "⎇", load_skill: "✦" };
const PALETTE = [
  ["/help", "show commands"], ["/model", "pick a model"], ["/compact", "summarize & shrink context"],
  ["/resume", "reopen a past session"], ["/clear", "new conversation"], ["/cd", "change working folder"],
  ["/add-dir", "add another folder"], ["/memory", "edit project guide"], ["/skills", "list skills"],
  ["/reload", "re-scan skills & commands"], ["/init", "create BRAINEDGE.md"], ["/undo", "revert last edit"],
  ["/cwd", "show folder"], ["/status", "session status"], ["/config", "show configuration"],
  ["/doctor", "run health checks"], ["/permissions", "approval mode"], ["/cost", "token estimate"],
  ["/auto", "toggle auto-approve"], ["/mcp", "connectors (desktop)"], ["/agents", "sub-agents (auto)"],
  ["/exit", "quit"],
];
const pad = (s, w) => { s = String(s); return s.length >= w ? s : s + " ".repeat(w - s.length); };
const clip = (s, n) => { s = String(s); return s.length <= n ? s : s.slice(0, n - 1) + "…"; };
const planLabel = () => core.USER.status === "active" ? "Subscribed" : core.USER.status === "trialing" ? (core.USER.daysLeft != null ? `Trial · ${core.USER.daysLeft}d` : "Trial") : (core.cfg.token ? (core.USER.status || "—") : "Local");

// Model classification (mirrors the GUI picker) for the /model filters.
const PURPOSES = ["any", "coding", "reasoning", "vision", "fast"];
const COSTS = ["all", "free", "paid"];
const classify = (id) => { const n = (id || "").toLowerCase();
  if (/cod(er|e)\b|coder|deepseek-coder/.test(n)) return "coding";
  if (/reason|\br1\b|\bo1\b|\bo3\b|qwq|thinking|think\b/.test(n)) return "reasoning";
  if (/vision|multimodal|\bvl\b|llava|-v\b/.test(n)) return "vision";
  if (/flash|mini|lite|haiku|tiny|small|turbo|nano/.test(n)) return "fast";
  return "general"; };
const isFreeModel = (id) => /:free\b/.test((id || "").toLowerCase());
const costOk = (m, cost) => cost === "all" || (cost === "free" ? isFreeModel(m) : !isFreeModel(m));
const purpOk = (m, purpose) => purpose === "any" || classify(m) === purpose;

function App() {
  const app = useApp();
  const [items, setItems] = useState([]);
  const [live, setLive] = useState("");
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [permission, setPermission] = useState(null); // { label, resolve }
  const [picker, setPicker] = useState(null);          // { all, filter, idx, resolve }
  const [tick, setTick] = useState(0);
  const [slashIdx, setSlashIdx] = useState(0);

  const msgs = useRef([{ role: "system", content: core.SYSTEM() }]);
  const abort = useRef(null);
  const startRef = useRef(0);
  const idc = useRef(0);
  const ctrlC = useRef(0);
  const sessionId = useRef("s" + Date.now().toString(36));

  const push = (kind, data) => setItems((prev) => [...prev, { id: ++idc.current, kind, ...data }]);
  const view = (p) => p.all.filter((m) => m.toLowerCase().includes(p.filter.toLowerCase()) && (p.kind !== "model" || (costOk(m, p.cost || "all") && purpOk(m, p.purpose || "any"))));

  useEffect(() => { push("banner", {}); }, []); // eslint-disable-line
  useEffect(() => { if (!busy) return; const t = setInterval(() => setTick((x) => x + 1), 100); return () => clearInterval(t); }, [busy]);
  useEffect(() => { setSlashIdx(0); }, [input]); // reset highlight when the typed command changes

  function askConfirm(label) {
    return new Promise((resolve) => {
      setPermission({ label, resolve: (choice) => { setPermission(null); if (choice === "always") { core.state.auto = true; resolve(true); } else resolve(choice === "yes"); } });
    });
  }

  async function runAgent(text) {
    msgs.current.push({ role: "user", content: text });
    setBusy(true); startRef.current = Date.now();
    const ac = new AbortController(); abort.current = ac;
    try {
      for (let step = 0; step < 24; step++) {
        let liveText = "";
        const { content, toolCalls } = await core.streamTurn(msgs.current, core.TOOLS, (chunk) => { liveText += chunk; setLive(liveText); }, ac.signal);
        setLive("");
        if (content) push("assistant", { text: content });
        if (!toolCalls.length) { msgs.current.push({ role: "assistant", content: content || "" }); break; }
        msgs.current.push({ role: "assistant", content: content || null, tool_calls: toolCalls.map((x) => ({ id: x.id, type: "function", function: { name: x.name, arguments: x.arguments } })) });
        for (const call of toolCalls) {
          const a = core.tolerantParse(call.arguments);
          push("tool", { name: call.name, label: call.name === "run_command" ? a.command : (a.path || a.query || a.task || a.name || "") });
          let out; try { out = await core.execTool(call.name, a, { confirm: askConfirm, onSubTool: (n, sa) => push("tool", { name: "↳ " + n, label: sa.path || sa.command || sa.query || "" }) }); } catch (e) { out = "Error: " + (e.message || e); }
          msgs.current.push({ role: "tool", tool_call_id: call.id, content: String(out).slice(0, 60000) });
        }
      }
    } catch (e) { if (!ac.signal.aborted) push("error", { text: String(e.message || e) }); }
    abort.current = null;
    try { core.saveSession(sessionId.current, msgs.current); } catch {}
    push("note", { text: `done · ${((Date.now() - startRef.current) / 1000).toFixed(1)}s` });
    setBusy(false);
  }

  async function chooseModel(arg) {
    if (arg) { core.cfg.model = arg; msgs.current[0] = { role: "system", content: core.SYSTEM() }; push("note", { text: "model → " + arg }); return; }
    push("note", { text: "loading models…" });
    const all = await core.fetchModels();
    if (!all.length) { push("error", { text: "Couldn't list models from this provider — use /model <id>." }); return; }
    const sel = await new Promise((resolve) => setPicker({ kind: "model", all, filter: "", idx: 0, cost: "all", purpose: "any", resolve }));
    setPicker(null);
    if (sel) { core.cfg.model = sel; msgs.current[0] = { role: "system", content: core.SYSTEM() }; push("note", { text: "model → " + sel }); }
  }

  const allCommands = () => [...PALETTE, ...core.COMMANDS.map((c) => ["/" + c.name, c.description])];

  function restoreSession(meta) {
    const full = core.loadSession(meta.id); if (!full) return;
    msgs.current = full.messages.slice();
    if (!msgs.current[0] || msgs.current[0].role !== "system") msgs.current.unshift({ role: "system", content: core.SYSTEM() });
    sessionId.current = meta.id;
    setItems((prev) => {
      const base = prev.filter((i) => i.kind === "banner");
      const restored = full.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ id: "r" + (++idc.current), kind: m.role === "user" ? "user" : "assistant", text: typeof m.content === "string" ? m.content : "[tool call]" }));
      return [...base, { id: "rn" + (++idc.current), kind: "note", text: `— resumed: ${meta.title} —` }, ...restored];
    });
  }
  async function resumeSession() {
    const sessions = core.listSessions();
    if (!sessions.length) { push("note", { text: "no saved sessions yet" }); return; }
    const all = sessions.map((s) => `${new Date(s.at).toLocaleString()} · ${s.count} msg · ${s.title}`);
    const sel = await new Promise((resolve) => setPicker({ kind: "session", all, filter: "", idx: 0, resolve }));
    setPicker(null);
    const meta = sessions[all.indexOf(sel)];
    if (meta) restoreSession(meta);
  }

  async function handleSlash(v) {
    const [cmd, ...rest] = v.slice(1).split(/\s+/); const arg = rest.join(" ").trim();
    const rebuildSys = () => { msgs.current[0] = { role: "system", content: core.SYSTEM() }; };
    switch (cmd) {
      case "exit": case "quit": app.exit(); break;
      case "help": push("note", { text: allCommands().map(([c, d]) => "  " + pad(c, 11) + " " + d).join("\n") }); break;
      case "model": case "models": await chooseModel(arg); break;
      case "compact": { push("note", { text: "compacting…" }); try { const sum = await core.summarize(msgs.current); msgs.current = [{ role: "system", content: core.SYSTEM() }, { role: "user", content: "Summary of the earlier conversation:\n" + sum }]; setItems((p) => p.filter((i) => i.kind === "banner")); push("note", { text: "context compacted ✓" }); push("assistant", { text: sum }); } catch (e) { push("error", { text: "compact failed: " + (e.message || e) }); } break; }
      case "resume": await resumeSession(); break;
      case "clear": msgs.current = [{ role: "system", content: core.SYSTEM() }]; setItems((p) => p.filter((i) => i.kind === "banner")); sessionId.current = "s" + Date.now().toString(36); push("note", { text: "conversation cleared" }); break;
      case "cd": { if (!arg) { push("note", { text: core.ROOT }); break; } try { const r = core.setRoot(arg); rebuildSys(); push("note", { text: "cwd → " + r }); } catch (e) { push("error", { text: e.message || String(e) }); } break; }
      case "add-dir": case "adddir": { if (!arg) { push("note", { text: "usage: /add-dir <path>" }); break; } try { const d = core.addDir(arg); rebuildSys(); push("note", { text: "added folder: " + d }); } catch (e) { push("error", { text: e.message || String(e) }); } break; }
      case "memory": { const r = core.openMemory(); push("note", { text: r.opened ? `opened ${r.file}` : `edit ${r.file}` }); break; }
      case "cwd": push("note", { text: core.listRoots().join("\n") }); break;
      case "skills": push("note", { text: core.SKILLS.length ? core.SKILLS.map((s) => "  ✦ " + s.name + " — " + s.description).join("\n") : "No skills. Add SKILL.md folders under .brainedge/skills, then /reload." }); break;
      case "reload": core.reloadSkills(); core.reloadCommands(); rebuildSys(); push("note", { text: `reloaded — ${core.SKILLS.length} skill(s), ${core.COMMANDS.length} command(s)` }); break;
      case "init": { const f = path.join(core.ROOT, "BRAINEDGE.md"); if (fs.existsSync(f)) push("note", { text: "BRAINEDGE.md already exists" }); else { fs.writeFileSync(f, "# Project guide\n\nDescribe this project, its conventions, and rules the agent should always follow.\n"); rebuildSys(); push("note", { text: "created BRAINEDGE.md" }); } break; }
      case "undo": push("note", { text: core.undoLast() }); break;
      case "status": push("note", { text: [`model    ${core.cfg.model}`, `provider ${core.cfg.baseUrl}`, `folder   ${core.ROOT}`, `messages ${msgs.current.filter((m) => m.role === "user" || m.role === "assistant").length}`, `approve  ${core.state.auto ? "auto" : "ask"}`, `plan     ${planLabel()}`].join("\n") }); break;
      case "config": push("note", { text: [`model    ${core.cfg.model}`, `kind     ${core.cfg.kind}`, `baseUrl  ${core.cfg.baseUrl}`, `apiKey   ${core.cfg.apiKey ? "set" : "missing"}`, `gated    ${core.cfg.token ? "yes" : "no"}`].join("\n") }); break;
      case "doctor": { push("note", { text: "running checks…" }); const checks = await core.doctor(); push("note", { text: checks.map((c) => `  ${c.ok ? "✓" : "✗"} ${pad(c.name, 16)} ${c.detail}`).join("\n") }); break; }
      case "permissions": push("note", { text: `approval: ${core.state.auto ? "auto-approve (no prompts)" : "ask before changes"} — toggle with /auto` }); break;
      case "cost": { const ch = msgs.current.reduce((n, m) => n + (typeof m.content === "string" ? m.content.length : 0), 0); push("note", { text: `~${Math.round(ch / 4)} tokens this session (estimate)` }); break; }
      case "auto": core.state.auto = !core.state.auto; push("note", { text: "auto-approve " + (core.state.auto ? "ON" : "OFF") }); break;
      case "mcp": push("note", { text: "Connectors (MCP) are managed in the BrainEdge desktop app." }); break;
      case "agents": push("note", { text: "Sub-agents run automatically — the model calls spawn_subagent for big independent tasks." }); break;
      default: { const cc = core.COMMANDS.find((x) => x.name === cmd); if (cc) { push("user", { text: v }); runAgent(core.expandCommand(cmd, arg)); } else push("error", { text: "unknown command — /help for the list" }); }
    }
  }

  function submit(v) { if (v.startsWith("/")) handleSlash(v); else { push("user", { text: v }); runAgent(v); } }

  useInput((ch, key) => {
    if (permission) {
      if (ch === "1" || key.return) return permission.resolve("yes");
      if (ch === "2") return permission.resolve("always");
      if (ch === "3" || key.escape || (ch && ch.toLowerCase() === "n")) return permission.resolve("no");
      return;
    }
    if (picker) {
      const n = view(picker).length; const last = Math.max(0, n - 1);
      if (key.upArrow) return setPicker((p) => ({ ...p, idx: Math.max(0, p.idx - 1) }));
      if (key.downArrow) return setPicker((p) => ({ ...p, idx: Math.min(last, p.idx + 1) }));
      if (key.pageUp) return setPicker((p) => ({ ...p, idx: Math.max(0, p.idx - 10) }));
      if (key.pageDown) return setPicker((p) => ({ ...p, idx: Math.min(last, p.idx + 10) }));
      if (picker.kind === "model" && key.leftArrow) { const i = PURPOSES.indexOf(picker.purpose || "any"); return setPicker((p) => ({ ...p, purpose: PURPOSES[(i - 1 + PURPOSES.length) % PURPOSES.length], idx: 0 })); }
      if (picker.kind === "model" && key.rightArrow) { const i = PURPOSES.indexOf(picker.purpose || "any"); return setPicker((p) => ({ ...p, purpose: PURPOSES[(i + 1) % PURPOSES.length], idx: 0 })); }
      if (picker.kind === "model" && key.tab) { const i = COSTS.indexOf(picker.cost || "all"); return setPicker((p) => ({ ...p, cost: COSTS[(i + 1) % COSTS.length], idx: 0 })); }
      if (key.return) return picker.resolve(view(picker)[Math.min(picker.idx, last)] || null);
      if (key.escape) return picker.resolve(null);
      if (key.backspace || key.delete) return setPicker((p) => ({ ...p, filter: p.filter.slice(0, -1), idx: 0 }));
      if (ch && !key.ctrl && !key.meta) return setPicker((p) => ({ ...p, filter: p.filter + ch, idx: 0 }));
      return;
    }
    if (key.ctrl && ch === "c") { if (++ctrlC.current >= 2) app.exit(); else { if (busy && abort.current) abort.current.abort(); push("note", { text: "press Ctrl+C again to exit" }); setTimeout(() => (ctrlC.current = 0), 1500); } return; }
    if (busy) { if (key.escape && abort.current) { abort.current.abort(); push("note", { text: "interrupted" }); } return; }
    ctrlC.current = 0;
    // Live slash menu navigation (only while typing a bare "/command" with no space yet).
    const sh = /^\/\S*$/.test(input) ? allCommands().filter(([c]) => c.startsWith(input)) : [];
    if (sh.length) {
      const si = Math.min(slashIdx, sh.length - 1);
      if (key.upArrow) return setSlashIdx(Math.max(0, si - 1));
      if (key.downArrow) return setSlashIdx(Math.min(sh.length - 1, si + 1));
      if (key.tab) return setInput(sh[si][0] + " ");
      if (key.return) { const cmd = sh[si][0]; setInput(""); submit(cmd); return; }
    }
    if (key.return) { const v = input.trim(); setInput(""); if (v) submit(v); return; }
    if (key.backspace || key.delete) return setInput((s) => s.slice(0, -1));
    if (key.tab) { if (input.startsWith("/")) { const hit = PALETTE.find(([c]) => c.startsWith(input)); if (hit) setInput(hit[0] + " "); } return; }
    if (ch && !key.ctrl && !key.meta) setInput((s) => s + ch);
  });

  // ---------- render helpers ----------
  const seg = (color, s) => h(Text, { color }, s);
  function renderItem(item) {
    if (item.kind === "banner") return h(Box, { key: item.id, flexDirection: "column", borderStyle: "round", borderColor: TEAL, paddingX: 1, marginBottom: 1 },
      h(Text, null, h(Text, { color: TEAL, bold: true }, "⬢ BRAINEDGE "), seg(DIM, "cli")),
      h(Text, null, seg("#e4e8f0", "Welcome back "), h(Text, { color: TEAL, bold: true }, (core.USER.name ? core.USER.name.split(" ")[0] : "there") + "!")),
      h(Text, null, " "),
      h(Text, null, seg(DIM, "model  "), core.cfg.model || "—"),
      h(Text, null, seg(DIM, "plan   "), seg(GREEN, planLabel())),
      h(Text, null, seg(DIM, "dir    "), path.basename(core.ROOT) || core.ROOT),
      h(Text, null, " "),
      seg(DIM, "Type a task, or / for commands · Tab completes · Esc interrupts"));
    if (item.kind === "user") return h(Box, { key: item.id }, h(Text, { color: VIOLET }, "❯ "), h(Text, null, item.text));
    if (item.kind === "assistant") return h(Box, { key: item.id }, h(Text, { color: TEAL }, "● "), h(Text, null, item.text));
    if (item.kind === "tool") return h(Text, { key: item.id, color: DIM }, "│ " + (ICON[item.name] || "•") + " " + item.name + (item.label ? "  " + clip(item.label, 64) : ""));
    if (item.kind === "error") return h(Text, { key: item.id, color: CORAL }, item.text);
    return h(Text, { key: item.id, color: DIM }, item.text); // note
  }

  const SLW = 10; // visible rows in the live slash menu
  const slashAll = /^\/\S*$/.test(input) ? allCommands().filter(([c]) => c.startsWith(input)) : [];
  const sIdx = Math.min(slashIdx, Math.max(0, slashAll.length - 1));
  const sStart = Math.max(0, Math.min(sIdx - 5, Math.max(0, slashAll.length - SLW)));
  const slashWin = slashAll.slice(sStart, sStart + SLW);
  const elapsed = startRef.current ? ((Date.now() - startRef.current) / 1000).toFixed(1) : "0.0";
  const pview = picker ? view(picker) : [];
  const PWIN = 12; // visible rows in the model picker
  const pIdx = picker ? Math.min(picker.idx, Math.max(0, pview.length - 1)) : 0;
  const pStart = picker ? Math.max(0, Math.min(pIdx - 6, Math.max(0, pview.length - PWIN))) : 0; // window follows the selection
  const pWindow = picker ? pview.slice(pStart, pStart + PWIN) : [];

  return h(Box, { flexDirection: "column" },
    h(Static, { items }, (item) => renderItem(item)),
    live ? h(Box, null, h(Text, { color: TEAL }, "● "), h(Text, null, live)) : null,
    busy && !live && !permission && !picker ? h(Text, { color: DIM }, `${FRAMES[tick % FRAMES.length]} thinking · ${elapsed}s  (esc to interrupt)`) : null,

    permission ? h(Box, { flexDirection: "column", borderStyle: "round", borderColor: GOLD, paddingX: 1 },
      h(Text, { color: GOLD }, "⚠ " + permission.label), h(Text, null, " "),
      h(Text, null, seg(GREEN, "1"), " Yes    ", seg(GREEN, "2"), " Yes, don't ask again    ", seg(CORAL, "3"), " No")) : null,

    picker ? h(Box, { flexDirection: "column", borderStyle: "round", borderColor: TEAL, paddingX: 1 },
      h(Text, null, seg(TEAL, (picker.kind === "session" ? "Resume a session  " : "Select a model  ")), seg(DIM, `${pview.length ? pIdx + 1 : 0}/${pview.length} · type to filter · ↑↓ · PgUp/PgDn · Enter · Esc`)),
      h(Text, null, seg(DIM, "filter: "), picker.filter ? h(Text, null, picker.filter) : seg("#56607a", "(type to narrow)")),
      picker.kind === "model" ? h(Text, null, seg(DIM, "best for: "), seg((picker.purpose || "any") === "any" ? DIM : TEAL, picker.purpose || "any"), seg(DIM, " ←→    cost: "), seg((picker.cost || "all") === "all" ? DIM : TEAL, picker.cost || "all"), seg(DIM, " Tab")) : null,
      pStart > 0 ? seg(DIM, "  ↑ more") : null,
      ...pWindow.map((m, i) => { const real = pStart + i; const sel = real === pIdx; return h(Text, { key: m, color: sel ? TEAL : undefined }, (sel ? "❯ " : "  ") + m + (m === core.cfg.model ? "  ● current" : "")); }),
      pStart + PWIN < pview.length ? seg(DIM, "  ↓ more") : null) : null,

    !permission && !picker ? h(Box, { flexDirection: "column" },
      slashAll.length ? h(Box, { flexDirection: "column", borderStyle: "round", borderColor: LINE, paddingX: 1 },
        h(Text, null, seg(DIM, `commands ${sIdx + 1}/${slashAll.length} · ↑↓ to move · Enter to run · Tab to fill`)),
        sStart > 0 ? seg(DIM, "  ↑ more") : null,
        ...slashWin.map(([c, d], i) => { const real = sStart + i; const sel = real === sIdx; return h(Text, { key: c }, seg(sel ? TEAL : "#aab2c5", (sel ? "❯ " : "  ") + pad(c, 11)), seg(DIM, " " + d)); }),
        sStart + SLW < slashAll.length ? seg(DIM, "  ↓ more") : null) : null,
      h(Box, { borderStyle: "round", borderColor: input.startsWith("/") ? TEAL : LINE, paddingX: 1 },
        h(Text, { color: TEAL }, "❯ "),
        input.length ? h(Text, null, input) : seg("#56607a", "Ask anything, or / for commands"))) : null,
  );
}

export function start() { render(h(App)); }
