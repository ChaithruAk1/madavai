// Skills — progressive-disclosure skills format, across one or more skill folders.
// A skill = a folder containing SKILL.md (YAML frontmatter name/description + body).
// Discovery is recursive (skill folders can be nested) and runs fresh each turn, so adding or
// editing a skill on disk is reflected in real time on the next message.
const fs = require("fs");
const path = require("path");

const SKIP = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build"]);
const MAX_DEPTH = 5;

function parse(text) {
  const m = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text };
  const meta = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) {
      const k = line.slice(0, i).trim();
      const v = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      meta[k] = v;
    }
  });
  return { meta, body: m[2] };
}

function walk(root, depth, acc) {
  if (depth < 0) return;
  let entries;
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isFile() && e.name === "SKILL.md") {
      try {
        const file = path.join(root, "SKILL.md");
        const { meta } = parse(fs.readFileSync(file, "utf8"));
        let updated = 0; try { updated = fs.statSync(file).mtimeMs; } catch {}
        acc.push({ name: meta.name || path.basename(root), description: meta.description || "", dir: root, file, updated });
      } catch {}
    }
  }
  for (const e of entries) {
    if (e.isDirectory() && !SKIP.has(e.name) && !e.name.startsWith(".")) {
      walk(path.join(root, e.name), depth - 1, acc);
    }
  }
}

function roots(dirs) {
  if (Array.isArray(dirs)) return dirs.filter(Boolean);
  return dirs ? [dirs] : [];
}

// Built-in skills — the app's OWN skills/ folder (the curated library: ECC imports,
// user packs, EdgeTrader) loads in EVERY mode without needing a settings entry, so a
// settings wipe or reinstall can never silently lose them.
function builtinSkillDirs() {
  const d = path.join(__dirname, "..", "skills");
  try { return fs.existsSync(d) ? [d] : []; } catch { return []; }
}
// The Extras "EdgeTrader analysis pack" switch hides ONLY edgetrader-* skills,
// never the general bundled library that shares the folder. Fail-OPEN (absent = ON).
function edgetraderOn() {
  try { if ((require("./settings.cjs").load().extras || {}).edgetrader === false) return false; } catch { /* default ON */ }
  try { if (!require("./features.cjs").builtIn("edgetrader")) return false; } catch { /* default ON */ }
  return true;
}

// Short-TTL cache: discover() runs on every turn and walks the skills tree (readdir + read each
// SKILL.md + parse frontmatter). The skill set rarely changes mid-session, so cache by
// (dir-set + edgetrader flag) for a few seconds. Newly added/removed skills still appear within the
// TTL, and a restart is always fresh. Mirrors the mtime cache settings.cjs already uses.
let _discCache = new Map();
function discover(dirs) {
  const et = edgetraderOn();
  const key = JSON.stringify(roots(dirs)) + "|" + (et ? 1 : 0);
  const hit = _discCache.get(key);
  if (hit && Date.now() - hit.at < 8000) return hit.out;
  const acc = [];
  for (const r of new Set([...builtinSkillDirs(), ...roots(dirs)])) walk(r, MAX_DEPTH, acc);
  const seen = new Set();
  const out = [];
  for (const s of acc) {
    if (!et && /^edgetrader-/.test(path.basename(s.dir))) continue; // pack switched off in Extras
    if (seen.has(s.name)) continue;
    seen.add(s.name); out.push(s);
  }
  _discCache.set(key, { at: Date.now(), out });
  if (_discCache.size > 16) _discCache.clear(); // tiny bound — keys are per dir-set
  return out;
}

function indexText(skills) {
  if (!skills.length) return "";
  return "You have these SKILLS. When the user's request matches one, call the load_skill tool " +
    "with its exact name to get the full instructions, then follow them:\n" +
    skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
}

function loadSkill(dirs, name) {
  const s = discover(dirs).find((x) => x.name === name || path.basename(x.dir) === name);
  if (!s) return null;
  const { body } = parse(fs.readFileSync(s.file, "utf8"));
  return { dir: s.dir, body };
}

// Compose a play for injection/loading: its body, a "this play needs…" hint from
// settings.playMeta (connectors/folder), and any chained plays (settings.playChains)
// appended in order. `seen` guards chain cycles. Returns { dir, text } or null.
function composePlay(dirs, name, opts = {}) {
  const r = loadSkill(dirs, name);
  if (!r) return null;
  let cfg = opts.settings;
  if (!cfg) { try { cfg = require("./settings.cjs").load(); } catch { cfg = {}; } }
  const seen = opts.seen || new Set();
  seen.add(name);
  let text = `### ${name}\n`;
  const meta = (cfg.playMeta || {})[name];
  if (meta && ((meta.connectors && meta.connectors.length) || meta.folder)) {
    const needs = [];
    if (meta.connectors && meta.connectors.length) needs.push(`connectors: ${meta.connectors.join(", ")}`);
    if (meta.folder) needs.push(`a working folder (${meta.folder})`);
    text += `_This play needs: ${needs.join("; ")}. Use them if available; if a needed tool is missing, do what you can and say what was unavailable._\n\n`;
  }
  text += r.body;
  const chain = (cfg.playChains || {})[name] || [];
  for (const next of chain) {
    if (seen.has(next)) continue;
    const c = composePlay(dirs, next, { settings: cfg, seen });
    if (c) text += `\n\n--- THEN run this chained play (${next}) ---\n\n` + c.text;
  }
  return { dir: r.dir, text };
}

// PINNED PLAYS — given a list of play names, return their composed bodies (with chains +
// needs hints) as a system-prompt block so they're ALWAYS in hand (no tool call needed).
// Missing/unreadable names are skipped silently (graceful fallback to the normal skills
// index + load_skill path). Records a usage event per pinned play (ok true/false for
// health). `by` is a label (agent/room name) for the "last by …" stat.
function pinnedBlock(dirs, names, { record = false, by = "", context = "" } = {}) {
  const list = Array.isArray(names) ? names.filter(Boolean) : [];
  if (!list.length) return "";
  let log = null;
  if (record) { try { log = require("./play-usage.cjs"); } catch {} }
  const parts = [];
  for (const name of list.slice(0, 12)) {
    try {
      const c = composePlay(dirs, name);
      if (!c) { if (log) { try { log.record({ name, by, context, source: "pinned", ok: false }); } catch {} } continue; }
      parts.push(c.text);
      if (log) { try { log.record({ name, by, context, source: "pinned", ok: true }); } catch {} }
    } catch {}
  }
  if (!parts.length) return "";
  return "\n\nPINNED PLAYS — these are already loaded for you; follow them when the task fits (no need to call load_skill for these):\n\n" + parts.join("\n\n");
}

// Read one skill's full content for the detail view.
function readSkill(dir) {
  const file = path.join(dir, "SKILL.md");
  try {
    const raw = fs.readFileSync(file, "utf8");
    const { meta, body } = parse(raw);
    let updated = 0; try { updated = fs.statSync(file).mtimeMs; } catch {}
    return { dir, file, meta, body, updated };
  } catch { return null; }
}

function createStarter(dir, name) {
  const safe = String(name || "new-skill").replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase() || "new-skill";
  const d = path.join(dir, safe);
  fs.mkdirSync(d, { recursive: true });
  const file = path.join(d, "SKILL.md");
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      `---\nname: ${safe}\ndescription: One sentence on when Madav should use this skill.\n---\n\n# ${safe}\n\nDescribe the steps Madav should follow when this skill applies.\n\nYou can include helper scripts in this folder and run them with the run_bash tool,\ne.g. \`python "${d}/script.py"\`. List any inputs the skill needs.\n`
    );
  }
  return { dir: d, file };
}

module.exports = {
  pinnedBlock, composePlay, discover, indexText, loadSkill, readSkill, createStarter };
