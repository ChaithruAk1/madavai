# `core/` — Madav shared core (platform-agnostic)

This directory holds logic that is **the same on every surface** (desktop, web, and any future
surface). It depends **only** on the platform **adapter** contract — never on Node, Electron,
the browser, or the server directly. See `docs/adr/0001-architecture.md`.

## Layout
- `adapter.contract.js` — the seam. Defines `ADAPTER_SPEC` (the methods every host must provide:
  `fs / exec / net / persist / emit / secrets / paths / env`) plus `validateAdapter()` /
  `assertAdapter()`. Pure, no imports.
- `harness/replay.js` — the turn-replay harness: deterministic "cassette" + mock model + mock
  adapter, so a migrated core can be proven to reproduce recorded desktop behavior.

## Rules
1. **No platform imports in `core/`.** If you need a file read, a process run, an event emitted,
   call the adapter — never `fs`, `child_process`, `window`, or `localStorage`.
2. **Desktop is the reference.** New/migrated core logic is validated on desktop first, then web
   lights it up through the web adapter. Every desktop-touching step is permission-gated.
3. **Locked by tests.** `tests/parity/**` proves the contract holds and the harness detects drift;
   the CSP/office-rule parity tests prove shared files don't diverge.

## Adding a host adapter (later phases)
Implement every method in `ADAPTER_SPEC` and pass `validateAdapter(adapter).ok`. The desktop
adapter wraps Node/Electron; the web adapter wraps the browser + `server/` proxy. Nothing in
`core/` changes when you add or change an adapter — that is the point.
