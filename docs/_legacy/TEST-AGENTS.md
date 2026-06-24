# Madav — Agent Ecosystem E2E Test Script

One sitting, ~30 minutes, no connectors required. Tests every layer: solo agents, Relay teams,
Managed (parallel) teams, and a grand finale chaining all three.

## Prereqs
- Full restart (engine changed): `Ctrl+C` → `npm run electron:dev` (web: `npm run build` + restart auth server).
- Model selector on a **strong tool-capable model** (DeepSeek V3/R1, Qwen, GPT-4o-class via OpenRouter). Weak models fail the Designer/Coordinator JSON steps — that's a model limit, not a bug.
- Keep the **[ELECTRON] terminal visible** — engine errors land there.

---

## Scenario 0 — Smoke test: the save path (2 min) ⚠ DO THIS FIRST
The Save bug from earlier is unresolved; everything below depends on saving.
1. Sidebar → Agents → New agent → type a name manually in the top bar → **Save**.
2. **PASS:** button shows "Saving… → Saved ✓"; agent appears in the list; survives app restart.
3. **FAIL:** button shows "Save failed: …" or does nothing → STOP, capture DevTools console (Ctrl+Shift+I) + [VITE] terminal output. Nothing else can be tested.

---

## Scenario 1 — Solo agent: build-by-chat → bench → deploy (5 min)
*Tests: Designer AI generation, Bench, identity, launch, instruction adherence in a real session.*
1. New agent → tell the Designer:
   > An agent called Briefly that turns any text into exactly 3 bullet points, max 15 words each, no intro or outro.
2. **PASS:** Designer replies conversationally; Blueprint fills (name/purpose/instructions); identity face appears.
3. Bench: paste any paragraph. **PASS:** exactly 3 bullets, nothing else.
4. **Put to work** → hero shows Briefly's face + name (NOT "Good morning") → paste a long news article.
5. **PASS:** 3 bullets in the real session; agent chip under composer; × detaches and the next message answers normally.

## Scenario 2 — Solo agent with tools: files + permissions (5 min)
*Tests: capability toggles, cowork routing, tool cards, permission flow.*
1. Agents tab → hire **Quant** from the crew → Put to work.
2. **PASS:** lands in Let's Collaborate (not chat) — files capability routed it.
3. Pick any folder containing a CSV/data file → "Profile the data here and give me the 3 most interesting findings."
4. **PASS:** file tool cards appear (list/read); answer uses real values from the file; permission modal appears for any write (in default mode).

## Scenario 3 — Relay team: the assembly line (7 min)
*Tests: team builder, ordered hand-off, Mission Control sequential flow.*
1. Build 3 quick agents via Designer (one sentence each):
   - **Digger** — "researches a topic and lists the key facts with reasoning"
   - **Drafter** — "turns teammates' notes into a 300-word blog post"
   - **Polisher** — "edits drafts for flow and punch; returns only the final copy"
2. Teams tab → New team "Blog Line" → **Relay line** → add in order Digger → Drafter → Polisher (test ↑↓ reorder + remove once).
3. **Brief the team:** "A blog post on why small businesses should adopt AI agents."
4. **PASS — Mission Control:** stations clear ONE AT A TIME, top to bottom; rail turns accent as each finishes; output snippet stamps on each; the chat answer ≈ Polisher's output (a finished post, not research notes).
5. **PASS — chat:** three "(teammate)" cards with each member's work inside.

## Scenario 4 — Managed team: parallel fan-out, the factory moment (7 min)
*Tests: coordinator planning, simultaneous execution, synthesis.*
1. Build 4 one-line agents: **Adsmith** (ad copy), **Faqster** (FAQs), **Socialite** (social posts), **Mailwright** (launch email).
2. New team "Launch Crew" → **Managed** → add all four.
3. Brief: "Launch kit for BeanBox, a coffee-bean subscription for home brewers."
4. **PASS — Mission Control:** Coordinator station plans first (sub-task list visible) → then **ALL FOUR stations glow at the same time** ("4 agents on the floor") → Assembly merges → one coherent deliverable containing ads + FAQ + social + email.
5. **FAIL modes:** stations run one-by-one = fan-out broke; plan card shows "(planning failed — relay order…)" = model too weak for JSON planning → switch model, retry.
6. *Optional:* pin a different model on two members (Studio → Blueprint) → re-brief → [ELECTRON] log shows different model names per concurrent call.

## Scenario 5 — Grand finale: all three layers in one workflow (8 min)
*Tests: solo + managed + relay chained into one real business deliverable. Sessions are separate by design — outputs chain by paste (agent-as-tool is the roadmap item that automates this).*
**Goal: a market-entry brief for "BeanBox" produced by 8 agents in 3 stages.**
1. **Stage 1 — solo:** run **Briefly** (S1): "3 bullets: who is the target customer for a premium home-brew coffee subscription?" → copy the bullets.
2. **Stage 2 — managed parallel:** brief **Launch Crew** (S4): "Using this customer profile: [paste bullets] — produce the launch kit." → all four fan out with YOUR stage-1 data → copy the deliverable.
3. **Stage 3 — relay:** brief **Blog Line** (S3): "Turn this launch kit into a launch-announcement blog post: [paste deliverable]."
4. **PASS:** final post references the stage-1 customer profile AND stage-2 launch details — proof that data survived solo → parallel team → relay team. You just ran 8 agents across 3 architectures on one mission.

---

## Score card
| # | Scenario | Pass? | Notes |
|---|----------|-------|-------|
| 0 | Save path | | |
| 1 | Solo build/bench/deploy | | |
| 2 | Solo + files/permissions | | |
| 3 | Relay line | | |
| 4 | Managed parallel | | |
| 5 | Combined workflow | | |

## Troubleshooting quick map
- **Designer/Coordinator returns garbage** → weak model: switch in the picker (it's in the Studio header).
- **404 / 401 from provider** → bad active model or key (NIM function 404 = model not on your account).
- **Stations never light** → no `(teammate)` events: check [ELECTRON] for `_teamTurn` errors.
- **Modal never appears but agents stall** → permission queue bug: report immediately with console output.
- **Mission Control missing** → window narrower than 980px (it hides) or an artifact panel is open.
