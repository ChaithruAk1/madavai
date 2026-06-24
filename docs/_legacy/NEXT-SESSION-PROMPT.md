＝＝＝ PASTE EVERYTHING BELOW THIS LINE INTO THE NEW SESSION ＝＝＝

Continue the Madav single-source Projects effort. I'm Chaithru — I'm NOT a developer, so explain in
plain English, give me numbered steps for anything I have to do myself, and follow every rule in
C:\Projects\ClaudeCodeUI\Madav\CLAUDE.md (single-source is MANDATORY: every change goes to ONE shared
source so web AND desktop inherit it; you do all the technical work; you run the tests yourself; you
hand me copy-paste git + restart steps).

FIRST, get your bearings (do this before changing anything):
1. Read C:\Projects\ClaudeCodeUI\Madav\CLAUDE.md (working rules) and
   C:\Projects\ClaudeCodeUI\Madav\MEMORY.md (durable handoff — the "PROJECTS ORCHESTRATOR" section and
   "OPEN / NEXT" list are the live state).
2. Run `git status` and `git log --oneline -6`, tell me in plain English what's committed vs. unpushed,
   and confirm whether commit 3e7f04dc (the repair-loop fix) made it to the live site.

WHERE WE LEFT OFF
We built a deterministic Projects "job engine" that makes reports repeatable instead of flaky:
core/project-job.js + core/project-runner.js + core/model-fit.js. It inspects the data, decides
replay-vs-rebuild, writes/repairs ONE Python script, validates the output, saves the result into a
"Madav Results" subfolder, and remembers the recipe so repeat runs are instant. It's wired and proven
on DESKTOP (deepseek-v4-pro builds my 6-file DTC report end to end). This session we also added a
"Recommended" filter chip, fixed deepseek being wrongly tagged "Needs a recipe", and fixed an endless
"adjusting and trying again" loop that hit flaky/free models (truncated-reply salvage + fail-fast).

THE OPEN DECISION (I will tell you which one — your prior recommendation was Option 1):
The problem I'm unhappy about: the report is built by whatever model I pick to CHAT with, so a weak or
rate-limited model (e.g. llama-3.3-70b-instruct:free) fails — yet the picker still labels it
"Recommended". Options on the table:
 • Option 1 — Dedicated builder + honest badges: Madav ALWAYS builds reports with a known-good model
   (e.g. deepseek-v4-pro) no matter my chat model; use a cloud builder only when I'm already on cloud
   (if I pick a LOCAL/private model, keep the build local); and fix the badge to reflect real
   reliability. Most consistent. (Recommended.)
 • Option 2 — Honest badges only: keep my per-project model choice, but make "Recommended" weigh the
   :free endpoint / model size / task complexity and steer me away from picks likely to fail.
 • Option 3 — Diagnose first: add an error "Details"/log surface, capture the exact failure from a
   free-model run, then fix the proven cause before any architecture change.
Build whichever I pick single-source (core + BOTH surfaces), add tests, run them yourself, and give me
git + restart steps. Note: "honest badges" is just correctness and should happen regardless.

REMAINING ITEMS TO FULLY REALIZE SINGLE-SOURCE (priority order; see MEMORY.md "OPEN / NEXT"):
1. Projects orchestrator: (a) the Option above; (b) WEB PARITY — core/project-runner.js is shared but
   only wired on desktop (electron/session-manager.cjs); wire the web adapters (inspect/author/run/
   persist, via Pyodide or server-side Python) so web runs the SAME engine. This is the biggest
   Projects single-source gap. (c) Push commits and have me run TEST-PROJECTS-E2E.md.
2. M2 RETIRE phase (chat loop): web adopts core/chat-loop.js, then flip MADAV_CORE_CHAT default and
   delete the legacy chat path in agent-openai.cjs (collapses the duplicate chat loops).
3. Office rule → ESM core (banked) — wire alongside the session-manager engine work; re-run the
   PROTECTED Report_March.xlsx scenario.
4. Remaining web-parity items in MEMORY.md (swarms/missions parked; browser automation/Telegram
   vendor-gated; office-doc "build a simpler version" fallback).

REMEMBER: single-source only (never two copies of the same logic/prompt — collapse, don't duplicate);
desktop main-process changes need a FULL restart (Ctrl+C then `npm run electron:dev`), not just Ctrl+R;
a web change only goes live after `git push` (Render rebuilds on push). Ask me before any big
architecture change that shifts cost or touches my data's privacy.

＝＝＝ END OF PASTE ＝＝＝
