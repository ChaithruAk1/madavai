# Code Review — 2026-06-11

Full-project review focused on everything landed since the 2026-06-09 review (harness waves, Sage rounds, competitive-gap features, agent browser/voice, web mirror). Three parallel review passes: main-process engine, React renderer, web/server/CLI. Static review only — nothing in the current diff has been compiled or run.

**Verdict in one line:** no build breakers found; the architecture and the previously-fixed security layer are holding; but there are 2 high-priority security-shaped gaps (webhook folder tasks, proxy key forwarding), 2 high-priority UX-breaking renderer bugs (detached-session leak, Craft input focus loss), and a cluster of medium reliability issues that should be fixed before launch.

---

## A. CRITICAL / HIGH — fix before launch

### A1. Webhook-fired folder/chat tasks run with bypass permissions + live shell
`electron/task-runner.cjs:28-30, ~112` + `electron/webhook-server.cjs:117`
Agent/team webhook routes strip shell via `guardWebhookRun`, but a **task whose target is a folder or chat** fired by webhook runs attacker-influenced prompt text with `permMode:"bypass"` and shell enabled — the untrusted-prompt marker is the only mitigation. This is the closest thing in the codebase to unattended remote command execution.
**Fix:** when `source === "webhook"` and target is folder/chat/brief, pass `noShell:true` (mirror the agent path), unless an explicit per-task opt-in flag is set.

### A2. /proxy/chat forwards user API keys to arbitrary public hosts
`server/auth-server.mjs:450-499`
The proxy's SSRF guard blocks private/loopback hosts but does NOT restrict destinations to known provider hosts. A signed-in user (or script with their session) can make the server forward a bearer API key to any public host. Self-directed today, but it makes the server a general authenticated egress proxy and contradicts the "keys only go to providers or our own proxy" rule.
**Fix:** allowlist of supported provider hostnames (openrouter.ai, api.openai.com, api.anthropic.com, generativelanguage.googleapis.com, integrate.api.nvidia.com, …); reject others. Keep the loopback exception for desktop/Ollama.

### A3. Detached-session events leak into the wrong conversation
`src/App.jsx:134-137, 496-512`
The event guard is `if (e.sessionId && sessionRef.current && e.sessionId !== sessionRef.current) return;`. `switchMode()` sets `sessionRef.current = null` while the old engine session keeps running — with null, the guard passes EVERY event, so a detached session's deltas/tool cards/result mutate whatever timeline is on screen (ghost text in the wrong conversation, foreign `setBusy(false)`).
**Fix:** drop the `sessionRef.current &&` clause and ensure `sessionRef.current` is assigned synchronously from `bridge.start`; events from a sessionId that isn't current never apply.

### A4. Craft section inputs lose focus every keystroke
`src/components/Agents.jsx:2136-2143`
`Section` is declared INSIDE `BlueprintExtras` render — React sees a new component type each render and remounts the subtree, so the "Economy model" input (2232-2237) and the Memory edit textarea (2157) lose focus after one character. The headline new Craft feature is effectively untypeable.
**Fix:** hoist `Section` to module scope (pass open/setOpen as props).

### A5. Agent-browser credential-field guard has gaps + two divergent regexes
`electron/agent-browser.cjs:185 vs 195`
The regex actually enforced in-page omits `secret`, `social.?sec`, and `pin` — fields with those names WILL be auto-filled, contradicting the documented "password/payment fields are human-only" guarantee. The stricter `FORBIDDEN_FIELD` regex at 185 is only used in a dead no-op branch.
**Fix:** one shared regex constant including `passw|cvv|cvc|card-?num|cc-(number|exp|csc)|expir|ssn|otp|secret|social.?sec|\bpin\b`, injected into the page check.

---

## B. MEDIUM — fix soon (reliability / correctness)

### B1. Auto-compaction can loop without progress on small-context models
`electron/agent-openai.cjs:404-415` — after `applyCompaction` the kept tail (4 turns, e.g. 16KB browser snapshots) can still exceed 70% of a 32k window → recompacts every step, burning a model call per step to MAX_STEPS. **Fix:** `_justCompacted` flag to skip immediate recompaction + hard-trim oversized tail messages.

### B2. Concurrent per-agent memory writes clobber learnings
`electron/agent-memory.cjs` append = read-modify-write with no lock; same agent running in parallel (duplicate team member, call_agent re-entry) loses notes. **Fix:** per-agent-id in-process promise chain serializing writes.

### B3. Large knowledge imports parse fully in the main process before any cap
`electron/main.cjs:~454` (xlsx branch; pdf/docx same shape) — a 200MB workbook is fully parsed before the 60k-char slice → main-process freeze/OOM. **Fix:** stat first, reject >50MB with a clear skip reason.

### B4. Artifact panel state survives artifact switches
`src/components/ArtifactPanel.jsx:8-29` + `App.jsx:862` — open artifact A, edit, click artifact B: draft/undo/tab persist → A's edited text shown and DOWNLOADED under B's title. **Fix:** key the panel on a stable artifact id or reset on `artifactProp` change.

### B5. Message memo freezes onEdit/onRetry
`src/components/Message.jsx:75-76` — comparator only checks item/streaming/userName; user messages mount with `onEdit=undefined` while busy and never re-render → Edit affordance missing for all live messages; Retry captures stale closures. **Fix:** include handler presence in the comparator; route handlers through refs.

### B6. send() has no error path — failed start wedges the composer
`src/App.jsx:306-325` (+ project variants) — un-caught `await bridge.start`; on rejection `busy` stays true with no error shown. **Fix:** try/catch → setBusy(false) + error item in timeline.

### B7. Sage proactive tip drops the question
`src/components/SageDock.jsx:373` — computed `a` never used; clicking a tip opens an empty dock. **Fix:** call `ask(a)` after `openDock()` (skip for the walkthrough tip).

### B8. Sage/Composer mic cannot be stopped on desktop
`SageDock.jsx:217-231`, `Composer.jsx:207` — winSpeech path stores nothing in recRef; "click to stop" is a lie (only the 10s timeout ends it); a stale web recognizer may get `.stop()`ed. **Fix:** track the active engine, label honestly or disable mid-listen.

### B9. ArtifactPanel versions recomputed per render (per streamed token)
`src/App.jsx:863` — full regex extraction over every assistant message on every render while a panel is open. **Fix:** useMemo on [timeline, artifact.kind].

### B10. webGenImage URL construction diverges from shared transport
`src/bridge/webBridge.js:378` — skips `apiBase()` normalization; profiles without `/v1` in baseUrl get 404 on image gen while chat works. **Fix:** use `apiBase(prof.baseUrl) + "/chat/completions"`.

### B11. CLI sub-agents bypass the run_command confirmation gate
`cli/agent-core.mjs:143,153` — sub-agents inherit `{...ctx, sub:true}` and the destructive-op confirm is gated on `!ctx.sub` → a model can run unconfirmed shell commands by delegating to a sub-agent in interactive mode. **Fix:** propagate confirm into sub-agents for destructive ops.

### B12. Text-mode tier not updated after native→text fallback
`electron/agent-openai.cjs:336, 417, 442` — `textMode` flips true but `tier` stays A/B → redundant tier-B re-pin prompt bloat. **Fix:** set `tier="C"` alongside the flip.

---

## C. LOW — batch into a polish pass

1. **ToolCard.describe() throws on malformed events** (`ToolCard.jsx:7-8,45`) — null input / undefined name → TypeError, and there is NO error boundary in the app → one bad event white-screens everything. Cheap fix: `input = input || {}; name = String(name||"")` + add a top-level error boundary.
2. **squashStale skips text-mode tool results** (`harness.cjs:185-194`) — user-role results never squashed; text-mode missions hit the context wall faster. Squash user-role messages with the `[result of <tool>]` prefix.
3. **mission-store.save has no try/catch** (`mission-store.cjs:19-25`) — contained today by the caller; wrap to match sibling stores.
4. **Team checkpoint O(N²) writes** during parallel fan-out — debounce or checkpoint after the wave.
5. **persistSession write race** (`webBridge.js:571-585`) — latent; add a per-session write queue.
6. **store.mjs patchUser column-name fallback** (`store.mjs:85`) — `COLS[k] || k` interpolates unknown keys into SQL identifier position; validate keys, throw on unknown.
7. **CLI lacks tolerantParse** (`agent-core.mjs:62-67`) — weak-model tool args silently become `{}`; wire the harness repair ladder (also closes the standing "CLI harness wiring" item).
8. **SageDock leaks** — nudge-peek setTimeout never cleared; drag/resize listeners leak on unmount mid-drag.
9. **GOTO parsing edges** (`SageDock.jsx:269-273`) — GOTO line only stripped at absolute end of text; GOTO! also renders the button. Add `m` flag; exclude `!` from button path.
10. **Composer mention replacement** (`Composer.jsx:149`) — `$` not escaped in replace; use function form.
11. **ArtifactPanel undo calls setState inside an updater** (`ArtifactPanel.jsx:67-74`) — StrictMode double-fires; restructure.
12. **task-runner `agent` shadowing** (`task-runner.cjs:43-60`) — correct but a reader trap; rename helper to `runAgent`.
13. **_browseIdxs is index-fragile** — sound today (appends only, reset on compaction), but any future mid-turn splice silently corrupts page trimming. Add a guard comment or use stable markers.
14. **xlsx installed from a CDN tarball URL** — supply-chain/install-reproducibility consideration; consider vendoring or registry pinning.

---

## D. What's solid (verified, no action)

- **streamChat `{text}` contract:** all ~22 desktop call sites + all web call sites correct. The past bug did not recur.
- **win-speech.cjs:** PowerShell built only from clamped integers; busy guard; hard-kill. Injection-safe as documented.
- **Permission/noShell/plan gates:** consistently applied in interactive AND headless paths; plan mode blocks all mutations incl. browser + create_image.
- **base64 images never enter model history;** text-protocol parser reads assistant text only; page text framed untrusted with shield default-on.
- **applyCompaction:** preserves system msg, tail never starts on a tool msg, resets _browseIdxs.
- **Team fan-out:** fresh history per member — no shared-array corruption class.
- **harness.js web twin:** exports match imports exactly, algorithms byte-identical — no build breaker.
- **No duplicate IndexedDB block;** failure paths surfaced; keys only go to provider or own proxy (destination scope = A2).
- **Stripe webhook:** timing-safe signature verify before acting, idempotent. Server endpoints auth-checked + rate-limited; SSRF guard on /proxy/fetch re-checks every redirect hop.
- **markdown.jsx still XSS-safe** (React elements only, https-only links); artifact popout sandbox correct; office.js download blob-only with sanitized filenames.
- **office.js:** all four library APIs real and version-correct (docx/pptxgenjs/jspdf/SheetJS); deps present in package.json; `mammoth/mammoth.browser.js` resolves (mammoth 1.12.0 has no exports map).
- **Bridge degradation:** all ~24 desktop-only preload methods are feature-checked at renderer call sites — web build degrades gracefully, no crashes.
- **webfs/CLI path containment:** boundary-aware checks correct; CLI offline-verify semantics match documented intent.
- **sageMemory.js:** every parse guarded, slot-claim prevents double-distill, capped arrays.

---

## E. Top risks, ranked

1. **A1** — webhook folder tasks: bypass + shell on attacker-influenced text.
2. **A3** — detached-session leak: corrupts visible conversations on navigation during a running turn.
3. **A2** — proxy as authenticated key-egress to arbitrary hosts.
4. **A4** — Craft inputs untypeable (headline feature broken on arrival).
5. **A5 + B1/B2** — browser fill-guard gaps and the compaction/memory reliability cluster degrading long agent missions.

## F. Improvement areas (beyond bug fixes)

1. **Add a React error boundary** at the app root — today one malformed event or render throw white-screens everything. Single cheapest robustness win in the codebase.
2. **Compile gate discipline:** this entire diff shipped with zero compile checks. The review found no build breakers, but `npm run build` before each batch (or restoring sandbox builds) would catch the class structurally.
3. **Q16 monolith split** (App.jsx ~, Agents.jsx 2300+ lines) — A4 is a direct symptom of monolith pressure; split BlueprintExtras/Studio/Floor into files after the next green build.
4. **Serialize per-id store writes** as a shared utility (fixes B2 and future stores by construction).
5. **Context-window catalog:** ctxWindowFor heuristics → real values from the OpenRouter catalog (already fetched) to make compaction thresholds accurate (reduces B1).
6. **CLI parity wave:** tolerantParse + sub-agent confirm + harness wiring in one pass.
7. **Error-path UX:** B6 pattern (try/catch + visible error item) applied to every bridge.start/sendInput call site.

## G. Verification limits

Static review only — no build or runtime execution (sandbox down; commit discipline requires user's terminal). Findings A3/B1/B5/B10 are reasoned from code, not reproduced. The owed gates stand: `npm run build` → full restart → smoke pass → commit.
