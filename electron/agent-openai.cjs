// Self-built agent loop for OpenAI-compatible providers (NIM, OpenRouter, local).
// No proxy, no Anthropic dependency — BrainEdge runs the tool-calling loop itself,
// in-process, against the active external model. Emits the same UiEvents as the SDK path.
const fs = require("fs");
const path = require("path");
const { execSync, exec } = require("child_process");
// Async shell runner — keeps the main process responsive (execSync froze the whole app for up to 30s).
const execAsync = (command, opts) => new Promise((resolve) => {
  exec(command, opts, (err, stdout, stderr) => {
    if (err && !stdout) return resolve("ERROR: " + String((stderr || err.message || err)).slice(0, 4000));
    resolve(String(stdout || "") + (stderr ? "\n[stderr] " + String(stderr).slice(0, 1000) : ""));
  });
});
const { streamChatTools, stripReasoning } = require("./providers.cjs");
const mcp = require("./mcp-manager.cjs");
const skillsMgr = require("./skills-manager.cjs");

const LOAD_SKILL_TOOL = {
  type: "function",
  function: {
    name: "load_skill",
    description: "Load the full instructions for one of your available skills, by its exact name.",
    parameters: { type: "object", properties: { name: { type: "string", description: "the skill's name" } }, required: ["name"] },
  },
};

// Mid-mission "ask the human": the mission pauses, the user answers, work resumes.
const ASK_USER_TOOL = {
  type: "function",
  function: {
    name: "ask_user",
    description: "Pause and ask the user ONE clarifying question or decision; their answer comes back as the tool result. Use sparingly — only when genuinely blocked on a choice you cannot make yourself (never for permission to use tools; that is handled separately).",
    parameters: { type: "object", properties: {
      question: { type: "string", description: "one short, specific question" },
      options: { type: "array", items: { type: "string" }, description: "optional 2-4 suggested answers the user can pick from" },
    }, required: ["question"] },
  },
};

// Agent Browser tools — drive a real, visible browser window (Electron Chromium).
// Text-mode browsing: works with any model, no vision needed.
const BROWSER_TOOLS = (allow) => [
  { type: "function", function: { name: "browse_open", description: "Open a URL in the Agent Browser window and return the page as readable text plus numbered interactive elements." + (allow.length ? ` Allowed sites only: ${allow.join(", ")}.` : ""),
    parameters: { type: "object", properties: { url: { type: "string" } }, required: ["url"] } } },
  { type: "function", function: { name: "browse_read", description: "Re-read the current page (text + numbered interactive elements). Use after the page changes.",
    parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "browse_click", description: "Click interactive element [n] from the latest browse_read/browse_open listing. Returns the resulting page.",
    parameters: { type: "object", properties: { n: { type: "number", description: "the element number" } }, required: ["n"] } } },
  { type: "function", function: { name: "browse_fill", description: "Type text into input/textarea/select element [n]. Never works on password or payment fields — those are human-only. Set submit=true to submit the form after filling.",
    parameters: { type: "object", properties: { n: { type: "number" }, text: { type: "string" }, submit: { type: "boolean" } }, required: ["n", "text"] } } },
  { type: "function", function: { name: "browse_back", description: "Go back one page in the Agent Browser and return the page.",
    parameters: { type: "object", properties: {} } } },
];

// Agent-as-tool handoffs: delegate a focused sub-task to another roster agent.
const callAgentTool = (roster) => ({
  type: "function",
  function: {
    name: "call_agent",
    description: "Delegate ONE focused, self-contained sub-task to another agent on the user's roster; its complete answer comes back as the tool result. Available agents:\n" +
      roster.slice(0, 20).map((a) => `- ${a.name}: ${a.description || (a.instructions || "").slice(0, 100)}`).join("\n"),
    parameters: { type: "object", properties: {
      agent: { type: "string", description: "the exact agent name" },
      task: { type: "string", description: "the full, self-contained sub-task (include all context it needs)" },
    }, required: ["agent", "task"] },
  },
});

// ---- tool schemas (OpenAI function-calling format) ----
const TOOLS = [
  { type: "function", function: { name: "list_dir", description: "List files in a directory (relative to the working folder).",
    parameters: { type: "object", properties: { path: { type: "string", description: "dir path, default '.'" } } } } },
  { type: "function", function: { name: "read_file", description: "Read a UTF-8 text file.",
    parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } } },
  { type: "function", function: { name: "write_file", description: "Create or overwrite a text file.",
    parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"] } } },
  { type: "function", function: { name: "edit_file", description: "Replace the first exact occurrence of old_string with new_string in a file.",
    parameters: { type: "object", properties: { path: { type: "string" }, old_string: { type: "string" }, new_string: { type: "string" } }, required: ["path", "old_string", "new_string"] } } },
  { type: "function", function: { name: "run_bash", description: "Run a shell command in the working folder.",
    parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] } } },
  { type: "function", function: { name: "search_text", description: "Search file contents for a string/substring across the project. Returns file:line matches.",
    parameters: { type: "object", properties: { query: { type: "string" }, glob: { type: "string", description: "optional extension filter like .js" } }, required: ["query"] } } },
  { type: "function", function: { name: "find_files", description: "Find files whose path matches a substring or extension (e.g. '.tsx' or 'session').",
    parameters: { type: "object", properties: { pattern: { type: "string" } }, required: ["pattern"] } } },
];

// Reads are always safe. Whether a *mutating* tool runs without asking depends on
// the user-selected permission mode, not the chat mode.
const READS = new Set(["list_dir", "read_file", "search_text", "find_files"]);

// permMode: "default" (ask before changes) | "acceptEdits" | "bypass" (act, trust all) | "plan" (read-only)
const SAFE = (name) => READS.has(name) || name === "load_skill" || name === "browse_read"; // read-only, never needs approval
function isAuto(permMode, name) {
  if (SAFE(name)) return true;
  if (permMode === "bypass") return true;
  if (name.startsWith("mcp__")) return false; // external connector tools always ask (unless bypass)
  if (permMode === "acceptEdits") return name === "write_file" || name === "edit_file"; // edits auto, bash still asks
  return false; // "default" → ask for every mutation; "plan" handled by isBlocked
}
function isBlocked(permMode, name) {
  return permMode === "plan" && !SAFE(name); // plan = read-only (reads + load_skill allowed)
}

// Shared artifact-iteration rule (Studio "live preview" iterates in place like frontier chat products):
// always emit the WHOLE file in one fenced block so it renders, and re-emit it whole on edits.
const ARTIFACT_RULE = " When you build or change something runnable — an HTML page, web app, tool, game, SVG, Mermaid diagram, React/JSX component, or a document — put the ENTIRE file in ONE fenced code block tagged with its language (```html, ```jsx, ```svg, ```mermaid, ```markdown). When the user asks for a change to it, return the COMPLETE updated file again in a single block — never a diff, snippet, or partial edit — so it re-renders as a live preview.";

const SYSTEM = (mode) =>
  mode === "chat"
    ? `You are BrainEdge, a helpful AI assistant. Use a skill or connector tool when it fits the user's request; otherwise just answer. ` +
      `Reply in clear, natural language; never paste raw JSON, tool-call syntax, or machine field names.` + ARTIFACT_RULE
    : mode === "code"
    ? `You are BrainEdge, an expert software engineer working in the user's repository. ` +
      `Always explore before editing: use find_files and search_text to locate code, read_file to understand it, then make minimal, correct edits with edit_file/write_file. ` +
      `Prefer surgical edits over rewrites. After changes, you may run tests/build via run_bash. Explain what you changed in one short paragraph; show diffs or key snippets when useful, but never paste raw tool JSON.`
    : `You are BrainEdge, an AI assistant working inside the user's folder. ` +
      `Use the provided tools (files, shell, skills, and connectors) to take real actions rather than describing them. Use relative paths. ` +
      `Reply to the user in clear, natural language. When they ask to SEE something — a file list, file contents, search results — ` +
      `actually present it readably (a short bullet or comma-separated list, or a brief excerpt). Don't just say "here are the files" without showing them. ` +
      `But never paste raw JSON, tool-call syntax, or machine field names like "status" or "output_from_command"; translate results into human-readable form.`;

// Keep file access inside the chosen folder.
function inside(cwd, p) {
  const abs = path.resolve(cwd, p || ".");
  const root = path.resolve(cwd);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("path escapes the working folder");
  return abs;
}

async function execTool(cwd, name, args) {
  switch (name) {
    case "list_dir": {
      const dir = inside(cwd, args.path || ".");
      return fs.readdirSync(dir, { withFileTypes: true })
        .map((d) => (d.isDirectory() ? d.name + "/" : d.name)).join("\n") || "(empty)";
    }
    case "read_file":
      return fs.readFileSync(inside(cwd, args.path), "utf8").slice(0, 8000);
    case "write_file":
      fs.mkdirSync(path.dirname(inside(cwd, args.path)), { recursive: true });
      fs.writeFileSync(inside(cwd, args.path), args.content == null ? "" : args.content);
      return "wrote " + args.path;
    case "edit_file": {
      const f = inside(cwd, args.path);
      let t = fs.readFileSync(f, "utf8");
      if (!t.includes(args.old_string)) throw new Error("old_string not found in " + args.path);
      fs.writeFileSync(f, t.replace(args.old_string, args.new_string == null ? "" : args.new_string));
      return "edited " + args.path;
    }
    case "run_bash":
      return (await execAsync(args.command, { cwd, encoding: "utf8", timeout: 30000 })).slice(0, 8000);
    case "find_files": {
      const out = [];
      walkFiles(cwd, cwd, 6, (rel) => { if (rel.toLowerCase().includes(String(args.pattern || "").toLowerCase())) out.push(rel); });
      return out.slice(0, 200).join("\n") || "(no matches)";
    }
    case "search_text": {
      const q = String(args.query || "");
      const ext = args.glob ? String(args.glob).replace(/^\*/, "") : "";
      const out = [];
      walkFiles(cwd, cwd, 6, (rel, abs) => {
        if (ext && !rel.endsWith(ext)) return;
        if (out.length >= 100) return;
        let txt; try { txt = fs.readFileSync(abs, "utf8"); } catch { return; }
        txt.split(/\r?\n/).forEach((line, i) => { if (out.length < 100 && line.includes(q)) out.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`); });
      });
      return out.join("\n") || "(no matches)";
    }
    default:
      throw new Error("unknown tool " + name);
  }
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".venv", "__pycache__", "release", "out"]);
function walkFiles(root, dir, depth, cb) {
  if (depth < 0) return;
  let entries; try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) walkFiles(root, abs, depth - 1, cb); }
    else { cb(path.relative(root, abs).split(path.sep).join("/"), abs); }
  }
}

// Route a tool call to a skill, an MCP connector, a remote SSH backend, or a local tool.
async function runTool(cwd, name, args, skillsDir, backend) {
  if (name === "load_skill") {
    const r = skillsMgr.loadSkill(skillsDir, args.name);
    if (!r) return "Skill not found: " + args.name;
    return `(Skill "${args.name}" loaded. Its files are in: ${r.dir} — run any scripts there with run_bash.)\n\n` + r.body;
  }
  if (mcp.isMcpTool(name)) return await mcp.callTool(name, args);
  if (backend) return backendExec(backend, name, args);
  return execTool(cwd, name, args);
}

// Map a tool call to a remote backend (SSH).
function backendExec(b, name, args) {
  switch (name) {
    case "list_dir": return b.list(args.path || ".");
    case "read_file": return b.read(args.path);
    case "write_file": return b.write(args.path, args.content);
    case "edit_file": return b.edit(args.path, args.old_string, args.new_string);
    case "run_bash": return b.bash(args.command);
    case "find_files": return b.find(args.pattern);
    case "search_text": return b.search(args.query, args.glob);
    default: throw new Error("unknown tool " + name);
  }
}

function askPermission(emit, permissions, toolUseId, toolName, input) {
  return new Promise((resolve) => {
    const requestId = "perm_" + Math.random().toString(36).slice(2, 9);
    permissions.set(requestId, (res) => resolve(res && res.behavior === "allow"));
    emit({ kind: "permission_request", data: { requestId, toolName, input, toolUseId } });
  });
}

// ask_user reuses the permission plumbing: the UI answers via resolvePermission
// with { behavior: "allow", answer } — no new IPC channel needed.
function askUserQuestion(emit, permissions, toolUseId, question, options) {
  return new Promise((resolve) => {
    const requestId = "ask_" + Math.random().toString(36).slice(2, 9);
    permissions.set(requestId, (res) => resolve(String((res && res.answer) || "(the user didn't answer — proceed with your best judgment)")));
    emit({ kind: "user_question", data: { requestId, toolUseId, question: String(question || ""), options: Array.isArray(options) ? options.slice(0, 4).map(String) : [] } });
  });
}

async function runOpenAIAgentTurn({ prompt, mode, cwd, profile, history, emit, permissions, signal, permMode = "default", connectors = [], skillsDir = "", disabledSkills = [], systemOverride = null, globalInstructions = "", allowAskUser = false, roster = [], callAgent = null, browser = null, noShell = false }) {
  const skills = skillsMgr.discover(skillsDir).filter((s) => !disabledSkills.includes(s.dir)); // skillsDir may be a string or an array of folders
  const gi = globalInstructions ? `\n\nUser's custom instructions (always follow these):\n${globalInstructions}` : "";
  const sys = (systemOverride || SYSTEM(mode)) + gi + (skills.length ? "\n\n" + skillsMgr.indexText(skills) : "");
  if (history.length === 0) history.push({ role: "system", content: sys });
  else if (history[0] && history[0].role === "system") history[0].content = sys; // refresh index live
  history.push({ role: "user", content: prompt });

  emit({ kind: "init", data: { model: profile.model, cwd, mode, permissionMode: permMode } });

  // Build the tool set. Chat gets skills + connectors only; agent modes also get file/shell tools.
  let tools = mode === "chat" ? [] : [...TOOLS];
  // Hard tool gate: when the caller says no shell (e.g. webhook-triggered headless
  // runs, or an agent whose Shell capability is off), run_bash is neither offered
  // nor executable — the schema is removed AND execution is refused below.
  if (noShell) tools = tools.filter((t) => t.function.name !== "run_bash");
  if (skills.length) tools.push(LOAD_SKILL_TOOL);
  if (allowAskUser) tools.push(ASK_USER_TOOL);
  if (callAgent && Array.isArray(roster) && roster.length) tools.push(callAgentTool(roster));
  if (browser) tools = [...tools, ...BROWSER_TOOLS(browser.allow || [])];
  try {
    const mcpTools = await mcp.openAiTools(connectors);
    if (mcpTools.length) tools = [...tools, ...mcpTools];
  } catch {}

  // Always buffer: reasoning models emit chain-of-thought (often a bare </think>
  // with no opener) into content, which must be stripped before it reaches the UI.
  const streamLive = false;

  const started = Date.now();
  const MAX_STEPS = 12;
  for (let step = 0; step < MAX_STEPS; step++) {
    let result;
    try {
      result = await streamChatTools(profile, history, tools, {
        signal,
        onDelta: streamLive ? (d) => emit({ kind: "assistant_delta", data: { text: d } }) : () => {},
      });
    } catch (e) {
      if (e.name === "AbortError") { emit({ kind: "result", data: { subtype: "interrupted" } }); return; }
      emit({ kind: "error", data: { code: e.code || "error", message: String(e.message || e) } });
      return;
    }

    const { content, toolCalls } = result;
    const assistantMsg = { role: "assistant", content: content || "" };
    if (toolCalls.length) {
      assistantMsg.tool_calls = toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }));
    }
    history.push(assistantMsg);

    if (!toolCalls.length) {
      // Final answer — strip any chain-of-thought, then reveal the clean text.
      const clean = stripReasoning(content);
      if (clean) emit({ kind: "assistant_delta", data: { text: clean } });
      emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
      emit({ kind: "result", data: { subtype: "success", num_turns: step + 1, duration_ms: Date.now() - started } });
      return;
    }
    // Tool-calling step: suppress the model's pre-tool narration so it can't claim
    // success before the user approves. The tool cards convey the action.

    for (const tc of toolCalls) {
      let args = {};
      try { args = JSON.parse(tc.arguments || "{}"); } catch {}

      // Mid-mission question: pause for the human, resume with their answer.
      if (tc.name === "ask_user") {
        emit({ kind: "tool_use", data: { id: tc.id, name: "ask_user", input: { question: args.question }, auto: true } });
        const answer = allowAskUser
          ? await askUserQuestion(emit, permissions, tc.id, args.question, args.options)
          : "(no user available on this run — proceed with your best judgment and state your assumption)";
        emit({ kind: "tool_result", data: { id: tc.id, output: answer.slice(0, 4000) } });
        history.push({ role: "tool", tool_call_id: tc.id, content: answer.slice(0, 8000) });
        continue;
      }

      // Agent-as-tool handoff: run a roster agent on a sub-task, return its work.
      if (tc.name === "call_agent") {
        if (permMode === "plan" || !callAgent) {
          const out = permMode === "plan" ? "(blocked: plan mode is read-only — describe the delegation instead)" : "(agent handoffs unavailable on this run)";
          emit({ kind: "tool_use", data: { id: tc.id, name: `call_agent → ${args.agent || "?"}`, input: args, auto: true } });
          emit({ kind: "tool_result", data: { id: tc.id, output: out } });
          history.push({ role: "tool", tool_call_id: tc.id, content: out });
          continue;
        }
        emit({ kind: "tool_use", data: { id: tc.id, name: `call_agent → ${args.agent || "?"}`, input: { task: args.task }, auto: true } });
        let out;
        try { out = String(await callAgent(args.agent, args.task) || "(no output)"); }
        catch (e) { out = "ERROR: " + String((e && e.message) || e); }
        emit({ kind: "tool_result", data: { id: tc.id, output: out.slice(0, 4000) } });
        history.push({ role: "tool", tool_call_id: tc.id, content: out.slice(0, 12000) });
        continue;
      }

      // Agent Browser tools — browse_read is free; navigation/click/fill honor the
      // permission mode like any other mutation (the user approves each move).
      if (browser && tc.name.startsWith("browse_")) {
        if (isBlocked(permMode, tc.name)) {
          emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: false } });
          emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "plan mode (read-only)" } });
          const out = "(blocked: plan mode is read-only)";
          emit({ kind: "tool_result", data: { id: tc.id, output: out } });
          history.push({ role: "tool", tool_call_id: tc.id, content: out });
          continue;
        }
        const auto = isAuto(permMode, tc.name);
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto } });
        let allowed = auto;
        if (!allowed) allowed = await askPermission(emit, permissions, tc.id, tc.name, args);
        let out;
        if (!allowed) {
          emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "declined" } });
          out = "(user declined this browser action)";
        } else {
          try {
            if (tc.name === "browse_open") out = await browser.open(String(args.url || ""));
            else if (tc.name === "browse_read") out = await browser.read();
            else if (tc.name === "browse_click") out = await browser.click(Number(args.n));
            else if (tc.name === "browse_fill") out = await browser.fill(Number(args.n), String(args.text == null ? "" : args.text), !!args.submit);
            else out = await browser.back();
          } catch (e) { out = "ERROR: " + String((e && e.message) || e); }
        }
        emit({ kind: "tool_result", data: { id: tc.id, output: String(out).slice(0, 4000) } });
        history.push({ role: "tool", tool_call_id: tc.id, content: String(out).slice(0, 16000) });
        continue;
      }

      // Shell hard-gate: even if a model hallucinates the tool name, refuse it.
      if (noShell && tc.name === "run_bash") {
        const out = "(blocked: the shell is not available on this run)";
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: true } });
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        history.push({ role: "tool", tool_call_id: tc.id, content: out });
        continue;
      }

      // Plan mode: refuse mutations outright.
      if (isBlocked(permMode, tc.name)) {
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: false } });
        emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "plan mode (read-only)" } });
        const out = "(blocked: plan mode is read-only)";
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        history.push({ role: "tool", tool_call_id: tc.id, content: out });
        continue;
      }

      const auto = isAuto(permMode, tc.name);
      emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto } });

      let allowed = auto;
      if (!allowed) allowed = await askPermission(emit, permissions, tc.id, tc.name, args);

      let output;
      if (!allowed) {
        emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "declined" } });
        output = "(user declined this tool call)";
      } else {
        try { output = await runTool(cwd, tc.name, args, skillsDir); emit({ kind: "tool_result", data: { id: tc.id, output: String(output).slice(0, 4000) } }); }
        catch (e) { output = "ERROR: " + e.message; emit({ kind: "tool_result", data: { id: tc.id, output } }); }
      }
      history.push({ role: "tool", tool_call_id: tc.id, content: String(output).slice(0, 8000) });
    }
  }
  emit({ kind: "result", data: { subtype: "max_steps", duration_ms: Date.now() - started } });
}

module.exports = { runOpenAIAgentTurn };
