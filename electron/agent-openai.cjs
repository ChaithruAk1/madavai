// Self-built agent loop for OpenAI-compatible providers (NIM, OpenRouter, local).
// No proxy, no Anthropic dependency — Madav runs the tool-calling loop itself,
// in-process, against the active external model. Emits the same UiEvents as the SDK path.
const fs = require("fs");
const path = require("path");
const { execSync, exec } = require("child_process");
// Async shell runner — keeps the main process responsive (execSync froze the whole app for up to 30s).
// Guarantee a Node + exceljs runtime for the agent's run_bash data work even on machines with no
// system Node/Python: make the app's node_modules resolvable via NODE_PATH, and (only if there is
// no real `node` on PATH) expose Electron-as-Node as a `node` shim. exceljs ships with the app, so
// "node build_report.js" with require("exceljs") always works. Cached.
let _runnerEnv = null;
function appNodeModules() {
  const cands = [];
  try { if (process.resourcesPath) cands.push(path.join(process.resourcesPath, "app.asar.unpacked", "node_modules")); } catch {}
  cands.push(path.join(__dirname, "..", "node_modules"));
  for (const c of cands) { try { if (fs.existsSync(path.join(c, "exceljs"))) return c; } catch {} }
  return path.join(__dirname, "..", "node_modules");
}
function runnerEnv() {
  if (_runnerEnv) return _runnerEnv;
  const env = { ...process.env };
  // Folder-poisoning guard: a model scratch script named after a stdlib module (inspect.py, json.py,
  // random.py, code.py, test.py, string.py) left in the DATA folder would shadow the stdlib and crash
  // `import pandas` at startup, silently breaking every run. PYTHONSAFEPATH keeps cwd/script-dir OFF
  // sys.path[0] (Python 3.11+; ignored on older), so a stray .py in the folder can never shadow stdlib.
  env.PYTHONSAFEPATH = "1";
  const nm = appNodeModules();
  env.NODE_PATH = nm + (env.NODE_PATH ? path.delimiter + env.NODE_PATH : "");
  // Provide an Electron-as-Node shim, APPENDED to PATH so a real system `node` (dev) is preferred and
  // the shim is only the fallback on machines without Node. No execSync — that would freeze the main process.
  try {
    const binDir = path.join(require("electron").app.getPath("userData"), "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const exe = process.execPath;
    if (process.platform === "win32") fs.writeFileSync(path.join(binDir, "node.cmd"), "@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n\"" + exe + "\" %*\r\n");
    else { const sh = path.join(binDir, "node"); fs.writeFileSync(sh, "#!/bin/sh\nELECTRON_RUN_AS_NODE=1 \"" + exe + "\" \"$@\"\n"); try { fs.chmodSync(sh, 0o755); } catch {} }
    env.PATH = (env.PATH || env.Path || "") + path.delimiter + binDir;
  } catch {}
  _runnerEnv = env;
  return _runnerEnv;
}
const execAsync = (command, opts) => new Promise((resolve) => {
  exec(command, opts, (err, stdout, stderr) => {
    if (err && !stdout) return resolve("ERROR: " + String((stderr || err.message || err)).slice(0, 4000));
    resolve(String(stdout || "") + (stderr ? "\n[stderr] " + String(stderr).slice(0, 1000) : ""));
  });
});
// Review H3: hard deny-list for CATASTROPHIC shell commands, enforced even under auto-approve /
// bypassPermissions. The weak-model office pipeline runs ONE python script, so this never trips it;
// it is defense-in-depth against prompt-injection, NOT a replacement for the permission gate.
function destructiveBashGuard(command) {
  const c = String(command || "");
  const DANGER = [
    /\brm\b[^\n]*\s-[^\s]*(rf|fr)\b[^\n]*(\s\/(\s|$|\*)|\s~(\s|$)|\s\.(\s|$)|--no-preserve-root)/i,
    /\brm\b[^\n]*--recursive[^\n]*--force[^\n]*(\s\/(\s|$|\*)|--no-preserve-root)/i,
    /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/,
    /\bmkfs(\.\w+)?\b/i,
    /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|hd|disk|vd)/i,
    />\s*\/dev\/(sd|nvme|hd|disk|vd)\w*/i,
    /\b(shutdown|reboot|halt|poweroff)\b/i,
    /\b(diskpart|cipher\s+\/w)\b/i,
    /\bformat\s+[a-z]:/i,
    /\b(del|erase)\b[^\n]*\s\/[sS]\b[^\n]*[a-z]:\\/i,
    /\b(rd|rmdir)\b[^\n]*\s\/[sS]\b[^\n]*[a-z]:\\/i,
    /\breg\s+delete\b/i,
    /\bRemove-Item\b[^\n]*-Recurse[^\n]*[a-z]:\\/i,
    /\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n|]*\|\s*(sudo\s+)?(ba|z|c|tc|k)?sh\b/i,
    /\b(curl|wget|iwr|Invoke-WebRequest)\b[^\n|]*\|\s*(iex|Invoke-Expression)\b/i,
    /\|\s*(iex|Invoke-Expression)\b/i,
    /\bchmod\b[^\n]*\s-[^\s]*R[^\s]*\s+0?777\s+\/(\s|$)/i,
  ];
  if (DANGER.some((re) => re.test(c)))
    return "ERROR: command blocked by Madav safety guard — it matches a catastrophic/irreversible pattern (mass delete, disk/registry wipe, power-off, or remote pipe-to-shell). If you truly intend this, run it yourself in a terminal; Madav will not auto-run it.";
  return "";
}
const { streamChatTools, streamChat, stripReasoning } = require("./providers.cjs");
const mcp = require("./mcp-manager.cjs");
const skillsMgr = require("./skills-manager.cjs");
// The discipline layer (PLAN-AGENT-PARITY waves): JSON repair, plan tracking,
// compaction, tiers, loop breakers — see electron/harness.cjs.
const harness = require("./harness.cjs");
// Measured per-model tool discipline (lazy: stats are a desktop nicety, never fatal).
let modelStats = null;
try { modelStats = require("./model-stats.cjs"); } catch { modelStats = { bump: () => {}, flag: () => {}, summary: () => null, score: () => null, all: () => ({}) }; }

const LOAD_SKILL_TOOL = {
  type: "function",
  function: {
    name: "load_skill",
    description: "Load the full instructions for one of your available skills, by its exact name.",
    parameters: { type: "object", properties: { name: { type: "string", description: "the skill's name" } }, required: ["name"] },
  },
};

// Text→image through the model selector (imagegen.cjs). The image lands in the
// tool card directly; the model only sees a tiny confirmation string (no base64
// ever enters the conversation — that would explode the token budget).
const CREATE_IMAGE_TOOL = {
  type: "function",
  function: {
    name: "create_image",
    description: "Generate an IMAGE (raster picture) from a text prompt using the user's selected model (must be an image-output model, e.g. google/gemini-2.5-flash-image on OpenRouter). The image is shown to the user and saved automatically. Use ONLY for actual pictures: photos, illustrations, logos, artwork, or a diagram rendered as a picture. NEVER call this for a document, spreadsheet, slide deck, presentation, or PDF — those are produced with a fenced ```officedoc block, not with create_image. If unsure, do not call it.",
    parameters: { type: "object", properties: { prompt: { type: "string", description: "a vivid, complete description of the image" } }, required: ["prompt"] },
  },
};

// Lightweight web search (quick, no approval) — for current info without the heavyweight Deep Research.
const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web and return the top results (title + URL) for a query. Use this for ANYTHING current or beyond your training data — news, recent events, latest releases, current prices, 'today'/'now'/'latest'. Quick and lightweight (no approval needed). For an in-depth multi-source cited report use deep_research instead. After searching, answer from the results and cite the URLs — never claim you cannot access the internet.",
    parameters: { type: "object", properties: { query: { type: "string", description: "the search query" } }, required: ["query"] },
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
const SAFE = (name) => READS.has(name) || name === "load_skill" || name === "browse_read" || name === "desktop_apps" || name === "desktop_read"; // read-only, never needs approval
function isAuto(permMode, name) {
  if (SAFE(name)) return true;
  if (permMode === "bypass" || permMode === "bypassPermissions") return true; // "act" autonomy
  if (name.startsWith("mcp__")) return false; // external connector tools always ask (unless bypass)
  if (permMode === "acceptEdits") return name === "write_file" || name === "edit_file"; // edits auto, bash still asks
  return false; // "default" → ask for every mutation; "plan" handled by isBlocked
}
function isBlocked(permMode, name) {
  return permMode === "plan" && !SAFE(name); // plan = read-only (reads + load_skill allowed)
}

// Shared artifact-iteration rule (Studio "live preview" iterates in place like frontier chat products):
// always emit the WHOLE file in one fenced block so it renders, and re-emit it whole on edits.
const ARTIFACT_RULE_BASE = require("../shared/office-rules.cjs").ARTIFACT_RULE; // inline require — avoids TDZ vs the destructured import below
// In-chat office files (keep this spec in sync with OFFICE_RULE in src/office.js).
// Gated by the Extras switchboard (settings.extras.office !== false) — evaluated per
// turn, never at module load, so the toggle applies without a restart.
const { officeRule, isDeckCapable, ARTIFACT_RULE } = require("../shared/office-rules.cjs");
function officeRulePart(model) {
  try { if (!require("./features.cjs").builtIn("office")) return ""; } catch {}
  try { if ((require("./settings.cjs").load().extras || {}).office === false) return ""; } catch {}
  return officeRule(model);
}
// Deliver the answer — don't narrate the machinery. Weak models love to say "let me load my X skill"
// or "I don't have access to …"; this forbids that and tells them to just use tools silently and answer.
const ANSWER_DIRECT_RULE = " Answer the user's request directly and naturally. NEVER narrate your internal process, tools, or skills — do not say things like \"let me load my web search skill\", \"I'll use the web_search tool\", \"I don't have access to …\", or describe what you are about to do. If a tool helps, call it silently and present only the result. Don't apologize for limitations or list what you cannot do — give the best possible answer to what was actually asked.";
const DATA_TOOLS_RULE = " DATA & SPREADSHEETS: when a task means processing data files (xlsx/csv) or producing an office file, PREFER writing and running a Python script with run_bash (pandas + openpyxl) — let code do the joins and the math; do NOT compute large aggregations by hand. NEVER name a script after a Python standard-library module (inspect.py, code.py, test.py, json.py, string.py, random.py, etc.) — it shadows the stdlib and breaks pandas with a 'partially initialized module / circular import' error; use a unique name like build_report.py. If Python is unavailable, use Node instead — it is ALWAYS available: write a uniquely-named .js script and run it with \"node build_report.js\"; the exceljs library is bundled (const ExcelJS = require(\"exceljs\")) for reading and writing .xlsx. read_file already returns spreadsheets as readable rows. CRITICAL \u2014 the file must contain REAL DATA, not formula text: compute the numbers in Python and write the actual VALUES into the cells. Do NOT put Excel formula strings (text starting with '=') into a pandas DataFrame and then call df.to_excel() \u2014 pandas saves them as TEXT, so Excel shows \"=...\" literally and the sheet has NO usable numbers. Write the computed values; if you truly need live formulas, set them via openpyxl cell assignment (ws[\"B2\"] = \"=...\" or ws.cell(row,col).value = ...), NEVER through a DataFrame of '=' strings. Before finishing, sanity-check that every data cell holds a number, not a '=' string. When you produce a spreadsheet, document, deck, or PDF, deliver it as ONE officedoc block so the user gets a card to open and download it right here.";

const SYSTEM = (mode) =>
  mode === "chat"
    ? `You are Madav, a helpful AI assistant. You are NOT Claude, ChatGPT, Gemini, or any other assistant; if anyone asks who you are or who made you, you are Madav. Use a skill or connector tool when it fits the user's request; otherwise just answer. ` +
      `Reply in clear, natural language; never paste raw JSON, tool-call syntax, or machine field names.`
    : mode === "code"
    ? `You are Madav, an expert software engineer working in the user's repository. You are NOT Claude, ChatGPT, Gemini, or any other assistant; if anyone asks who you are or who made you, you are Madav. ` +
      `Always explore before editing: use find_files and search_text to locate code, read_file to understand it, then make minimal, correct edits with edit_file/write_file. ` +
      `Prefer surgical edits over rewrites. After changes, you may run tests/build via run_bash. Explain what you changed in one short paragraph; show diffs or key snippets when useful, but never paste raw tool JSON.`
    : `You are Madav, an AI assistant working inside the user's folder. You are NOT Claude, ChatGPT, Gemini, or any other assistant; if anyone asks who you are or who made you, you are Madav. ` +
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

async function execTool(cwd, name, args, mission) {
  // Wave 2.3 — read-before-edit, enforced structurally (not just prompted):
  // editing or overwriting a file the agent hasn't read this mission is refused.
  const readPaths = mission && mission.readPaths;
  switch (name) {
    case "list_dir": {
      const dir = inside(cwd, args.path || ".");
      return fs.readdirSync(dir, { withFileTypes: true })
        .map((d) => (d.isDirectory() ? d.name + "/" : d.name)).join("\n") || "(empty)";
    }
    case "read_file": {
      const f = inside(cwd, args.path);
      if (readPaths) readPaths.add(f);
      // Spreadsheets are binary (zip) — reading them as UTF-8 yields garbage. Parse to text rows so the agent can actually use the data.
      if (/\.(xlsx|xlsm|xls)$/i.test(f)) {
        try {
          const ExcelJS = require("exceljs");
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.readFile(f);
          let out = "";
          wb.eachSheet((ws) => {
            out += `# Sheet: ${ws.name}\n`;
            ws.eachRow({ includeEmpty: false }, (row) => {
              const vals = (row.values || []).slice(1).map((v) => v == null ? "" : (typeof v === "object" ? (v.result !== undefined ? v.result : (v.text !== undefined ? v.text : (v.hyperlink || ""))) : v));
              out += vals.join("\t") + "\n";
            });
            out += "\n";
          });
          return harness.headTail(out.trim() || "(empty workbook)", { maxChars: 16000 });
        } catch (e) { return `(could not parse spreadsheet ${args.path}: ${(e && e.message) || e})`; }
      }
      return harness.headTail(fs.readFileSync(f, "utf8"), { maxChars: 8000 });
    }
    case "write_file": {
      const f = inside(cwd, args.path);
      // Binary office formats can't be written as text — steer the agent to the right path instead of producing a corrupt file.
      if (/\.(xlsx|xlsm|xls|docx|pptx|pdf)$/i.test(f)) {
        const ext = (f.match(/\.([a-z]+)$/i) || [,"file"])[1].toLowerCase();
        throw new Error("Cannot create " + args.path + " with write_file — ." + ext + " is a BINARY office format; write_file only writes text, so the result would be a corrupt file that won't open. To produce it: (1) PREFERRED — stop using file tools and reply with ONE fenced officedoc block (```officedoc) containing only the JSON spec; Madav builds the real file as a downloadable card. (2) If it must be saved into this folder, use run_bash with a script (e.g. python + openpyxl for xlsx).");
      }
      if (readPaths && fs.existsSync(f) && !readPaths.has(f)) {
        throw new Error(`refusing to overwrite ${args.path} — read_file it first (it already exists and you have not read it this mission)`);
      }
      fs.mkdirSync(path.dirname(f), { recursive: true });
      const body = args.content == null ? "" : String(args.content);
      fs.writeFileSync(f, body);
      if (readPaths) readPaths.add(f);
      return `wrote ${args.path} (${body.split("\n").length} lines, ${body.length} chars)`;
    }
    case "edit_file": {
      const f = inside(cwd, args.path);
      if (readPaths && !readPaths.has(f)) {
        throw new Error(`refusing to edit ${args.path} — read_file it first so you can see the exact current text`);
      }
      let t = fs.readFileSync(f, "utf8");
      const oldS = String(args.old_string == null ? "" : args.old_string);
      if (!oldS) throw new Error("old_string is empty");
      // Wave 1.2 — uniqueness: a non-unique match silently edits the WRONG spot.
      const first = t.indexOf(oldS);
      if (first === -1) throw new Error("old_string not found in " + args.path + " — read the file again and copy the exact current text (whitespace matters)");
      if (t.indexOf(oldS, first + 1) !== -1) {
        const n = t.split(oldS).length - 1;
        throw new Error(`old_string matches ${n} places in ${args.path} — include more surrounding lines so it matches exactly once`);
      }
      const newS = args.new_string == null ? "" : String(args.new_string);
      const updated = t.slice(0, first) + newS + t.slice(first + oldS.length);
      fs.writeFileSync(f, updated);
      if (readPaths) readPaths.add(f);
      // Wave 1.2 — show the agent what it actually did (±3 lines around the change),
      // killing the "said it fixed it but didn't" failure class.
      const upToChange = updated.slice(0, first + newS.length);
      const lineNo = upToChange.split("\n").length;
      const lines = updated.split("\n");
      const lo = Math.max(0, lineNo - 4), hi = Math.min(lines.length, lineNo + 3);
      const region = lines.slice(lo, hi).map((l, i) => `${lo + i + 1}| ${l}`).join("\n");
      return `edited ${args.path} — the changed region now reads:\n${region}`;
    }
    case "run_bash": {
      const _blocked = destructiveBashGuard(args.command);
      if (_blocked) return _blocked;
      return harness.headTail(await execAsync(args.command, { cwd, encoding: "utf8", timeout: 120000, maxBuffer: 8 * 1024 * 1024, env: runnerEnv() }), { maxChars: 8000 });
    }
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
async function runTool(cwd, name, args, skillsDir, backend, mission, agentName) {
  if (name === "load_skill") {
    const c = skillsMgr.composePlay(skillsDir, args.name);
    if (!c) { try { require("./play-usage.cjs").record({ name: args.name, by: agentName || "", context: "chat", source: "load_skill", ok: false }); } catch {} return "Skill not found: " + args.name; }
    try { require("./play-usage.cjs").record({ name: args.name, by: agentName || "", context: "chat", source: "load_skill", ok: true }); } catch {}
    return `(Play "${args.name}" loaded. Its files are in: ${c.dir} — run any scripts there with run_bash.)\n\n` + c.text;
  }
  if (mcp.isMcpTool(name)) return await mcp.callTool(name, args);
  if (backend) return backendExec(backend, name, args);
  return execTool(cwd, name, args, mission);
}

// ---- Wave 5.1: parallel read-only scouts -------------------------------------
// Each scout is a tiny text-protocol mini-loop on the economy (or main) model with
// READ-ONLY tools. Scouts cannot write, edit, or run commands — by construction.
const SCOUT_READONLY = new Set(["list_dir", "read_file", "search_text", "find_files"]);
async function runScout(profile, cwd, query, signal) {
  const toolList = "- list_dir {path}\n- read_file {path}\n- search_text {query, glob?}\n- find_files {pattern}";
  const msgs = [
    { role: "system", content: "You are a fast project scout. Explore the project with the tools, then answer the question in <=120 words: name the exact files and line areas that matter." + harness.TEXT_PROTOCOL(toolList) },
    { role: "user", content: String(query || "").slice(0, 500) },
  ];
  for (let i = 0; i < 4; i++) {
    let text;
    try { const r = await streamChat(profile, msgs, { onDelta: () => {}, signal }); text = (r && r.text) || ""; }
    catch (e) { return "(scout error: " + String((e && e.message) || e).slice(0, 200) + ")"; }
    const { calls, stripped } = harness.parseTextToolCalls(text);
    if (!calls.length) return stripped.slice(0, 1200) || "(no findings)";
    msgs.push({ role: "assistant", content: text });
    for (const c of calls) {
      const p = harness.tolerantParse(c.arguments);
      let out;
      if (!SCOUT_READONLY.has(c.name)) out = "(scouts are read-only — that tool is not available)";
      else { try { out = await execTool(cwd, c.name, p.value || {}, null); } catch (e) { out = "ERROR: " + String((e && e.message) || e); } }
      msgs.push({ role: "user", content: `[result of ${c.name}]\n` + String(out).slice(0, 4000) });
    }
  }
  return "(scout ran out of steps — partial findings above)";
}

// ---- Wave 5.2: cheap-model reviewer ------------------------------------------
// One bounded call: did this change match the brief? "approve" or "flag: reason".
async function runReviewer(profile, brief, action, signal) {
  try {
    const r = await streamChat(profile, [
      { role: "system", content: "You are a strict but fair code/work reviewer. Reply with EXACTLY one line: either \"approve\" or \"flag: <one concrete reason, max 25 words>\". Never anything else." },
      { role: "user", content: "Brief (what the user asked for):\n" + String(brief || "").slice(0, 2000) + "\n\nChange just made:\n" + String(action || "").slice(0, 3000) },
    ], { onDelta: () => {}, signal });
    const line = String((r && r.text) || "").trim().split("\n")[0].slice(0, 200);
    return /^flag/i.test(line) ? line : "approve";
  } catch { return "approve"; } // reviewer failures never block the builder
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

async function runOpenAIAgentTurn({ prompt, mode, cwd, profile, history, emit, permissions, signal, permMode = "default", connectors = [], skillsDir = "", disabledSkills = [], systemOverride = null, globalInstructions = "", allowAskUser = false, roster = [], callAgent = null, browser = null, desktop = null, noShell = false, agentName = "", agentOpts = {} }) {
  const skills = skillsMgr.discover(skillsDir).filter((s) => !disabledSkills.includes(s.dir)); // skillsDir may be a string or an array of folders
  // ---- Per-PROCESS scoping (read from settings here so callers don't thread it through). ----
  // surface = the process this turn runs in. Agents keep their own gates (full skills + research).
  let _pcfg = {}; try { _pcfg = require("./settings.cjs").load() || {}; } catch {}
  const surface = agentName ? "agents" : (mode || "chat");
  const skillSurfaces = _pcfg.skillSurfaces || {};       // { skillDir: { chat,cowork,code,project: bool } }
  const researchSurfaces = _pcfg.researchSurfaces || {}; // { chat,cowork,code,project: bool } — Deep Research is opt-in per process
  const researchOn = agentName ? true : researchSurfaces[surface] === true;
  const agentSurfaces = _pcfg.agentSurfaces || {}; // per-process "Use Agents" toggle (auto-delegation / call_agent)
  const agentsOn = agentName ? true : (agentSurfaces[surface] != null ? agentSurfaces[surface] !== false : surface !== "chat");
  // promptSkills = what the model SEES in its catalog for THIS process. load_skill stays available for
  // every enabled skill (explicit /attach always works); this only scopes autonomous discovery.
  // Default: on everywhere except plain chat. When Deep Research is on, research skills are included.
  const promptSkills = skills.filter((s) => {
    const key = s.dir || s.name; const m = skillSurfaces[key];
    // Default on everywhere except plain chat — EXCEPT the document skills, which are useful in chat
    // (people make decks/sheets/docs there) so they default on in chat too. Explicit toggles still win.
    let on = (m && (surface in m)) ? m[surface] !== false : true; // default ON in every process (chat included); trim per-process with the + menu Skills toggles
    if (!on && researchOn && /research/i.test(String(key) + " " + (s.name || ""))) on = true;
    return on;
  });
  // Lightweight web search — on by default in every process (incl. plain chat). Quick + no approval,
  // unlike heavyweight Deep Research. Reuses research.cjs's search; gated by the same build flag.
  let websearchOn = false;
  try { websearchOn = require("./features.cjs").builtIn("research") && (_pcfg.extras || {}).websearch !== false; } catch {}
  const webSearchNote = websearchOn ? "\n\nYou can search the web: call the web_search tool for anything current or beyond your training data — news, latest releases, prices, 'today'/'now', recent events. Do NOT say you cannot access the internet or browse; search first, then answer with what you find and cite the sources." : "";
  // ---- Mission state (the harness's memory for this conversation) ----
  // Attached to the history array: custom props on arrays survive in RAM across turns
  // of the same session and are invisible to JSON persistence. Reset on app restart.
  history._plan = history._plan || new harness.PlanTracker();
  history._guard = new harness.CallGuard(); // fresh per turn — streaks are turn-local
  history._readPaths = history._readPaths || new Set();
  const mission = { readPaths: history._readPaths };
  const tracker = history._plan;
  const guard = history._guard;
  const model = profile.model || "";
  let tier = agentOpts.textTools ? "C" : harness.tierFor(modelStats.summary(model));
  modelStats.bump(model, "missions");
  const gi = globalInstructions ? `\n\nUser's custom instructions (always follow these):\n${globalInstructions}` : "";
  // Spell the browser out in the system prompt — without this, weaker models ignore the
  // browse_* tool schemas and improvise ("install Chrome", "I cannot browse"), which is wrong:
  // the Agent Browser is Madav's own built-in Chromium window, always available here.
  const browserNote = browser
    ? `\n\nYou HAVE a real web browser: the tools browse_open, browse_read, browse_click, browse_fill, browse_back drive a visible browser window the user watches. To look at any website, CALL browse_open with the URL — do not describe what you would do, do it. Never say you cannot browse, never ask the user to install or download a browser (no Chrome needed — the browser is built in), and never invent page content: open the page and read it.\nVERIFY BEFORE CLAIMING: after any action that should change something (sending a message, submitting a form, posting), call browse_read and CONFIRM the page actually shows the result (e.g. your message visible in the conversation) BEFORE telling the user it was done. If you cannot confirm it on the page, say honestly that it may not have gone through and what you see instead. Never report success you have not verified.${(browser.allow || []).length ? ` This agent may only visit: ${browser.allow.join(", ")}.` : ""}`
    : "";
  // Wave 4.1 — repo map: one compressed file tree per mission so the agent starts
  // knowing the lay of the land instead of list_dir spelunking.
  let repoMapText = "";
  if (cwd && mode !== "chat") {
    if (!history._repoMap) {
      try {
        const entries = [];
        walkFiles(cwd, cwd, 5, (rel, abs) => { if (entries.length < 800) { let size = 0; try { size = fs.statSync(abs).size; } catch {} entries.push({ rel, size }); } });
        history._repoMap = harness.formatRepoMap(entries);
      } catch { history._repoMap = ""; }
    }
    repoMapText = history._repoMap ? "\n\n" + history._repoMap : "";
  }
  const methodRules = mode !== "chat" ? harness.METHOD_RULES : "";
  const tierNote = tier === "B" ? harness.FEWSHOT_NOTE : "";
  // Artifact + office rules are appended for EVERY mode AND every agent (systemOverride). Previously
  // they lived only inside SYSTEM("chat") and were lost when an agent's instructions replaced it —
  // which is why a delegated agent insisted it "can't create a .pptx" instead of emitting officedoc.
  const sys = (systemOverride || SYSTEM(mode)) + ARTIFACT_RULE_BASE + officeRulePart(model) + webSearchNote + ANSWER_DIRECT_RULE + (noShell ? "" : DATA_TOOLS_RULE) + methodRules + tierNote + gi + browserNote + repoMapText + (promptSkills.length ? "\n\n" + skillsMgr.indexText(promptSkills) : "");
  if (history.length === 0) history.push({ role: "system", content: sys });
  else if (history[0] && history[0].role === "system") history[0].content = sys; // refresh index live
  history.push({ role: "user", content: prompt });
  // Wave 4.2 — squash stale tool outputs so old logs stop hogging the window.
  harness.squashStale(history);

  emit({ kind: "init", data: { model: profile.model, cwd, mode, permissionMode: permMode } });

  // Build the tool set. Chat gets skills + connectors only; agent modes also get file/shell tools.
  let tools = mode === "chat" ? [] : [...TOOLS];
  // Hard tool gate: when the caller says no shell (e.g. webhook-triggered headless
  // runs, or an agent whose Shell capability is off), run_bash is neither offered
  // nor executable — the schema is removed AND execution is refused below.
  if (noShell) tools = tools.filter((t) => t.function.name !== "run_bash");
  if (skills.length) tools.push(LOAD_SKILL_TOOL);
  if (allowAskUser) tools.push(ASK_USER_TOOL);
  // "Use Agents" gate — auto-delegation (call_agent) is opt-in per process. OFF in plain chat by
  // default → no handoffs, just a direct plain-text answer. A running agent (agentName) keeps it so
  // the full multi-agent ecosystem can delegate onward.
  if (agentsOn && callAgent && Array.isArray(roster) && roster.length) tools.push(callAgentTool(roster));
  if (browser) tools = [...tools, ...BROWSER_TOOLS(browser.allow || [])];
  // Desktop Applications Driver — native Windows apps via UI Automation (text-mode, like the browser).
  let dd = null;
  if (desktop) {
    try { dd = require("./desktop-driver.cjs"); tools = [...tools, ...dd.DESKTOP_TOOLS(desktop.allow || [])]; }
    catch { dd = null; } // module excluded from this build — feature simply absent
  }
  // Deep Research — multi-source web research with cited reports. Offered in every mode;
  // running it always asks the user first (it spends model calls + fetches the web).
  let research = null;
  try {
    // Deep Research is a heavyweight, multi-step web-research agent that always prompts for
    // approval — it should NOT be offered in plain "Let's Chat" (it was firing permission
    // popups on simple chat messages). Keep it for Collaborate / Build / Agents work only.
    if (researchOn && require("./features.cjs").builtIn("research") && (require("./settings.cjs").load().extras || {}).research !== false) {
      research = require("./research.cjs");
      tools.push(research.RESEARCH_TOOL);
    }
  } catch { research = null; }
  // Wave 2.1 — the visible working plan; Wave 5.1 — parallel scouts (folder missions).
  if (mode !== "chat") tools.push(harness.PLAN_TOOL);
  if (cwd && mode !== "chat" && agentOpts.scouts !== false) tools.push(harness.SCOUT_TOOL);
  // Text→image in every mode (selector-powered; see CREATE_IMAGE_TOOL).
  // Gated by the Extras switchboard (settings.extras.imagegen !== false).
  let imagegenOn = true;
  try { imagegenOn = require("./features.cjs").builtIn("imagegen") && (require("./settings.cjs").load().extras || {}).imagegen !== false; } catch {}
  if (imagegenOn) tools.push(CREATE_IMAGE_TOOL);
  if (websearchOn) tools.push(WEB_SEARCH_TOOL);
  // Connector (MCP) tools — the caller (session-manager) already scoped these to the process/
  // surface (plain chat is empty unless the user turned connectors on for chat from its + menu),
  // so just load whatever we were given. Empty list = no per-turn connect = fast.
  try {
    const mcpTools = await mcp.openAiTools(connectors);
    if (mcpTools.length) tools = [...tools, ...mcpTools];
  } catch {}

  // Live token streaming for CHAT: streamChatTools strips reasoning on the fly, so <think>
  // never reaches the UI, and the user sees tokens as they arrive instead of waiting for the
  // whole reply. Agent/cowork/code stay buffered — their pre-tool narration is deliberately
  // hidden behind tool cards (streaming it would let a model "narrate success" before approval).
  const streamLive = mode === "chat";

  const started = Date.now();
  const MAX_STEPS = agentOpts.thorough ? 14 : 12;
  // Prefer the model's exact context window from the cached OpenRouter catalog when known (heuristic fallback otherwise).
  let exactCtx = null; try { exactCtx = require("./openrouter-catalog.cjs").contextWindowOf(model); } catch {}
  const ctxBudget = harness.ctxWindowFor(model, exactCtx);
  let textMode = tier === "C";   // JSON-in-text protocol for models w/o native tools
  let planNudged = false;        // Wave 2.1 — one "finish your plan" nudge per turn
  let selfReviewed = false;      // Wave 2.4 — one self-review pass per turn
  let reviewsDone = 0;           // Wave 5.2 — reviewer call budget per turn
  let justCompacted = false;     // skip re-triggering compaction the step right after it ran
  const textToolList = () => tools.map((t) => `- ${t.function.name} ${JSON.stringify((t.function.parameters && t.function.parameters.properties) || {}).slice(0, 160)}`).join("\n");
  for (let step = 0; step < MAX_STEPS; step++) {
    // Wave 1.3 — auto-compaction: at ~70% of the model's window, compress the
    // mission into working notes (exactly what /compact does in the CLI). Guard
    // against a no-progress loop: never compact two steps in a row, and after
    // compaction hard-trim any one over-long message in the kept tail.
    if (!justCompacted && harness.estTokens(history) > 0.7 * ctxBudget) {
      const cid = "compact_" + Date.now().toString(36);
      emit({ kind: "tool_use", data: { id: cid, name: "compact_context", input: { reason: "approaching the model's context window" }, auto: true } });
      try {
        const sr = await streamChat(profile, harness.buildCompactionMessages(history), { onDelta: () => {}, signal });
        harness.applyCompaction(history, (sr && sr.text) || "");
        history._browseIdxs = []; // compaction rebuilt the array — old indices are void
        // A single huge message in the kept tail can leave us right back over budget
        // next step → infinite compaction. Hard-trim any tail message > ~6000 chars
        // (preserve role/shape; never touch the system message at index 0).
        for (let k = 1; k < history.length; k++) {
          const hm = history[k];
          if (hm && hm.role !== "system" && typeof hm.content === "string" && hm.content.length > 6000) {
            hm.content = harness.headTail(hm.content, { maxChars: 6000 });
          }
        }
        justCompacted = true; // skip compaction on the very next step
        emit({ kind: "tool_result", data: { id: cid, output: "Mission history compacted into working notes (goal, decisions, files, remaining work)." } });
      } catch (e) {
        emit({ kind: "tool_result", data: { id: cid, output: "(compaction skipped: " + String((e && e.message) || e).slice(0, 160) + ")" } });
      }
    } else if (justCompacted) {
      justCompacted = false; // clear after one step so future compaction can trigger again
    }
    // Wave 3.2 — tier-B drift guard: re-pin the discipline note every 6 steps.
    if (tier === "B" && step > 0 && step % 6 === 0) {
      history.push({ role: "user", content: "[reminder — not the user] Re-read your tool-call discipline rules and your plan; continue the task." });
    }

    let result;
    try {
      if (textMode) {
        // Tier C: plain completion + ```tool block protocol (any chat model can agent).
        const sysC = history[0] && history[0].role === "system" ? history[0] : null;
        if (sysC && !sysC._protocolAdded) { sysC.content += "\n" + harness.TEXT_PROTOCOL(textToolList()); sysC._protocolAdded = true; }
        const tr = await streamChat(profile, history, { onDelta: () => {}, signal });
        const text = (tr && tr.text) || "";
        const { calls, stripped } = harness.parseTextToolCalls(text); // assistant text ONLY — never tool results
        result = { content: stripped, toolCalls: calls, _rawText: text };
      } else {
        result = await streamChatTools(profile, history, tools, {
          signal,
          onDelta: streamLive ? (d) => emit({ kind: "assistant_delta", data: { text: d } }) : () => {},
        });
      }
    } catch (e) {
      if (e.name === "AbortError") { emit({ kind: "result", data: { subtype: "interrupted" } }); return; }
      // Wave 3.2 — native tool-calling unsupported? Fall back to the text protocol
      // once, and remember it for this model so future missions skip the failure.
      if (!textMode && /tool|function/i.test(String(e.message || "")) && step === 0) {
        textMode = true;
        tier = "C"; // text mode IS tier C — stop the tier-B re-pin from firing redundantly
        modelStats.flag(model, "nativeBroken", 1);
        modelStats.bump(model, "textMode");
        continue; // retry this step in text mode
      }
      emit({ kind: "error", data: { code: e.code || "error", message: String(e.message || e) } });
      return;
    }

    const { content, toolCalls } = result;
    const assistantMsg = { role: "assistant", content: textMode ? (result._rawText || content || "") : (content || "") };
    if (!textMode && toolCalls.length) {
      assistantMsg.tool_calls = toolCalls.map((tc) => ({ id: tc.id, type: "function", function: { name: tc.name, arguments: tc.arguments } }));
    }
    history.push(assistantMsg);

    if (!toolCalls.length) {
      // Wave 2.1 — plan enforcement: no "done" while plan steps are pending.
      if (!planNudged && mode !== "chat" && tracker.hasPlan() && tracker.pending().length && step < MAX_STEPS - 2) {
        planNudged = true;
        history.push({ role: "user", content: "[plan check — not the user] Your working plan still has pending steps:\n" + tracker.render() + "\nFinish them (or update the plan with set_plan if they are no longer needed) before giving your final answer." });
        continue;
      }
      // Wave 2.4 — thorough mode: one self-review pass before the answer ships.
      if (agentOpts.thorough && !selfReviewed && String(content || "").length > 400 && step < MAX_STEPS - 1) {
        selfReviewed = true;
        history.push({ role: "user", content: "[final self-review — not the user] Re-read the ORIGINAL request and your answer above. If anything is missing, wrong, or incomplete, produce the corrected COMPLETE answer now. If it is already complete, repeat it verbatim." });
        continue;
      }
      // Final answer — strip any chain-of-thought, then reveal the clean text. When we already
      // streamed it live (chat), it's on screen — re-emitting would duplicate it, so skip.
      const clean = stripReasoning(content);
      if (clean && !(streamLive && !textMode)) emit({ kind: "assistant_delta", data: { text: clean } });
      emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
      emit({ kind: "result", data: { subtype: "success", num_turns: step + 1, duration_ms: Date.now() - started } });
      modelStats.bump(model, "success");
      return;
    }
    // Tool-calling step: suppress the model's pre-tool narration so it can't claim
    // success before the user approves. The tool cards convey the action.

    // In text mode there are no native tool_calls on the assistant message, so tool
    // results must return as user-role messages (the "tool" role would be rejected).
    const pushToolResult = (tc, text) => {
      if (textMode) history.push({ role: "user", content: `[result of ${tc.name}]\n` + text });
      else history.push({ role: "tool", tool_call_id: tc.id, content: text });
    };

    for (const tc of toolCalls) {
      // Wave 1.1 — tolerant JSON repair ladder + measured discipline (Wave 3.1).
      const parsed = harness.tolerantParse(tc.arguments || "{}");
      let args = parsed.value || {};
      modelStats.bump(model, "toolCalls");
      if (parsed.repaired) modelStats.bump(model, "repaired");
      if (!parsed.ok) {
        modelStats.bump(model, "parseFails");
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: { error: "invalid arguments" }, auto: true } });
        let out;
        if (guard.reasks < 2) {
          guard.reasks++;
          modelStats.bump(model, "reasks");
          out = `Your ${tc.name} arguments were not valid JSON. Call ${tc.name} again with ONE valid JSON object as arguments — no comments, no single quotes, no trailing commas.`;
        } else {
          out = "(arguments were invalid JSON again — abandon this call and try a different approach)";
        }
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        pushToolResult(tc, out);
        continue;
      }

      // Wave 2.1 — the visible working plan (internal, instant, always auto).
      if (tc.name === "set_plan") {
        const rendered = args.update ? tracker.update(args.update.index, args.update.status) : tracker.set(args.steps);
        emit({ kind: "tool_use", data: { id: tc.id, name: "set_plan", input: { plan: rendered }, auto: true } });
        emit({ kind: "tool_result", data: { id: tc.id, output: rendered } });
        pushToolResult(tc, "Plan updated:\n" + rendered);
        continue;
      }

      // Wave 1.4 — identical-call loop breaker: the 3rd copy of the same call in a
      // row is refused (the result will not change; flailing wastes the budget).
      if (guard.repeatBlocked(tc.name, args)) {
        const out = "(blocked: this is the 3rd identical call in a row — the result will not change. State in one sentence why the previous attempts failed, then try a DIFFERENT approach.)";
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: true } });
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        pushToolResult(tc, out);
        continue;
      }

      // Wave 5.1 — parallel read-only scouts on the economy (or main) model.
      if (tc.name === "explore_parallel") {
        const queries = (Array.isArray(args.queries) ? args.queries : []).slice(0, 3).map((q) => String(q || "")).filter(Boolean);
        emit({ kind: "tool_use", data: { id: tc.id, name: `explore_parallel (${queries.length} scouts)`, input: { queries }, auto: true } });
        let out;
        if (!queries.length || !cwd) {
          out = "(scouts need at least one query and a working folder)";
        } else {
          try {
            const sp = agentOpts.economyProfile || profile;
            const results = await Promise.all(queries.map((q) => runScout(sp, cwd, q, signal)));
            out = results.map((r, i) => `Scout ${i + 1} — "${queries[i]}":\n${r}`).join("\n\n");
          } catch (e) { out = "ERROR: " + String((e && e.message) || e); }
        }
        emit({ kind: "tool_result", data: { id: tc.id, output: String(out).slice(0, 4000) } });
        pushToolResult(tc, String(out).slice(0, 8000));
        continue;
      }

      // Lightweight web search — quick, no approval. Returns top results (title + URL).
      if (tc.name === "web_search") {
        emit({ kind: "tool_use", data: { id: tc.id, name: "web_search", input: { query: String(args.query || "").slice(0, 200) }, auto: true } });
        let out;
        try { out = await require("./research.cjs").quickSearch(String(args.query || ""), signal); } catch { out = "(web search failed)"; }
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        pushToolResult(tc, String(out).slice(0, 8000));
        continue;
      }
      // Text→image: generate with the active profile/model, show the image in the
      // tool card (data.image), give the model only a tiny confirmation string.
      if (tc.name === "create_image") {
        emit({ kind: "tool_use", data: { id: tc.id, name: "create_image", input: { prompt: String(args.prompt || "").slice(0, 300) }, auto: true } });
        let out, image = null;
        if (isBlocked(permMode, tc.name)) out = "(blocked: plan mode is read-only)";
        else if (!imagegenOn) out = "Image generation is turned off for this install (Settings → Extras)."; // text-mode models can still emit the call
        else {
          try {
            const r = await require("./imagegen.cjs").generateImage(profile, args.prompt);
            image = r.dataUrl;
            out = "Image generated and shown to the user" + (r.file ? ` (saved: ${r.file})` : "") + ". Describe it in one short sentence and continue.";
          } catch (e) { out = "ERROR: " + String((e && e.message) || e); }
        }
        emit({ kind: "tool_result", data: { id: tc.id, output: String(out).slice(0, 600), image } });
        pushToolResult(tc, String(out).slice(0, 600));
        continue;
      }

      // Mid-mission question: pause for the human, resume with their answer.
      if (tc.name === "ask_user") {
        emit({ kind: "tool_use", data: { id: tc.id, name: "ask_user", input: { question: args.question }, auto: true } });
        const answer = allowAskUser
          ? await askUserQuestion(emit, permissions, tc.id, args.question, args.options)
          : "(no user available on this run — proceed with your best judgment and state your assumption)";
        emit({ kind: "tool_result", data: { id: tc.id, output: answer.slice(0, 4000) } });
        pushToolResult(tc, answer.slice(0, 8000));
        continue;
      }

      // Agent-as-tool handoff: run a roster agent on a sub-task, return its work.
      if (tc.name === "call_agent") {
        if (permMode === "plan" || !callAgent) {
          const out = permMode === "plan" ? "(blocked: plan mode is read-only — describe the delegation instead)" : "(agent handoffs unavailable on this run)";
          emit({ kind: "tool_use", data: { id: tc.id, name: `call_agent → ${args.agent || "?"}`, input: args, auto: true } });
          emit({ kind: "tool_result", data: { id: tc.id, output: out } });
          pushToolResult(tc, out);
          continue;
        }
        emit({ kind: "tool_use", data: { id: tc.id, name: `call_agent → ${args.agent || "?"}`, input: { task: args.task }, auto: true } });
        let out;
        try { out = String(await callAgent(args.agent, args.task) || "(no output)"); }
        catch (e) { out = "ERROR: " + String((e && e.message) || e); }
        emit({ kind: "tool_result", data: { id: tc.id, output: out.slice(0, 4000) } });
        pushToolResult(tc, out.slice(0, 12000));
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
          pushToolResult(tc, out);
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
        // Keep only the NEWEST page snapshot at full size. Older page dumps are the
        // #1 prompt bloat on browser missions (WhatsApp Web pages are huge): the
        // moment a newer read lands, every earlier one shrinks to a stub — cutting
        // per-step prompt size by half or more on long missions.
        // NOTE: these indices assume history is APPEND-ONLY within a turn. Any future
        // code that splices history MUST rebuild or reset _browseIdxs (applyCompaction
        // already resets it) — otherwise these indices point at the wrong messages.
        if (!Array.isArray(history._browseIdxs)) history._browseIdxs = [];
        for (const bi of history._browseIdxs) {
          const bm = history[bi];
          if (bm && (bm.role === "tool" || bm.role === "user") && typeof bm.content === "string" && bm.content.length > 420 && !bm._pageTrimmed) {
            bm.content = bm.content.slice(0, 300) + "\n… (older page snapshot trimmed — the newest page read is authoritative)";
            bm._pageTrimmed = true;
          }
        }
        pushToolResult(tc, String(out).slice(0, 16000));
        history._browseIdxs.push(history.length - 1);
        continue;
      }

      // Desktop Applications Driver — desktop_apps/desktop_read are free reads;
      // focus/click/type/open honor the permission mode like any other mutation.
      if (dd && tc.name.startsWith("desktop_")) {
        if (isBlocked(permMode, tc.name)) {
          emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: false } });
          emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "plan mode (read-only)" } });
          const out = "(blocked: plan mode is read-only)";
          emit({ kind: "tool_result", data: { id: tc.id, output: out } });
          pushToolResult(tc, out);
          continue;
        }
        const auto = isAuto(permMode, tc.name);
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto } });
        let allowed = auto;
        if (!allowed) allowed = await askPermission(emit, permissions, tc.id, tc.name, args);
        let out;
        if (!allowed) {
          emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "declined" } });
          out = "(user declined this desktop action)";
        } else {
          try { out = await dd.exec(tc.name, { ...args, __allow: desktop.allow || [] }); }
          catch (e) { out = "ERROR: " + String((e && e.message) || e); }
        }
        emit({ kind: "tool_result", data: { id: tc.id, output: String(out).slice(0, 4000) } });
        pushToolResult(tc, String(out).slice(0, 12000));
        continue;
      }

      // Deep Research — always asks first (spends model calls + reads the open web).
      if (research && tc.name === "deep_research") {
        if (isBlocked(permMode, tc.name)) {
          emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: false } });
          const out = "(blocked: plan mode is read-only)";
          emit({ kind: "tool_result", data: { id: tc.id, output: out } });
          pushToolResult(tc, out);
          continue;
        }
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: { query: String(args.query || "").slice(0, 200) }, auto: false } });
        const allowed = (permMode === "bypass" || permMode === "bypassPermissions")
          ? true : await askPermission(emit, permissions, tc.id, tc.name, args);
        let out;
        if (!allowed) {
          emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "declined" } });
          out = "(user declined the research run)";
        } else {
          try {
            const r = await research.runDeepResearch(profile, args, { signal });
            out = r.report || "Research returned nothing.";
          } catch (e) { out = "ERROR: " + String((e && e.message) || e); }
        }
        emit({ kind: "tool_result", data: { id: tc.id, output: String(out).slice(0, 6000) } });
        pushToolResult(tc, String(out).slice(0, 14000));
        continue;
      }

      // Shell hard-gate: even if a model hallucinates the tool name, refuse it.
      if (noShell && tc.name === "run_bash") {
        const out = "(blocked: the shell is not available on this run)";
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: true } });
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        pushToolResult(tc, out);
        continue;
      }

      // Plan mode: refuse mutations outright.
      if (isBlocked(permMode, tc.name)) {
        emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto: false } });
        emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "plan mode (read-only)" } });
        const out = "(blocked: plan mode is read-only)";
        emit({ kind: "tool_result", data: { id: tc.id, output: out } });
        pushToolResult(tc, out);
        continue;
      }

      const auto = isAuto(permMode, tc.name);
      emit({ kind: "tool_use", data: { id: tc.id, name: tc.name, input: args, auto } });

      let allowed = auto;
      if (!allowed) allowed = await askPermission(emit, permissions, tc.id, tc.name, args);

      const target = args.path || args.command || args.pattern || args.query || "";
      let output;
      if (!allowed) {
        emit({ kind: "permission_denied", data: { id: tc.id, name: tc.name, reason: "declined" } });
        modelStats.bump(model, "denied");
        output = "(user declined this tool call)";
      } else {
        try {
          output = await runTool(cwd, tc.name, args, skillsDir, null, mission, agentName);
          guard.noteResult(tc.name, target, true);
          emit({ kind: "tool_result", data: { id: tc.id, output: String(output).slice(0, 4000) } });
        } catch (e) {
          // Wave 1.4 — bounded error recovery: reflect, change approach, 2-strike stop.
          guard.noteResult(tc.name, target, false);
          modelStats.bump(model, "failures");
          const streak = guard.failStreak(tc.name, target);
          output = "ERROR: " + e.message + (streak >= 2
            ? "\n[harness] Second consecutive failure of this tool on this target — STOP retrying this approach. State in one sentence why it failed, then either take a different route or report the blocker honestly."
            : "\nReflect: state in one sentence why this failed, then try a DIFFERENT approach (do not repeat the same call).");
          emit({ kind: "tool_result", data: { id: tc.id, output } });
        }
      }
      pushToolResult(tc, String(output).slice(0, 8000));

      // Wave 5.2 — cheap-model reviewer: one bounded verdict per successful change.
      if (allowed && agentOpts.reviewerProfile && (tc.name === "edit_file" || tc.name === "write_file")
          && !String(output).startsWith("ERROR") && reviewsDone < 6) {
        reviewsDone++;
        const verdict = await runReviewer(agentOpts.reviewerProfile, prompt, `${tc.name} ${args.path || ""}\n${String(output).slice(0, 1200)}`, signal);
        if (/^flag/i.test(verdict)) {
          const rid = String(tc.id) + "_rev";
          emit({ kind: "tool_use", data: { id: rid, name: "reviewer", input: { file: args.path }, auto: true } });
          emit({ kind: "tool_result", data: { id: rid, output: verdict } });
          history.push({ role: "user", content: `[reviewer — not the user] ${verdict} — address this on ${args.path || "the change"} before finishing.` });
        }
      }
    }
  }
  modelStats.bump(model, "maxSteps");
  emit({ kind: "result", data: { subtype: "max_steps", duration_ms: Date.now() - started } });
}

module.exports = { runOpenAIAgentTurn };
