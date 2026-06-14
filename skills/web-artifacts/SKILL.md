---
name: web-artifacts
description: Build rich, interactive web artifacts in Madav — dashboards, calculators, mini-tools, data explorers, multi-section UIs, games. Use when the user wants something they can click and interact with, not just read. Triggers include "dashboard", "interactive", "tool", "calculator", "build me a UI/app", "data explorer".
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# Interactive web artifacts in Madav

Madav renders an artifact as a LIVE PREVIEW the user can use and pop out. Produce the ENTIRE thing as
ONE self-contained file in a single fenced block — `html` for a page/app, `jsx` for a React component,
`svg` for a graphic, `mermaid` for a diagram. On any change, re-emit the WHOLE updated file so the
preview re-renders.

## Build it well
- **One file, no network.** Inline all CSS and JS. If you need a library, pull it from a CDN
  (`cdnjs.cloudflare.com`) in an `html` artifact; otherwise keep it dependency-free.
- **Real state, in memory only.** Use React `useState`/`useReducer` (jsx) or plain JS variables/closures
  (html). Never use `localStorage`/`sessionStorage` — keep all state in memory for the session.
- **Structure for clarity.** A clear header, a focused main area, and obvious controls. Group related
  controls; label everything. Empty states and sensible defaults so it works on first render.
- **Make it look intentional.** One accent color, generous spacing, a readable type scale, hover/active
  states on controls. Pair with the `design-director` skill when polish matters.
- **Data-driven UIs:** draw charts/visuals with inline SVG or a CDN chart lib; compute from in-memory
  data; give the user filters/toggles rather than a static dump.

## Recipe
1. Restate what the artifact must DO in one line.
2. Pick the format (html app vs jsx component vs svg).
3. Build the whole thing in one block — controls wired to state, no placeholders, no TODOs.
4. Offer one or two obvious next tweaks ("want a dark theme / an export button?").

Keep prose outside the block short — the artifact is the deliverable.
