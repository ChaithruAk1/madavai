# Madav — Full Code Review (2026-06-16)

Reviewer: Claude (Cowork). Scope: full source tree — desktop main process (`electron/*.cjs`), shared React renderer (`src/**`), web server (`server/*.mjs`), shared modules (`shared/*.cjs`). ~35k LOC. Method: four parallel surface deep-dives, then independent re-verification of every High/Medium finding against the actual source. Each finding carries a confidence level.

---

## Executive summary

Madav is **materially more hardened than its own CLAUDE.md implies**. Context isolation is on, the preload surface is tight and non-leaky, secrets are encrypted at rest (`safeStorage`), SQL is fully parameterized with an identifier allowlist, OAuth uses PKCE + `state`, there is a real SSRF defense on the proxy routes, and a production guard hard-exits on default secrets. The "three prompt copies / two separate CSPs that drift" warnings in CLAUDE.md are now **stale** — both are single-sourced (`shared/office-rules.cjs`, `shared/csp.cjs`) and the prompt copy is byte-equality-tested.

The residual risk is **not** sloppiness; it is concentrated in a handful of places where **model- or renderer-authored input reaches a powerful sink**: shell execution, OS "open this path," and an OAuth redirect. Those are the things to fix. Test coverage is the biggest *process* gap — ~5 test files guard a 35k-LOC app that runs untrusted code, handles auth, and takes money.

**Fix in this order:** H2 (web OAuth token leak — only finding with a click-through remote path) → H1 (desktop one-click model-executable) → H3 (auto-approve shell) → the web CSP (M1) and the unsandboxed deck-preview eval (M2).

---

## HIGH

### H1 — `shell.openPath` executes any renderer/model-supplied path (desktop)
**Location:** `electron/main.cjs:389` — `ipcMain.handle("madav:openPath", (_e,p) => shell.openPath(String(p||"")))`. No validation.
**Why it matters:** `shell.openPath` hands the path to the OS to *open with its default handler* — i.e. it will launch `.exe`/`.bat`/`.cmd`/`.lnk`/`.hta`, or a UNC `\\attacker\share\x.exe`. Model-produced output files are surfaced as one-click **Open** cards (`emitNewOutputs` → `FileOutCard`, `session-manager.cjs:43`). A model running under auto-approve (or a prompt-injected one — see H3) that writes `Report.xlsx.exe` into the linked folder produces a friendly **Open** button that executes it. The sibling handler `madav:openExternal` (line 388) *is* scheme-gated; `openPath` is not.
**Fix:** For model-produced outputs use `shell.showItemInFolder` (reveal, never execute). If `openPath` must stay, allowlist known-safe document extensions and reject executables/UNC.
**Confidence:** High (verified the handler + the file-card pipeline).

### H2 — OAuth open-redirect leaks the session token (web) → account takeover
**Location:** `server/auth-server.mjs:339` (`isAllowedRedirect` uses unanchored `r.startsWith(a)`), consumed at `:390` (start) and `:429–432` (callback appends `token=` to the redirect). Production `ALLOWED_REDIRECTS=https://madav.ai` (`render.yaml`).
**Why it matters:** `"https://madav.ai.evil.com".startsWith("https://madav.ai")` → **true**; so does `"https://madav.ai@evil.com"`. An attacker sends the victim `https://madav.ai/auth/google/start?redirect=https://madav.ai@evil.com`. The victim completes a *legitimate* Google sign-in, and the callback 302-redirects their browser to the attacker host **with a freshly minted, valid session token in the query string** (`:432`). Full account takeover, no XSS required — just a clicked link.
**Fix:** Exact-origin match: `try { return ALLOWED.some(a => new URL(r).origin === new URL(a).origin) } catch { return false }` (keep the anchored loopback regex for desktop). Do it at **both** `:390` and `:429`.
**Confidence:** High (read the start handler, the `startsWith` check, and the token-append). The only precondition is the configured `ALLOWED_REDIRECTS` value lacking a trailing-slash boundary — which is the current prod value.

### H3 — `run_bash` runs model-authored command strings through a shell under auto-approve (desktop)
**Location:** `electron/agent-openai.cjs:284` (`run_bash` → `execAsync`) and `:43–48` (`execAsync` = `child_process.exec(command,…)`, which spawns `/bin/sh -c` / `cmd /c`). Auto-approval: `session-manager.cjs:275` (agent `autonomy:"act"`) and `:894` (`project.autoApprove`) pass `permMode:"bypassPermissions"`, under which `isAuto()` is true for `run_bash` (`agent-openai.cjs:156`).
**Why it matters:** The command author is the model — including weak third-party LLMs and, critically, **prompt-injected content** the model reads from the very data files it is asked to process. Auto-approve + raw shell is the canonical prompt-injection→RCE chain for agentic apps. It is gated behind a user opt-in and a first-party renderer (so not remotely exploitable today), and the webhook/scheduled paths correctly force `noShell` — but on the interactive desktop path this is the largest blast radius in the app.
**Fix:** Keep `run_bash` out of blanket auto-approval (require confirmation even when other tools are auto-approved), and/or add a destructive-pattern deny-list that applies even under `bypassPermissions`. Validate `cwd` is an existing directory before use.
**Confidence:** High (verified the exec, the auto-approve plumbing, and the `noShell` webhook guard).

---

## MEDIUM

### M1 — Web CSP combines `'unsafe-inline'` + `connect-src *` (defeats XSS containment)
**Location:** `shared/csp.cjs:12` (`script-src 'self' 'unsafe-inline' 'unsafe-eval' …`) and `:16` (`connect-src *`), served as `HTML_CSP` (`auth-server.mjs:178`).
**Why it matters:** `'unsafe-eval'` is genuinely required by the bespoke engine and is fine. But `'unsafe-inline'` in `script-src` means any injected inline script or handler runs, and `connect-src *` lets it exfiltrate to any origin — so any single DOM-XSS becomes full token/key theft. The **desktop** branch correctly drops `'unsafe-inline'` in production (`csp.cjs:25`); the web branch does not.
**Fix:** Remove `'unsafe-inline'` from web `script-src` (nonce/hash the bootstrap), scope `connect-src` to `'self' https:` + the API/provider origins, and tighten `img-src *` (`:14`).
**Confidence:** High (read the full policy; two independent reviewers concur).

### M2 — Deck "View" preview evaluates model JS on the main thread, unsandboxed
**Location:** `src/deck/deckPreview.js:31` — `new AsyncFunction(...); await fn(...)` runs in the renderer realm. Unlike `src/deck/deckWorker.js:6` (which nulls `fetch`/`XHR`/`WebSocket`/`importScripts`/`indexedDB`), the preview neuters nothing. Triggered by DeckCard's **View** button (`markdown.jsx:126`).
**Why it matters:** During preview the model's script runs with full page access — `window`, `localStorage` (the web auth token `be.token` and provider API keys live there), and `fetch`. On web, `connect-src *` (M1) makes exfiltration trivial. The download path is properly worker-sandboxed; only the *preview eval* is exposed. Secondary: `render()` interpolates model-controlled `it.o.data` straight into an `<img src='…'>` (`deckPreview.js:70`) — an attribute-breakout HTML-injection vector in the preview (contained only by the downstream iframe sandbox).
**Fix:** Run the preview through the same neutered worker as the download path (or null `fetch`/`XHR`/`WebSocket` at the top of `deckPreviewHTML` before `new AsyncFunction`); validate/escape image `src`.
**Confidence:** High (read `deckPreview.js`, `deckWorker.js`, the call site).

### M3 — `verify()` can throw on a malformed token (DoS) and web tokens can't be revoked
**Location:** `server/auth-server.mjs:148–154`. `crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))` **throws** when buffer lengths differ (a truncated token). `verify()` is called outside try/catch on many routes (e.g. `/me`, `/proxy/*`), and the `http` handler is `async`, so the throw becomes an unhandled rejection — no response, socket hangs to `requestTimeout`. Separately, web `sign()` tokens (`:143`) carry only `{sub,exp}` with no `tokenVersion`, so a leaked web token can't be force-revoked for its 24h TTL (suspension is re-checked online, which partly mitigates).
**Fix:** `try { … } catch { return null }` around `timingSafeEqual` (or length-check first); add `tokenVersion` to `sign()` and check it in `verify`.
**Confidence:** Moderate (reviewer-cited with quoted code; behavior of `timingSafeEqual` on length mismatch is well-known).

### M4 — Desktop Google OAuth loopback has no `state` (CSRF)
**Location:** `electron/main.cjs:1039–1056`. The loopback callback reads `code` and exchanges it with no `state` set/checked — inconsistent with the otherwise-correct `electron/mcp-oauth.cjs:163`, which does validate `state`.
**Fix:** Generate a random `state`, include it in the auth URL, reject mismatches (mirror `mcp-oauth.cjs`).
**Confidence:** Moderate (reviewer-cited; consistent with the verified MCP implementation).

### M5 — Spoofable `X-Forwarded-For` defeats brute-force limits
**Location:** `server/auth-server.mjs:348` — rate-limit key uses `req.headers["x-forwarded-for"].split(",")[0]`. A client can spoof the left-most XFF to rotate the key, bypassing the per-IP throttles on `/auth` (`:382`) and the `ADMIN_KEY` check (`:124`).
**Fix:** Use the right-most XFF entry inserted by the trusted proxy, or a fixed trusted-hop count.
**Confidence:** Moderate (reviewer-cited; standard XFF pitfall).

### M6 — `safeStorage` encrypt failure silently persists the secret in plaintext
**Location:** `electron/settings.cjs:24` (`encStr`) — empty `catch` returns the plaintext value, which is then written to disk. The decrypt-side key-wipe guard (`:164–180`) is good, but the encrypt side degrades to cleartext without warning.
**Fix:** On encrypt failure, do not persist the field (or mark it un-encrypted explicitly) and log a warning.
**Confidence:** Moderate (reviewer-cited).

### M7 — Postgres TLS is unauthenticated for managed DBs
**Location:** `server/store.mjs:71` — `ssl: url.includes("localhost") ? false : { rejectUnauthorized:false }`. Encrypted but not authenticated → MITM between app and DB.
**Fix:** Supply the provider CA (`ssl:{ca: process.env.PGSSLROOTCERT, rejectUnauthorized:true}`).
**Confidence:** Moderate (reviewer-cited).

---

## LOW / hardening

- **OfficeCard has no `streaming` backstop** (`src/markdown.jsx:60`, `:185/189`). *Correction to the surface review, which rated this HIGH:* on verification it is **not** an active corrupt-build bug. `parseOfficeSpec` does a strict `JSON.parse` (`src/office.js:24`), so the card stays in the "Preparing…" placeholder until the JSON object is syntactically complete; a complete spec builds correctly even if surrounding prose is still streaming. The real issue is **latent fragility**: the safety rests entirely on strict JSON parsing with no `!streaming` backstop (unlike DeckCard). Given the codebase's theme of tolerating malformed weak-model output, any future leniency in `parseOfficeSpec` silently re-opens the mid-stream build window. *Fix (cheap):* thread `streaming` into `OfficeCard` and gate the buttons on `!streaming`, matching DeckCard. **Confidence: High.**
- **`setWindowOpenHandler` / `openExternal`** open arbitrary `https` URLs in the OS browser (`main.cjs:120–123`); model-rendered links auto-launch on click. Consider host confirmation for model-originated links. **Moderate.**
- **`artifacts.js` hand-rolled HTML sanitizer** (`:124–142`) misses `<base>` and `xlink:href` `javascript:`; impact contained by the iframe sandbox (opaque origin). Prefer DOMPurify. **Moderate.**
- **In-memory rate-limit / OAuth `state` / starter quota** (`auth-server.mjs:342/346`) don't survive restart or multi-instance — at >1 Render instance, OAuth callbacks land on the wrong box and fail (availability bug). Move to Redis or sign `state` as a self-contained HMAC. **Moderate.**
- **`_runnerEnv` writes a `node` shim into `userData/bin` and prepends it to PATH** (`agent-openai.cjs:32–39`) — writable PATH entry; ensure user-only perms. `PYTHONSAFEPATH=1` *is* correctly set (verified). **Low.**
- **`madav:listDir` / `madav:deleteSkill`** do unconfined reads / recursive delete on renderer-supplied paths (`main.cjs:394`, `:431`); acceptable under the first-party trust model, but unrestricted ambient authority. **Low.**

---

## Dependencies & hygiene

- **`npm audit --omit=dev` → 0 vulnerabilities.** Shipped runtime is clean. **High confidence.**
- **Full `npm audit` → 8 (1 critical, 4 high, 3 moderate), all dev-only:** `esbuild`/`vite`/`vitest`/`vite-node` (dev-server SSRF + binary-integrity — only matters on a dev machine), `form-data` high (CRLF injection) and `joi` moderate (RangeError DoS) are **fixable non-breaking via `npm audit fix`**; the esbuild chain needs a (breaking) vite@8 bump. Do the non-breaking fix now.
- **`xlsx` is invisible to `npm audit`** — it's pinned to a CDN tarball (`xlsx-0.20.3`), which *is* past the patched 0.20.2 (CVE-2023-30533 prototype pollution, CVE-2024-22363 ReDoS), but must be tracked manually since the auditor can't see it. **High.**
- **`pdf-parse` 1.1.x** (desktop-only, user-initiated PDF import) is stale/unmaintained; consider `pdfjs-dist`. **Moderate.**
- **Tracked junk:** `.~lock.Madav-Test-Plan.xlsx#` (a LibreOffice owner-lock file) is committed — `git rm --cached` it and add `.~lock.*#` to `.gitignore`. `dist/`/`release/` are correctly **not** tracked. No tracked secrets; `.gitignore` covers `.env*`. **High.**

---

## Documentation & process

- **CLAUDE.md is stale on two load-bearing rules.** The "three copies of the office rule, keep in lockstep" and "two separate CSPs" sections no longer reflect the code: both are single-sourced (`shared/office-rules.cjs`, `shared/csp.cjs`). The renderer keeps a deliberate ESM duplicate of the office rule (Vite can't `require` a `.cjs`), but it is **byte-equality-tested** by `test/rules-parity.test.cjs` (passes: 10164 chars identical). *Action:* update CLAUDE.md to point at the shared modules, and **wire `node test/rules-parity.test.cjs` into `npm run verify`/CI** — `test/` is outside the default vitest glob, so the guard isn't currently enforced automatically.
- **Test coverage is thin** for the risk profile: ~5 unit/contract tests, none covering the security-critical paths (CSP construction, OAuth redirect validation, permission gating, the streaming card-gate, file-output path handling). The verified-good claims below are currently guarded by code review, not tests. *Action:* add regression tests for H1/H2/M2 fixes at minimum.

---

## Verified GOOD (claims checked, not issues)

Electron hardening (`contextIsolation:true`, `nodeIntegration:false`, no `webSecurity:false`, sandboxed+partitioned agent-browser window, deny-by-default permission handler); preload exposes only a fixed named method surface (no generic `ipcRenderer`/`fs`/`child_process`); secrets encrypted at rest via `safeStorage` with `mode:0o600` and a decrypt-failure key-wipe; turn logs print only key length. CSP production branch carries the eval-engine directives on both surfaces. SQL fully parameterized with a table-name allowlist (`store.mjs:93`); tokens are HMAC-SHA256 over `crypto.randomBytes` secrets with `timingSafeEqual`; a production guard `exit(1)`s on default `SESSION_SECRET`/`ADMIN_KEY` or `ALLOW_DEV_LOGIN` in prod; strong SSRF defense (loopback/RFC1918/metadata blocked, re-checked per redirect hop) and a strict CORS allowlist; per-route authz re-verifies the live user and checks ownership before mutate/delete. MCP OAuth is textbook (PKCE + `state` + encrypted token store). The deck **download** path runs model code in a neutered worker; the chat markdown renderer is XSS-safe by construction (React elements only, no `dangerouslySetInnerHTML`, no image rendering). Web/desktop bridge parity is real (honest `{error:"…desktop app…"}` stubs, capability-gated screens), not silent breakage.

---

## Prioritized action list

1. **H2** — exact-origin OAuth redirect match (`auth-server.mjs:339`, both call sites). *Highest priority: only click-through remote exploit.*
2. **H1** — `showItemInFolder` (or extension allowlist) for model-produced "Open" cards (`main.cjs:389`).
3. **H3** — keep `run_bash` out of blanket auto-approval; add a destructive-command deny-list under bypass.
4. **M1** — drop web `'unsafe-inline'`, scope `connect-src`/`img-src` (`shared/csp.cjs:12–16`).
5. **M2** — sandbox the deck-preview eval (`deckPreview.js:31`); validate image `src`.
6. **M3–M7** — `verify()` try/catch + `tokenVersion`; desktop OAuth `state`; XFF keying; encrypt-failure handling; PG CA pinning.
7. **Hygiene** — `npm audit fix` (form-data/joi); `git rm --cached` the lock file; wire the parity test into CI; refresh CLAUDE.md's stale sections.
8. **Cheap-but-worth-it** — give `OfficeCard` the `!streaming` backstop so its safety doesn't rest solely on strict JSON parsing.
