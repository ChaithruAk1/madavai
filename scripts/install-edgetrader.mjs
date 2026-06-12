// EdgeTrader installer — seeds the 6 agents, the relay team, the two MCP connectors,
// webhook settings, and the two scheduled tasks into Madav's settings/task stores.
//
//   node scripts/install-edgetrader.mjs            (run with Madav CLOSED)
//
// Idempotent: re-running replaces the EdgeTrader entries by id, touches nothing else.
// A timestamped backup of madav-settings.json is written first.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ET = path.join(ROOT, "edgetrader");
const APPDATA = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
const LEGACY = "brain" + "edge"; // legacy brand, built via concat so rename sweeps skip it
// Prefer the new userdata dir; fall back to the legacy one for not-yet-migrated machines.
const USERDATA_NEW = path.join(APPDATA, "madav");
const USERDATA_OLD = path.join(APPDATA, LEGACY);
const settingsFile = (dir) => path.join(dir, (dir === USERDATA_OLD ? LEGACY : "madav") + "-settings.json");
const USERDATA = (fs.existsSync(settingsFile(USERDATA_NEW)) || !fs.existsSync(settingsFile(USERDATA_OLD))) ? USERDATA_NEW : USERDATA_OLD;
const SETTINGS = settingsFile(USERDATA);
const TASKS_DIR = path.join(USERDATA, "task-data");
const TASKS = path.join(TASKS_DIR, "tasks.json");

const log = (m) => console.log("  " + m);
const fail = (m) => { console.error("✗ " + m); process.exit(1); };

// ---------- the EdgeTrader roster ----------
const C = { quant: "#13c2d6", context: "#5e9bf2", bull: "#5fb573", bear: "#e76f81", risk: "#d6a313", chief: "#8b7cf6" };
const T = (over) => ({ files: false, shell: false, connectors: false, skills: true, browser: false, ...over });
const now = Date.now();

const AGENTS = [
  {
    id: "agent_et_quant", name: "ET Quant Analyst",
    description: "EdgeTrader station 1 — technical analysis of one ticker from real indicator data.",
    tools: T({ connectors: true }), model: "", identity: { color: C.quant, glyph: "◆" }, autonomy: "ask", createdAt: now,
    instructions: "You are the EdgeTrader Quant Analyst, station 1 of a relay analyzing ONE stock ticker (given in the brief). Load the skill 'edgetrader-equity-analysis' and follow its Quant section exactly: call the finance-data connector tool get_snapshot(ticker) once, interpret trend, momentum, volatility, volume and 52-week context using the skill's rules, and produce a technical report under 500 words ending with the mandatory summary table and an 'ANALYST LEAN:' line. Every number must come from the tool result — if a field is null write 'unavailable'. Never give buy/sell advice; the Chief Strategist decides. If the ticker symbol is invalid, say so and stop.",
  },
  {
    id: "agent_et_context", name: "ET Context Analyst",
    description: "EdgeTrader station 2 — fundamentals, news and sentiment-proxy for the ticker.",
    tools: T({ connectors: true }), model: "", identity: { color: C.context, glyph: "✦" }, autonomy: "ask", createdAt: now,
    instructions: "You are the EdgeTrader Context Analyst, station 2 of a relay analyzing ONE stock ticker (find it in the brief / prior station's report). Load the skill 'edgetrader-equity-analysis' and follow its Context section exactly: call finance-data tools get_fundamentals(ticker) and get_news(ticker, 7), then report valuation, financial health, growth, and news tone (classify each headline bullish/bearish/neutral, quoting titles). State explicitly that news tone is a proxy for sentiment. Under 500 words, ending with the mandatory summary table and an 'ANALYST LEAN:' line. Never invent figures; null = 'unavailable'. No buy/sell advice.",
  },
  {
    id: "agent_et_bull", name: "ET Bull",
    description: "EdgeTrader station 3 — argues the strongest possible case FOR owning the stock.",
    tools: T({}), model: "", identity: { color: C.bull, glyph: "▲" }, autonomy: "ask", createdAt: now,
    instructions: "You are the EdgeTrader Bull Researcher, station 3 of a relay. You receive two analyst reports on one ticker. Load the skill 'edgetrader-adversarial-debate' and follow the Bull section: build the strongest case to OWN this stock now, citing specific numbers from the reports, and pre-empt the two most obvious bear counters. Max 300 words. You are an advocate, not a judge — no hedging, no balance, no advice disclaimers (the Chief Strategist handles that). Do not fabricate data not present in the reports.",
  },
  {
    id: "agent_et_bear", name: "ET Bear",
    description: "EdgeTrader station 4 — dismantles the bull case; strongest case AGAINST the stock.",
    tools: T({}), model: "", identity: { color: C.bear, glyph: "▼" }, autonomy: "ask", createdAt: now,
    instructions: "You are the EdgeTrader Bear Researcher, station 4 of a relay. You receive the analyst reports AND the bull case. Load the skill 'edgetrader-adversarial-debate' and follow the Bear section: quote the bull's two strongest claims and rebut them with data, then build the strongest case AGAINST owning this stock now (valuation, deteriorating signals, negative catalysts). Max 300 words. Advocate, not judge — no hedging. Do not fabricate data not present in the reports.",
  },
  {
    id: "agent_et_risk", name: "ET Risk Critic",
    description: "EdgeTrader station 5 — stress-tests the emerging decision: sizing, invalidation, drawdown.",
    tools: T({}), model: "", identity: { color: C.risk, glyph: "⚙" }, autonomy: "ask", createdAt: now,
    instructions: "You are the EdgeTrader Risk Critic, station 5 of a relay. You receive analyst reports and the bull/bear debate. Load the skill 'edgetrader-adversarial-debate' and follow the Risk Critic section: do NOT pick a side — stress-test the decision. Cover position sizing the evidence supports, a concrete invalidation level (use SMA/ATR/52w data from the quant report), the realistic drawdown scenario over the horizon, and the assumption both debaters missed. Max 300 words. End with exactly one line: 'RISK ADJUSTMENT: none' or 'RISK ADJUSTMENT: reduce conviction by N' or 'RISK ADJUSTMENT: flip to HOLD (reason)'.",
  },
  {
    id: "agent_et_chief", name: "ET Chief Strategist",
    description: "EdgeTrader station 6 — final judge: weighs everything, issues the structured verdict.",
    tools: T({}), model: "", identity: { color: C.chief, glyph: "❖" }, autonomy: "ask", createdAt: now,
    instructions: "You are the EdgeTrader Chief Strategist, the final station of the relay. You receive the analyst reports, the bull and bear cases, and the risk critique for ONE ticker. Load the skill 'edgetrader-verdict-format' and follow it exactly: name the debate winner and why (one sentence), apply or reject the Risk Critic's RISK ADJUSTMENT explicitly, apply any PAST LESSONS included in the brief (say which changed your view, if any), avoid defaulting to HOLD without positive justification, write a concise decision rationale (under 300 words), close the prose with 'This is information, not financial advice.', and END your message with the mandatory fenced JSON edgetrader_verdict block from the skill — exact shape, machine-parsed, numbers grounded in the analyst data.",
  },
];

// OPTIONAL persona lenses (ai-hedge-fund-inspired): three investing "schools" that judge
// the same ticker through different philosophies. Seeded as agents but NOT in the default
// team — add them in Agent Studio (between Context Analyst and Bull) when you want the
// ensemble; the 'edgetrader-persona-lenses' skill carries their full rules.
const LENS = (id, name, glyph, color, school, brief) => ({
  id, name, description: `EdgeTrader optional lens — ${school} school. ${brief}`,
  tools: T({}), model: "", identity: { color, glyph }, autonomy: "ask", createdAt: now,
  instructions: `You are the ${name}, an OPTIONAL EdgeTrader lens station. You receive the Quant and Context analyst reports for ONE ticker. Load the skill 'edgetrader-persona-lenses' and follow its Shared rules plus the ${school} section exactly: judge the ticker strictly through that school's philosophy, max 250 words, only numbers from the reports, and END with the mandatory 'LENS VERDICT:' line from the skill. You are a lens, not the decider.`,
});
const LENS_AGENTS = [
  LENS("agent_et_lens_value", "ET Value Lens", "◉", "#d6a313", "Value lens (Buffett/Graham school)", "Moats, owner earnings, margin of safety."),
  LENS("agent_et_lens_contra", "ET Contrarian Lens", "◎", "#e76f81", "Contrarian lens (Burry/deep-skeptic school)", "What is the consensus missing?"),
  LENS("agent_et_lens_growth", "ET Growth Lens", "◈", "#5e9bf2", "Growth lens (Wood/Lynch school)", "Secular tailwinds and compounding runway."),
];
AGENTS.push(...LENS_AGENTS);

const TEAM = {
  id: "team_edgetrader", name: "EdgeTrader",
  identity: { color: C.chief, glyph: "❖" }, mode: "relay",
  // Default relay stays the lean 6 stations; the lens agents are available to add in Studio.
  members: AGENTS.filter((a) => !a.id.startsWith("agent_et_lens_")).map((a) => a.id), budgetTokens: 120000, createdAt: now,
};

// ---------- run ----------
console.log("\nEdgeTrader installer\n");
if (!fs.existsSync(SETTINGS)) fail(`Settings not found: ${SETTINGS}\n  Launch Madav once first, then close it and re-run.`);

let s;
try { s = JSON.parse(fs.readFileSync(SETTINGS, "utf8")); } catch (e) { fail("Could not parse settings file: " + e.message); }

const backup = SETTINGS + ".edgetrader-backup-" + new Date().toISOString().replace(/[:.]/g, "-");
fs.copyFileSync(SETTINGS, backup);
log("backup written: " + path.basename(backup));

// agents (replace by id)
s.agents = Array.isArray(s.agents) ? s.agents : [];
for (const a of AGENTS) {
  const i = s.agents.findIndex((x) => x.id === a.id);
  if (i >= 0) s.agents[i] = { ...s.agents[i], ...a, createdAt: s.agents[i].createdAt || a.createdAt };
  else s.agents.push(a);
}
log(`agents: ${AGENTS.length} seeded (ET Quant Analyst … ET Chief Strategist)`);

// team
s.teams = Array.isArray(s.teams) ? s.teams : [];
const ti = s.teams.findIndex((t) => t.id === TEAM.id);
if (ti >= 0) s.teams[ti] = { ...s.teams[ti], ...TEAM, createdAt: s.teams[ti].createdAt || TEAM.createdAt };
else s.teams.push(TEAM);
log("team: EdgeTrader (relay, 6 stations, 120k token budget)");

// connectors (python stdio MCP servers)
s.connectors = Array.isArray(s.connectors) ? s.connectors : [];
const CONNECTORS = [
  { id: "c_etfindata", name: "finance-data", command: "python", args: [path.join(ET, "mcp", "finance_data_server.py")], env: {}, enabled: true },
  { id: "c_etexec", name: "trade-executor", command: "python", args: [path.join(ET, "mcp", "executor_server.py")], env: {}, enabled: false }, // OFF until you opt in
];
for (const c of CONNECTORS) {
  const i = s.connectors.findIndex((x) => x.id === c.id);
  if (i >= 0) s.connectors[i] = { ...s.connectors[i], ...c, enabled: s.connectors[i].enabled ?? c.enabled };
  else s.connectors.push(c);
}
log("connectors: finance-data (enabled) + trade-executor (DISABLED by default)");

// skills folder
s.skillsDirs = Array.isArray(s.skillsDirs) ? s.skillsDirs : [];
const skillsDir = path.join(ROOT, "skills");
if (!s.skillsDirs.includes(skillsDir)) s.skillsDirs.push(skillsDir);
log("skills folder registered: " + skillsDir);

// webhooks (needed by the batch runner)
s.webhooks = s.webhooks || { enabled: false, port: 8765, token: "", lan: false };
// Existing tokens (plaintext or OS-encrypted "enc:v1:…") are kept; mint only when empty.
if (!s.webhooks.token) s.webhooks.token = crypto.randomBytes(24).toString("hex");
s.webhooks.enabled = true;
s.webhooks.port = s.webhooks.port || 8765;
const tokenIsReadable = !String(s.webhooks.token).startsWith("enc:v1:");
log("webhooks: enabled on port " + s.webhooks.port + (tokenIsReadable ? "" : " (existing encrypted token kept)"));

fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2), "utf8");
log("settings saved");

// edgetrader/config.json — wire webhook + team id for the batch runner
const cfgPath = path.join(ET, "config.json");
if (!fs.existsSync(cfgPath)) fs.copyFileSync(path.join(ET, "config.example.json"), cfgPath); // fresh clone (config.json is gitignored — it holds the token)
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
cfg.webhook.base_url = "http://127.0.0.1:" + s.webhooks.port;
cfg.webhook.team_id = TEAM.id;
if (tokenIsReadable) cfg.webhook.token = s.webhooks.token;
else log("NOTE: webhook token is OS-encrypted; copy it from Madav Scheduler page into edgetrader/config.json webhook.token");
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2), "utf8");
log("edgetrader/config.json wired (webhook url + team id" + (tokenIsReadable ? " + token)" : ")"));

// scheduled tasks (backup first; refuse to proceed over a corrupt file — never wipe user tasks)
fs.mkdirSync(path.join(TASKS_DIR, "runs"), { recursive: true });
let tasks = [];
if (fs.existsSync(TASKS)) {
  try { tasks = JSON.parse(fs.readFileSync(TASKS, "utf8")).tasks || []; }
  catch (e) { fail(`tasks.json exists but won't parse (${e.message}) — fix or remove it manually; refusing to overwrite user tasks.`); }
  fs.copyFileSync(TASKS, TASKS + ".edgetrader-backup");
}
const upsert = (t) => {
  const i = tasks.findIndex((x) => x.id === t.id);
  if (i >= 0) tasks[i] = { ...tasks[i], ...t, lastRun: tasks[i].lastRun || 0 }; // keep run history timing
  else tasks.unshift(t);
};
upsert({
  id: "tsk_et_sweep", name: "EdgeTrader · Daily watchlist sweep",
  prompt: "Run the command `python batch_runner.py` in this folder (it analyzes every ticker in watchlist.txt through the EdgeTrader team and writes reports/, the digest, signals.jsonl and the decision log). Wait for it to finish, then report: how many tickers ran, each ticker's verdict + conviction from the digest, and any errors.",
  target: { type: "folder", folder: ET },
  schedule: { mode: "daily", everyMinutes: 60, time: "07:00", weekday: 1 }, lastRun: 0,
});
upsert({
  id: "tsk_et_reflect", name: "EdgeTrader · Weekly reflection",
  prompt: "Run the command `python reflector.py` in this folder (it resolves pending entries in the decision log against realized returns and writes lessons). Wait for it to finish, then report which decisions were resolved, their alpha vs SPY, and the new lessons added.",
  target: { type: "folder", folder: ET },
  schedule: { mode: "weekly", everyMinutes: 60, time: "07:30", weekday: 1 }, lastRun: 0,
});
fs.writeFileSync(TASKS, JSON.stringify({ tasks }, null, 2), "utf8");
log("scheduled tasks: daily sweep 07:00 + weekly reflection Mon 07:30");

console.log(`\n✓ EdgeTrader installed.

Next steps:
  1. pip install -r edgetrader\\requirements.txt
  2. Start Madav — the EdgeTrader team is on the Agents Team tab
  3. Single run: open the team, brief it with just a ticker, e.g.  NVDA
  4. Batch run:  edit edgetrader\\watchlist.txt, then  python edgetrader\\batch_runner.py
     (Madav must be running — the runner fires the team via the local webhook)

Trading stays OFF until you set execution.enabled=true in edgetrader\\config.json
and enable the trade-executor connector. Paper endpoint is enforced by default.\n`);
