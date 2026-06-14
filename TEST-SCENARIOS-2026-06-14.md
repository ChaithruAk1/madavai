# Madav — Test scenarios (changes since skill modification)
> 2026-06-14. Manual smoke tests for: skill set + scoping, document creation, Use Agents + multi-agent,
> Deep Research, per-process connectors, per-process model selector + Auto routing, sidebar agent strip,
> and the office-rule bug fix. Sandbox was down during dev → none of this was compile-checked; run the
> prereqs first.

## Prerequisites (do these once)
- **P0. Build check.** `npm run build` — must complete with no errors. (Catches any syntax/import slip.)
- **P1. Full restart.** Most of this is Electron **main-process** (agent-openai, session-manager,
  skills-manager, providers, mcp-manager). Stop `npm run electron:dev` (Ctrl+C) and start it again —
  a plain Ctrl+R will NOT load these. (Renderer-only bits do hot-reload, but restart to be safe.)
- **P2. Run the skills PowerShell** (remove 17 + skills_bak; the original Madav doc/builder skills are
  already in `skills/`). Do NOT run the old "copy Anthropic skills" line.
- **P3. Models.** Key at least two models — ideally one small/fast (e.g. an 8–9B `:free`) and one
  strong (70B-class or paid); a vision model helps. **Document creation needs a capable model**, not a 9B.
- **P4. Have ≥1 connector enabled** (Connectors page) and **≥1 agent created** (e.g. "Briefly").

---

## A. Skill set (removal + originals + cache)
- **A1 — Removal took effect.** Models/Playbook skill list shows the trimmed set: no `caveman`,
  `diagnose`, `tdd`, `to-issues/to-prd/triage`, `scaffold-exercises`, `grill-me`, `handoff`, `teach`,
  `prototype`, `write-a-skill`, `setup-matt-pocock-skills`, `setup-pre-commit`, `git-guardrails-claude-code`.
  Present: `tdd-workflow`, `git-workflow`, `grill-with-docs`, the 4 EdgeTrader skills.
- **A2 — Originals present.** `docx`, `pptx`, `xlsx`, `pdf`, `canvas`, `web-artifacts`, `mcp-builder`,
  `skill-creator` appear in the skill list, authored under Madav (open one → no Anthropic text).
- **A3 — discover() cache.** Send several chat turns quickly; nothing breaks. Add a new skill folder,
  wait ~10s, it appears (the 8s TTL means near-instant, not per-turn rescan). *(Behavioral; hard to see
  directly — mainly a no-regression check.)*

## B. Per-process skill scoping
- **B1 — Chat catalog is lean.** Plain Let's Chat, ask a normal question → fast, no skill list bloat.
  *(Perf/behavior: the ~N-skill catalog is no longer injected in chat.)*
- **B2 — Office skills still work in chat.** In Let's Chat ask "make a 2-slide deck about X" on a
  **capable model** → a **download card** appears (officedoc), NOT "copy this into PowerPoint". (Office
  skills are exempt from the chat gate.)
- **B3 — Per-process skill toggle.** `+` menu → Skills: each skill has a switch. Toggle one OFF for
  Chat; it stays ON in Collaborate. Reopen the menu in each surface to confirm independent state.
- **B4 — Work modes keep full catalog.** In Collaborate/Build the model can still auto-pick non-office
  skills (e.g. ask for something matching `git-workflow`).

## C. Document creation (office-rule bug fix + hardened rule)
- **C1 — Main chat builds files.** Capable model, Let's Chat: "create an executive summary pptx, 2
  slides" → **file card**, downloadable, opens as a real .pptx.
- **C2 — Agents build files too (the bug).** Turn **Use Agents ON** in Chat (`+` menu). Ask for a deck
  that routes to an agent → the agent produces a **file card**, not "I can't create files / copy into
  PowerPoint." (This was the systemOverride bug — office rule now travels with every agent.)
- **C3 — No refusal language.** Across C1/C2 the reply must never say "I can't create a file" or "paste
  this into PowerPoint/Google Slides." (Hardened anti-refusal rule.)
- **C4 — Weak-model expectation.** Repeat C1 on a 9B `:free` model → it may still fail/just describe
  content. That's the model limit, not a Madav bug — confirms behavior, sets expectations.

## D. Use Agents toggle + multi-agent
- **D1 — Off in chat = plain text.** Use Agents OFF (default) in Let's Chat. Ask anything that used to
  trigger a handoff → a **direct answer**, NO "Handed off to …" card, no agent question.
- **D2 — On in chat = delegation.** Turn Use Agents ON in Chat. Ask a request matching an agent →
  "Handed off to <agent>" appears and the agent runs inline.
- **D3 — Per-process default.** Confirm the toggle is **on by default** in Collaborate/Build/Projects,
  **off** in Chat. Each surface remembers its own setting.
- **D4 — Multi-agent depth.** With Use Agents on, have an agent whose task implies delegating to another
  agent → a nested handoff occurs (capped at 3 levels; it must not loop forever).
- **D5 — Agents keep connectors.** An agent with its Connectors capability ON still reaches connectors
  even though Chat connectors are off by default.

## E. Deep Research toggle
- **E1 — Off in chat (default).** Let's Chat, ask "what's the latest AI news" → answers from model
  knowledge, **no `deep_research` approval popup**.
- **E2 — On.** Turn Deep Research ON (`+` menu) in Chat, ask the same → it runs deep_research (asks
  approval, then a cited report) and research skills are surfaced.
- **E3 — Per-process memory.** The toggle state persists per surface across reopen.

## F. Per-process connectors (recap)
- **F1 — Master + per-surface.** Connector enabled on the Connectors page (master). In Chat `+` menu its
  switch is OFF by default (chat clean); ON by default in Collaborate. Toggling in one surface does NOT
  disable it app-wide.
- **F2 — No chat connector popups / no stall.** Plain chat with a connector enabled → "Hi" is fast (no
  per-turn connector connect), no `mcp__…` approval popups.

## G. Per-process model selector + Auto routing
- **G1 — Auto entry.** Model picker shows **✨ Auto** at the top; selecting it makes the dock read
  "✨ Auto".
- **G2 — Routing by request.** Chat set to Auto: ask something trivial → reply shows "✨ routed to
  <small/fast model>"; ask for a deck/spreadsheet → routes to a **stronger** model (away from weak free);
  attach an image → routes to a **vision** model.
- **G3 — Per-surface pin.** In Build, pin a specific coder model. Switch to Chat (Auto) and back to
  Build → Build still shows the pinned coder. Each surface remembers its own choice.
- **G4 — Fallback-safe.** With only one model keyed, Auto just uses it (no error). If routing can't
  decide, the default model is used and the run still works.
- **G5 — Transparency.** Every Auto turn shows the "✨ routed to … · <reason>" line under your message.

## H. Sidebar active-agents strip
- **H1 — Solo agent.** Run a single agent → sidebar shows an "Active agents" block with a working
  indicator + step count while it runs; clears when done.
- **H2 — Team mission.** Run a team → sidebar lists each member with avatar (glyph/color) + status
  (○ queued / ● working / ✓ done). Click the strip → jumps to the conversation.
- **H3 — Collapsed sidebar.** Collapse the sidebar → the strip shows just the avatars; no layout break.

## I. Help & Sage (standing rule)
- **I1 — HelpDot.** `+` menu shows a `?` next to **Use Agents** and **Deep Research**; clicking explains
  the Chat/Collaborate/Build behavior, popover sized to the window.
- **I2 — Sage parity.** Ask Sage "what does Use Agents do?" and "why did an agent take over my chat?" →
  it answers from the new knowledge (same depth as the dot).
- **I3 — User Guide.** The "every control explained" section includes Use Agents + Deep Research.

## J. Regression / safety
- **J1 — Live streaming.** Chat replies stream token-by-token (not one buffered dump).
- **J2 — Attachment chips.** Attach a file → the message shows a 📎 chip, not the full file dumped.
- **J3 — officedoc renders.** A ` ```officedoc{…} ` block (even brace glued to the tag) becomes a file
  card, not raw JSON.
- **J4 — No white-screen.** Open every surface (Chat/Collaborate/Build/Projects/Agents/Models/
  Connectors/Consumption) — none throw the "Something went wrong on this screen" boundary.
- **J5 — Model picker fits.** Open the model dropdown on a short window → the search box is visible
  (not clipped); list scrolls inside.

---

## Optional automated checks (need the sandbox/node)
- `node --check` each edited `electron/*.cjs` and a `vite build` for the renderer.
- A tiny unit test for the pure router: import `pickModel` from `src/modelRouter.js`, feed (a) an image
  request → expect a vision-tagged id, (b) "make a pptx" with a weak free + a strong model → expect the
  strong one, (c) a one-model pool → expect that one, (d) empty pool → expect null.
