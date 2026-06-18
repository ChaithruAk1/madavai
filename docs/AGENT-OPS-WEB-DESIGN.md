# Agent Ops on Web — design + scope (parity fill; client-side, low-risk)

**Status: DESIGN ONLY — no code until approved.** Fills the §4 scorecard gap "advanced agent operations."
Unlike the scheduler, this is **client-side (localStorage) — no new server state, no secrets, no execution on a
timer** — so the gate is light. Desktop is untouched (it uses `window.madav`).

## 1. The problem (verified)
The shared `Agents.jsx` Ops panel calls a cluster of `bridge.*` methods. On web, only `getAgentMemory` exists;
the rest are absent. The UI guards every call (`if (bridge.X)` + `.catch`), so it **doesn't crash** — it
**silently does nothing**. Concretely, on web today:
- Agent memory **displays** (read works; the turn engine writes notes via `addAgentNote`)…
- …but you **can't edit it** — `setAgentMemory` is missing, so the 👍/👎 "coach" and the memory editor are no-ops.
- **Run history** and **track-record stats** never populate (`getAgentHistory` / `getAgentStats` missing).
- **Versioning** (snapshot/restore) and **export/import** do nothing (`snapshotAgentVersion` /
  `listAgentVersions` / `exportAgent` / `importAgent` missing).

## 2. Scope
**IN (client-side; wire to the existing `agentMemory.js` store + `settings.agents`):**
| Method | Contract (matches `Agents.jsx` + `mockBridge`) | Web implementation |
|---|---|---|
| `getAgentMemory(id)` | `{ notes: [{at, text}] }` | map existing `{text, ts}` → `{at: ts, text}` |
| `setAgentMemory(id, notes)` | `notes` = array of **strings _or_ `{text}`** (saveMemory sends strings; coach sends objects) | normalize → store `{text, ts}`; return `{notes:[{at,text}]}` |
| `clearAgentMemory(id)` | `{ notes: [] }` | clear notes (keep the run track-record) |
| `getAgentHistory(id)` | `[{at, ok, …}]` | **requires a small model extension** — see §3 |
| `getAgentStats()` | map `{ [agentId]: {lastAt, runs, ok, fail, …} }` (no arg; `presence` reads `stats[id].lastAt`) | derive from `be.agentMemory` |
| `snapshotAgentVersion(agent)` | takes the **agent object**; keep last 10 | push to `be.agentVersions[id]` |
| `listAgentVersions(id)` | `[{at, agent}]` | read `be.agentVersions[id]` |
| `exportAgent(agent)` | does the download itself; returns `{ok}`/`{error}` | Blob download of agent JSON |
| `importAgent()` | no arg; returns `{agent}`/`{error}` | file-picker → parse JSON → return `{agent}` |

**OUT (keep as graceful desktop-only no-ops so the UI can never crash, mirroring `mockBridge`):**
`runSwarm` / `cancelSwarm` / `onSwarmEvent` (swarm *execution* — touches the agent loop; bigger, separate),
`getMission`, `transcribe` (voice → the managed-service track).

## 3. The one model extension (additive, pure, tested)
`agentMemory.js` currently keeps **aggregate** counts (`runs, ok, fail, lastRunAt`) but **no per-run list**, so
`getAgentHistory` has nothing to return. Fix: extend `recordAgentRun` to also push a **bounded** run entry
(`{at, ok}`, keep last ~20) to `rec.history`. Pure function change + unit test; the turn engine already calls
`recordAgentRun`, so history populates automatically. `getAgentStats` derives from the same record.

## 4. Storage & sync
- `be.agentMemory` (existing) — extended with a capped `history[]` per agent.
- `be.agentVersions` (new) — `{ [agentId]: [{at, agent}] }`, last 10.
Both `localStorage`, consistent with how web stores agents/settings. Cross-device sync is **out of scope** for
this slice (can ride workspace-sync later if wanted). No server route, no secret, no new collection.

## 5. Risk & why the gate is light
- No server state, no secrets, no autonomous execution → none of the S3 threat surface.
- The UI already guards every call, so this only *adds* function (can't regress the panel).
- Desktop untouched (`window.madav` path unchanged); `webBridge` + the pure `agentMemory.js` are web-only.
- The only shared file touched is `src/bridge/agentMemory.js` (pure, web-only consumer) — verified by tests.

## 6. Increments
- **A1** `agentMemory.js`: add bounded `history` to `recordAgentRun` + `getAgentHistory`/`getAgentStats` pure
  helpers + unit tests.
- **A2** `webBridge.js`: the 9 methods above wired to `agentMemory.js` + `settings.agents` + `be.agentVersions`;
  graceful no-ops for the OUT list; bridge-surface parity guards.
- **A3** verify (vitest + esbuild + build) + manual scenario in `PARITY-PHASE-TESTS.md`.

## 7. Test plan (manual, web)
Open an agent → Ops: (a) edit memory + 👍/👎 coach → notes persist and reload; (b) run the agent once → it
appears in **run history** and the track-record line; (c) edit + save the agent → previous version shows under
**Versions**; (d) **Export** downloads a JSON; **Import** adds it back with a fresh identity. Confirm the
Agents screen behaves identically on desktop (no change).

**On approval I build A1 (the pure model extension + tests) first, then stop for a check before A2/A3.**
