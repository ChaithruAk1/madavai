import type { SyncItem } from '@madav/contracts';
import type { SyncStore } from './stores.js';

/** Minimal db handle satisfied by BOTH PGlite (tests) and node-postgres `pg` (production). */
export interface Queryable { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>; }

/** Schema migration. A monotonic `seq` (bumped on every write) drives incremental, cursor-based pull. */
export const MIGRATION = `
CREATE SEQUENCE IF NOT EXISTS sync_seq;
CREATE TABLE IF NOT EXISTS sync_items (
  workspace_id text   NOT NULL,
  id           text   NOT NULL,
  kind         text   NOT NULL,
  updated_at   bigint NOT NULL,
  envelope     jsonb  NOT NULL,
  seq          bigint NOT NULL,
  PRIMARY KEY (workspace_id, id)
);
CREATE INDEX IF NOT EXISTS sync_items_ws_seq ON sync_items (workspace_id, seq);
`;

export async function migrate(db: Queryable): Promise<void> {
  for (const stmt of MIGRATION.split(';').map((x) => x.trim()).filter(Boolean)) await db.query(stmt);
}

/** Postgres-backed sync store. Same interface as the in-memory one — the gateway never changes. */
export class PgSyncStore implements SyncStore {
  constructor(private db: Queryable) {}

  async push(workspaceId: string, items: SyncItem[]): Promise<{ accepted: number; conflicts: string[] }> {
    let accepted = 0;
    const conflicts: string[] = [];
    for (const it of items) {
      // last-writer-wins: the conditional ON CONFLICT only updates when the incoming row is newer.
      const r = await this.db.query(
        `INSERT INTO sync_items (workspace_id,id,kind,updated_at,envelope,seq)
         VALUES ($1,$2,$3,$4,$5::jsonb,nextval('sync_seq'))
         ON CONFLICT (workspace_id,id) DO UPDATE
           SET kind=EXCLUDED.kind, updated_at=EXCLUDED.updated_at, envelope=EXCLUDED.envelope, seq=nextval('sync_seq')
           WHERE sync_items.updated_at <= EXCLUDED.updated_at
         RETURNING seq`,
        [workspaceId, it.id, it.kind, it.updatedAt, JSON.stringify(it.envelope)],
      );
      if (r.rows.length) accepted++;
      else conflicts.push(it.id);
    }
    return { accepted, conflicts };
  }

  async pull(workspaceId: string, since: number, limit: number): Promise<{ items: SyncItem[]; cursor: number }> {
    const r = await this.db.query(
      `SELECT id, kind, updated_at, envelope, seq FROM sync_items
       WHERE workspace_id=$1 AND seq>$2 ORDER BY seq ASC LIMIT $3`,
      [workspaceId, since, limit],
    );
    const items: SyncItem[] = r.rows.map((row) => ({
      id: row.id, kind: row.kind, updatedAt: Number(row.updated_at),
      envelope: typeof row.envelope === 'string' ? JSON.parse(row.envelope) : row.envelope,
    }));
    const cursor = r.rows.length ? Number(r.rows[r.rows.length - 1].seq) : since;
    return { items, cursor };
  }
}
