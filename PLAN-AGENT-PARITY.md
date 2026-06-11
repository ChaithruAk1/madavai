# Plan: Frontier-grade agent quality on ANY model
*How to make Madav's agents and Let's Collaborate perform like the best frontier agent harnesses even when running on external/open models. Written June 2026.*

> **STATUS 2026-06-10: BUILT — all five waves.** Engine: `electron/harness.cjs` (discipline layer), `electron/model-stats.cjs` (measured tool discipline + harness score), wired through `agent-openai.cjs`, `session-manager.cjs` (`_harnessFor`), `mission-runner.cjs`; web mirror `src/shared/harness.js` → `webBridge.js` (Wave-1 core); per-agent toggles in Studio → Blueprint → "Craft" (thorough / reviewer / text-protocol / economy model); harness score surfaced in Models Overview expanded rows. Plain-English explanation: **HARNESS.md**. Deviations from the plan: 1.3 compaction uses heuristic context windows (catalog hookup later); 3.1 uses live mission stats (no separate gauntlet yet — §8's Test-Center gauntlet remains the open follow-up); 2.3 read-before-edit resets on app restart (per-process memory).

---

## 1. The honest frame

An agent's quality = **model capability × harness quality**. Madav can't change the first factor (users bring their own models), but the harness is where frontier products earn most of their perceived "magic" — and Madav's current loop (`electron/agent-openai.cjs`) is a *correct* but *minimal* harness. Closing the harness gap is high-leverage: the same DeepSeek/Qwen/Llama model behaves dramatically better inside a disciplined loop.

What a frontier harness actually does that a minimal loop doesn't:

| Lever | Minimal loop (Madav today) | Frontier harness |
|---|---|---|
| Context | grows until it breaks (cap 200 msgs) | budgeted, compacted, summarized mid-mission |
| Planning | implicit, in the model's head | explicit working plan the loop enforces |
| Tool failures | error string returned, model may flail | repair, reflect, bounded retry policy |
| Edits | string replace, hope it matched | uniqueness checks, re-read, diff verification |
| Done-ness | model says "done" | evidence required (build/test/read-back) |
| Exploration | sequential tool calls | parallel read-only fan-out |
| Weak models | same prompt as strong models | per-model adaptation (few-shot, JSON fallback) |
| Tool results | raw dump into history | tiered truncation + later compression |

## 2. Wave 1 — Reliability (do first; biggest perceived jump)

**1.1 Tool-call repair.** Malformed JSON arguments are the #1 weak-model failure. Add a repair ladder before giving up: (a) tolerant parse (trailing commas, single quotes, unescaped newlines); (b) regex-extract the largest `{...}` block; (c) one silent re-ask: feed back "your tool call arguments were invalid JSON: <error> — call the tool again, arguments only". Each repaired call is logged so the Track Record can score models on tool discipline.

**1.2 Edit-tool hardening.** `edit_file` replaces the *first* occurrence — silent wrong-spot edits on repeated code. Change to: fail loudly when `old_string` matches 0 or >1 times (tell the model to include more surrounding context), and after every successful write/edit, return the modified region (±3 lines) in the tool result so the model *sees* what it did. This single change eliminates most "the agent said it fixed it but didn't" reports.

**1.3 Context compaction.** At ~70% of the model's context window (estimate via chars/4 against a per-model window from the OpenRouter catalog, fallback 32k): pause, run a single summarization call ("compress this mission history into: goal, decisions made, files touched + their current relevant state, what remains"), then rebuild history = system + summary + last 4 turns. This is exactly what `/compact` does in the CLI — make it automatic in all agent modes. Without this, long Collaborate missions on small-window models degrade into amnesia.

**1.4 Bounded error recovery.** On a failed tool (non-zero exit, exception): inject a one-line reflection requirement — "state in one sentence why it failed, then try a DIFFERENT approach; after 2 consecutive failures of the same tool on the same target, stop and report". Prevents both flailing loops and silent give-ups. Cap identical-call repetition (same tool + same args twice in a row → blocked with a notice).

**1.5 Smart tool-output truncation.** `run_bash`/read results currently get flat caps. Use head+tail windows (first 80 lines + last 40 + "(N lines omitted)") — build logs and test output put the verdict at the END, which flat caps cut off.

## 3. Wave 2 — Method (the "thinks like a senior engineer" feel)

**2.1 Working-plan scaffold.** For multi-step missions, require an explicit plan the loop tracks: a lightweight `set_plan` tool (array of steps, each pending/doing/done). Render it as a live checklist card in the chat (web + desktop — it's just a UiEvent). The system prompt instructs: update the plan as you go; you may not declare the mission complete while steps are pending. Weak models benefit the most — the plan externalizes state they'd otherwise lose.

**2.2 Evidence-based completion.** In code/cowork modes, the loop appends a completion gate to the system prompt: "Before your final answer: if the project has a build or test command you discovered, run it and report the result; if you edited files, re-read the changed regions and confirm they contain your changes." Cheap, mechanical, transformative for trust.

**2.3 Explore-before-edit enforcement (code mode).** Already prompted; make it structural — the loop refuses `write_file`/`edit_file` on a file the agent hasn't read this mission (tool result: "read it first"). One Map of read paths per mission.

**2.4 Self-review for deliverables.** For long text/code deliverables (>150 lines), one optional extra turn: "review your deliverable against the brief; fix anything missing" — gated by a per-agent "thorough mode" toggle since it costs a call.

## 4. Wave 3 — Per-model adaptation (Madav's unique advantage)

No competitor optimizes per-model because they each ship one family. Madav sees hundreds of models — exploit it:

**3.1 Capability profiles.** Keyed by model id: context window + pricing (OpenRouter catalog), native tool-calling support (catalog `tools` flag), and *measured* tool discipline (repair rate + mission success from agent history + Test Center). Stored like the speed-test results; shown as a "harness score".

**3.2 Prompt adaptation tiers.** Tier A (strong tool-callers): current prompts. Tier B (erratic): add 2 few-shot tool-call examples + re-pin the system prompt every ~10 turns (drift guard). Tier C (no native tool-calling at all): JSON-in-text protocol — the loop instructs ````tool {"name":..., "args":...}```` blocks and parses them, unlocking agents on *every* chat model, including most local ones. Tier picked automatically from the profile; user-overridable per agent.

**3.3 Data-driven recommendations.** The Models pages already measure speed/quality. Add the harness score → "agent-ready" badge becomes measured, not name-heuristic. The Designer can then warn: "this model scores 4/10 on tool discipline — pick X for agent work."

## 5. Wave 4 — Context engineering

**4.1 Repo map.** On folder attach, build a one-shot compressed tree (dirs, file names, sizes, top-level exports for code files ≤ a budget) injected once — the agent stops wasting turns on `list_dir` spelunking. Reuse `knowledge-retrieval.cjs` chunking for "which files mention X" answers without full reads.

**4.2 Stale-result compression.** After compaction (1.3), old tool results are the bulkiest, least useful tokens. Replace tool outputs older than N turns with one-line digests ("read src/App.jsx — 730 lines, contains mode routing") while keeping the latest result per file intact.

**4.3 File-state ledger.** Track files written/edited this mission (path → last content hash). Re-reads of unchanged files come from the ledger for free; the ledger digest feeds compaction summaries.

## 6. Wave 5 — Multi-model orchestration

**5.1 Read-only parallel scouts.** Exploration (searches, multi-file reads) fans out to 2-3 parallel calls on a *cheap* model, synthesized by the main model — the swarm pool already exists in `mission-runner.cjs`. Big wall-clock win on large repos.

**5.2 Reviewer pattern.** Optional team-of-two: builder model + cheap reviewer model that checks each diff against the brief ("approve | flag: reason"), one round max. Catches weak-model blunders for cents. Surfaces in Mission Control as a station.

**5.3 Right-model-for-the-step routing.** Coordinator missions already pin models per member; extend the same idea inside one agent: planning/synthesis on the strong model, bulk grunt reads on a cheap one. Off by default; a per-agent "economy mode".

## 7. Quick wins (each ≤ a day, independent)

- Re-pin system prompt every 10 turns for Tier-B models (drift guard).
- Same-call-twice loop breaker (4.4 above, trivially small).
- Head+tail truncation (1.5).
- Read-before-edit gate (2.3).
- max_tokens floor for final answers so weak providers don't clip deliverables.
- Log every repair/retry to agent history → the measurement layer starts accumulating from day one.

## 8. Measurement (so progress is real, not vibes)

Add an **agentic gauntlet** to the Test Center: ~10 scripted folder missions (create/edit/multi-file refactor/search/build-fix) with mechanical pass checks (file exists, contains X, build green). Run per model → harness score (3.1). Every wave above should move this number; if it doesn't, revert it. ~30-60 model calls per full gauntlet — run on demand, cheap model default.

## 9. Honest limits

A 7-8B local model will not become Fable — harness work narrows the gap (typically: unusable → useful for bounded tasks), it doesn't erase model ceilings. The biggest jumps come from Waves 1-2 (reliability + method), which are model-agnostic and cheap. Waves 3-5 are differentiators no single-model competitor can copy without rebuilding their product around model plurality — that's Madav's moat.

**Suggested order:** 1.1 → 1.2 → 1.3 → 2.1 → 2.2 → quick wins → measurement gauntlet → Wave 3 → 4 → 5.
