# Technique Catalog

Specific visual techniques organized by what they achieve. These are not abstract principles — they are concrete moves with predictable effects. Select 3–5 per project.

---

## TABLE OF CONTENTS
1. [Hierarchy Techniques](#hierarchy)
2. [Typography Techniques](#typography)
3. [Color Techniques](#color)
4. [Layout & Spacing Techniques](#layout)
5. [Data Visualization Techniques](#data)
6. [Detail & Craft Techniques](#detail)
7. [Techniques by Output Type](#by-output-type)

---

## 1. Hierarchy Techniques {#hierarchy}

### The Scale Anchor
Make one element dramatically larger than expected. A number at 96px when everything else is 16px. A headline at 72px when body is 14px. The scale contrast immediately communicates importance without additional decoration.
**Use when**: You need one element to dominate unambiguously.

### The Weight Ladder
Use typographic weight to create hierarchy without size changes. 700 for primary, 500 for secondary, 400 for body, 300 for tertiary. Size stays consistent; weight does the work.
**Use when**: Space is constrained but hierarchy still needs to be clear.

### The Color Gradient of Importance
Assign a color intensity to hierarchy levels: high importance = high contrast (dark on white), medium = medium contrast (gray), low = very low contrast (light gray). Readers instinctively scan toward contrast.
**Use when**: Dense information layouts where size variation alone isn't enough.

### The Isolation Move
Surround the most important element with more whitespace than anything else. The eye finds the isolated element first. Works even when the element isn't the largest on the page.
**Use when**: The key element is surrounded by supporting detail.

### The Single Red Dot
Use a small, single accent color marker (dot, line, underline) only on the most important element. The rarity of the accent makes it magnetic.
**Use when**: You need to direct attention without shouting.

---

## 2. Typography Techniques {#typography}

### The Serif/Sans Pairing
Combine a humanist sans (Inter, Helvetica, GT America) with a serif (Georgia, Playfair, Tiempos) for warmth and authority simultaneously. Sans for data/UI elements; serif for headlines and pull quotes.
**Specific pairings**:
- Inter + Playfair Display (modern warmth)
- Helvetica Neue + Georgia (editorial authority)
- GT Walsheim + Canela (premium consumer)

### The Monospace Accent
Use a monospace typeface (Courier, JetBrains Mono, IBM Plex Mono) for data labels, technical annotations, or timestamps. Against a humanist sans, it creates a precision signal.
**Use when**: Technical credibility matters; data is being displayed.

### The Tracked Caps Label
All-caps text, tracked at 0.08–0.15em, at 10–11px. Used for section labels, categories, metadata. Creates a visual language for "supporting information" that never competes with primary content.
**CSS**: `text-transform: uppercase; letter-spacing: 0.1em; font-size: 11px; font-weight: 500;`

### The Long-Form Reading Setup
For text-heavy content: 16–18px base, 1.6–1.7 line-height, 60–70 character line-length, generous paragraph spacing (1.5× line-height). The reader should not be aware of the typography — only the content.

### The Display Headline
For hero moments: 48px+, tight tracking (-0.02 to -0.04em), high weight (700–900). Looks like the designer thought about it.
**CSS**: `font-size: clamp(40px, 6vw, 80px); letter-spacing: -0.03em; font-weight: 800; line-height: 1.1;`

### The Number Treatment
Tabular figures (tnum) for all numbers in data displays. Prevents misalignment in tables. Add lining figures (lnum) for numbers that appear in headers.
**CSS**: `font-variant-numeric: tabular-nums lining-nums;`

---

## 3. Color Techniques {#color}

### The 60-30-10 Rule (Strict)
60% neutral background, 30% text/content color, 10% accent. The accent is the only "color" on the page. Everything else is a neutral. This ratio makes the accent feel intentional, not decorative.

### The Tinted White
Instead of #FFFFFF, use a very slightly warm or cool white (#FAFAF8, #F8FAFC, #FFFEF7). Reduces harshness on screens, makes the layout feel more considered.

### The Dark Mode Authority
Near-black background (#0F0F10, #111827, #141414) with light text (#E5E5E5, not #FFFFFF). Use pure white sparingly — only for the most important elements. Creates a premium, technical feel.

### The Monochromatic Scale
One hue, 5–7 shades from near-white to saturated to near-black. No other hue. The sophistication comes from the tonal range, not hue variety.
**Works with**: Blue (trust), Green (growth/health), Slate (neutral authority)

### The Temperature Contrast
Cool background (blue-gray), warm accent (amber, gold, warm orange). Temperature contrast creates more visual tension than value contrast alone. Feels considered.

### Color as Data
In data visualizations: never use color decoratively. Color encodes meaning — category, value, status. Every color use should be answerable with "this color means X."

### The Desaturation Technique
Desaturate all colors by 20–30% from their "pure" form. Saturated colors look digital and cheap. Slightly desaturated colors look printed and considered.
**Example**: Instead of #3B82F6 (pure blue), use #5B8DB8 (desaturated blue)

---

## 4. Layout & Spacing Techniques {#layout}

### The 8px Grid
Every spacing decision is a multiple of 8px. This creates invisible harmony without requiring conscious effort on each decision.
**Values**: 8, 16, 24, 32, 40, 48, 64, 80, 96, 128

### The Generous Margin
Add more margin/padding than feels comfortable. Then add 25% more. Whitespace communicates confidence. Cramped layouts communicate insecurity.
**Rule of thumb**: If you think the padding might be too much, it's probably right.

### The Asymmetric Grid
Offset content within the grid to create tension and movement. A full-bleed image on the left, text occupying the right 60%. Or a headline that starts at column 2 of 12, creating an unexpected indent.

### The Section Break Without a Line
Separate content sections with space (3–4× body line-height) rather than horizontal rules. Borders feel cheap; space feels intentional.

### The Card Restraint
Not everything needs a card. Use cards only when content needs clear containment (is interactive, or is one item in a comparable set). Use background color or whitespace as alternative containment mechanisms.

### The Flush Left Command
For most layouts: align everything to the left. Center alignment is appropriate only for hero headlines, marketing moments, or small UI elements. Left-aligned layouts feel more confident and easier to read.

---

## 5. Data Visualization Techniques {#data}

### The Data-Ink Ratio Maximization
Remove every non-data pixel. No background on the chart area. Minimal gridlines (light gray, not dark). No border around the chart. Let the data speak.

### The Baseline Emphasis
Bold or slightly darker color for the zero line in charts. Lighter gridlines for other intervals. The baseline is always most important.

### The Annotation Instead of Legend
Instead of a legend (which requires eye movement), annotate the lines/bars directly. Place the label at the end of the line, or within the bar. Reduces cognitive load.

### The Comparison Highlight
In a chart with multiple lines/bars: gray everything out, color only the one line being discussed. Forces attention without requiring explanation.

### The Big Number Treatment
When a KPI is the point, make the number enormous (48–72px), its label small (11–12px, tracked caps), and any supporting context (trend, comparison) even smaller. The number is the design.

### The Minimal Table
Tables with: no vertical lines, hairline horizontal rules only between rows (not every row — every 2–3), alternating row tints at 3% opacity, right-aligned numbers, left-aligned text. Remove all other decoration.

---

## 6. Detail & Craft Techniques {#detail}

### The Optical Correction
Numbers, certain letters, and icons appear heavier or lighter than they actually are. Optically adjust: slightly reduce font size of numerals to match cap height, nudge icons up by 1–2px so they sit visually centered.

### The Border Radius Consistency
Pick one border radius and use it everywhere: 4px (sharp, technical), 8px (modern, friendly), 12px (rounded, consumer), 2px (editorial, precise). Never mix radius values without reason.

### The Shadow System
Maximum two shadow types in a composition: one elevation (for floating elements), one for form inputs. Use box-shadow with very low opacity (0.08–0.12) and large blur radius. No colored shadows unless intentional.

### The Focus State
Every interactive element needs a visible focus state. Design it — don't leave it as browser default. Use the accent color as an outline with 2px offset.

### The Loading State Consideration
For data displays: what does this look like before data loads? Skeleton screens with the exact layout but gray placeholder shapes. Never spinners in the center of otherwise empty space.

### The Favicon / Meta Detail
For HTML pages: always include a favicon (even a simple colored square with a letter), a proper page title, and meta description. These signal that the output was thought through to its edges.

---

## 7. Techniques by Output Type {#by-output-type}

### For HTML Dashboards
- Big Number Treatment for KPIs
- 8px Grid throughout
- Color as Data in charts
- Data-Ink Ratio Maximization
- Tracked Caps Labels for section headers
- Dark Mode Authority (if data-heavy, technical audience)

### For Presentations/PPTX
- Scale Anchor for hero slides
- The Isolation Move for key points
- 60-30-10 Color Rule (strict)
- Display Headline technique
- Consistent border radius system

### For HTML Landing Pages
- The Generous Margin
- Serif/Sans Pairing for warmth
- Display Headline for hero
- Temperature Contrast for CTAs
- The Asymmetric Grid for visual interest

### For Reports/PDFs
- Long-Form Reading Setup
- Weight Ladder for hierarchy
- Minimal Table for data
- Tracked Caps Labels for section headers
- The Tinted White for background

### For Data Visualizations
- Data-Ink Ratio Maximization
- Annotation Instead of Legend
- Baseline Emphasis
- Monochromatic Scale
- The Number Treatment (tabular nums)

### For Spreadsheets
- Minimal Table approach
- Color as Data (not decoration)
- Tracked Caps for headers
- Number Treatment
- Section Break Without Lines
