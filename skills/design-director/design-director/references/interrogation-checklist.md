# Design Interrogation Checklist

Before producing any visual output, interrogate the brief. These questions surface the design constraints that determine every subsequent choice. You don't need to ask the user — derive answers from context, then make committed decisions.

---

## 1. Purpose Interrogation

**What is this for?**
- To **inform**: Accuracy and scannability matter most. Hierarchy serves comprehension.
- To **persuade**: Emotional resonance and confidence matter most. Visual authority carries weight.
- To **impress**: Aesthetic distinction matters most. The medium is part of the message.
- To **reference**: Density and navigability matter most. Users return to it repeatedly.
- To **sell**: Clarity of value proposition and call-to-action matter most.

**What action should the viewer take after seeing this?**
Design everything to make that action feel natural and obvious.

**What's the single most important thing?**
If the viewer remembers one thing, what must it be? Everything else serves this.

---

## 2. Audience Interrogation

**Who sees this?**
- **Executive/C-suite**: Signal authority and confidence. Dense data should be pre-interpreted. Fewer words, more clarity.
- **Technical audience**: Precision and completeness matter. They spot inconsistency. Dense information is welcome if well-organized.
- **Consumer**: Emotional connection and simplicity. Low tolerance for friction. Visual warmth helps.
- **Internal team**: Efficiency over beauty. They need to act on this. Navigation and scannability first.
- **Mixed**: Default to the most demanding audience for clarity; the least demanding for warmth.

**What is their context when viewing this?**
- Projected on a screen in a meeting room (contrast, large type, minimal text)
- Individual screen, focused review (can handle more density, fine type)
- Mobile / quick scan (vertical layout, extreme hierarchy)
- Printed (no pure black backgrounds, sufficient contrast without screen gamma)

**What do they already know?**
Don't explain what they know. Lead with what they need.

---

## 3. Tone Interrogation

**What emotional register should this hit?**

Pick one primary, one secondary:
- **Trustworthy**: Calm palette, structured layout, clean typography, no visual tricks
- **Bold**: High contrast, strong typographic weight, confident color use
- **Minimal**: Radical whitespace, restraint, every element essential
- **Warm**: Rounded forms, softer palette, humanist typefaces
- **Technical/Precise**: Monospace accents, grid rigidity, cool palette, data-forward
- **Premium**: More whitespace than necessary, quiet confidence, no clutter
- **Urgent**: High contrast, compressed spacing, action-oriented hierarchy

**What brands or references would the audience trust?**
This guides the design language. If they trust Apple, use Apple's visual vocabulary. If they trust Bloomberg, use editorial authority.

---

## 4. Content Interrogation

**What type of content dominates?**
- **Data/numbers**: Typography and hierarchy are critical. Numbers need tabular alignment. Color encodes meaning.
- **Text-heavy**: Reading experience is the product. Type scale, line-length, line-height matter enormously.
- **Visual/image-forward**: Layout serves the visuals. Grid and whitespace frame them.
- **Mixed**: Establish a clear primary content type and let others support it.

**What is the information hierarchy?**
Literally rank the content: Level 1 (most important), Level 2, Level 3, Level 4 (supporting/reference). Then design levels, not items.

**What should NOT be in this output?**
Often more important than what should be included. Removing elements is a design act.

---

## 5. Medium Interrogation

**What format is this?**
- HTML/web artifact: Full CSS control. Can use web fonts, custom properties, precise layout.
- PPTX: Slide constraints. Think in slides, not pages. Master slides matter.
- PDF: Static, print-influenced. Generous margins. No hover states.
- XLSX: Grid-constrained. Color and typography within cell formatting limits.
- Dashboard: Data first, interaction second. Load states matter.

**What constraints exist?**
- Screen size / aspect ratio
- Brand colors or typefaces required
- Accessibility requirements
- Dark or light mode preference

**What's the output context?**
Will this be shared as a file, embedded in a page, presented on a large screen? Each context changes the design requirements.

---

## 6. Design Direction Decision

After answering the above, make three committed decisions before touching any code or content:

**Decision 1 — Visual Tone**: [e.g., "Calm authority with one bold typographic moment"]

**Decision 2 — Color Strategy**: [e.g., "Near-white background, dark charcoal text, single blue accent used only for the key metric"]

**Decision 3 — Typographic Approach**: [e.g., "Inter for data labels, Georgia for headlines to add warmth to a data-heavy layout"]

These three decisions filter every subsequent choice. When in doubt about a design decision, return to these three and ask: does this serve them?
