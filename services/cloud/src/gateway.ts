import { API, type ApiError } from '@madav/contracts';
import { can, personalWorkspaceId, type Action, type Role } from '@madav/rbac';
import type { SessionStore, RateLimiter, SyncStore, MembershipStore, Session } from './stores.js';

export interface Gateway { sessions: SessionStore; limiter: RateLimiter; sync: SyncStore; members?: MembershipStore }
export interface Incoming { path: string; method: string; token?: string; ip?: string; body?: unknown }
export interface Outgoing { status: number; body: unknown }

const fail = (status: number, code: string, message: string): Outgoing => ({ status, body: { code, message } as ApiError });
const ok = (schema: { parse(d: unknown): unknown }, data: unknown): Outgoing => ({ status: 200, body: schema.parse(data) });

const RBAC_ON = (): boolean => process.env.MADAV_RBAC === '1';

/** Resolve a caller's role, bootstrapping the first toucher of an EMPTY workspace as its owner. Null = not a member. */
async function resolveRole(gw: Gateway, userId: string, workspaceId: string): Promise<Role | null> {
  let role = await gw.members!.roleOf(userId, workspaceId);
  if (!role && (await gw.members!.count(workspaceId)) === 0) { await gw.members!.setRole(userId, workspaceId, 'owner'); role = 'owner'; }
  return role;
}

/**
 * Workspace access gate (flag-guarded). Flag OFF or no membership store -> null (OPEN — today's behavior, the
 * fallback). Flag ON: a non-member of a populated workspace is FORBIDDEN; an empty workspace's first toucher
 * becomes OWNER (creator-becomes-owner, so personal workspaces never lock out); otherwise the role must satisfy
 * the policy for the action. Returns an Outgoing to short-circuit on denial, or null when authorized.
 */
async function authorizeWorkspace(gw: Gateway, userId: string, workspaceId: string, action: Action): Promise<Outgoing | null> {
  if (!RBAC_ON() || !gw.members) return null;
  const role = await resolveRole(gw, userId, workspaceId);
  if (!role) return fail(403, 'FORBIDDEN', 'You are not a member of this workspace');
  if (!can({ userId, workspaceId, role }, action, { type: 'project', workspaceId })) {
    return fail(403, 'FORBIDDEN', `Your role (${role}) cannot ${action} content here`);
  }
  return null;
}

/** The single entry point: rate-limit -> authenticate -> [authorize] -> validate -> handle -> validate response. */
export async function handle(gw: Gateway, req: Incoming): Promise<Outgoing> {
  const rl = await gw.limiter.take(req.token ?? req.ip ?? 'anon');
  if (!rl.ok) return fail(429, 'RATE_LIMITED', 'Too many requests');

  const session: Session | null = req.token ? await gw.sessions.get(req.token) : null;
  if (!session) return fail(401, 'UNAUTHENTICATED', 'Sign in required');

  if (req.method === API.whoami.method && req.path === API.whoami.path) {
    // Flag OFF -> the legacy single 'default' workspace (UNCHANGED). Flag ON -> each account gets its OWN
    // owner-seeded workspace id, so the new spine never shares a 'default' bucket (no cross-user lockout at cutover).
    if (RBAC_ON() && gw.members) {
      const id = personalWorkspaceId(session.userId);
      const role = await resolveRole(gw, session.userId, id); // bootstraps the user as owner of their own workspace
      return ok(API.whoami.response, { userId: session.userId, email: session.email, workspaces: [{ id, name: 'My Workspace', custody: 'server-readable', ...(role ? { role } : {}) }] });
    }
    return ok(API.whoami.response, { userId: session.userId, email: session.email, workspaces: [{ id: 'default', name: 'My Workspace', custody: 'server-readable' }] });
  }
  if (req.method === API.syncPush.method && req.path === API.syncPush.path) {
    const p = API.syncPush.request.safeParse(req.body);
    if (!p.success) return fail(400, 'BAD_REQUEST', p.error.message);
    const denied = await authorizeWorkspace(gw, session.userId, p.data.workspaceId, 'write');
    if (denied) return denied;
    return ok(API.syncPush.response, await gw.sync.push(p.data.workspaceId, p.data.items));
  }
  if (req.method === API.syncPull.method && req.path === API.syncPull.path) {
    const p = API.syncPull.request.safeParse(req.body);
    if (!p.success) return fail(400, 'BAD_REQUEST', p.error.message);
    const denied = await authorizeWorkspace(gw, session.userId, p.data.workspaceId, 'read');
    if (denied) return denied;
    return ok(API.syncPull.response, await gw.sync.pull(p.data.workspaceId, p.data.since, p.data.limit));
  }
  return fail(404, 'NOT_FOUND', `no route ${req.method} ${req.path}`);
}
