# Studio Space — Creativity Proposal (for review)

Studio is where things get *made* and previewed live — it's the most natural home for
playful, divergent, creative features. Below are the proposals, each with: what it is, why
it matters, a concrete example, rough effort, and how it reuses what Madav already has.
Nothing here is built yet — this is for your review. Pick any subset and I'll build it.

---

## 1. Variations mode (divergence before convergence) ⭐ top pick

**What:** Ask for *N* takes on one thing and Studio renders them all at once in a gallery
you compare side-by-side, then fork your favorite.

**Why:** The #1 thing creative tools get wrong is forcing one-at-a-time. Designers think in
options. "Give me 4 heroes" should show 4, not make you re-ask three times.

**Example:** "4 takes on a landing hero for madav.ai." Studio shows a 2×2 grid of live
artifacts. You click one → "make this bolder" → it forks into a new variation set. Keep the
ones you like, discard the rest.

**Reuses:** Studio already renders one artifact live; this is the same render × N in a grid,
plus a "pick & fork" action. The Agent SDK can produce N candidates in parallel
(the swarm pattern already exists).

**Effort:** Medium. The grid + parallel generation is the work; the renderer exists.

---

## 2. Remix tree (non-destructive lineage) ⭐ top pick

**What:** Every artifact remembers its parent. A small visual tree lets you branch a
design, try a wild direction, and snap back to any earlier node — git for creative work,
but visual and zero-jargon.

**Why:** Creativity needs fearless experimentation. People don't take big swings if a bad
idea destroys the good one. A lineage makes every branch safe and reversible.

**Example:** Your hero → branch "neon brutalist" → branch "soft pastel" → you prefer the
pastel's type but the neon's layout → snap back, cross-pollinate. The tree shows the whole
exploration.

**Reuses:** Artifact version history already exists in the message timeline
(`extractArtifacts`). This makes it a navigable graph instead of a linear scroll, with
named branches.

**Effort:** Medium-high (the tree UI + branch model). Highest creative payoff.

---

## 3. Style presets — "design DNA"

**What:** Save a look (palette + type + voice/tone) as a named style — "Aurora Noir,"
"Brutalist," "Soft Pastel" — and apply it to any new artifact in one click.

**Why:** Consistency without re-describing your aesthetic every time. Brand-in-a-button.

**Example:** Save your madav.ai look as "Aurora Noir." Next week: "make a pricing page,
Aurora Noir" → it arrives on-brand instantly.

**Reuses:** Ties directly into the accent/theme system and the **design-director skill**
you already have. A style is essentially a saved prompt-prefix + token set — store it like
room templates (settings).

**Effort:** Low-medium. Mostly a saved-styles store + an "apply style" prefix.

---

## 4. Inspiration seeds ("surprise me")

**What:** A button that seeds Studio with a creative constraint or theme when the blank
canvas is intimidating.

**Why:** The blank page is the enemy of creativity. A constraint is a gift — "make it feel
like a 70s travel poster" unlocks more than "make something nice."

**Example:** Click "Surprise me" → Studio proposes "a dashboard, but as if designed by a
Swiss railway in 1965" and starts from there. Reroll for another.

**Reuses:** A curated seed list + a reroll; pairs with the Studio launcher's starter prompts
that already exist.

**Effort:** Low.

---

## 5. Live co-creation with an agent crew

**What:** Put a *team* in Studio: a **Concept** agent proposes, a **Critic** agent pokes
holes, a **Polish** agent refines — and you watch the artifact evolve through their dialogue.

**Why:** This is the headline that only Madav could ship — it fuses the workforce (agents +
teams) with the canvas (Studio). Creativity as a visible relay, not a black box.

**Example:** "Design a logo concept." Concept sketches three directions, Critic says "two
are clichés, push #3," Polish refines #3 into a clean artifact — all live in the preview,
each step visible.

**Reuses:** Relay/Managed teams + Mission Control already exist; this points their output at
the Studio canvas instead of a chat transcript.

**Effort:** Medium-high. The richest, most "wow" feature; depends on Variations (1) for the
multi-candidate rendering.

---

## 6. Gallery / portfolio

**What:** Everything made in Studio collects into a personal gallery — thumbnails,
favorites, tags — so creative output is browsable, not lost in chat history.

**Why:** Right now a great artifact scrolls away. A gallery makes your work an asset you
return to, reuse, and feel proud of.

**Example:** "Studio → Gallery" shows every page, poster, component, and diagram you've
made, filterable by tag ("logos," "landing pages"), with one-click reopen-and-remix.

**Reuses:** Artifacts are already extracted from the timeline; this persists thumbnails +
metadata and adds a browse view.

**Effort:** Medium.

---

## 7. Export anywhere

**What:** One click from a Studio artifact to: a Workroom's knowledge shelf, a .pptx / .pdf,
an image, or a shareable link.

**Why:** Creation is only half the loop — the output has to *go* somewhere. Make leaving
Studio as fluid as creating in it.

**Example:** Finished a pitch deck mock in Studio → "Send to Launch Marketing room" → it
lands on that room's knowledge shelf, ready for the crew. Or → .pptx for the real meeting.

**Reuses:** The office-doc skill (pptx/pdf/xlsx) and the room knowledge API both exist; this
wires Studio's output into them.

**Effort:** Low-medium.

---

## My recommendation

Build in this order for maximum creative impact per unit effort:

1. **Style presets** (low effort, immediate daily value) — warms up the system.
2. **Variations mode** (the divergence engine — unlocks #5 later).
3. **Remix tree** (the fearless-experimentation backbone).
4. **Live co-creation crew** (the headline, once 2 exists).

…with **Gallery** and **Export anywhere** as the connective tissue that makes Studio output
a lasting, portable asset rather than a throwaway.

The through-line — same as Workrooms and Agents — is **everything belongs to everything**:
a style is reusable, a remix has lineage, an artifact can become a room's knowledge or a
team's brief. Studio becomes the creative front-door to the whole Madav web.

**Tell me which to build** (or "all, in your recommended order") and I'll spec the engine +
UI for each, with a test script like the others.
