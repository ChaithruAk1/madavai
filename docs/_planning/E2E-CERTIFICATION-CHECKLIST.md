# Madav — One‑Sitting E2E Certification Checklist

Run this top to bottom in one session to certify the whole app. Tick each box; if anything fails, stop and note it. Reflects the current build (native agent default‑on, old Projects engine removed, one clean agent loop, document pipeline intact). The detailed per‑feature reference is `E2E-TEST-SCRIPT.md`; this is the single runnable pass.

**Legend:** ✅ = expected pass. Steps are PowerShell unless noted. "Strong model" = Claude Sonnet/Opus, GPT‑4/4o/5, Gemini Pro, DeepSeek (anything `isDeckCapable`). "Weak model" = Haiku, Flash, small/<20B.

---

## Part 0 — Build + automated gate (≈5 min)

- [ ] **0.1 Install & build.** In `MadavNew`: `npm install` then `npm run build`. ✅ Renderer builds with no errors; the `deckWorker` chunk bundles (the only remaining doc worker after the xlsx/docx/pdf bespoke retirement).
- [ ] **0.2 Automated test suite.** `npm test` (or `npx vitest run`). ✅ Green. In particular: `tests/parity/rules-parity.test.js` passes — it now asserts **all three** office‑rule copies (`shared/office-rules.cjs`, `src/office.js`, `core/office-rules.js`) are identical, so the rule can never silently drift.
- [ ] **0.3 Launch.** `npm run electron:dev`. ✅ App opens; new **MADAV** wordmark + M logo show; the "built to think with you." tagline sits under the wordmark.

## Part 1 — Documents in Let's Chat (the core capability)

Do these with a **strong model** first, then spot‑check one with a **weak model**.

- [ ] **1.1 Plain chat.** Ask any question. ✅ Normal streamed answer.
- [ ] **1.2 Excel.** "Make me an Excel model of a 12‑month SaaS budget with an MRR chart." ✅ An **officedoc** card appears → Download → opens in Excel: styled sheet, KPI tiles, a real native chart, numbers present.
- [ ] **1.3 Word.** "Write a 1‑page Word brief on our Q3 plan." ✅ Card → Download → styled .docx with headings, sections, formatting.
- [ ] **1.4 PDF.** "Same brief as a PDF." ✅ Card → Download → styled .pdf.
- [ ] **1.5 PowerPoint (strong = bespoke).** "Build a 6‑slide investor deck on the AI market." ✅ A **deck** card appears → it runs the model's PptxGenJS code in the sandboxed worker → Download → a dense, designed .pptx (dark slides, charts, icon badges).
- [ ] **1.6 PowerPoint (weak = template).** Switch to a weak model, ask for a deck. ✅ You get the **template** path (officedoc JSON → clean templated slides), not code — and it still produces a valid .pptx (weak models don't write code).
- [ ] **1.7 Change request.** Ask "make the deck dark blue and add a risks slide." ✅ A fresh full card re‑renders with the change (never a diff/snippet).

## Part 2 — Let's Collaborate (folder room)

- [ ] **2.1 Pick a folder** with a small `.xlsx`/`.csv` in it.
- [ ] **2.2 Read + compute.** "Open the spreadsheet and total the amount column." ✅ It reads the file, computes the real number, answers.
- [ ] **2.3 Save into folder.** "Build a summary report and save it here." ✅ The file is written **into the folder** (not just a download); an **Open / Show‑in‑folder** card appears; the file is really on disk.

## Part 3 — Projects (the clean agent loop — recently changed)

This is the area we just rebuilt — verify the router is gone.

- [ ] **3.1 File‑listing is NOT a report.** In a project linked to a data folder, with a **strong model**, ask: *"List the files in this folder and tell me which is biggest."* ✅ It simply lists the files and names the biggest. ❌ It must NOT spin up a report / show column‑join errors (that was the old router — now removed).
- [ ] **3.2 Report on request.** Ask: *"Build a report from this data and save it here."* ✅ The model reads, computes (running real code), saves the file into the project folder, and the Open/Download card appears.
- [ ] **3.3 Weak‑model honesty.** Switch to a weak model and repeat 3.2. ✅ It either does a simpler version or you're steered toward a "Recommended" model in the picker — no hidden rigid pipeline, no silent stall.

## Part 4 — Agent (Studio / custom agents)

- [ ] **4.1 Run a built‑in agent** (e.g., Analyst) on a small task. ✅ It uses tools and answers.
- [ ] **4.2 Agent makes a file.** Ask an agent to produce a spreadsheet or deck. ✅ The same office card appears — agents share the document capability.

## Part 5 — Native Anthropic agent is now the DEFAULT

- [ ] **5.1 Default path.** With a **Claude** model in a folder room, run a tool task (e.g., 2.2/3.1). ✅ Works normally — it's now running on **Madav's own native engine**, not the Claude Agent SDK.
- [ ] **5.2 Escape hatch.** Quit, set `$env:MADAV_NATIVE_AGENT="0"`, relaunch, repeat. ✅ Still works (this falls back to the SDK). Then unset it (`Remove-Item Env:\MADAV_NATIVE_AGENT`) and relaunch to return to the native default.

## Part 6 — Flag‑guarded features (each is OFF by default)

Turn each on, test, turn off. All are env vars on desktop (set before launch).

- [ ] **6.1 RAG** — `MADAV_KNOWLEDGE=1`. Put a couple of docs in a project; ask something only answerable from them. ✅ The answer uses the doc content. Off again → no change to normal chat.
- [ ] **6.2 Crash reports** — `MADAV_CRASH_REPORTS=1`. ✅ Crash details are captured **locally** only (no network). Confirm nothing is sent out.
- [ ] **6.3 RBAC** — `MADAV_RBAC=1` (cloud/gateway only, if you're running the server). ✅ Roles are enforced (owner/admin/member/viewer); with the flag OFF behavior is the legacy single‑workspace. **Do not** flip this on live until the per‑user‑workspace cutover is reviewed.

## Part 7 — Resilience & branding

- [ ] **7.1 App survives errors.** Trigger a deliberately bad action (e.g., point at a missing file). ✅ You get a friendly error; the app does NOT crash or lose your chats (global crash guard).
- [ ] **7.2 Light theme.** Switch to light theme. ✅ The tagline turns brand blue (`#0849F8`) and the default accent becomes `#0849F8`; dark theme keeps the gradient.
- [ ] **7.3 App icon.** Check the taskbar/window icon is the new **M** (a fresh installer build, `npm run electron:build`, is needed for the pinned/taskbar icon to fully refresh).

## Part 8 — Sign‑off

- [ ] All boxes above are ✅.
- [ ] Commit anything still uncommitted (e.g., the native‑agent default flip): `git add -A && git commit -m "..."` then `git push` (push deploys the web side via Render).

**If all green:** the build is certified end‑to‑end for the current feature set. Remaining work beyond this checklist is *deployment + enablement* (cloud infra, turning flags on in prod, SSO/SCIM) and the optional **Phase 4 E2EE** — none of which is a code gap, all gated on your go‑ahead.

---

### Known not‑covered here (by design)
- **Phase 4 E2EE "Private" mode** — only the crypto foundation exists; full feature gated on your approval + external crypto review.
- **Cloud deploy / production flag enablement / SSO‑SCIM** — environment + decisions, not code to test on the desktop build.
- **Full Claude Agent SDK removal** — staged; execute after Part 5 passes (see `AGENT-LOOP-UNIFICATION-SCOPE.md`).
