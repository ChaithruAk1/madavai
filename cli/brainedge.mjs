#!/usr/bin/env node
// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// BrainEdge CLI — a terminal coding agent (like Claude Code) on ANY provider.
// Run inside the folder you want to work in:  brainedge   (or: node cli/brainedge.mjs)
//
// Config (first match wins): env vars, ./brainedge.config.json, ~/.brainedge/config.json
//   BRAINEDGE_BASE_URL · BRAINEDGE_API_KEY · BRAINEDGE_MODEL · BRAINEDGE_KIND ("openai" | "anthropic")
// Flags:  --yes  auto-approve everything    --model <id>    override the model
//
// UI: a rich Ink (React-for-terminal) interface when run in an interactive terminal; a plain readline
// fallback otherwise (or when BRAINEDGE_PLAIN=1, or if Ink isn't installed yet — run `npm install`).
import readline from "node:readline";
import * as core from "./agent-core.mjs";

const C = { dim: "\x1b[2m", red: "\x1b[31m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", reset: "\x1b[0m" };
const col = (k, s) => (process.stdout.isTTY ? C[k] + s + C.reset : s);

if (!core.configured()) {
  console.error(col("red", "BrainEdge CLI is not configured.") + "\nCreate ~/.brainedge/config.json like:\n" +
    col("dim", `{
  "baseUrl": "https://openrouter.ai/api/v1",
  "apiKey": "sk-or-...",
  "model": "deepseek/deepseek-chat",
  "kind": "openai"
}`) + "\n…or set BRAINEDGE_BASE_URL / BRAINEDGE_API_KEY / BRAINEDGE_MODEL.");
  process.exit(1);
}

// Subscription gate (only when provisioned by the desktop app).
const ent = await core.verifyEntitlement();
if (!ent.ok) { console.error(col("red", ent.reason || "Not authorized.")); process.exit(1); }
if (ent.offline) console.log(col("dim", "(couldn't reach BrainEdge to verify — offline; continuing)\n"));

const RICH = process.stdout.isTTY && process.stdin.isTTY && !process.env.BRAINEDGE_PLAIN;
if (RICH) {
  try { const tui = await import("./tui.mjs"); tui.start(); }
  catch (e) { console.log(col("dim", "(rich UI unavailable — " + (e && e.message || e) + "; using plain mode. Run `npm install` to enable it.)\n")); plain(); }
} else {
  plain();
}

// ---------- plain readline fallback ----------
function plain() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise((r) => rl.question(q, r));
  const messages = [{ role: "system", content: core.SYSTEM() }];
  const confirm = async (label) => /^y/i.test(await ask(col("yellow", "  ⚠ " + label + "  allow? [y/N] ")));

  console.log(col("cyan", "BrainEdge") + col("dim", `  ${core.cfg.model}  ·  ${core.ROOT}`));
  console.log(col("dim", `Type a task. /help for commands, /exit to quit.\n`));

  async function turn(text) {
    messages.push({ role: "user", content: text });
    for (let step = 0; step < 24; step++) {
      let printed = false;
      const { content, toolCalls } = await core.streamTurn(messages, core.TOOLS, (t) => { if (!printed) { process.stdout.write(col("cyan", "● ")); printed = true; } process.stdout.write(t); });
      if (printed) process.stdout.write("\n");
      if (!toolCalls.length) { messages.push({ role: "assistant", content: content || "" }); break; }
      messages.push({ role: "assistant", content: content || null, tool_calls: toolCalls.map((x) => ({ id: x.id, type: "function", function: { name: x.name, arguments: x.arguments } })) });
      for (const call of toolCalls) {
        let a = {}; try { a = JSON.parse(call.arguments || "{}"); } catch {}
        console.log(col("dim", `  ⚙ ${call.name} ${call.name === "run_command" ? a.command : (a.path || a.query || "")}`));
        let out; try { out = await core.execTool(call.name, a, { confirm }); } catch (e) { out = "Error: " + (e.message || e); }
        messages.push({ role: "tool", tool_call_id: call.id, content: String(out).slice(0, 60000) });
      }
    }
  }
  async function slash(input) {
    const [cmd, ...rest] = input.slice(1).split(/\s+/); const arg = rest.join(" ").trim();
    if (cmd === "exit" || cmd === "quit") return true;
    if (cmd === "help") console.log(col("dim", "  /model [id]  /clear  /skills  /reload  /init  /undo  /cwd  /cost  /exit"));
    else if (cmd === "model") { if (arg) { core.cfg.model = arg; messages[0] = { role: "system", content: core.SYSTEM() }; console.log(col("dim", "  model → " + arg)); } else { const all = await core.fetchModels(); all.slice(0, 40).forEach((m, i) => console.log(`  ${String(i + 1).padStart(2)}  ${m}`)); const n = (await ask("  number: ")).trim(); const sel = all[parseInt(n, 10) - 1]; if (sel) { core.cfg.model = sel; messages[0] = { role: "system", content: core.SYSTEM() }; console.log(col("dim", "  model → " + sel)); } } }
    else if (cmd === "clear") { messages.length = 0; messages.push({ role: "system", content: core.SYSTEM() }); console.log(col("dim", "  cleared")); }
    else if (cmd === "undo") console.log(col("dim", "  " + core.undoLast()));
    else if (cmd === "cwd") console.log(col("dim", "  " + core.ROOT));
    else if (cmd === "skills") console.log(col("dim", core.SKILLS.map((s) => "  ✦ " + s.name).join("\n") || "  (none)"));
    else if (cmd === "reload") { core.reloadSkills(); messages[0] = { role: "system", content: core.SYSTEM() }; console.log(col("dim", `  reloaded ${core.SKILLS.length}`)); }
    else if (cmd === "auto") { core.state.auto = !core.state.auto; console.log(col("dim", "  auto " + (core.state.auto ? "ON" : "OFF"))); }
    else console.log(col("dim", "  unknown — /help"));
    return false;
  }
  (async () => {
    while (true) {
      const input = (await ask(col("green", "❯ "))).trim();
      if (!input) continue;
      if (input.startsWith("/")) { if (await slash(input)) break; console.log(); continue; }
      try { await turn(input); } catch (e) { console.log(col("red", "Error: " + (e.message || e))); }
      console.log();
    }
    rl.close();
  })();
}
