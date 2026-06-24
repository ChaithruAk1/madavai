import { API, type ApiError } from '@madav/contracts';
import type { SessionStore, RateLimiter, SyncStore, Session } from './stores.js';

export interface Gateway { sessions: SessionStore; limiter: RateLimiter; sync: SyncStore }
export interface Incoming { path: string; method: string; token?: string; ip?: string; body?: unknown }
export interface Outgoing { status: number; body: unknown }

const fail = (status: number, code: string, message: string): Outgoing => ({ status, body: { code, message } as ApiError });
const ok = (schema: { parse(d: unknown): unknown }, data: unknown): Outgoing => ({ status: 200, body: schema.parse(data) });

/** The single entry point: rate-limit -> authenticate -> validate request -> handle -> validate response.
 *  Stateless: all state lives in the injected stores, so N instances behave identically. */
export async function handle(gw: Gateway, req: Incoming): Promise<Outgoing> {
  const rl = await gw.limiter.take(req.token ?? req.ip ?? 'anon');
  if (!rl.ok) return fail(429, 'RATE_LIMITED', 'Too many requests');

  const session: Session | null = req.token ? await gw.sessions.get(req.token) : null;
  if (!session) return fail(401, 'UNAUTHENTICATED', 'Sign in required');

  if (req.method === API.whoami.method && req.path === API.whoami.path) {
    return ok(API.whoami.response, { userId: session.userId, email: session.email, workspaces: [{ id: 'default', name: 'My Workspace', custody: 'server-readable' }] });
  }
  if (req.method === API.syncPush.method && req.path === API.syncPush.path) {
    const p = API.syncPush.request.safeParse(req.body);
    if (!p.success) return fail(400, 'BAD_REQUEST', p.error.message);
    return ok(API.syncPush.response, await gw.sync.push(p.data.workspaceId, p.data.items));
  }
  if (req.method === API.syncPull.method && req.path === API.syncPull.path) {
    const p = API.syncPull.request.safeParse(req.body);
    if (!p.success) return fail(400, 'BAD_REQUEST', p.error.message);
    return ok(API.syncPull.response, await gw.sync.pull(p.data.workspaceId, p.data.since, p.data.limit));
  }
  return fail(404, 'NOT_FOUND', `no route ${req.method} ${req.path}`);
}
