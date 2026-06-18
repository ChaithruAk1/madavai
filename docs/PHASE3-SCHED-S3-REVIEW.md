# Phase 3 / S3 — scheduler + BYO-key vault: focused review (SECURITY GATE)

**Status: REVIEW ONLY. No code yet.** S3 is the slice that (a) actually executes tasks **server-side on a
timer** and (b) introduces a new long-lived secret: the user's **BYO provider key, stored server-side**. Both
are reviewed before code. Builds on S1 (tasks/runs store + CRUD) and S2 (`runTaskOnce`, single-shot, injected).

## Two sub-slices (each verifiable)
- **S3a — provider-key vault + key routes** (accepts/holds the secret; NO execution).
- **S3b — scheduler tick + provider-call builder + quotas** (the executing slice). Re-review before S3b ships.

## S3a — BYO provider key, sealed server-side (reuses the P3.4 vault)
`server/provider-key-vault.mjs`: thin wrapper over the **existing AES-256-GCM `token-vault`** (`makeVault` +
`vaultKey`), storing one record per user: `{ kind, baseUrl, apiKey }`, sealed under `provkey:<userId>`.
```js
import { makeVault, vaultKey } from "./token-vault.mjs";
export function makeProviderKeyVault(store, env = process.env) {
  const v = makeVault(kvFromCollection(store.col("provkeys")), vaultKey(env)); // same kv-adapter as connector-vault
  return {
    set: (uid, { kind, baseUrl, apiKey }) => v.put(uid, "default", { kind, baseUrl, apiKey }),
    get: (uid) => v.get(uid, "default"),           // server-only; decrypted in memory at run time
    remove: (uid) => v.remove(uid, "default"),
    status: async (uid) => ({ stored: !!(await v.get(uid, "default")) }), // never returns the key
  };
}
```
Routes (authUser-gated, rate-limited):
- `POST /tasks/provider-key {kind,baseUrl,apiKey}` → `assertSafeMcpUrl`-style host allowlist on baseUrl, seal, return `{ok}`. **Key never echoed back.**
- `GET /tasks/provider-key/status` → `{stored:boolean}` only.
- `DELETE /tasks/provider-key` → remove. Idempotent.
- New store collection: `provkeys`.

## S3b — provider-call builder + scheduler tick
**Provider call (server-side, single completion, token-capped):**
```js
async function providerCallFor(task, user) {                 // built per run; returns a string
  if (task.provider === "byo") {
    const k = await provKeys.get(task.userId); if (!k) throw new Error("no stored provider key");
    if (!isAllowedProxyHost(k.baseUrl)) throw new Error("provider host not allowed"); // SSRF reuse (/proxy)
    return callOpenAIish(k.baseUrl, k.apiKey, task.model, task.prompt, { max_tokens: 2000 });
  }
  return callStarterUpstream(task.model, task.prompt, { max_tokens: 2000 }); // house key (STARTER_OPENROUTER_KEY)
}
```
**Scheduler tick (internal `setInterval`, ~60s; NO public trigger):**
```js
async function tick(now = Date.now()) {
  const tasks = (await store.col("tasks").all()).filter((t) => isTaskDue(t, () => now));
  for (const task of tasks) {
    // CLAIM FIRST (lock): advance nextRunAt before running so a concurrent tick/instance won't double-run.
    const claimed = await store.col("tasks").update(task.id, { nextRunAt: nextRunAfter(task, () => now), lastRunAt: now });
    if (!claimed) continue;
    const user = await store.getUser(task.userId);
    if (!user || statusOf(user).status === "expired" || user.suspended) continue;   // plan/suspension gate
    if (await runsToday(task.userId, now) >= 200) continue;                          // daily quota
    const run = await withTimeout(runTaskOnce(task, { providerCall: () => providerCallFor(task, user) }), 60000)
      .catch((e) => ({ ok: false, error: String(e && e.message) }));
    await appendRun(task, run);                                                      // ring-buffer: keep last 50/task
  }
}
```

## Threat model (S3) + mitigations
| # | Threat | Mitigation |
|---|---|---|
| D1 | **Double-run** (two ticks / two instances) | **Claim-first**: `nextRunAt` is advanced *before* execution; a second tick sees it not-due. (Single Render instance for v1; multi-instance needs an atomic conditional update — see decision.) |
| D2 | **Cost / abuse** | Per-user **daily run cap (200)**, **min interval (15m)**, **max tasks (20)** [S1], **max 2000 output tokens/run**, **60s per-run timeout**; plan/suspension gate via `statusOf`. |
| D3 | **BYO key theft at rest** | Sealed with AES-256-GCM `token-vault`, per-user, **prod-key-guarded**; decrypted only in memory at run time; never written to logs or run output. |
| D4 | **Key leak to browser** | Key routes accept-only / status-only; `GET` returns `{stored:bool}`, never the key. (Same posture as connector tokens.) |
| D5 | **SSRF via BYO baseUrl** | Reuse `/proxy`'s `isAllowedProxyHost` + `isForbiddenTarget` — only known provider hosts; loopback/private blocked. |
| D6 | **Drift into a full agent** (R7) | Runs via `runTaskOnce` only (S2): one completion, **no tools/MCP/files/loop**. The executor's "no tool imports" test still guards it. |
| D7 | **Runaway / hang** | 60s per-run timeout; failures stored as `{ok:false,error}`; the tick continues to the next task. |
| D8 | **Trigger forgery** | Internal `setInterval` → **no public run endpoint**, nothing to forge. (`runTaskNow` for "run it now" is authUser-gated and reuses the same single-shot path.) |
| D9 | **Storage blow-up** | `runs` capped to the last 50 per task (ring buffer); output capped 8k [S2]. |

## Decisions before S3b
1. **Multi-instance:** **single-instance scheduler for v1** (recommended — Render free/standard is one instance; the claim-first advance is sufficient) vs add an atomic conditional-claim now for horizontal scale. (If multi-instance: only run if `update` is conditional on the old `nextRunAt` — needs a store `compareAndSet`.)
2. **Tick interval:** 60s (recommended).
3. **`runTaskNow`:** authUser-gated `POST /tasks/:id/run` that runs the same single-shot path immediately (counts against the daily quota). Include in S3b? (recommended yes — it's the manual-test path.)

**Nothing implemented. On approval I build S3a (provider-key vault + key routes + tests — accepts the secret,
no execution), then stop for a final check before S3b (the scheduler).**
