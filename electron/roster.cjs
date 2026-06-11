// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Loads the LOCAL admin roster (admin-roster.cjs) if present and resolves a role for an
// email. The roster file is local-only (git-ignored + excluded from the installer); when
// it's absent — e.g. in a packaged build on an end user's machine — every lookup returns
// null and the app falls back entirely to the server's verdict.
const lc = (e) => String(e || "").trim().toLowerCase();

function load() {
  try {
    delete require.cache[require.resolve("./admin-roster.cjs")]; // pick up live edits on next call
    const r = require("./admin-roster.cjs") || {};
    return {
      admins: (Array.isArray(r.admins) ? r.admins : []).map(lc).filter(Boolean),
      complimentary: (Array.isArray(r.complimentary) ? r.complimentary : []).map(lc).filter(Boolean),
    };
  } catch { return { admins: [], complimentary: [] }; }
}

// "creator" | "complimentary" | null
function roleFor(email) {
  const e = lc(email);
  if (!e) return null;
  const r = load();
  if (r.admins.includes(e)) return "creator";
  if (r.complimentary.includes(e)) return "complimentary";
  return null;
}

const isLocalAdmin = (email) => roleFor(email) === "creator";

module.exports = { roleFor, isLocalAdmin, load };
