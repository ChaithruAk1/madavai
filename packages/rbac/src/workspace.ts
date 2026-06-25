/**
 * Each account maps to its OWN personal workspace, which it owns — deterministic and distinct per user, so
 * the new sync spine never falls back to a shared 'default' bucket (which would let one owner lock out the rest
 * once RBAC is on). Team/shared workspaces use explicit ids + invited memberships instead.
 */
export function personalWorkspaceId(userId: string): string { return 'ws_' + String(userId); }
