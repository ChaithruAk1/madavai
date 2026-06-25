// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// WEB RBAC adapter — single-source twin of electron/rbac.cjs. Resolves the caller's role for a workspace from
// the (extended) WhoAmI and decides via the SAME @madav/rbac policy. Flag-guarded; the SERVER gateway is the
// authoritative enforcer — this is client-side context + defense-in-depth, with ZERO UI change.
import { can } from "@madav/rbac";

export function rbacOn() { try { return localStorage.getItem("MADAV_RBAC") === "1"; } catch { return false; } }

/** Build the access context for a workspace from the WhoAmI workspaces list. Flag OFF -> owner (open behavior). */
export function resolveAccess(userId, workspaceId, workspaces) {
  if (!rbacOn()) return { userId, workspaceId, role: "owner" };
  const w = (workspaces || []).find((x) => x && x.id === workspaceId);
  return w && w.role ? { userId, workspaceId, role: w.role } : null; // null = not a member
}

/** Client-side decision (defense-in-depth). Flag OFF -> always true (no gating). */
export function canWeb(ctx, action, resource) {
  if (!rbacOn()) return true;
  return ctx ? can(ctx, action, resource) : false;
}
