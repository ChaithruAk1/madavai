# Madav — rebuild state (read me first)

**This folder (`MadavNew`)** is the **rebuild workspace** for Madav Next. It started as a full copy of the current Madav and is being transformed, in place, into the clean target architecture described in `docs/blueprint/`. It will be renamed to **Madav** once mature. The **current Madav** folder is untouched — run it any time to compare.

**Git:** `origin` is set to **https://github.com/ChaithruAk1/madavai.git**. The work below is **saved as files in this folder**; the git *commit* is pending — a stale `.git/index.lock` copied in from the source repo is blocking it, and the host won't let me delete it. The one‑time fix (clear lock → commit → push) is in §6.

---

## 1. The honest headline

A full production rewrite to the 1M‑user architecture is **multiple months** of engineering — not one night, and no one (human or AI) can truthfully claim otherwise. So tonight I did the thing that is real and valuable: **laid the foundation correctly, proved the hardest fix, and wrote the map.** The app you copied still runs exactly as before — nothing was broken to chase a half‑finished rewrite.

## 2. What is DONE tonight (real, verifiable)

| Area | What landed | Where |
|---|---|---|
| **Charter** | `CLAUDE.md` → **`MADAV.md`**, rewritten, fully rebranded, forward‑looking rules | `MADAV.md` |
| **Clean structure** | New monorepo skeleton (`packages/`, `apps/`, `services/`, `scripts/`, `docs/`) + strict TS base config | repo root, `tsconfig.base.json` |
| **Excel‑stability engine** | Schema‑gated, no‑silent‑truncation, formula‑validated workbook planner — **strict‑typechecked + 6 unit tests passing** | `packages/documents/` |
| **Branding policy + scanner** | A runnable CI scanner that fails on forbidden references; a full reference report | `scripts/check-branding.mjs`, `docs/branding/REFERENCES-REPORT.md` |
| **Flagship blueprint** | Plain‑English, 11 diagrams, Markdown **and** a rendered HTML edition | `docs/blueprint/Madav-Blueprint.md` / `.html` |
| **Cleanup** | 55 old planning docs archived to `docs/_legacy/`; stray temp/chat files archived; root decluttered | `docs/_legacy/` |

**Verify it yourself (one command):**
```
cd packages/documents && npm install && npm test
```
Expected: `# pass 6  # fail 0`.

## 3. What is NOT done (so you're not surprised)

- **The app is still the legacy JavaScript app.** The mono‑TypeScript migration of `core/`, `src/`, `electron/`, `server/` has **not** happened yet — only the foundation (`packages/`) is seeded. The running app is unchanged.
- **The cloud tier** (gateway, jobs, connector vault, sync) is **designed, not built**.
- **Branding rebrand is located, not finished.** The scanner found **31 hard‑forbidden** references (the legacy "BrainEdge" name, competitor mentions in prompts) and **776 provider mentions** to consolidate into a provider layer. These live in legacy code and get fixed **as each file is migrated** — doing a blind find‑replace across 6,000 files unattended would break the app, so I did not. The report is the exact worklist.
- **Locked junk I couldn't delete:** the Windows host kept `release/` (1.6 GB), `dist/`, `build/` open, so my delete was refused. They're regenerable and git‑ignored. Delete them yourself when nothing is running:
  ```
  rmdir /s /q release dist build
  ```

## 4. How to run & compare both

- **Current Madav** (the control): open the original `Madav` folder and run it as you always do.
- **This rebuild** (`MadavNew`): still runs the same legacy app today (foundation is additive). To run both *at the same time*, the new build needs a distinct app identity (name, data folder, dev port) — that is the **first task of the next session** so the two never clash.

## 5. What's next (Phase 0 continuation, in order)

1. Give this build a distinct desktop identity (name/appId/data dir/dev port) so both apps run side by side.
2. Migrate `core/` to TypeScript behind the shared `@madav/contracts` package (start the single‑source spine).
3. Wire the new Excel engine into the live document path; add golden‑file tests.
4. Work down `docs/branding/REFERENCES-REPORT.md` file‑by‑file during migration until the scanner passes (0 forbidden).
5. Stand up the cloud spine (Redis + Postgres + typed API) — Phase 1.

Full sequence and rationale: `docs/blueprint/` §11 and the architecture docs.

## 6. Saving & pushing to GitHub

Everything tonight is **saved as files** in this folder. The git *commit* didn't run because a stale `.git/index.lock` (copied in from the source repo, dated before the copy) is present and the host blocked me from deleting it. To commit and publish, run this once — it clears the stale lock, commits, and pushes (it will ask for your GitHub login the first time):
```
cd C:\Projects\ClaudeCodeUI\MadavNew
del .git\index.lock
git add -A
git commit -m "Rebuild foundation: charter, clean structure, tested Excel engine, branding scanner, blueprint"
git push -u origin main
```
Prefer me to do it? Just delete `.git\index.lock` yourself (one file) and tell me — I'll stage, commit, and prepare the push. If you'd rather review on a branch/PR before `main`, say so and I'll arrange that instead.

---

## 7. Decisions I made autonomously (correct me anytime)

- **Kept the product name "Madav" everywhere** (the folder name "MadavNew" is temporary and appears nowhere in the product).
- **Branding policy:** strip all identity/competitor/legacy branding; keep *functional* model‑provider and protocol integrations, isolated in a provider layer — because removing those would break real network calls. (See `MADAV.md` → the policy.)
- **Clean from first principles:** seed the new structure and migrate into it, rather than copy‑everything‑then‑delete. "Junk" never enters; nothing is deleted before its replacement is proven.
- **Foundation uses Node's built‑in test runner** (zero native dependencies) so it verifies on any machine.

*This file is updated every build. It is the single source of truth for "where are we."*
