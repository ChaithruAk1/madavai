# Madav — Scale-out & DR Runbook (Phase 3 infra completion)
### These items "finish" at DEPLOY, not in code. This runbook makes them deploy-ready; the software they rely on is built + tested.

## 1. Multi-AZ / N-instance (horizontal scale)
- The cloud gateway (`services/cloud`) is **stateless** — all state is in injected stores (Redis sessions/rate-limit, Postgres sync/membership). Verified by the gateway/RBAC tests.
- **Deploy:** run N gateway instances across ≥2 AZs behind a load balancer.
- **Health checks (built):** point the LB liveness at `GET /api/health` and readiness at `GET /api/ready` (both 200, unauthenticated, no rate budget). Rolling deploys drain via these.
- **Observability (built):** each request emits a `gateway.request` log `{method,path,status,ms}` via the injected `@madav/insight` logger — wire your log aggregator to the gateway's logger.

## 2. Read replicas (read scale)
- Writes → primary; reads (e.g. sync **pull**, membership lookups) → replica pool.
- **Deploy:** provision Postgres read replicas; give the gateway a primary URL + replica URLs. Route `pull`/`roleOf`/`list` to a replica, `push`/`setRole` to primary. (Store interfaces already separate reads from writes by method.)
- Accept eventual consistency on reads (the sync cursor tolerates it).

## 3. Partitioning (table scale)
- Partition the big tables by `workspace_id` (LIST/HASH) once a single table grows hot:
  - `sync_items`, `workspace_members`, `knowledge_chunks`.
- **Deploy:** declarative partitioning in Postgres; the app SQL is unchanged (it already filters by `workspace_id`). Do this only when row counts demand it — don't pre-partition.

## 4. Desktop code-signing + auto-update
- **Signing:** sign the Windows installer with your code-signing cert in the `electron-builder` config (CI secret). Required so Windows/SmartScreen trusts the app.
- **Auto-update:** host an update feed (e.g. an S3/Render bucket with `latest.yml`); wire `electron-updater` to check it on launch. Needs the signing cert + a release bucket — your infra.
- **Crash-reporting (built):** local capture is done (`MADAV_CRASH_REPORTS`). If you later want crashes *sent*, add an explicit opt-in upload — keep it disclosed (privacy).

## 5. DR drill (backup + restore rehearsal)
- **Backups:** enable automated Postgres backups (point-in-time) + object-storage versioning.
- **Drill (rehearse quarterly):**
  1. Snapshot prod Postgres + object storage.
  2. Restore into a fresh staging env.
  3. Point a gateway instance at the restored DB; hit `/api/ready` → 200.
  4. Verify a user can pull their workspace content + a membership check passes.
  5. Record RTO/RPO. Target: RTO < 1h, RPO < 5m (tune to your SLA).

## 6. Live cutover (new gateway → live backend) — GATED, your review
- Today's live web uses `auth-server.mjs` (`/workspace`,`/projects`). The new `services/cloud` gateway (`/api/sync`, RBAC) isn't the live backend yet.
- **Before cutover:** ensure each user gets their **own** workspace id (already implemented under `MADAV_RBAC` — `WhoAmI` returns `ws_<userId>`), seed/owner existing users, then point clients at `/api/sync`. Only enable `MADAV_RBAC` on live AFTER this. (This is the access-sensitive step you asked to review.)

> Multi-region is deferred until latency/data-sovereignty demands it (per the plan — don't build it on day one).
