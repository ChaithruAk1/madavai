import type { Role, Membership } from '@madav/rbac';
import type { MembershipStore } from './stores.js';

/** Minimal db handle — satisfied by BOTH PGlite (tests) and node-postgres `pg` (prod). */
export interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; }

export const MEMBERSHIP_MIGRATION = `
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id text NOT NULL,
  user_id      text NOT NULL,
  role         text NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);`;

export async function migrateMemberships(db: Queryable): Promise<void> {
  for (const s of MEMBERSHIP_MIGRATION.split(';').map((x) => x.trim()).filter(Boolean)) await db.query(s);
}

/** Postgres-backed membership store — same interface as the in-memory one, so the gateway never changes. */
export class PgMembershipStore implements MembershipStore {
  constructor(private db: Queryable) {}
  async roleOf(userId: string, workspaceId: string): Promise<Role | null> {
    const r = await this.db.query('SELECT role FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspaceId, userId]);
    return r.rows.length ? (r.rows[0].role as Role) : null;
  }
  async setRole(userId: string, workspaceId: string, role: Role): Promise<void> {
    await this.db.query(
      'INSERT INTO workspace_members (workspace_id,user_id,role) VALUES ($1,$2,$3) ON CONFLICT (workspace_id,user_id) DO UPDATE SET role=EXCLUDED.role',
      [workspaceId, userId, role],
    );
  }
  async remove(userId: string, workspaceId: string): Promise<void> {
    await this.db.query('DELETE FROM workspace_members WHERE workspace_id=$1 AND user_id=$2', [workspaceId, userId]);
  }
  async list(workspaceId: string): Promise<Membership[]> {
    const r = await this.db.query('SELECT user_id, role FROM workspace_members WHERE workspace_id=$1', [workspaceId]);
    return r.rows.map((x: any) => ({ userId: x.user_id, workspaceId, role: x.role as Role }));
  }
  async count(workspaceId: string): Promise<number> {
    const r = await this.db.query('SELECT COUNT(*)::int AS n FROM workspace_members WHERE workspace_id=$1', [workspaceId]);
    return Number(r.rows[0]?.n ?? 0);
  }
}
