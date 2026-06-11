# BrainEdge — Two-Channel Builds (Admin & Public)

Every release now produces TWO installers, driven by the Extras switchboard
(Settings → Extras, visible only to Creator/Complimentary accounts).

## The one command

```
npm run electron:build
```

builds BOTH installers into `release/`:

| Artifact | Channel | Contents |
|---|---|---|
| `BrainEdge-admin-<version>-setup.exe` | **Admin** | Every feature included, regardless of Extras. Your personal/internal build. |
| `BrainEdge-public-<version>-setup.exe` | **Public** | Anything switched OFF in Settings → Extras at build time is **not in the file at all**. This is what global users download. |

(Portable .exe variants are produced with the same channel stamps.)

Individual commands: `npm run electron:build:admin`, `npm run electron:build:public`.
Web deploy of the public channel: `npm run build:public` (then deploy `dist/` as usual).
Plain `npm run build` stays a full-feature web/dev build.

## How it works — three layers, one manifest

`scripts/build-features.mjs` runs before each build and writes the channel manifest:

1. **`electron/build-features.json`** (gitignored) — read by:
   - `electron/features.cjs` → `builtIn(key)`: every engine gate consults this. In dev
     (unpackaged) it always returns true, so a stale manifest can never disable features
     while developing. Missing manifest = everything ON (fail open).
   - `electron-builder.config.cjs` → on the public channel, the leaf module files of
     excluded features are dropped from the installer: imagegen.cjs, voice.cjs,
     win-speech.cjs, agent-browser.cjs, telegram-bot.cjs, terminal.cjs. Every require of
     these is lazy + try/catch'd, so absence can never crash.
2. **`.env.production.local`** (gitignored) — `VITE_FEAT_<KEY>=0` lines for excluded
   features. Vite folds each `import.meta.env.VITE_FEAT_X !== "0"` to a constant, so
   Rollup statically DROPS the feature's renderer chunk from the public bundle
   (same proven mechanism as the QA/Test Center exclusion).
3. **Runtime Extras switchboard** — unchanged. Availability is always
   `builtIn(key) && extras gate`, so the owner can still soft-toggle features that ARE
   in the build; users get no Extras page at all.

## Feature → exclusion mapping (keep in sync with src/extras.js)

| Key | Renderer (public build drops) | Engine (public installer drops / gates) |
|---|---|---|
| sage | SageDock chunk | — (renderer only) |
| voice | mic buttons (Composer, Sage) | voice.cjs + win-speech.cjs excluded; transcribe/winSpeech IPC guarded |
| imagegen | create_image (web tool list) | imagegen.cjs excluded; tool not offered, call refused |
| office | officedoc card → plain code block; rule out of prompts | gate only (spec lives in renderer) |
| browser | — | agent-browser.cjs excluded; _browserFor/browserFor return null |
| memory | umBlock/umLearn off (web) | gate only (user-memory.cjs ships, withLang/learn gated) |
| studio | StudioLauncher chunk + sidebar entry | — |
| terminal | TerminalPanel chunk + sidebar entry | terminal.cjs excluded; term* IPC guarded |
| scheduler | Scheduler chunk + sidebar entry | gate only: 60s scheduler loop + webhook server not started (task-runner/store/webhook-server ship — shared plumbing for teams/briefs) |
| viamobile | ViaMobile chunk + sidebar entry | telegram-bot.cjs excluded; messaging IPC guarded; auto-start skipped |

**Coupling/decoupling rule:** a feature is excluded ONLY by (a) renderer chunk flags and
(b) leaf-module exclusion behind guarded requires. Shared plumbing is never excluded.
Adding a new switchable feature = one key in src/extras.js + scripts/build-features.mjs
KEYS + (optionally) a leaf-module entry in electron-builder.config.cjs EXCLUDABLE +
gates that consult `builtIn(key)`.

## Release checklist

1. Sign in as Creator → Settings → Extras → set the public feature set.
2. `npm run electron:build` → both installers in `release/`.
3. Verify the public one on a clean profile: excluded sidebar entries absent, mic absent
   (if voice off), Settings → Extras absent for normal users, no excluded .cjs files
   inside `resources/app.asar` (and Test Center absent — standing check).
4. Ship `BrainEdge-public-…-setup.exe`; keep the admin build for yourself.
