# Elevation Protocol

A systematic process for refining visual output from "functional first draft" to "looks hand-crafted." Run these checks in order before finalizing any visual output.

---

## The Protocol

### Level 1 — Structural Integrity Check

**Purpose**: Ensure the foundation is solid before adding polish.

Before evaluating aesthetics, confirm:

- [ ] **Hierarchy is legible in 3 seconds**: Cover the content mentally. Can someone understand the structure without reading anything? If the layout doesn't communicate its hierarchy through form alone, rebuild it.
- [ ] **One dominant element exists**: Is there a clear most-important thing? Not two or three — one. If multiple elements compete, choose one and subordinate the others.
- [ ] **Information is grouped logically**: Related things are visually close. Unrelated things are visually separated. The grouping reflects the semantic structure.
- [ ] **The grid is respected**: Elements align to something. Nothing floats independently unless that independence is intentional and communicative.

**If any check fails**: Stop, restructure, then continue.

---

### Level 2 — Typography Audit

**Purpose**: Typography does most of the hierarchy work. It must be precise.

- [ ] **Type scale is intentional**: Is there a clear scale (e.g., 11/14/18/24/40px)? Or did sizes drift randomly? Define the scale; apply it consistently.
- [ ] **Weight contrast is sufficient**: The jump from body to heading weight should be perceptible (400 → 600, or 400 → 700). If it's 400 → 500, the hierarchy is too subtle.
- [ ] **Line-height is appropriate to size**: Large display text (36px+) should have tight leading (1.0–1.2). Body text should have open leading (1.5–1.7). These are different; they should look different.
- [ ] **Line length is controlled**: Body text columns should not exceed 70–75 characters per line. Wide columns are hard to read; narrow columns feel fragmented.
- [ ] **Label text is consistently small**: All metadata, labels, and secondary information should be at the same small size (11–13px), consistently treated.
- [ ] **Numbers are tabular if in a table or data context**: `font-variant-numeric: tabular-nums` prevents column misalignment.

**The typography sniff test**: Cover the content. Does the type alone communicate the hierarchy? Can you tell which things are headings, which are body, which are labels, from form alone?

---

### Level 3 — Color Audit

**Purpose**: Color should encode meaning or hierarchy, never decorate.

- [ ] **Count active colors**: How many distinct non-neutral hues are in use? The target is 1 (2 at maximum). Neutrals (grays, off-whites, near-blacks) don't count.
- [ ] **Color is used consistently**: If blue means "interactive" on slide 1, it means "interactive" everywhere. No exceptions.
- [ ] **The accent appears sparingly**: If the accent color appears on more than ~15% of elements, it's no longer an accent — it's a base color.
- [ ] **Contrast passes**: All text has at minimum 4.5:1 contrast against its background (WCAG AA). Labels and secondary text at 3:1 minimum.
- [ ] **Nothing is pure black or pure white (for most contexts)**: Use #0F172A instead of #000000, #F8FAFC instead of #FFFFFF. Pure extremes are harsh.

**The color reduction test**: If you converted the design to grayscale, would it still communicate hierarchy clearly? If yes, color is being used correctly (to add meaning on top of an already-clear hierarchy). If no, you're relying on color to do structural work it shouldn't do.

---

### Level 4 — Spacing Audit

**Purpose**: Spacing is the most impactful change with the least apparent effort.

- [ ] **Is all spacing on the 8px grid?** Check every margin, padding, gap. If values like 13px or 7px appear, they're likely errors — round to 8 or 16.
- [ ] **Is there enough breathing room?** The main test: does it feel crowded? If yes, increase section spacing by 50% and re-evaluate. Usually this feels "too much" and is then correct.
- [ ] **Does spacing reinforce grouping?** Elements in the same group should have small spacing (8–16px). Elements in different groups should have larger spacing (32–64px). The ratio between within-group and between-group spacing communicates the structure.
- [ ] **Are the largest spacing values used sparingly?** A section with 120px of padding above and below reads as "important, isolated, breathes." If every section has 120px padding, none of them do.

**The spacing test**: Would someone be able to identify the groups and sections from the layout alone, ignoring all content?

---

### Level 5 — Detail Refinement

**Purpose**: The difference between "looks pretty good" and "clearly was crafted."

Run these in order of impact:

1. **Border radius consistency**: Pick one value and apply it everywhere. Mixed radius values look unfinished.

2. **Icon treatment**: Are all icons the same weight (stroke), same size, same style (filled/outlined)? Inconsistent icon treatment undermines professional credibility.

3. **Shadow usage**: Is shadow used only once or twice, for clear elevation purposes? Multiple shadow styles, or shadows on non-elevated elements, read as amateur.

4. **Hover/interactive states**: For HTML: have all interactive elements received hover states? Default browser behavior on interactive elements signals incomplete implementation.

5. **Loading and empty states**: For dashboards: what shows before data loads? A designed skeleton or placeholder communicates thoroughness.

6. **Edge and corner treatment**: Check corners, edges, and boundaries of the design. Are they intentional? The bottom of a long page, the right edge of a table, the overflow of truncated text — these details signal whether the design was thought through.

7. **The favicon and meta**: For HTML outputs, is there a favicon? A proper page title? These are the edges of the deliverable — they signal completion.

---

### Level 6 — The Signature Move Check

**Purpose**: Every great piece of design has at least one distinctive detail that signals intentionality.

Ask: **What is the one thing in this design that would make someone say "that's a nice detail"?**

If no answer comes immediately, add one:

**Options**:
- A dramatically large number or headline that creates unexpected scale
- A single accent color element, used exactly once, at the exact right place
- An elegant solution to information density (sparklines, bullet chart, small multiples)
- A type treatment that's slightly unusual but completely appropriate (tracked caps, mixed weight in a headline)
- An asymmetric layout choice that creates visual interest without distraction
- A subtle background texture or gradient that rewards close inspection
- A perfectly placed horizontal rule that creates an editorial moment

The signature move should never feel forced. It should feel like the most natural solution to a design problem. If it feels forced, remove it and find the natural one.

---

### Level 7 — The Honest Comparison

**Purpose**: Reality check. Would a professional designer be satisfied with this?

The final test: Imagine the best version of this output. Not an impossible version — the best achievable version given the constraints. How close is the current output?

If the gap is large, identify the one change that would close most of that gap and make it.

Then ask: if this appeared on a portfolio, would you be proud of it? If not, find what's bothering you and address it.

---

## Elevation Patterns by Common Failure Mode

### "It looks like a template"
**Fix**: Find the most prominent repeated pattern and break it deliberately. If every slide has the same layout, redesign one to be radically different. If every card has the same internal structure, remove the card from one element that doesn't need containment.

### "It feels cluttered"
**Fix**: Remove the three elements that contribute least to the communication. If removing them hurts, put them back. If it doesn't, they shouldn't have been there. Then double all margins.

### "The colors are ugly"
**Fix**: Desaturate every color by 20%. If using multiple hues, remove all but one. Use that one sparingly.

### "It looks amateurish"
**Fix**: This almost always comes from inconsistency. Audit: are all instances of the same element type treated identically? Type sizes, weights, colors, spacing values? Inconsistency reads as unplanned; consistency reads as designed.

### "It's boring"
**Fix**: Add one bold move — increase one element's scale dramatically, or use the accent color somewhere unexpected but appropriate. One change creates contrast; contrast creates interest.

### "It's too busy"
**Fix**: Remove everything that doesn't directly serve the single most important thing. Ask of every element: "Does removing this make the most important thing harder to see?" If no, remove it.
