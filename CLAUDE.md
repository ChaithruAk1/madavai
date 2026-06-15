# Madav — working rules for code changes

## RULE 0 — Every fix must work on BOTH web and desktop. Always.
Madav ships two surfaces from one repo. A change is **not done** until it is correct on **both** web and desktop, and the deploy step for each is stated. Never fix one and assume the other; they have separate prompt copies, separate CSPs, and separate deploy paths. When you change behaviour, walk the map below and patch every surface it touches.

## Surface map — what affects what, and how it ships

| Layer | Files | Used by | To pick up the change |
|---|---|---|---|
| **Shared renderer** | `src/**` (App.jsx, markdown.jsx, components, `src/doc/*`, `src/deck/*`, `src/bridge/webBridge.js`, `src/office.js`) | **both** | Desktop dev: Ctrl+R (or restart). **Web: `npm run build` → redeploy to Render.** A desktop Ctrl+R does NOT update web. |
| **Desktop main process** | `electron/*.cjs` (session-manager, agent-openai, main, chat-sync, sessions-store) | desktop only | **Full `npm run electron:dev` restart** (Ctrl+R won't reload main-process code). |
| **Web server** | `server/*.mjs` (auth-server, store) | web only | **Redeploy to Render.** |

## Three copies of the office/prompt rule — keep them in lockstep
The model-facing office rule (officedoc + bespoke `deckjs`/`xlsxjs`/`docxjs`/`pdfjs` + the capability gate + guardrails) exists in **three** places. Change all three or web/desktop diverge:
1. `electron/agent-openai.cjs` — `officeRulePart(model)` (desktop agent path)
2. `electron/session-manager.cjs` — `officeRulePart()` (desktop **active chat** path)
3. `src/office.js` — `officeRule(model)` (web path, consumed by `src/bridge/webBridge.js`)
The capability gate `isDeckCapable(model)` is duplicated in all three too.

## Bespoke engine requires `'unsafe-eval'` in the CSP — on BOTH
The bespoke document engines run model-written code via `new AsyncFunction(code)` in a sandboxed worker (no DOM/network), with a main-thread fallback. This needs `script-src 'unsafe-eval'` and `worker-src 'self' blob:`:
- Web CSP: `server/auth-server.mjs` → `HTML_CSP`.
- Desktop CSP: `electron/main.cjs` → `applyCSP()` (production branch needs it too, not just dev).
The runners fall back to main-thread on a CSP/`EvalError` so a strict worker CSP still degrades gracefully.

## Cards show actions only when the turn is COMPLETE
Bespoke cards (Excel/Word/PDF/deck) must not show View/Download mid-stream — clicking runs half-written code → parse error. `streaming` is threaded App → Message → Markdown → cards; each card gates `ready` on `!streaming`. On a genuine code error the card shows **Rebuild**, which dispatches `madav:fixdoc` for a one-shot self-repair.

## Build / verify discipline
- This filesystem mount truncates the Edit tool intermittently — **use python/heredoc writes**, never the Edit tool on important files. Restore a botched file with `git show HEAD:<file>`.
- Verify before claiming done: `node --check` the `.cjs`/`.mjs`; `esbuild transform` the changed `.jsx`/`.js`; a full `npm run build` (vite) for renderer changes (slow — obfuscator; run backgrounded). Confirm the four worker chunks bundle: `xlsxWorker`, `docxWorker`, `pdfWorker`, `deckWorker`.
- `npm run build` = renderer only. The **installer** is `npm run electron:build` (vite + electron-builder). `EPERM …win-unpacked.tmp` = Windows lock: close running `electron.exe`/`Madav.exe`, delete `release\win-unpacked*`, add a Defender exclusion (elevated), retry.
