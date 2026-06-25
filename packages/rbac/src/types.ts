import { z } from 'zod';

/** Roles form a hierarchy: viewer < member < admin < owner. */
export const Role = z.enum(['owner', 'admin', 'member', 'viewer']);
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const Action = z.enum(['read', 'write', 'delete', 'share', 'manage_members', 'manage_workspace']);
export type Action = 'read' | 'write' | 'delete' | 'share' | 'manage_members' | 'manage_workspace';

export const ResourceType = z.enum(['workspace', 'project', 'chat', 'connector', 'knowledge', 'member']);
export type ResourceType = 'workspace' | 'project' | 'chat' | 'connector' | 'knowledge' | 'member';

/** A user's role within a workspace — the persisted membership record. */
export const Membership = z.object({ userId: z.string().min(1), workspaceId: z.string().min(1), role: Role });
export type Membership = z.infer<typeof Membership>;

/** The resolved caller context for one request: the user's membership in the targeted workspace. */
export const AccessContext = z.object({ userId: z.string().min(1), workspaceId: z.string().min(1), role: Role });
export type AccessContext = z.infer<typeof AccessContext>;

/** A thing being acted upon; ownerId (when present) enables "manage your OWN content". */
export const Resource = z.object({ type: ResourceType, workspaceId: z.string().min(1), ownerId: z.string().optional() });
export type Resource = z.infer<typeof Resource>;
