# Proposal: Simplified Career-Ops Module for BrainEdge

**Status:** Awaiting approval — no code built yet.
**Date:** 2026-06-11

---

## 1. What career-ops is

[santifer/career-ops](https://github.com/santifer/career-ops) is an AI job-search "command center" designed to run inside generic CLI coding agents (Claude Code, Gemini, Qwen). Core capabilities:

1. **Evaluate a job description** against your CV — 6-block A–F analysis (role summary, CV match, level strategy, comp research, CV personalization, interview prep) with a weighted 1–5 score.
2. **Generate an ATS-optimized CV PDF** tailored per offer (HTML template → Puppeteer, plus a LaTeX path).
3. **Scan job portals** for new offers via Greenhouse / Lever / Ashby APIs.
4. **Track applications** in a markdown/TSV tracker with statuses, dedup, follow-up cadence, and rejection-pattern analysis.
5. **Batch-process** many offers in parallel via a shell orchestrator spawning headless CLI workers.
6. **Visualize the pipeline** in a standalone Go terminal UI (dashboard).

## 2. Why it's so complex — and why most of it disappears inside BrainEdge

Career-ops' complexity is almost entirely **compensation for having no host application**. It targets stateless CLI agents, so it must build its own everything:

| Career-ops component | Why it exists | BrainEdge already provides |
|---|---|---|
| Go TUI dashboard (~15 files, separate toolchain) | CLI agents have no UI | React renderer — a pipeline view is just another screen |
| `batch-runner.sh` + state TSV + retry logic | No agent orchestration | Agent runtime (Claude Agent SDK) + task system |
| `merge-tracker / dedup-tracker / normalize-statuses / verify-pipeline / cv-sync-check` (5 scripts) | Data lives in fragile markdown+TSV files written by parallel workers | A single JSON store with CRUD via IPC — no merging, no dedup, no normalization scripts needed |
| 16 modes × 8 languages (~50 markdown prompt files) | Pre-translated prompts per locale | The model handles language at runtime; one prompt with a language preference |
| `followup-cadence.mjs`, cron-style scripts | No scheduler | BrainEdge scheduled tasks |
| Puppeteer for PDF | No rendering engine | Electron's native `printToPDF` — zero extra dependency |
| Nix flake, release-please, multi-CLI compat shims (.claude/.qwen/.agents triplicated skills) | Open-source distribution to many hosts | Not needed for an internal module |

**Verdict: yes — this can be redesigned far simpler.** Roughly 80% of the repo is infrastructure BrainEdge makes redundant. The durable value is concentrated in: the A–F evaluation methodology (prompt content), the 3 ATS provider clients (~4 small .mjs files), the CV HTML template, and the canonical status model (`states.yml`).

## 3. Proposed design: "Career" module in BrainEdge

### 3.1 Data layer (1 new store)

`electron/careers-store.cjs` following the existing store pattern:

- `applications.json` — one record per application: company, role, url, source, status (canonical set from `states.yml`), score, dates (found/applied/last-contact/next-followup), report reference, generated-CV path, notes.
- Profile/CV live as project knowledge files (`cv.md`, `profile.yml` equivalent) inside a dedicated BrainEdge Project — no new storage concept.

### 3.2 One skill, 5 modes (down from 16)

A single `career-ops` skill prompt with consolidated modes:

1. **evaluate** (absorbs auto-pipeline + oferta + deep + pdf): paste JD text/URL → A–F evaluation → score → report saved to project → tailored CV PDF → application record created. Sub-options skip steps rather than being separate modes.
2. **scan** (absorbs scan + pipeline + batch): pull new offers from configured portals via providers, dedupe against the store, optionally auto-evaluate top matches. Parallelism handled by BrainEdge's agent runtime, not shell scripts.
3. **apply**: live application assistant — reads a form, drafts answers from CV + report.
4. **track** (absorbs tracker + followup + patterns): status overview, overdue follow-ups with draft messages, rejection-pattern analysis on demand.
5. **outreach** (contacto): find contacts, draft LinkedIn message.

Dropped as modes (become ordinary chat prompts when needed): training, project, ofertas-ranking, latex. Dropped entirely: 8 language directories — language is a runtime preference.

### 3.3 Reused from career-ops (port nearly as-is)

- `providers/{greenhouse,lever,ashby}.mjs` + `_http.mjs` — clean, small API clients.
- `templates/cv-template.html` + `templates/states.yml`.
- The A–F evaluation rubric and scoring dimensions from `modes/_shared.md` / `auto-pipeline.md` — this is the crown jewel; port the prompt content, not the routing machinery.

### 3.4 UI

One new React screen, **Career Pipeline**: board/table of applications with the same filters the Go TUI offers (status tabs, score sort, top-rated, "no aplicar"), inline status changes, report preview, "evaluate new JD" entry point. Replaces the entire Go dashboard.

### 3.5 Automation

Two optional scheduled tasks using BrainEdge's existing scheduler: daily portal scan, and daily follow-up check that flags overdue applications.

## 4. What is explicitly cut

Go dashboard and toolchain; `batch-runner.sh` and all batch state files; 5 tracker-integrity scripts; TSV/markdown tracker format; 7 of 8 language trees; LaTeX pipeline; Puppeteer; Nix/release tooling; multi-CLI skill triplication. None of these carry functionality the BrainEdge-native design loses — they carry portability and file-format repair work the design makes unnecessary.

## 5. Effort estimate (after approval)

- **Phase 1 — Core (1–2 sessions):** careers-store + IPC handlers; port evaluation prompt as a skill; CV PDF via `printToPDF`; records created on evaluate.
- **Phase 2 — Pipeline UI (1 session):** Career Pipeline screen with filters and status editing.
- **Phase 3 — Scan + automation (1 session):** port providers, scan mode, scheduled scan/follow-up tasks.
- **Phase 4 — Polish (optional):** apply-assist mode, outreach mode, pattern analysis.

## 6. Risks / open questions

1. **Live form-filling (apply mode)** depends on browser automation; in BrainEdge this should route through an MCP browser connector rather than bundling Playwright. Defer to Phase 4.
2. **Portal scanning** relies on public ATS APIs (Greenhouse/Lever/Ashby boards). LinkedIn/Indeed are not covered in career-ops either — no regression, but worth stating.
3. **License:** MIT (verified) — porting code and prompts is permitted with attribution (keep the copyright notice for any substantially copied files).
4. Comp research quality depends on web search availability in the agent runtime — already present in BrainEdge.

---

*Approve to proceed; Phase 1 would start with the careers-store and the evaluation skill.*
