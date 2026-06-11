# Sage Knowledge — How It Was Built & How to Maintain It

*The complete record: thought process, architecture, the agents that built it, and the
mechanical runbook for regenerating it. Written so ANY model — or a careful human —
can maintain the system without breaking it.*

---

## 1 · The objective

Sage (the floating in-app helper) must answer questions about ANY specific control —
"what is this field / checkbox / window / section?" — like the engineer who built the
app: what it is, why it exists, what actually happens when you use it, plus a small
example when that helps. Previously Sage only had two overview guides (APP-GUIDE.md,
AGENT-GUIDE.md); deep control-level questions were beyond him.

## 2 · The thought process (why this design)

**Constraint 1 — tokens.** A control-level reference covering ~300 controls is far too
big to inject into every Sage question (~80k tokens/question). A language model can
only use facts present in its prompt, so the trick is putting ONLY the relevant facts
there.
**Constraint 2 — performance.** No background processes, no network calls, no
embeddings model, no per-question latency.
**Constraint 3 — weak-model survival (standing project rule).** Future work may use
less capable models. So: the runtime path contains NO model in the loop (retrieval is
plain string scoring); knowledge files are plain markdown anyone can edit; every
failure mode degrades to "Sage behaves like before", never an error.
**Constraint 4 — truth.** Knowledge written from memory drifts; knowledge generated
FROM SOURCE CODE carries exact labels and real behavior.

**Decision:** static knowledge files generated from source (once per release, not per
question) + deterministic local retrieval at question time. Tokens per question rise
only by the few retrieved entries (~1–2k). This is "embed it in help", plus a filter.

## 3 · The architecture (3 pieces)

```
sage-knowledge/*.md          ←  ~300 entries, 8 files by app area (the MEMORY)
        │  bundled at build time (Vite ?raw, import.meta.glob — auto-discovers files)
        ▼
src/sageKnowledge.js         ←  parses entries once, keyword-scores per question,
        │                       +screen boost, returns top ~6 (the RETRIEVER)
        ▼
SageDock.jsx / Agents.jsx    ←  appends retrieved entries to Sage's system prompt
   "Ask Sage" tab               under "CONTROL-LEVEL KNOWLEDGE" (the CONSUMER)
```

**The entry contract** (the retriever splits files on `### ` — keep this stable):
```
### <Screen> · <Exact control label>
aliases: <lowercase synonyms users might say>
What: <one sentence>
Why: <one sentence>
Behavior: <2-3 sentences of REAL behavior — defaults, gotchas, who can see it>
Example: <short concrete example, only when it helps>
```

**Scoring:** question words matched against the entry — heading hit ×4, alias hit ×4,
body hit ×1; +5 if the entry's screen matches the screen the user is currently on;
threshold ≥4 (at least one strong hit); top 6 entries, ≤5,200 chars total.

**Fail-open guarantees:** missing folder → zero entries → Sage unchanged; malformed
entry → skipped silently; retrieval exception → returns "" — by construction this
feature can only ADD context, never break Sage.

## 4 · The files

| File | Covers |
|---|---|
| sage-knowledge/01-settings.md | Settings: Profile, Memory, Terminal access, Extras switchboard, Agent Browser admin, account |
| sage-knowledge/02-agent-studio.md | Agent Studio: Designer, Bench, Blueprint (capabilities, knowledge, memory, craft, versions, autonomy) |
| sage-knowledge/03-agents-tabs.md | Agents tabs: cards, folders, Teams (relay vs managed), Recruiter, Floor, Activity, Mission Control, swarm |
| sage-knowledge/04-models.md | Model picker, Models overview (benchmarks, harness, compare), Speed check, provider config |
| sage-knowledge/05-chat.md | Chat/Collaborate/Build: composer, +/​/​@ menus, attachments, permissions, tool cards, artifacts, recents actions |
| sage-knowledge/06-projects-scheduler.md | Projects (knowledge, folder/GitHub links, categorized chats/tasks), Scheduler (targets, webhooks), Via Mobile |
| sage-knowledge/07-interface.md | Sidebar, top bar, Skills, Connectors, Plugins, Consumption, Terminal panel |
| sage-knowledge/08-community-studio-sage.md | Community, Product requests, Studio launcher, Onboarding, User Guide, Sage's own controls |

## 5 · How it was built (the agent sweep)

Eight parallel agents, one per area file. Each agent received: (a) the exact source
files to read (e.g. `src\components\Settings.jsx`), (b) the entry contract above,
(c) hard rules — exact labels copied from JSX strings, behavior only from real code,
role/platform gates stated, ≤110 words/entry, warm expert voice, and "if you can't
verify it, don't write it — report it instead". Each agent wrote ONE new file and
reported entry count + anything unverifiable. Two agents shared the giant Agents.jsx
read-only (different output files), avoiding write conflicts. Total: ~295 entries.

Why agents read SOURCE and not the running app: source carries every label, default,
cap and condition exactly; a UI walk-through misses gated/admin/edge states.

## 6 · RUNBOOK — regenerating after code changes (mechanical, any model)

**When:** any release that adds/renames/removes user-facing controls. A rename makes
one entry stale — Sage then gives a confidently wrong label, the worst failure mode.

**Per-feature (preferred, tiny):** when building a feature, append/update the matching
entries in the right `sage-knowledge/NN-*.md` file in the same session, following the
entry contract. This is the same standing rule as APP-GUIDE.md maintenance.

**Full or partial sweep (when drift accumulated):**
1. Identify changed components: `git diff --name-only <last-sweep-tag> -- src/components`
   (or just list the components you know changed).
2. For each affected AREA file, run one agent (or do it by hand) with this exact brief:
   - "Read <component files>. Rewrite/patch <sage-knowledge file> entries for the
     controls in those files. Entry contract: [paste §3 contract]. Rules: exact labels
     from JSX strings; behavior only from real code; role/platform gates stated;
     ≤110 words; never invent — omit and report what you can't verify."
3. REVIEW THE DIFF before accepting (wrong knowledge poisons Sage — this is the one
   step never to skip when a weak model wrote the entries).
4. Rebuild (`npm run build` / dev hot-reload) — files are bundled, so changes apply on
   the next build/reload, no other step needed.
5. Smoke: ask Sage "what does the <renamed control> do?" on the relevant screen.

**Adding a NEW area** (a new screen, e.g. a future feature): create
`sage-knowledge/09-<area>.md` with the same header + contract. Nothing else to wire —
the glob in src/sageKnowledge.js discovers it automatically.

## 7 · Tuning knobs (all in src/sageKnowledge.js, safe to adjust)

`k = 6` entries per answer · `maxChars = 5200` context cap · score weights (heading/
alias ×4, body ×1, screen +5) · threshold ≥4 · `MODE_WORDS` (add the screen words when
adding a new app mode). Raising k improves recall and costs tokens linearly.

## 8 · Known limitations (honest)

- **Staleness** is the #1 risk — mitigated by the runbook, not eliminated.
- **Keyword retrieval misses synonyms** outside the alias lists ("tick box" works only
  if an entry lists it). Fix by enriching `aliases:` lines — cheap and targeted.
- **Sage can't see the screen** — he knows everything ON the screen you're viewing
  (screen boost), but not which pixel you point at. DOM-level inspection would be a
  separate future feature.
- **Answer quality still tracks the selected model.** Retrieval guarantees the right
  facts arrive; eloquence is the model's job.
- Entry count grows with the app; at ~2,000+ entries revisit scoring (still fine
  computationally; alias quality matters more then).

## 9 · Future (phase 2, not built): the Librarian

An in-app agent ("Sage Librarian", file access to the repo) that performs §6 steps 1-2
on demand or on a schedule, presenting the diff for admin approval (Repair-Bay
pattern: nothing lands without the human click). Only works on machines with the
source tree; shipped installers update knowledge per release, which is correct anyway.
