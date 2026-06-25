// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// DESKTOP RBAC adapter — single-source twin of src/bridge/rbacWeb.js. Desktop is single-user-LOCAL: the user
// owns their own workspace, so locally can() always allows (NO lockout). RBAC only bites on SHARED/synced
// workspaces, which the cloud gateway enforces authoritatively. Flag-guarded; imports the shared @madav/rbac dist.
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const DIST = path.join(__dirname, "..", "packages", "rbac", "dist", "src");
const imp = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

function rbacOn() { return process.env.MADAV_RBAC === "1"; }

/** Local user = owner of their own workspace (no lockout). */
async function resolveAccess(userId, workspaceId) { return { userId, workspaceId, role: "owner" }; }

/** Decide locally via the shared policy. Flag OFF (or engine unbuilt) -> allow, matching today's behavior. */
async function canDesktop(ctx, action, resource) {
  if (!rbacOn()) return true;
  try { const { can } = await imp("index.js"); return can(ctx, action, resource); } catch { return true; }
}

module.exports = { rbacOn, resolveAccess, canDesktop };
