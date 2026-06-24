# Decommission Ledger — reaching a fresh codebase

**Rule (non-negotiable).** When a new module replaces a legacy one, the legacy file/dir is **deleted in the same change** once the replacement is proven — never left as a parallel copy. No scratch files, dead code, or archived junk accumulates.

**Phase-4 exit gate (hard).** The repository must contain **only** the new architecture and **none** of the legacy. A 1.0 release cannot be cut while any legacy path remains.

## End-state target
- **KEEP:** `packages/` · `apps/` · `services/` · `scripts/` · `docs/` (current) · root configs
- **GONE:** `core/` · `src/` · `electron/` · `server/` · `shared/` · `docs/_legacy/`

## Ledger (legacy → replacement → status)

| Legacy (delete when replaced) | New replacement | Status |
|---|---|---|
| `core/` — turn loop, router, recipes, project runner, search | `@madav/core` | logic migrated + tested; still imported by `electron/`+`src/` → delete when those surfaces migrate |
| `src/office.js`, `src/doc/*` — Excel/doc authoring | `@madav/documents` (ingest · govern · author · transform) | new engine done + tested; legacy still drives the running renderer → delete when the new app surface consumes the engine |
| `src/markdown.jsx` ExcelizeButton + `src/office.js` `_governXlsx` (legacy-app patches) | the new `apps/` surface | **transitional** — remove when `apps/` replaces the legacy renderer, **or revert now** to keep legacy an untouched control |
| `src/` — React renderer | `apps/web` (+ shared `packages/`) | not started |
| `electron/` — desktop main | `apps/desktop` | not started |
| `server/` — auth-server | `services/cloud` | Phase 1 |
| `shared/` — csp etc. | `packages/` shared configs | fold in during Phase 1 |
| `docs/_legacy/` — archived old docs | — | delete after a final review |

## Enforcement
- Every migration that lands a new module **also deletes** the legacy it replaces (or notes here exactly why it can't yet).
- A CI check (added approaching Phase 4) **fails the build** if any legacy dir still exists.
- Updated every migration; `REBUILD-STATE.md` carries the running status.
