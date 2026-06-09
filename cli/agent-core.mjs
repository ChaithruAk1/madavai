// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// Agent core for the BrainEdge CLI — all logic, no UI. The Ink TUI (tui.mjs) and the fallback REPL
// both drive this. Provider transport, tools, checkpoints, skills, web access, sub-agents, model list.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync, spawn } from "node:child_process";

export let ROOT = process.cwd();
const extraDirs = [];
export function setRoot(p) { const abs = path.resolve(ROOT, p); if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) throw new Error("not a folder: " + p); ROOT = abs; return ROOT; }
export function addDir(p) { const abs = path.resolve(ROOT, p); if (!fs.existsSync(abs)) throw new Error("not found: " + p); if (!extraDirs.includes(abs)) extraDirs.push(abs); return abs; }
export function listRoots() { return [ROOT, ...extraDirs]; }
const argv = process.argv.slice(2);
const modelFlag = argv.includes("--model") ? argv[argv.indexOf("--model") + 1] : null;
export const state = { auto: argv.includes("--yes") || argv.includes("-y") };
export const USER = { name: "", status: "", daysLeft: null };

// ---------- config ----------
export function loadConfig() {
  let cfg = { kind: "openai" };
  for (const p of [path.join(ROOT, "brainedge.config.json"), path.join(os.homedir(), ".brainedge", "config.json")]) {
    try { cfg = { ...cfg, ...JSON.parse(fs.readFileSync(p, "utf8")) }; break; } catch {}
  }
  const e = process.env;
  if (e.BRAINEDGE_BASE_URL) cfg.baseUrl = e.BRAINEDGE_BASE_URL;
  if (e.BRAINEDGE_API_KEY) cfg.apiKey = e.BRAINEDGE_API_KEY;
  if (e.BRAINEDGE_MODEL) cfg.model = e.BRAINEDGE_MODEL;
  if (e.BRAINEDGE_KIND) cfg.kind = e.BRAINEDGE_KIND;
  if (modelFlag) cfg.model = modelFlag;
  return cfg;
}
export const cfg = loadConfig();
export const configured = () => !!(cfg.baseUrl && cfg.model);

// ---------- provider transport (OpenAI-compatible function calling, streamed) ----------
export const apiBase = (b) => { b = (b || "").replace(/\/$/, ""); return /\/v\d|\/openai/.test(b) ? b : b + "/v1"; };
async function* sseLines(res) {
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
  while (true) { const { done, value } = await reader.read(); if (done) break; buf += dec.decode(value, { stream: true });
    let nl; while ((nl = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (line.startsWith("data:")) yield line.slice(5).trim(); } }
}
export async function streamTurn(messages, tools, onText, signal) {
  const res = await fetch(apiBase(cfg.baseUrl) + "/chat/completions", {
    method: "POST", headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {}) },
    body: JSON.stringify({ model: cfg.model, messages, tools, tool_choice: "auto", stream: true }), signal,
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  let content = ""; const calls = {};
  for await (const data of sseLines(res)) {
    if (data === "[DONE]") break;
    let j; try { j = JSON.parse(data); } catch { continue; }
    const d = j.choices && j.choices[0] && j.choices[0].delta; if (!d) continue;
    if (d.content) { content += d.content; onText && onText(d.content); }
    if (d.tool_calls) for (const tc of d.tool_calls) { const i = tc.index || 0; calls[i] = calls[i] || { id: "", name: "", arguments: "" };
      if (tc.id) calls[i].id = tc.id; if (tc.function?.name) calls[i].name += tc.function.name; if (tc.function?.arguments) calls[i].arguments += tc.function.arguments; }
  }
  const toolCalls = Object.values(calls).filter((x) => x.name);
  toolCalls.forEach((x, i) => { if (!x.id) x.id = "call_" + i; });
  return { content, toolCalls };
}

// ---------- skills + project memory ----------
export function loadSkills() {
  const dirs = [path.join(ROOT, ".brainedge", "skills"), path.join(ROOT, "skills"), path.join(os.homedir(), ".brainedge", "skills")];
  const out = [];
  for (const d of dirs) { let names = []; try { names = fs.readdirSync(d); } catch { continue; }
    for (const n of names) { try {
      const file = path.join(d, n, "SKILL.md"); const md = fs.readFileSync(file, "utf8");
      const nm = (md.match(/^name:\s*(.+)$/im) || [])[1] || n;
      const de = (md.match(/^description:\s*([\s\S]*?)(?:\n[a-z_]+:|\n---)/im) || [])[1] || "";
      out.push({ name: nm.trim(), description: de.replace(/\s+/g, " ").trim().slice(0, 200), file });
    } catch {} } }
  return out;
}
export let SKILLS = loadSkills();
export function reloadSkills() { SKILLS = loadSkills(); return SKILLS; }
export function projectMemory() { for (const f of ["BRAINEDGE.md", "CLAUDE.md", "AGENTS.md", ".brainedge.md"]) { try { return `\n\nProject guide (${f}) — always follow:\n` + fs.readFileSync(path.join(ROOT, f), "utf8").slice(0, 8000); } catch {} } return ""; }
const SKILLS_TXT = () => SKILLS.length ? "\n\nAvailable skills (call load_skill with the exact name for full instructions before using one):\n" + SKILLS.map((s) => `- ${s.name}: ${s.description}`).join("\n") : "";
export const SYSTEM = () => `You are BrainEdge, a terminal coding agent working in the folder: ${ROOT}.
Use the tools to read, search, write, edit files and run commands. You can also access the web (web_fetch/web_search) and delegate big independent chunks of work with spawn_subagent. Inspect before editing. Keep replies concise.
Make changes by calling tools — don't just print code unless asked. Every file write is checkpointed (the user can /undo). When done, give a short summary.` + projectMemory() + SKILLS_TXT();

// ---------- tools ----------
const within = (p) => { const abs = path.resolve(ROOT, p || "."); if ([ROOT, ...extraDirs].some((r) => abs === r || abs.startsWith(r + path.sep))) return abs; throw new Error("path escapes the working folder(s)"); };
export const TOOLS = [
  { type: "function", function: { name: "list_files", description: "List file paths in the project (recursive, skips node_modules/.git).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "read_file", description: "Read a text file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "search", description: "Search text across files; returns path:line matches.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite a file.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace the first occurrence of `find` with `replace` in a file.", parameters: { type: "object", properties: { path: { type: "string" }, find: { type: "string" }, replace: { type: "string" } }, required: ["path", "find", "replace"] } } },
  { type: "function", function: { name: "run_command", description: "Run a shell command in the project folder.", parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
  { type: "function", function: { name: "web_fetch", description: "Fetch a web page and return its readable text.", parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "web_search", description: "Search the web and return result snippets.", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } },
  { type: "function", function: { name: "spawn_subagent", description: "Delegate a focused, self-contained sub-task to a helper agent that reports back a summary.", parameters: { type: "object", properties: { task: { type: "string" } }, required: ["task"] } } },
  { type: "function", function: { name: "load_skill", description: "Load full instructions for a named skill before using it.", parameters: { type: "object", properties: { name: { type: "string" } }, required: ["name"] } } },
];
export function walk(dir = ROOT, prefix = "", out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue;
    const full = path.join(dir, name); const rel = prefix ? prefix + "/" + name : name;
    if (fs.statSync(full).isDirectory()) { if (out.length < 4000) walk(full, rel, out); } else out.push(rel);
    if (out.length >= 4000) break;
  }
  return out;
}

// ---------- checkpoints (undo) ----------
const checkpoints = [];
function snapshot(p) { let before = null, op = "create"; try { before = fs.readFileSync(p, "utf8"); op = "edit"; } catch {} checkpoints.push({ op, path: p, before }); }
export function undoLast() {
  const cp = checkpoints.pop(); if (!cp) return "Nothing to undo.";
  try { if (cp.op === "create") fs.rmSync(cp.path, { force: true }); else fs.writeFileSync(cp.path, cp.before); return `Reverted ${path.relative(ROOT, cp.path) || cp.path}`; }
  catch (e) { return "Undo failed: " + (e.message || e); }
}

// ---------- web access ----------
async function webGet(url, query) {
  let target = url;
  if (query && !target) target = "https://duckduckgo.com/html/?q=" + encodeURIComponent(query);
  if (!/^https?:\/\//i.test(target || "")) return "Provide an http(s) url or a query.";
  try {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 15000);
    const r = await fetch(target, { headers: { "User-Agent": "BrainEdge/1.0" }, redirect: "follow", signal: ac.signal }).finally(() => clearTimeout(to));
    const ct = r.headers.get("content-type") || ""; let t = (await r.text()).slice(0, 600000);
    if (/html/i.test(ct)) t = t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<\/(p|div|li|h[1-6]|tr|br)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
    return `# ${r.url} (${r.status})\n\n` + t.slice(0, 30000);
  } catch (e) { return "Web request failed: " + (e.message || e); }
}

// ---------- subagent ----------
const SUB_TOOLS = TOOLS.filter((t) => t.function.name !== "spawn_subagent");
async function runSubagent(task, ctx) {
  const msgs = [{ role: "system", content: `You are a focused sub-agent in ${ROOT}. Do ONLY the task below, then reply with a concise summary. Use the tools as needed.\n\nTASK:\n${task}` }, { role: "user", content: task }];
  for (let step = 0; step < 12; step++) {
    const { content, toolCalls } = await streamTurn(msgs, SUB_TOOLS, null);
    if (!toolCalls.length) return content || "(sub-agent finished)";
    msgs.push({ role: "assistant", content: content || null, tool_calls: toolCalls.map((x) => ({ id: x.id, type: "function", function: { name: x.name, arguments: x.arguments } })) });
    for (const call of toolCalls) {
      let a = {}; try { a = JSON.parse(call.arguments || "{}"); } catch {}
      ctx && ctx.onSubTool && ctx.onSubTool(call.name, a);
      let out; try { out = await execTool(call.name, a, { ...ctx, sub: true }); } catch (e) { out = "Error: " + (e.message || e); }
      msgs.push({ role: "tool", tool_call_id: call.id, content: String(out).slice(0, 40000) });
    }
  }
  return "(sub-agent reached its step limit)";
}

// ---------- tool execution. ctx.confirm(label, name, args) -> Promise<boolean> for destructive ops ----------
const DESTRUCTIVE = new Set(["write_file", "edit_file", "run_command"]);
export async function execTool(name, a, ctx = {}) {
  if (DESTRUCTIVE.has(name) && !state.auto && !ctx.sub && ctx.confirm) {
    const label = name === "run_command" ? `run  ${a.command}` : `${name === "write_file" ? "write" : "edit"}  ${a.path}`;
    const ok = await ctx.confirm(label, name, a);
    if (!ok) return "(declined by user)";
  }
  switch (name) {
    case "list_files": return walk().join("\n") || "(empty)";
    case "read_file": { const t = fs.readFileSync(within(a.path), "utf8"); return t.length > 60000 ? t.slice(0, 60000) + "\n…(truncated)" : t; }
    case "search": { const q = (a.query || "").toLowerCase(); const out = []; for (const f of walk()) { if (out.length >= 100) break;
      let t; try { t = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { continue; }
      t.split("\n").forEach((ln, i) => { if (out.length < 100 && ln.toLowerCase().includes(q)) out.push(`${f}:${i + 1}: ${ln.trim().slice(0, 200)}`); }); }
      return out.length ? out.join("\n") : "No matches."; }
    case "write_file": { const p = within(a.path); snapshot(p); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, a.content ?? ""); return "wrote " + a.path; }
    case "edit_file": { const p = within(a.path); const t = fs.readFileSync(p, "utf8"); const i = t.indexOf(a.find); if (i < 0) return "ERROR: text to replace not found."; snapshot(p); fs.writeFileSync(p, t.slice(0, i) + a.replace + t.slice(i + a.find.length)); return "edited " + a.path; }
    case "run_command": { try { return (execSync(a.command, { cwd: ROOT, timeout: 120000, stdio: "pipe" }).toString() || "(no output)").slice(0, 8000); } catch (e) { return "Command failed:\n" + String(e.stdout || "") + String(e.stderr || e.message).slice(0, 4000); } }
    case "web_fetch": return await webGet(a.url, null);
    case "web_search": return await webGet(null, a.query);
    case "spawn_subagent": return await runSubagent(a.task || "", ctx);
    case "load_skill": { const s = SKILLS.find((x) => x.name.toLowerCase() === (a.name || "").toLowerCase()); if (!s) return "No such skill."; try { return fs.readFileSync(s.file, "utf8").slice(0, 20000); } catch { return "Couldn't read skill."; } }
    default: return "unknown tool";
  }
}

// ---------- model list ----------
export async function fetchModels() {
  try {
    const r = await fetch(apiBase(cfg.baseUrl) + "/models", { headers: cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {} });
    if (!r.ok) return [];
    const j = await r.json().catch(() => ({}));
    const arr = j.data || j.models || [];
    return [...new Set(arr.map((m) => (typeof m === "string" ? m : (m.id || m.name))).filter(Boolean))].sort();
  } catch { return []; }
}

// ---------- single-shot completion (no tools) — used by /compact ----------
export async function complete(userText, sys) {
  const messages = [];
  if (sys) messages.push({ role: "system", content: sys });
  messages.push({ role: "user", content: userText });
  const { content } = await streamTurn(messages, [], null);
  return content || "";
}
export async function summarize(messages) {
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => `${m.role}: ${typeof m.content === "string" ? m.content : "[tool call]"}`).join("\n").slice(-12000);
  return complete(`Summarize this coding session concisely so it can replace the history while keeping all decisions, file changes, and open tasks. Use short bullet points.\n\n${convo}`, "You compress conversations faithfully and briefly.");
}

// ---------- session persistence (for /resume) ----------
const SESS_DIR = path.join(os.homedir(), ".brainedge", "sessions");
const firstUserText = (messages) => { const u = messages.find((m) => m.role === "user"); return u ? String(u.content).slice(0, 60) : "session"; };
export function saveSession(id, messages) {
  try { fs.mkdirSync(SESS_DIR, { recursive: true });
    if ((messages || []).filter((m) => m.role === "user").length === 0) return;
    fs.writeFileSync(path.join(SESS_DIR, id + ".json"), JSON.stringify({ id, root: ROOT, at: Date.now(), title: firstUserText(messages), messages }));
  } catch {}
}
export function listSessions() {
  try { return fs.readdirSync(SESS_DIR).filter((f) => f.endsWith(".json")).map((f) => { try { const j = JSON.parse(fs.readFileSync(path.join(SESS_DIR, f), "utf8")); return { id: j.id, at: j.at, title: j.title, root: j.root, count: (j.messages || []).filter((m) => m.role === "user").length }; } catch { return null; } }).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, 50); } catch { return []; }
}
export function loadSession(id) { try { return JSON.parse(fs.readFileSync(path.join(SESS_DIR, id + ".json"), "utf8")); } catch { return null; } }

// ---------- custom slash commands (markdown in .brainedge/commands or ~/.brainedge/commands) ----------
export function loadCommands() {
  const dirs = [path.join(ROOT, ".brainedge", "commands"), path.join(os.homedir(), ".brainedge", "commands")];
  const out = [];
  for (const d of dirs) { let files = []; try { files = fs.readdirSync(d); } catch { continue; }
    for (const f of files) { if (!f.endsWith(".md")) continue; try {
      const body = fs.readFileSync(path.join(d, f), "utf8");
      const name = f.replace(/\.md$/, "");
      const desc = (body.match(/^description:\s*(.+)$/im) || [])[1] || "custom command";
      const template = body.replace(/^---[\s\S]*?---\s*/m, "").trim();
      if (!out.find((c) => c.name === name)) out.push({ name, description: desc.trim().slice(0, 60), template });
    } catch {} } }
  return out;
}
export let COMMANDS = loadCommands();
export function reloadCommands() { COMMANDS = loadCommands(); return COMMANDS; }
export function expandCommand(name, args) { const c = COMMANDS.find((x) => x.name === name); if (!c) return null; return c.template.replace(/\$ARGUMENTS/g, args || "").replace(/\$1/g, (args || "").split(/\s+/)[0] || ""); }

// ---------- diagnostics: ping + doctor ----------
export async function ping() {
  try { const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 8000);
    const r = await fetch(apiBase(cfg.baseUrl) + "/models", { headers: cfg.apiKey ? { Authorization: "Bearer " + cfg.apiKey } : {}, signal: ac.signal }).finally(() => clearTimeout(to));
    return r.ok ? { ok: true } : { ok: false, detail: "HTTP " + r.status };
  } catch (e) { return { ok: false, detail: String((e && e.message) || e) }; }
}
export async function doctor() {
  const checks = [];
  checks.push({ name: "Node", ok: true, detail: process.version });
  checks.push({ name: "Provider", ok: !!cfg.baseUrl, detail: cfg.baseUrl || "not set" });
  checks.push({ name: "Model", ok: !!cfg.model, detail: cfg.model || "not set" });
  checks.push({ name: "API key", ok: !!cfg.apiKey, detail: cfg.apiKey ? "present" : "missing" });
  const p = await ping(); checks.push({ name: "Connectivity", ok: p.ok, detail: p.ok ? "reachable" : (p.detail || "unreachable") });
  let writable = false; try { const t = path.join(ROOT, ".brainedge-write-test"); fs.writeFileSync(t, "x"); fs.rmSync(t); writable = true; } catch {}
  checks.push({ name: "Folder writable", ok: writable, detail: ROOT });
  checks.push({ name: "Skills", ok: true, detail: String(SKILLS.length) });
  checks.push({ name: "Custom commands", ok: true, detail: String(COMMANDS.length) });
  checks.push({ name: "Subscription", ok: !cfg.token || USER.status === "active" || USER.status === "trialing", detail: cfg.token ? (USER.status || "—") : "local (ungated)" });
  return checks;
}

// ---------- open the project guide in an editor (for /memory) ----------
export function openMemory() {
  const f = path.join(ROOT, "BRAINEDGE.md");
  try { if (!fs.existsSync(f)) fs.writeFileSync(f, "# Project guide\n\nRules and context the agent should always follow.\n"); } catch {}
  const tryOpen = (cmd, args) => { try { spawn(cmd, args, { detached: true, stdio: "ignore" }).unref(); return true; } catch { return false; } };
  // Prefer VS Code (opens a separate window, won't fight the terminal UI), then OS default.
  if (tryOpen(process.platform === "win32" ? "code.cmd" : "code", [f])) return { file: f, opened: "code" };
  if (process.platform === "win32" && tryOpen("cmd", ["/c", "start", "", f])) return { file: f, opened: "default" };
  if (process.platform === "darwin" && tryOpen("open", [f])) return { file: f, opened: "default" };
  if (tryOpen("xdg-open", [f])) return { file: f, opened: "default" };
  return { file: f, opened: null };
}

// ---------- subscription check ----------
export async function verifyEntitlement() {
  if (!cfg.authBaseUrl || !cfg.token) return { ok: true, gated: false };
  try {
    const r = await fetch(cfg.authBaseUrl.replace(/\/$/, "") + "/cli/verify", { headers: { Authorization: "Bearer " + cfg.token } });
    if (r.status === 401) return { ok: false, gated: true, reason: "Your BrainEdge terminal session is invalid or expired. Re-enable terminal access in the desktop app: Settings → Terminal access." };
    const j = await r.json().catch(() => ({}));
    if (!j.ok) return { ok: false, gated: true, reason: `Your BrainEdge subscription is ${j.status || "inactive"}. Reactivate it in the app to use the terminal.` };
    USER.name = j.name || ""; USER.status = j.status || ""; USER.daysLeft = j.daysLeft;
    return { ok: true, gated: true };
  } catch { return { ok: true, gated: true, offline: true }; }
}
