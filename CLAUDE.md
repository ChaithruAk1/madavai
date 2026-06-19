# Madav — working rules for code changes

## COMMUNICATION RULE — The owner (Chaithru) is NOT a developer. Always explain, guide, advise, and recommend in plain, everyday language.
Chaithru does not write code and must never be expected to. Claude does ALL the technical work (code changes, debugging, file edits, investigation). When Chaithru needs to DO something — run the app, test, commit, deploy, click in the UI — Claude gives **numbered, plain-English steps**: the exact thing to type or click, where to do it, what it is FOR, and what a successful result looks like. Avoid jargon; when a technical term is unavoidable, define it in one short plain sentence. Do NOT dump a list of options and ask Chaithru to choose — give a clear recommendation with the reason in plain words, then proceed unless told otherwise. Be a guide and advisor, not a reference manual. (Owner preference, recorded 2026-06-18.)

## TESTING RULE — Claude runs the automated tests itself after every change, and reports in plain English.
Chaithru should NOT have to run tests manually for routine checks. After each change or migration stage, Claude runs the full automated test suite itself (`tests/parity`, ~294 checks today) — building a clean copy to run from when the workspace mount serves stale/truncated files — and tells Chaithru in plain words whether everything passed. Claude ADDS tests for each newly-migrated piece so coverage keeps growing. One comprehensive whole-app end-to-end (E2E) test is run ONCE at the end of a multi-stage effort as the final sign-off. (Owner preference, recorded 2026-06-18.)

## SINGLE-SOURCE FIX RULE — MANDATORY, NON-NEGOTIABLE. Every change goes to ONE shared source. NEVER create or keep two sources of truth.
This is an absolute requirement, not a preference Claude may trade off, and the owner has made it mandatory and permanent. Before ANY fix or feature, Claude asks where the logic belongs in the single-source architecture and puts it THERE — the shared core (`core/**`) or shared renderer (`src/**`) — so web and desktop inherit it from ONE place. Claude must NEVER propose, recommend, or implement a change that creates, keeps, or deepens TWO copies of the same logic/prompt/rule — **not even as a "safer", "lower-risk", or "temporary" option, and never to avoid touching desktop.** Duplicating to dodge risk is forbidden. Touching desktop (`electron/**`) IS allowed and expected when needed to reach one source: the owner explicitly accepts the test-and-fix risk — make the single-source change, then validate and fix forward. If existing code already has two copies, the fix is to COLLAPSE them into one, not to edit one side. The ONLY thing allowed to differ per surface is genuine platform plumbing that physically cannot be shared (terminal, local models, file/secret storage, the OS-level spellcheck/context menu). If Claude ever catches itself about to ship a per-surface copy, it must STOP and do the single-source version instead, every time, forever. (Owner preference — MANDATORY, recorded 2026-06-18.)

## COMMIT & DEPLOY RULE — After every code change, Claude hands over the exact git commit + push commands.
A web change reaches the live site (madav.ai on Render) ONLY when it is **pushed to git** — Render rebuilds on push (`buildCommand: npm install && npm run build:public`). Running `npm run build` locally only tests on Chaithru's own machine and deploys NOTHING. So after any fix, Claude ends by giving Chaithru copy-pasteable `git add <specific files>` / `git commit -m "…"` / `git push`, naming exactly which files belong to that fix so nothing is committed blind. Desktop changes need no git/deploy to test (just restart the app or Ctrl+R); git is for saving the change and for deploying the web version. (Owner preference, recorded 2026-06-18.)

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

## 🔒 PROTECTED — weak-model office pipeline (WORKS — do not regress)
**Verified working** 2026-06-16 on `nvidia stepfun-ai/step-3.5-flash` (a near-weakest model):
"Execute Report for March" in a folder-linked project → model wrote ONE `build_report.py`,
ran it via run_bash, saved `Report_March.xlsx` into the folder, and the **Open/Download card**
rendered in chat. Let's Chat produces files the same way (scratch dir). DO NOT "simplify" or
"improve" the pieces below without re-verifying this exact end-to-end result on a weak model.

**How it works (keep all four):**
1. `_projectTurn` folder note = a RIGID recipe: inspect ≤2 cmds → write ONE uniquely-named
   script that SAVES an .xlsx into the folder → run once → stop → one-line summary. The SAVED
   FILE is the deliverable (not an inline officedoc). `_chatDataTurn` does the same in a scratch dir.
   **(2026-06-16) GATED behind `isDeckCapable`:** the rigid recipe above now applies ONLY to weak models. `_projectTurn` wraps it as `isDeckCapable(profile.model) ? <lighter brief> : <this recipe, byte-identical 1313 B>`. Capable models (Opus/Sonnet/DeepSeek/etc.) get a lighter note that keeps the save-a-file -> Open/Download-card contract but drops the single-script / numbered-steps straitjacket. The WEAK path is byte-unchanged (verified), so the guarantee below still holds.
2. `emitNewOutputs(emit, folder, before)` diffs the folder before/after and emits `file_output`
   → renders as `FileOutCard` (Open = openPath, Folder = showInFolder). Logs `[madav] emitNewOutputs ... new=N`.
3. `needsDataTools` triggers on bare `excel|spreadsheet|workbook|xlsx|csv|pivot table` but NOT on
   ambiguous `report|model|data|table` (those over-trigger and break plain chat).
4. Plain-English reply guidance applies ONLY to the chat message, NEVER to the deliverable.

**Two traps that already cost hours — check these FIRST if a project "stops" with no output:**
- **Folder poisoning (the #1 cause):** a model scratch script named after a stdlib module
  (`inspect.py`, `json.py`, `random.py`, `code.py`, `test.py`, `string.py`) left in the DATA folder
  shadows the stdlib → `import pandas` crashes at startup → every `python -c` fails silently → the
  model flails for 12 steps and produces nothing. This is NOT model weakness. Fix: delete the
  stray .py from the folder. Hardening: set `PYTHONSAFEPATH=1` on the script runner so cwd can
  never shadow the stdlib again.
- **Prompt wording:** telling the model "do NOT dump formulas / column lists / reconciliation
  math" in the PROJECT system prompt made the weak model NOT build the spreadsheet at all. Keep
  brevity guidance scoped to the reply only.
