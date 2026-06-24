# Madav — Pending items (ADR-0001 single-source migration + backlog)

_As of 2026-06-18. The full **M2 chat-loop migration BUILD is landed + committed**, full parity suite green,
and the desktop core path is flag-validated on a real turn. What remains is the **RETIRE phase** (where the
duplication actually collapses to one source) plus a small backlog. See `MEMORY.md` + `docs/adr/0001-*`._

## M2 single-source — remaining (priority order)

1. **Desktop shakeout of `MADAV_CORE_CHAT` — THE GATE (owner's task).**
   Run varied chat turns with the flag on and confirm the core path matches the legacy path:
   a long chat (exercises **compaction**), a no-native-tools model (**text-mode / native→text fallback**),
   and a **connector or skill** turn. Everything below is gated on this.

2. **Web cutover (M2d.3) — NEXT build step (flag-guarded).**
   Wire `webBridge.runAgentTurn` → `runWebChatTurnViaCore` (`src/bridge/chatCoreWeb.js`) behind a
   `localStorage MADAV_CORE_CHAT` flag (default off = web's loop unchanged). Validate on Render, then
   **delete web's `runAgentTurn` loop + `src/shared/harness.js`.** Gated on #1 + Render validation.
   _Note: wiring this bundles the (dormant) core path into the web build — re-run `npm run build` + smoke-test before pushing._

3. **M2e desktop legacy retire — the final collapse.**
   Flip `MADAV_CORE_CHAT` to default-on → **delete the legacy chat path in `electron/agent-openai.cjs`** →
   **collapse the `harness.cjs` / `providers.cjs` helper copies** (now unused by the retired loop) →
   add a behavior-version stamp + golden parity tests. Gated on #1; re-validate desktop after.

4. **Two trivial parity gaps (low-value, additive to `coreChatTurn`).**
   - tier-B re-pin (periodic discipline reminder every 6 steps for erratic models)
   - create_image image card on the core path (tool_result currently drops the image blob)

5. **Orphan cleanup.** `git rm shared/agent-rules.cjs` (old orphaned CJS rule, superseded by `core/agent-rules.js`).

6. **Office-rule → core (banked, not wired).** `core/office-rules.js` exists but isn't wired — it touches the
   🔒 PROTECTED `session-manager.cjs` `isDeckCapable` gate. Wire alongside the session-manager engine work and
   **re-run the PROTECTED `Report_March.xlsx` weak-model scenario.**

## Broader backlog (from MEMORY, non-M2)

7. Deploy + smoke-test the accumulated web batch on Render (scheduled runs, Agent Ops, skills, voice).
8. Scorecard §4: swarms/missions (parked), browser automation + Telegram (vendor-gated), team-tools (unblocked once M2 lands).
9. Office-doc UX fallback for unreliable large free models (e.g. `nemotron-550b:free`) that hard-fail bespoke with no template fallback.

## Done this effort (for reference)

M2a (core helpers) · M2b (core loop) · M2c.0/0b (turn-recorder + emit capture) · M2c.1 (desktop adapter +
emit-parity) · M2c.3 (flag-guarded desktop cutover, **desktop-validated**) · M2c.2 (single-sourced
`stripReasoning` + compaction helpers; text-mode + auto-compaction parity) · M2d.1 (single-sourced the adapter
into `core/chat-adapter.js`) · M2d.2 (web platform wiring, additive, proven). All committed; suite green.
