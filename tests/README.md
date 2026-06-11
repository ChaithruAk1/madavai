# Madav test library

Central tests for core features. Layered so most regressions are caught in seconds, without launching Electron or needing API keys.

## Run

```
npm install          # once, to pull the test devDeps
npm test             # watch mode (vitest)
npm run test:run     # single run (CI / pre-commit)
npm run verify       # vite build + tests — run this before every commit
```

## Layers

| Folder | Env | What it guards |
|---|---|---|
| `tests/contract` | node | preload ↔ main IPC channel parity, and bridge/mock method parity. Catches the "renderer calls a method main never handles" / signature-drift class of bug. |
| `tests/unit` | node | Pure logic: `stripReasoning`, error-signature normalization, saved-store CRUD. Electron is stubbed (`tests/stubs/electron.js`) so main-process `.cjs` modules import in plain node. |
| `tests/component` | jsdom | Composer behavior with the mock bridge: `/` command menu, `@` mentions, send-on-Enter, empty-guard. |

## Adding a test for a new feature
1. Pure helper? → `tests/unit`.
2. New `bridge.*` method? → add it to the `CORE` list in `tests/contract/ipc-contract.test.js` so preload+mock parity is enforced.
3. New composer/chat UI behavior? → `tests/component`.

## What automation does NOT cover (run the manual smoke checklist below before a release)

Visual/animation/main-process-restart things must be eyeballed in the running app (`npm run electron:dev`):

- [ ] App launches; greeting + composer render; sidebar collapse (Ctrl+B) works.
- [ ] Send a text message → streamed response renders; model badge in the ⋯ menu matches the selected model.
- [ ] Paste an image with a **vision** model → it's described. With a text-only model → the friendly "doesn't support image handling" message shows.
- [ ] `/` opens commands+skills; selecting a skill attaches a chip; selecting a command runs it. `@` lists files/connectors.
- [ ] Save a response (⋯ → Save) → appears in the Saved sidebar AND in the "Saved History" project; delete removes from both.
- [ ] Projects: create, link folder, start a Chat and a Cowork task from a project.
- [ ] Online/offline indicator turns red when the active model is unreachable.
- [ ] Layout: tabs centered over the chat area; brand centered over the sidebar; logo static in hero + responses, animated in the top bar.

> Reminder: renderer (`src/**`) changes hot-reload; main-process (`electron/**`) changes require restarting `npm run electron:dev`.
