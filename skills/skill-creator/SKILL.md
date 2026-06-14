---
name: skill-creator
description: Create or improve a Madav skill — a reusable instruction pack the model loads on demand. Use when the user wants to "make a skill", "write a skill", "add a skill", "turn this workflow into a skill", or improve an existing one.
license: © 2026 Samskruthi Harish. Madav — Proprietary.
---
# Authoring a Madav skill

A Madav skill is a folder with a `SKILL.md`: YAML frontmatter (`name`, `description`) plus a Markdown
body. Madav lists each skill's name + description in the model's catalog; when a request matches, the
model calls `load_skill` to pull in the full body and follow it. So a skill has two jobs: **trigger
reliably** (the description) and **be genuinely useful when loaded** (the body).

## The description is the most important line
- It's the ONLY thing the model sees until the skill is loaded — it decides triggering.
- Lead with what the skill does, then concrete trigger phrases the user would actually type.
- Be specific and bounded. Vague descriptions either never fire or fire on everything.
- Keep it to a few sentences — every skill's description sits in the prompt catalog (cost).

## Write a body that earns its place
- Open with WHEN to use it and the exact mechanism in Madav (e.g. emit an `officedoc` block, produce a
  single-file artifact, call a connector tool).
- Give a short recipe or checklist, not an essay. Concrete steps beat prose.
- Reference Madav's real features by name; don't invent capabilities.
- No placeholders. Show the smallest correct example.

## Keep the set lean and scoped
- Fewer, sharper skills beat many overlapping ones — the whole enabled catalog is injected per turn.
- After adding a skill, scope it per process from the composer `+` menu (e.g. a dev skill → Build only),
  so it doesn't bloat plain chat.
- Test triggering: phrase a request the way a user would and confirm the model reaches for the skill.

## Recipe
1. Name it (short, lowercase). 2. Write the description (what + trigger phrases). 3. Write a tight body
(when, mechanism, recipe, one example). 4. Drop it in `skills/<name>/SKILL.md`. 5. Test the trigger; scope it.
