import { z } from 'zod';

/** The shared HTTP contract: the SAME Zod objects validate on the client and in the cloud service —
 *  no hand-written bridge, no drift. Every endpoint pairs a request schema with a response schema. */

export const Custody = z.enum(['server-readable', 'e2ee-private', 'device-only']);

export const ApiError = z.object({ code: z.string().min(1), message: z.string(), details: z.unknown().optional() });
export type ApiError = z.infer<typeof ApiError>;

/** Mirrors @madav/storage's Envelope (kept here so contracts stays dependency-free). */
export const StoredEnvelope = z.object({ v: z.literal(1), custody: Custody, iv: z.string().optional(), data: z.string() });

export const WorkspaceRef = z.object({ id: z.string().min(1), name: z.string().min(1), custody: Custody });
export const WhoAmIResponse = z.object({ userId: z.string().min(1), email: z.string().email().optional(), workspaces: z.array(WorkspaceRef) });

export const SyncItem = z.object({
  id: z.string().min(1),
  kind: z.enum(['chat', 'project', 'message']),
  updatedAt: z.number().int().nonnegative(),
  envelope: StoredEnvelope,
});
export const SyncPushRequest = z.object({ workspaceId: z.string().min(1), items: z.array(SyncItem).max(500) });
export const SyncPushResponse = z.object({ accepted: z.number().int().nonnegative(), conflicts: z.array(z.string()).default([]) });
export const SyncPullRequest = z.object({ workspaceId: z.string().min(1), since: z.number().int().nonnegative().default(0), limit: z.number().int().positive().max(1000).default(200) });
export const SyncPullResponse = z.object({ items: z.array(SyncItem), cursor: z.number().int().nonnegative() });

export interface Endpoint<Req extends z.ZodTypeAny, Res extends z.ZodTypeAny> { method: 'GET' | 'POST'; path: string; request: Req; response: Res }
export const defineEndpoint = <Req extends z.ZodTypeAny, Res extends z.ZodTypeAny>(e: Endpoint<Req, Res>): Endpoint<Req, Res> => e;

/** The endpoint registry — client and server both import THIS. */
export const API = {
  whoami: defineEndpoint({ method: 'GET', path: '/api/whoami', request: z.object({}), response: WhoAmIResponse }),
  syncPush: defineEndpoint({ method: 'POST', path: '/api/sync/push', request: SyncPushRequest, response: SyncPushResponse }),
  syncPull: defineEndpoint({ method: 'POST', path: '/api/sync/pull', request: SyncPullRequest, response: SyncPullResponse }),
} as const;

export type WhoAmIResponse = z.infer<typeof WhoAmIResponse>;
export type SyncItem = z.infer<typeof SyncItem>;
export type SyncPushRequest = z.infer<typeof SyncPushRequest>;
