# The Madav Harness — how your agents work like a frontier AI

*Built June 2026. This document explains, in plain English, the discipline layer that now wraps every Madav agent. Engine code: `electron/harness.cjs` + `electron/agent-openai.cjs` (desktop), `src/shared/harness.js` + `webBridge.js` (web), `electron/model-stats.cjs` (measurement).*

---

## The idea in one paragraph

An agent's quality = **the model's brain × the harness around it**. Madav can't ship a frontier brain — you bring your own models. But most of what makes a frontier agent feel "magical" isn't the brain at all: it's the workplace discipline around it. Plans before action. Evidence before "done". Repairing small mistakes instead of collapsing. Never running out of memory mid-job. That discipline is now built into Madav itself, so **every model you plug in — including small local ones — works inside the same system that makes the best agents good.**

---

## What's always on (free — no extra model calls)

**1. Sloppy tool calls get repaired, not rejected.** Weak models constantly hand in "forms with typos" — JSON with single quotes, trailing commas, raw newlines. The harness fixes these silently. If a call is truly unreadable, the agent is asked once to redo it properly — and every repair is *recorded* (see Measurement below).

**2. File edits can't hit the wrong spot anymore.** Before: "replace this text" changed the *first* match, even when the same text appeared in five places — silent wrong-spot edits. Now: an ambiguous match is refused with instructions to be more specific, and after every successful edit the agent is shown the actual changed lines. An agent can no longer say "fixed!" without the fix being real and visible to itself.

**3. Read before you write.** The engine refuses to edit or overwrite any file the agent hasn't read this mission. Not a polite suggestion in the prompt — a hard gate in the engine.

**4. No more amnesia on long jobs.** When a mission approaches ~70% of the model's memory window, the harness pauses, writes working notes (goal, decisions, files touched, what remains), and continues from the notes — like a good meeting secretary. You'll see a small "compact_context" card in the chat when it happens. Old tool outputs also get compressed automatically as they age.

**5. No more flailing.** A failed tool call now forces a one-sentence reflection and a *different* approach. Two failures in a row on the same target = stop and report honestly. The exact same call repeated three times = blocked (the result won't change).

**6. Logs are cut smartly.** Build and test output used to be chopped at a flat limit — which cut off the verdict at the END. Now the harness keeps the head AND the tail.

**7. A visible working plan.** For multi-step tasks, agents create a checklist you can watch live (a `set_plan` card), tick steps off as they work, and **cannot declare the job complete while steps are pending** — the engine sends them back.

**8. Evidence before "done".** In folder missions the rules require: if a build/test command exists, run it and report the result before the final answer; confirm edits from the actual tool results. Never claim unverified success.

**9. A project map on arrival.** When an agent starts a folder mission it receives a compressed map of the project (directories and files) — no more wasting half its steps wandering around with list_dir.

---

## What you can switch on per agent (Studio → Blueprint → "Craft — quality vs cost")

These cost extra model calls, so they're opt-in per agent:

- **Thorough mode** — before delivering a final answer, the agent re-reads the original request and its own answer once, and fixes anything missing. One extra call per mission. Best for writing/analysis agents.
- **Reviewer** — after every file change, a second model checks the change against your brief and answers "approve" or "flag: reason". Flags are fed straight back to the working agent. Cheap insurance against weak-model blunders.
- **Text-protocol tools** — for models with **no native tool support at all** (most local models): the harness switches to a text-based tool protocol, which means *agents now run on virtually every chat model in existence*. This also kicks in automatically if a provider rejects tool calls.
- **Economy model** — pin a cheap model (`profileId::model-id`, same shape as a member pin) and the agent's scouts and reviewer run on it instead of the main model. Strong brain for thinking, cheap brain for grunt work.

**Parallel scouts** (on by default in folder missions): instead of exploring a big project one search at a time, the agent can fan out up to 3 read-only questions to parallel scouts and get summarized findings back in one step. Scouts are read-only *by construction* — they physically have no write/edit/shell tools.

---

## Measurement — progress is real, not vibes

Every agent mission now measures the model that ran it: how many tool calls, how many needed repair, how many re-asks, failures, missions finished vs stalled. This builds a per-model **harness score (0–10)** you can see in **Models Overview → expand any row → "Harness"**. It says "not measured" until a model has ≥10 real tool calls — no fabricated numbers, ever.

The score feeds back into the engine automatically: well-behaved models are left alone (Tier A); models with sloppy-JSON history get discipline examples and periodic reminders (Tier B); models that can't do native tool calls switch to the text protocol (Tier C). **This per-model adaptation is Madav's moat — single-model products (ChatGPT, Claude, Gemini) can't copy it without rebuilding around model plurality.**

---

## Where things run

| Layer | Desktop | Web |
|---|---|---|
| JSON repair, loop breaker, reflect-on-error, head+tail logs, stale-result squash | ✅ | ✅ |
| Edit hardening + read-back diffs | ✅ | ✅ (the web agent already returned diffs) |
| Plan tool, compaction, repo map, tiers, scouts, reviewer, thorough, measurement | ✅ | Desktop engine only (today) |

The shared algorithms live in twin files (`electron/harness.cjs` ↔ `src/shared/harness.js`) — change one, change both.

---

## Security (deliberate, reviewed)

- **No new permission paths.** Every harness feature runs inside the existing permission gates: plan mode is still read-only, `noShell` still strips the shell at three layers, per-agent autonomy still applies. `set_plan` and `explore_parallel` touch no files and no network beyond the existing tool routes.
- **Text-protocol injection is closed by design.** Tool blocks are parsed **only from the assistant's own text — never from tool results or web page content** — so a hostile page cannot inject tool calls into an agent reading it. This rule is documented at the top of both harness files; keep it when editing.
- **Scouts are read-only by construction** (allowlist of 4 read tools), not by prompt.
- **The measurement store holds counters only** — no prompts, no file contents, no keys, nothing sensitive (`%APPDATA%/madav/model-stats.json`).
- **Protecting your code** (your question about hacking): the engine improvements ship inside the same protections as the rest of Madav — value lives server-side (auth gate, server-side quiz, revocable CLI tokens), the client bundle is obfuscated, secrets are OS-keychain encrypted, and the 21-point hardening from SECURITY-REVIEW-2026-06-10.md (sandboxed artifacts, SSRF blocklist, timing-safe compares, electron fuses) is unchanged by this work. The honest frame remains: a desktop client always belongs to its user; defense = keep the valuable parts on the server and revocable, which Madav already does.

---

## What to expect, honestly

A 7B local model will not become a frontier brain — the harness narrows the gap (typically: unusable → genuinely useful for bounded tasks), it doesn't erase model ceilings. The biggest felt jump is on **mid-tier models** (DeepSeek, Qwen, Llama-class): same model, dramatically fewer wrong-spot edits, fewer stalls, fewer false "done"s. Frontier models gain mostly on **long missions** (compaction) and **large repos** (map + scouts).

Costs: the always-on layer is free (it *saves* tokens via compression). Compaction ≈ 1 extra call on very long missions. Thorough = +1/mission. Reviewer = +1 small call per file change. Scouts = +N small calls when used — point them at an economy model.

## Verifying it works (after `npm run build` + full restart)

1. Folder mission, any model: ask for a 3-file change → expect a **set_plan card** first, then edits showing **changed-region read-backs**, then a build/verify step before "done".
2. Weak model on OpenRouter: watch repairs accumulate → Models Overview → expand the row → **Harness** starts at "measuring…" and becomes a score.
3. A model with no tool support (most local): agent missions now work via the text protocol instead of failing.
4. Turn on Reviewer + an economy model for one agent: edit flags appear as small "reviewer" cards.
