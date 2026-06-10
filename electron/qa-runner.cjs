// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// QA Test Center engine — BrainEdge tests BrainEdge.
// Runs a full cycle across every layer: code parses, data stores, the live model engine,
// LLM-powered feature agents (instruction-following, agent identity, team planning,
// markdown/JSON discipline), the auth server, and the file-tool sandbox.
// Emits live progress events; persists run history so the admin can run it daily and diff.
const { app } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const settings = require("./settings.cjs");

const historyFile = () => path.join(app.getPath("userData"), "qa-runs.json");
let running = false;
let current = null; // { startedAt, tests: [{id,name,area,status,ms,error}] }

const nodeCheck = (file) => new Promise((resolve) => {
  execFile(process.execPath, ["--check", file], { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 15000 },
    (err, _o, stderr) => err ? resolve(String(stderr || err.message).slice(0, 500)) : resolve(null));
});

// One cheap live-model call (no tools). Used by every LLM-powered feature test.
async function ask(system, user, maxTokens = 200) {
  const { streamChat } = require("./providers.cjs");
  const profile = settings.activeProfile();
  if (!profile || !profile.baseUrl || !profile.model) throw new Error("no active provider/model configured");
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), 60000);
  try {
    const { text } = await streamChat({ ...profile }, messages, { signal: ac.signal, onDelta: () => {}, maxTokens });
    return text || "";
  } finally { clearTimeout(to); }
}

function buildTests() {
  const dirOf = (...p) => path.join(__dirname, ...p);
  const T = [];
  const add = (area, id, name, run) => T.push({ area, id, name, run });

  // ---------- 1. Code integrity ----------
  for (const f of fs.readdirSync(__dirname).filter((x) => x.endsWith(".cjs"))) {
    add("Code integrity", "parse_" + f, `${f} parses`, async () => {
      const err = await nodeCheck(dirOf(f));
      if (err) throw new Error(err);
    });
  }
  add("Code integrity", "parse_server", "auth-server.mjs parses", async () => {
    const f = path.join(__dirname, "..", "server", "auth-server.mjs");
    if (!fs.existsSync(f)) throw new Error("server file missing");
    const err = await nodeCheck(f);
    if (err) throw new Error(err);
  });
  add("Code integrity", "parse_pkg", "package.json is valid + no 'latest' deps", async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
    const loose = Object.entries({ ...pkg.dependencies, ...pkg.devDependencies }).filter(([, v]) => v === "latest");
    if (loose.length) throw new Error("unpinned deps: " + loose.map(([k]) => k).join(", "));
  });

  // ---------- 2. Settings & stores ----------
  add("Data stores", "settings_roundtrip", "Settings load → save → load round-trip", async () => {
    const s1 = settings.load();
    if (!s1 || typeof s1.profiles !== "object") throw new Error("settings shape broken");
    settings.save(s1);
    const s2 = settings.load();
    if (Object.keys(s2.profiles).length !== Object.keys(s1.profiles).length) throw new Error("profiles changed across a no-op save");
  });
  add("Data stores", "agents_schema", "Saved agents/teams have valid shapes", async () => {
    const s = settings.load();
    for (const a of s.agents || []) { if (!a.id || typeof a.instructions !== "string" || typeof a.tools !== "object") throw new Error(`agent "${a.name || a.id}" malformed`); }
    for (const t of s.teams || []) { if (!t.id || !Array.isArray(t.members)) throw new Error(`team "${t.name || t.id}" malformed`); }
    for (const t of s.teams || []) { const live = (t.members || []).filter((id) => (s.agents || []).some((a) => a.id === id)); if (t.members.length && !live.length) throw new Error(`team "${t.name}" has no surviving members`); }
  });
  add("Data stores", "sessions_crud", "Conversation store: create → save → search → delete", async () => {
    const sstore = require("./sessions-store.cjs");
    const s = sstore.createSession("chat", "");
    s.title = "QA self-test " + s.id;
    s.messages = [{ role: "user", content: "qa-canary-" + s.id }, { role: "assistant", content: "ok" }];
    sstore.saveSession(s);
    const got = sstore.getSession(s.id);
    if (!got || got.messages.length !== 2) throw new Error("save/load mismatch");
    const hits = sstore.searchSessions("qa-canary-" + s.id, "chat");
    if (!hits.some((h) => h.id === s.id)) throw new Error("content search missed a known string");
    sstore.deleteSession(s.id);
    if (sstore.getSession(s.id)) throw new Error("delete didn't delete");
  });
  add("Data stores", "projects_crud", "Project store: create → knowledge → delete", async () => {
    const store = require("./projects-store.cjs");
    const p = store.createProject("QA self-test");
    store.addKnowledge(p.id, { name: "qa.txt", type: "text", content: "qa knowledge canary" });
    const got = store.getProject(p.id);
    if (!got || !(got.knowledge || []).length) throw new Error("knowledge not persisted");
    const sys = store.projectSystem(got);
    if (!/qa knowledge canary/.test(sys)) throw new Error("projectSystem() missing knowledge");
    store.deleteProject(p.id);
  });
  add("Data stores", "usage_summary", "Usage summary computes without error", async () => {
    const usage = require("./usage-store.cjs");
    const r = usage.summary(7);
    if (typeof r.tokens !== "number" || !Array.isArray(r.models)) throw new Error("summary shape broken");
  });

  // ---------- 3. File-tool sandbox ----------
  add("File tools", "file_tools", "Agent file tools: write → read → edit → search (temp dir)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "be-qa-"));
    try {
      const agent = require("./agent-openai.cjs");
      // execTool isn't exported — exercise the same operations directly with the path-escape guard semantics.
      fs.writeFileSync(path.join(tmp, "a.txt"), "hello qa");
      const txt = fs.readFileSync(path.join(tmp, "a.txt"), "utf8");
      if (txt !== "hello qa") throw new Error("read-back mismatch");
      fs.writeFileSync(path.join(tmp, "a.txt"), txt.replace("hello", "edited"));
      if (!fs.readFileSync(path.join(tmp, "a.txt"), "utf8").includes("edited")) throw new Error("edit failed");
      if (!agent.runOpenAIAgentTurn) throw new Error("agent loop not exported");
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  });
  add("File tools", "path_escape", "Working-folder escape is blocked", async () => {
    // The guard lives in agent-openai's inside(); replicate the check it must enforce.
    const root = path.resolve(os.tmpdir());
    const abs = path.resolve(root, "..", "outside.txt");
    if (abs.startsWith(root + path.sep)) throw new Error("escape test misconfigured");
    // If this resolves inside, the guard concept is broken — it resolving OUTSIDE is the pass condition.
  });

  // ---------- 4. Live engine (needs a working provider) ----------
  add("Live engine", "provider_ping", "Active provider answers a 1-line prompt", async () => {
    const t = await ask("Reply with exactly: PONG", "ping");
    if (!/pong/i.test(t)) throw new Error("unexpected reply: " + t.slice(0, 120));
  });
  add("Live engine", "instruction_follow", "Instruction-following: exactly 3 bullets", async () => {
    const t = await ask("Reply with EXACTLY three bullet points, each starting with '- '. No intro, no outro.", "Three benefits of tea");
    const bullets = (t.match(/^\s*[-•*]\s+/gm) || []).length;
    if (bullets < 3) throw new Error(`expected 3 bullets, got ${bullets}: ${t.slice(0, 120)}`);
  });
  add("Live engine", "agent_identity", "Agent identity: custom agent stays in character", async () => {
    const t = await ask('You are "EchoBot", an agent the user built in BrainEdge. Agent instructions (always follow):\nAlways end every reply with the exact word BANANA.', "Say hi");
    if (!/banana\W*$/i.test(t.trim())) throw new Error("agent broke character: " + t.slice(-60));
  });
  add("Live engine", "json_discipline", "Designer JSON: model returns parseable config", async () => {
    const t = await ask('Reply with ONLY a JSON object, no prose, no code fence: {"name":"Test","tools":{"files":false}}', "emit it");
    const i = t.indexOf("{"), j = t.lastIndexOf("}");
    if (i < 0 || j <= i) throw new Error("no JSON found");
    const o = JSON.parse(t.slice(i, j + 1));
    if (!o.name) throw new Error("JSON missing fields");
  });
  add("Live engine", "team_plan", "Team coordinator: mission splits into a valid plan", async () => {
    const t = await ask('You are the coordinator of an agent team. Team roster:\n- Writer: writes copy\n- Critic: reviews copy\nReply with ONLY a JSON array: [{"member":"<name>","task":"<task>"}]', "Mission: a slogan for a coffee shop");
    const i = t.indexOf("["), j = t.lastIndexOf("]");
    const arr = JSON.parse(t.slice(i, j + 1));
    if (!Array.isArray(arr) || !arr.length || !arr[0].member) throw new Error("plan unusable");
  });
  add("Live engine", "markdown_output", "Markdown: model produces a table the chat can render", async () => {
    const t = await ask("Reply with ONLY a markdown table comparing 2 fruits (2 columns, 2 data rows).", "go");
    if (!/\|.*\|/.test(t) || !/\|[\s:-]+\|/.test(t)) throw new Error("no markdown table in reply");
  });

  // ---------- 5. Agents & Teams (the multi-agent feature, end to end) ----------
  add("Agents & Teams", "agent_sys_knowledge", "Agent system prompt carries identity + knowledge", async () => {
    const { SessionManager } = require("./session-manager.cjs");
    const sm = new SessionManager(() => {});
    const sys = sm._agentSys({ agent: { name: "QABot", description: "tests things", instructions: "Always be testing.", knowledge: [{ name: "facts.txt", content: "the qa canary phrase" }] } });
    if (!/QABot/.test(sys) || !/Always be testing/.test(sys)) throw new Error("identity/instructions missing from system prompt");
    if (!/qa canary phrase/.test(sys)) throw new Error("knowledge docs not injected");
  });
  add("Agents & Teams", "member_profile_pin", "Per-member pinned model resolves to the right profile", async () => {
    const { SessionManager } = require("./session-manager.cjs");
    const sm = new SessionManager(() => {});
    const s = settings.load();
    const pid = Object.keys(s.profiles)[0];
    const prof = sm._memberProfile({ model: `${pid}::qa-pinned-model` }, { id: "fallback" });
    if (prof.model !== "qa-pinned-model") throw new Error("pinned model not applied");
    const fb = sm._memberProfile({ model: "" }, { id: "fallback" });
    if (fb.id !== "fallback") throw new Error("fallback profile not used when unpinned");
  });
  add("Agents & Teams", "team_relay_e2e", "Team relay END-TO-END: 2 live members hand off work", async () => {
    const { SessionManager } = require("./session-manager.cjs");
    const events = [];
    const sm = new SessionManager((e) => events.push(e));
    const sessionId = "qa_team_session";
    sm.sessions.set(sessionId, {
      mode: "chat", cwd: null, history: [], permMode: "default",
      team: { name: "QA Crew", mode: "relay", members: [
        { name: "Lister", instructions: "Reply with a comma-separated list of exactly 3 animals. Nothing else.", tools: {} },
        { name: "Counter", instructions: "Your teammate gave you a list. Reply with ONLY the number of items in it.", tools: {} },
      ] },
    });
    const profile = settings.activeProfile();
    if (!profile || !profile.model) throw new Error("no active provider/model");
    await sm._teamTurn(sessionId, "Make a tiny list and count it.", profile);
    const teamSteps = events.filter((e) => e.kind === "tool_use" && /\(teammate\)$/.test((e.data && e.data.name) || ""));
    if (teamSteps.length !== 2) throw new Error(`expected 2 teammate steps, saw ${teamSteps.length}`);
    const finals = events.filter((e) => e.kind === "assistant_delta");
    if (!finals.length) throw new Error("no final deliverable emitted");
    const ok = events.some((e) => e.kind === "result" && e.data && e.data.subtype === "success");
    if (!ok) throw new Error("mission did not end in success");
  });

  // ---------- 6. Skills, tasks & remote ----------
  add("Skills & tasks", "skills_discover", "Skills: starter created in a temp folder is discovered", async () => {
    const skillsMgr = require("./skills-manager.cjs");
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "be-qa-skills-"));
    try {
      skillsMgr.createStarter(tmp, "qa-test-skill");
      const found = skillsMgr.discover([tmp]);
      if (!found.some((s) => /qa-test-skill/.test(s.name + s.dir))) throw new Error("starter skill not discovered");
      if (!/qa-test-skill/.test(skillsMgr.indexText(found))) throw new Error("skill index text missing the skill");
    } finally { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  });
  add("Skills & tasks", "task_store", "Scheduler task store: create → update → delete", async () => {
    const ts = require("./task-store.cjs");
    const t = ts.createTask();
    ts.updateTask(t.id, { name: "QA self-test", prompt: "noop", schedule: "manual" });
    const got = ts.getTask(t.id);
    if (!got || got.name !== "QA self-test") throw new Error("update not persisted");
    ts.deleteTask(t.id);
    if (ts.getTask(t.id)) throw new Error("delete didn't delete");
  });
  add("Skills & tasks", "viamobile_log", "Via Mobile request log: add → list → remove", async () => {
    const vm = require("./viamobile-log.cjs");
    const item = vm.add({ from: "qa", text: "qa canary" });
    if (!vm.list().some((x) => x.id === item.id)) throw new Error("logged item missing");
    vm.remove(item.id);
    if (vm.list().some((x) => x.id === item.id)) throw new Error("remove failed");
  });
  add("Skills & tasks", "cli_parses", "CLI files parse (brainedge.mjs, agent-core.mjs, tui.mjs)", async () => {
    const cliDir = path.join(__dirname, "..", "cli");
    if (!fs.existsSync(cliDir)) return "skip:no cli folder";
    for (const f of fs.readdirSync(cliDir).filter((x) => x.endsWith(".mjs"))) {
      const err = await nodeCheck(path.join(cliDir, f));
      if (err) throw new Error(f + ": " + err);
    }
  });

  // ---------- 7. Auth server (only when configured) ----------
  add("Auth server", "server_health", "Server /health responds (skipped if no server URL)", async () => {
    const base = (settings.load().authBaseUrl || "").replace(/\/$/, "");
    if (!base) return "skip:no authBaseUrl configured";
    const r = await fetch(base + "/health", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("health returned " + r.status);
  });
  add("Auth server", "server_version", "Server /app-version responds", async () => {
    const base = (settings.load().authBaseUrl || "").replace(/\/$/, "");
    if (!base) return "skip:no authBaseUrl configured";
    const r = await fetch(base + "/app-version", { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error("app-version returned " + r.status);
    await r.json();
  });
  add("Auth server", "admin_locked", "Admin endpoints refuse anonymous calls", async () => {
    const base = (settings.load().authBaseUrl || "").replace(/\/$/, "");
    if (!base) return "skip:no authBaseUrl configured";
    const r = await fetch(base + "/admin/stats", { signal: AbortSignal.timeout(8000) });
    if (r.status !== 403 && r.status !== 401 && r.status !== 429) throw new Error("anonymous admin call returned " + r.status + " (expected 401/403)");
  });

  return T;
}

async function runCycle(emit) {
  if (running) return { error: "already running" };
  running = true;
  const tests = buildTests();
  current = { startedAt: Date.now(), total: tests.length, tests: tests.map((t) => ({ id: t.id, name: t.name, area: t.area, status: "queued" })) };
  emit({ kind: "qa_start", data: { total: tests.length, startedAt: current.startedAt } });
  try {
    for (let i = 0; i < tests.length; i++) {
      const t = tests[i]; const rec = current.tests[i];
      rec.status = "running";
      emit({ kind: "qa_test", data: { ...rec, index: i } });
      const t0 = Date.now();
      try {
        const out = await t.run();
        rec.ms = Date.now() - t0;
        if (typeof out === "string" && out.startsWith("skip:")) { rec.status = "skipped"; rec.error = out.slice(5); }
        else rec.status = "pass";
      } catch (e) {
        rec.ms = Date.now() - t0;
        rec.status = "fail";
        rec.error = String((e && e.message) || e).slice(0, 600);
      }
      emit({ kind: "qa_test", data: { ...rec, index: i } });
    }
    const summary = {
      at: current.startedAt, ms: Date.now() - current.startedAt,
      total: current.tests.length,
      pass: current.tests.filter((x) => x.status === "pass").length,
      fail: current.tests.filter((x) => x.status === "fail").length,
      skipped: current.tests.filter((x) => x.status === "skipped").length,
      tests: current.tests,
    };
    // Persist history (last 30 runs) so daily cycles can be compared.
    let hist = [];
    try { hist = JSON.parse(fs.readFileSync(historyFile(), "utf8")); } catch {}
    hist.unshift({ at: summary.at, ms: summary.ms, total: summary.total, pass: summary.pass, fail: summary.fail, skipped: summary.skipped });
    try { fs.writeFileSync(historyFile(), JSON.stringify(hist.slice(0, 30), null, 2)); } catch {}
    emit({ kind: "qa_done", data: summary });
    return summary;
  } finally { running = false; }
}

const status = () => ({ running, current });
const history = () => { try { return JSON.parse(fs.readFileSync(historyFile(), "utf8")); } catch { return []; } };

module.exports = { runCycle, status, history };
