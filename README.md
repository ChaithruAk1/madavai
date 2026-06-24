# Madav

Madav is one product shipped across three runtimes — **desktop**, **web/PWA**, and a **cloud** tier — from a single shared TypeScript core. It is a privacy‑respecting AI workspace for working with your **local files and many cloud apps**, authoring real documents, and automating work with agents, using a choice of frontier and local models.

> **This repository is the rebuild workspace ("Madav Next").** The clean TypeScript spine lives under `packages/`; the legacy app (`core/`, `src/`, `electron/`, `server/`) is being migrated into it module by module. See **`REBUILD-STATE.md`** for status and **`docs/blueprint/`** for the architecture.

## The spine (today)

| Package | What it is | Status |
|---|---|---|
| `@madav/contracts` | Zod schemas shared identically by every runtime — the single source of truth for shapes | tested |
| `@madav/documents` | Deterministic document authoring (schema‑gated, formula‑validated Excel engine) + ingestors | tested |
| `@madav/core` | Pure, provider‑agnostic turn‑loop helpers and orchestration | tested |

## Verify the spine

```powershell
node scripts/verify-packages.mjs
```

Type‑checks and runs every package's tests. Each package is self‑contained with its own tests.

## Rules & docs

- **`MADAV.md`** — the engineering charter (the non‑negotiables).
- **`docs/blueprint/`** — the full architecture, in plain English with diagrams (`Madav-Blueprint.html` renders the diagrams).
- **`REBUILD-STATE.md`** — what's built vs. planned, and how to run & compare both apps.
- **`scripts/check-branding.mjs`** — enforces the "built by and for Madav" policy.

## Conventions

- One language (TypeScript), one source of truth, deterministic I/O, sandboxed code.
- Commands in docs are written for **PowerShell**.
