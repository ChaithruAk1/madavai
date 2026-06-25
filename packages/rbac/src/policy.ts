import type { Role, Action, ResourceType, AccessContext, Resource } from './types.js';

const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
export function roleRank(r: Role): number { return RANK[r] ?? -1; }
export function roleAtLeast(role: Role, min: Role): boolean { return roleRank(role) >= roleRank(min); }

/** Minimum role required for (action, resourceType). Anything unlisted is DENIED by default. */
const REQUIRED: Partial<Record<Action, Partial<Record<ResourceType, Role>>>> = {
  read:    { workspace: 'viewer', project: 'viewer', chat: 'viewer', connector: 'viewer', knowledge: 'viewer', member: 'member' },
  write:   { workspace: 'admin',  project: 'member', chat: 'member', connector: 'member', knowledge: 'member', member: 'admin' },
  delete:  { workspace: 'owner',  project: 'admin',  chat: 'admin',  connector: 'admin',  knowledge: 'admin',  member: 'admin' },
  share:   { workspace: 'admin',  project: 'member', chat: 'member', connector: 'member', knowledge: 'member', member: 'admin' },
  manage_members:   { workspace: 'admin', member: 'admin' },
  manage_workspace: { workspace: 'owner' },
};
const OWNABLE: ResourceType[] = ['project', 'chat', 'connector', 'knowledge'];

/**
 * PURE access decision: may `ctx` (a user's membership) perform `action` on `resource`?
 * Deterministic, side-effect-free. Cross-workspace is always denied; an owner can do anything in their own
 * workspace; a member may write/delete/share their OWN content; otherwise the role must meet the matrix.
 * NOTE: this only DECIDES — it does not ENFORCE. Enforcement is wired separately, gated + flag-guarded.
 */
export function can(ctx: AccessContext, action: Action, resource: Resource): boolean {
  if (!ctx || !resource) return false;
  if (resource.workspaceId !== ctx.workspaceId) return false;     // cross-workspace -> always denied
  if (ctx.role === 'owner') return true;                          // owner override (own workspace)
  if (resource.ownerId && resource.ownerId === ctx.userId && OWNABLE.includes(resource.type)
      && (action === 'write' || action === 'delete' || action === 'share')) {
    return roleAtLeast(ctx.role, 'member');                        // manage your own content
  }
  const need = REQUIRED[action]?.[resource.type];
  return need ? roleAtLeast(ctx.role, need) : false;
}
