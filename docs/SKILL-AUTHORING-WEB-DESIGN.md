# Skill Authoring on Web — design + scope (parity fill)

**Status: DESIGN ONLY — no code until approved.** Closes the `skills.authoring` PARTIAL row in the scorecard
(today web ships built-in packs read-only; `createSkill`/`deleteSkill`/`setSkillEnabled`/`importSkill*` are
stubbed). Mostly client-side (localStorage); desktop untouched (`window.madav`).

## 1. The key insight — the model-facing path already works
Web already *uses* skills correctly: `bundledIndex()` injects a SKILLS list into the system prompt, and the
`load_skill` tool returns a skill's body (`bundledByName(name).body`). So **authored skills "just work" the
moment they flow into the same `listBundled` / `bundledByName` / `bundledIndex` functions** — no turn-loop or
prompt change needed. This makes authoring a *source* change, not an execution change.

## 2. Scope
**IN (client-side; new localStorage `be.skills` for user skills + `be.skillPrefs` for enable overrides):**
| Method | Today | Web plan |
|---|---|---|
| `listSkills()` | bundled only | bundled **+ user skills**, with `enabled` from `be.skillPrefs` |
| `readSkill(dir)` | bundled only | user skill (with body) or bundled |
| `createSkill(name)` | stub | create a user skill (starter template) in `be.skills`; returns it |
| `saveSkill(dir, {name,description,body})` | **does not exist anywhere** | **new** — persist edits to a user skill (see §4 decision) |
| `setSkillEnabled(dir, enabled)` | no-op `true` | store an override; disabled skills drop out of the index + `load_skill` (works for bundled too) |
| `deleteSkill(dir)` | no-op `{ok}` | delete a **user** skill (bundled are protected) |
| `importSkillZip()` | stub | **feasible** — JSZip is already bundled: pick a `.zip`/SKILL.md → parse frontmatter → store |
| `exportPlay(name)` / `importPlay()` | stub | JSON download / file-picker import |

**OUT (keep desktop-only / graceful):** `importSkillFolder` (needs local FS access to a skills directory), the
AI "forge" drafting flow (`forge*` — separate feature), cross-device sync (later via workspace-sync).

## 3. Storage & wiring
- `be.skills` — `{ [dir]: { dir, name, description, body, user:true, createdAt, updatedAt } }` (user skills; `dir`
  like `user/<slug>`).
- `be.skillPrefs` — `{ [dir]: { enabled:false } }` overrides (lets you bench a bundled or user skill).
- `webSkills.js`: `listBundled()` → rename intent to `listAll()` that merges bundled + `be.skills` and applies
  `be.skillPrefs`; `bundledByName`/`bundledIndex`/`load_skill` consume the merged list unchanged. **Authored +
  enabled skills automatically appear to the model and load.** Disabled skills are excluded.
- Caps: ~25 user skills, body ≤ 20k chars (localStorage-safe).

## 4. The one decision — body editing UX
There is **no `saveSkill`/body-editor anywhere today** (desktop edits skill files on disk). To let web users
actually *write* a skill body, web needs an editor. Two options:
- **A — full authoring (recommended):** add a **web-gated** inline editor (name/description/body textarea +
  Save) to the skill detail view in `Skills.jsx`, backed by a new `saveSkill` method. One shared-file UI touch,
  strictly `isWeb`-gated and verified desktop-neutral (same discipline as everywhere else). Gives real
  create+edit+delete+enable authoring on web.
- **B — methods only, no in-app editor:** wire create(template)/enable/delete/zip-import/play-import-export but
  **no body editing in-app** — users author by importing skill files. Lower risk (no `Skills.jsx` change), but
  create-without-edit is weak UX.

## 5. Risk (low)
- Client-side only; the model use-path already exists and is unchanged → can't regress chat.
- Desktop untouched (`window.madav`); the only shared-file touch (option A) is web-gated + verified.
- No server, no secrets, no new network surface.

## 6. Increments
- **SK1** `webSkills.js`: merge bundled + `be.skills` + `be.skillPrefs` into `listAll`/`bundledByName`/
  `bundledIndex`; pure helpers + tests (merge, override, name-collision, disabled-excluded).
- **SK2** `webBridge.js`: `createSkill`/`saveSkill`/`deleteSkill`/`setSkillEnabled`/`readSkill`/`importSkillZip`/
  `exportPlay`/`importPlay` over the stores; `importSkillFolder` stays desktop-only; bridge-surface guards.
- **SK3** (only if option A) web-gated editor block in `Skills.jsx` + verify (vitest+esbuild+build) + docs/manual
  scenarios.

## 7. Test plan (manual, web)
Create a skill → it appears in the Playbook and in chat (ask something matching it → the model calls
`load_skill` and follows it). Edit the body → the change takes effect next load. Bench it → it disappears from
the model's SKILLS list. Delete a user skill (bundled can't be deleted). Import a skill `.zip` → it's added.
Export/import a play. Confirm the Skills screen is unchanged on desktop.

**On approval I build SK1 (pure merge + tests) first, then stop for a check before SK2/SK3.**
