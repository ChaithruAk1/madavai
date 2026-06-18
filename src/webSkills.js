// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// webSkills — the BUNDLED skill packs (repo skills/ folder, e.g. EdgeTrader) for the
// WEB app. Browsers can't scan folders, but bundled skills ship inside the build via
// Vite's raw glob (same pattern as sageKnowledge). Read-only on web: folders, import
// and creation still need the desktop app. Fail-open: no files → empty list.
let _files = {};
try { _files = import.meta.glob("../skills/*/SKILL.md", { query: "?raw", import: "default", eager: true }); } catch { _files = {}; }

function parse(text) {
  const m = String(text || "").match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: text || "" };
  const meta = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  });
  return { meta, body: m[2] };
}

let _list = null;
export function listBundled() {
  if (_list) return _list;
  const out = [];
  try {
    for (const [path, raw] of Object.entries(_files)) {
      const { meta, body } = parse(raw);
      const dir = "bundled:" + (path.split("/").slice(-2, -1)[0] || "skill");
      out.push({ name: meta.name || dir.slice(8), description: meta.description || "", dir, file: path, body, bundled: true, enabled: true });
    }
  } catch { /* fail open */ }
  _list = out.sort((a, b) => a.name.localeCompare(b.name));
  return _list;
}

export const readBundled = (dir) => listBundled().find((s) => s.dir === dir) || null;

// ---- user-authored skills + prefs (web only; localStorage). Bundled stays read-only; users add their own. ----
const LSK = "be.skills", LPREF = "be.skillPrefs";
function lsObj(key) { try { const m = JSON.parse((typeof localStorage !== "undefined" && localStorage.getItem(key)) || "{}"); return (m && typeof m === "object") ? m : {}; } catch { return {}; } }
export function userSkills() { return Object.values(lsObj(LSK)).filter((x) => x && x.dir); }
export function skillPrefs() { return lsObj(LPREF); }

// Pure: merge bundled + user (user wins on a dir clash), apply enabled overrides, sort by name. -> tested.
export function mergeSkills(bundled, user, prefs) {
  const p = prefs || {}; const byDir = new Map();
  for (const x of bundled || []) byDir.set(x.dir, { ...x, bundled: true, user: false });
  for (const x of user || []) if (x && x.dir) byDir.set(x.dir, { ...x, bundled: false, user: true });
  return [...byDir.values()].map((x) => {
    const ov = p[x.dir];
    return { ...x, enabled: ov && ov.enabled === false ? false : (x.enabled !== false) };
  }).sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}
// All skills (bundled + user) with enabled applied. NOT memoized — user skills change at runtime.
export function listAll() { return mergeSkills(listBundled(), userSkills(), skillPrefs()); }
export const readAny = (dir) => listAll().find((s) => s.dir === dir) || null;
// Name lookup for load_skill — enabled skills only (bundled OR user).
export const bundledByName = (name) => listAll().find((s) => s.enabled !== false && s.name === name) || null;

// System-prompt index (mirror of electron/skills-manager.cjs indexText — keep wording in sync).
export function bundledIndex() {
  const skills = listAll().filter((s) => s.enabled !== false);
  if (!skills.length) return "";
  return "You have these SKILLS. When the user's request matches one, call the load_skill tool " +
    "with its exact name to get the full instructions, then follow them:\n" +
    skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
}
