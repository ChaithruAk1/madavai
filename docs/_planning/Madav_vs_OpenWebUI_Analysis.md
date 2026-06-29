# Madav vs. Open WebUI — Engineering Comparison, Excel-Stability Deep Dive, and Prioritized Remediation Backlog

**Prepared for:** Chaithru (owner, Madav)
**Date:** 2026-06-23
**Reference repo compared against:** `open-webui/open-webui` (branch `main`, fetched 2026-06-23)
**Scope of Madav review:** read-only (another working session was active; nothing in the Madav tree was modified)

---

## 📊 CURRENT STATE vs OPEN WEBUI — updated 2026-06-25

The comparison below was the *initial* analysis. This banner updates it to what Madav has actually BUILT. Short version: **the "boring infrastructure" gap this document flagged as Madav's core weakness is now built** — but it is *code-complete in the repo*, not yet *deployed + hardened in production*. That distinction still favors Open WebUI until you ship.

### The original gap — now closed (in code)
This document's verdict was: "Madav has a clever document engine but skipped the boring infrastructure (types, structured errors, sandboxing, observability) — exactly the layer that buys stability." Status now:

| Gap originally flagged | Built? |
|---|---|
| Typed payloads / schemas | ✅ Zod typed API contracts (client = server) + typed document specs |
| Structured logging, no silent catches | ✅ `@madav/insight` + crash-reporting |
| Real sandboxed execution | ✅ compute sandbox (Pyodide-first + microVM pool) |
| Observability | ✅ gateway health/ready probes + structured request log |
| Deterministic IO | ✅ deterministic ingestors + xlsx writer (golden-file tested) |
| Migrations / canonical store | ✅ Postgres + Drizzle migrations |
| Stable agent engine | ✅ one native agent loop (no third-party SDK), parity-tested helpers |

### Where Madav stands now
- **Its pre-existing win, now on a solid base:** the native **document engine** (styled xlsx/docx/pdf/pptx) — Open WebUI has **no** native equivalent (OWUI users bolt on third-party MCP plugins). Plus mono-language `core/` shared across desktop+web+cloud, and one clean agent loop.
- **New parity:** the infra layer OWUI had and Madav lacked (types, logging, sandbox, observability, durable jobs, RBAC seam, RAG) is now present.
- **OWUI's standing lead:** it is a *shipping product at scale with a large community*; Madav's spine is *built but not yet deployed/hardened*. Paper architecture loses to production software until you deploy.

### What was deliberately NOT adapted from Open WebUI (and why)
Per the "native, not copied" doctrine, Madav reimplemented **patterns**, never copied code (the provenance scan confirmed zero OWUI code in Madav). Intentionally **skipped**:
1. **Separate-language backend (Python + Svelte).** Madav stays **mono-JS** so `core/` is shared everywhere. The single most important "don't" — adopting it would destroy Madav's moat.
2. **9 vector databases.** Madav uses **pgvector + a few Ingestors**. Breadth not needed.
3. **6+ OCR/extraction engines** (Tika, Docling, Marker, MinerU, Mistral OCR, PaddleOCR, Azure DI). Madav ships a few ingestors — heavy-OCR users still prefer OWUI, **by choice**.
4. **SCIM 2.0 / LDAP directory.** Deferred to an optional later module (not built). Correct for consumer focus.
5. **Jupyter-server dependency.** Madav uses **Pyodide-first + a microVM sandbox** instead — lighter, safer, no external server.
6. **Self-host-first distribution + the public model/prompt/tool hub + plugin ecosystem.** Different product model; not adapted.
7. **OWUI's nouns/UX.** Everything borrowed is expressed in **Madav's vocabulary** (Workrooms, Projects, Agents, Teams, Skills, Connectors, Ingestors, Compute, Knowledge).

The one thing Madav has that OWUI does **not** (so it couldn't be "adapted" — it's a Madav original): the **native officedoc/deckjs document-generation engine**.

---

## 0. How to read this document

This is written so you can read the top of each section in plain English, then hand the deeper parts to a developer or to another Claude session as a work list. Every claim is tagged with a **confidence level** (high / moderate / low) and, where it matters, the exact file and function so it can be verified or actioned. The prioritized backlog in Section 9 is the "what to do" list, sorted **Critical → High → Medium → Nice-to-have**.

**The one-sentence version:** Open WebUI is more stable with spreadsheets not because it has better spreadsheet code, but because it *almost never lets the language model write the spreadsheet code* — it reads files with boring, deterministic libraries and runs any real computation inside a proper sandbox (a Python kernel or in-browser Python). Madav, by contrast, leans on the model to author code/specs and then executes that, which is where the instability comes from. The single most valuable change you can make is architectural, not cosmetic.

> **Honest framing up front (confidence: high).** Madav and Open WebUI are *not the same kind of product*. Open WebUI is a self-hosted, multi-user, server-based chat platform whose center of gravity is **RAG** (reading your documents so the model can answer questions about them). Madav is a desktop+web assistant whose differentiator is **authoring** real office files (xlsx/docx/pptx/pdf) — something Open WebUI does **not** do as a first-class feature. So "add the missing items in the same fashion as Open WebUI" cannot be taken literally for every feature. What transfers cleanly is the **engineering discipline and the robustness patterns**, especially around file reading and code execution. I will be explicit about what transfers and what does not.

---

## 1. Executive summary

**What Madav is (confidence: high).** One repository ships two surfaces — a web app (`madav.ai` on Render) and an Electron desktop app — from a shared core (`core/**`) and a shared React renderer (`src/**`). It is ~40k lines of hand-written JavaScript/JSX, no TypeScript, no linter/formatter, with a genuinely good idea at its heart: let a chat model produce **real, downloadable office documents**. It has a thoughtful cross-surface parity test suite (~294 checks) that is, frankly, better discipline than many larger projects show.

**What Open WebUI is (confidence: high).** A large, mature, multi-license open-source platform: **FastAPI + Pydantic + SQLAlchemy/Alembic** backend, **SvelteKit + Svelte 5 + TypeScript** frontend, 9 pluggable vector databases, 6+ document-extraction engines, RBAC, SCIM/LDAP, OpenTelemetry observability, and an in-browser Python runtime (**Pyodide**) plus a server-side **Jupyter** code executor. It is engineered like infrastructure.

**Where Madav is genuinely weaker (confidence: high):**

1. **It asks the model to write code and then runs that code** — for decks via `new AsyncFunction(...)` in a worker, and for data tasks via shelling out to the user's system `python`. Open WebUI does neither for file *reading*, and when it *does* run code, it uses real sandboxes (Jupyter kernel, Pyodide WASM, or `RestrictedPython`).
2. **No static typing and no automated linting/formatting.** Open WebUI runs TypeScript + `svelte-check`, and has `ruff` + `black` + `pylint` configured with a complexity ceiling (`mccabe max-complexity = 10`). Madav has none of this.
3. **Defensive-but-silent error handling.** ~528 empty `} catch {}` blocks swallow errors with no logging. Failures disappear instead of surfacing.
4. **Silent data loss in the Excel pipeline.** Hard caps (12 sheets, 5000 rows, 64 columns, 60 periods) silently truncate output with no warning to the user. This is the single worst trust problem in the spreadsheet path.
5. **Duplication of model-facing rules across three files** (the "office rule"), kept in sync by hand.

**Where Madav is *not* behind (confidence: high) — be fair:**

- Madav actually **authors** rich spreadsheets (formulas, charts, multi-sheet KPI models). Open WebUI does not. Madav's `xlsxTemplate.js` that compiles id-references into real A1 formulas is a sophisticated design; the problem is the *plumbing around it*, not the idea.
- Madav's **cross-surface parity tests** are a real strength. Notably, Open WebUI's own **lint CI workflows are currently disabled** (`lint-backend.disabled`, `lint-frontend.disabled`, `codespell.disabled`), so even the reference project does not gate every commit on its own tooling. Do not over-romanticize Open WebUI.

**The headline recommendation (confidence: high for the diagnosis; moderate for the exact remedy):** Stop treating "the model writes spreadsheet/code" as the default execution path. Split the problem into (a) **deterministic reading** of complex spreadsheets with pandas/openpyxl (like Open WebUI's loaders), and (b) **deterministic building** from a *validated* spec, with any genuine computation running in a **real sandbox** (Pyodide on web, bundled Python on desktop). Add a schema gate, replace silent truncation with explicit warnings, and validate formulas at build time instead of after the user opens a broken file.

---

## 2. Side-by-side: architecture & technology

| Dimension | **Madav** | **Open WebUI** | Who's stronger |
|---|---|---|---|
| Product category | Desktop + web AI assistant, **authors** office docs | Self-hosted multi-user RAG/chat platform | Different goals |
| Backend | Node.js ESM auth server (`server/auth-server.mjs`, ~1,527 lines) + Electron main (`electron/*.cjs`) | FastAPI 0.135 + Pydantic 2.12 + SQLAlchemy 2 + Alembic migrations | **Open WebUI** (typed, migrated, layered) |
| Frontend | React 18.3 + Tailwind (CDN) + Vite, **no TypeScript** | SvelteKit + Svelte 5 + **TypeScript** + `svelte-check` | **Open WebUI** (typed UI) |
| Language discipline | Plain JS/JSX/CJS; **no ESLint/Prettier/tsconfig** | `ruff` + `black` + `pylint` + ESLint + Prettier; complexity ≤ 10 | **Open WebUI** |
| Code execution of model output | `new AsyncFunction(code)` in a worker (decks); shell to system `python` (data) | Jupyter kernel over WebSocket; **Pyodide** (browser WASM); `RestrictedPython` | **Open WebUI** (real sandboxes) |
| Reading uploaded files | Model writes pandas script, or model reasons over a spec | Deterministic loaders (Unstructured / pandas / Tika / Docling / Azure DI / OCR) | **Open WebUI** (deterministic) |
| Database | LocalStorage/IndexedDB (web), JSON stores (desktop), Postgres/Redis on server | SQLite/Postgres/MySQL + Alembic; Redis; 9 vector DBs | **Open WebUI** |
| Testing | Vitest parity suite (~294 checks, cassette replay), CI: parity/full/worker-chunk | `pytest` + `pytest-asyncio` + `pytest-docker` + **Playwright** + **Cypress** | Roughly even; different shapes |
| Observability | `console.log` (`[madav] ...`) | **OpenTelemetry** traces/metrics/logs | **Open WebUI** |
| Build/packaging | Vite + rollup-obfuscator + electron-builder (NSIS) | Vite + SvelteKit adapters + Docker/Helm/Kustomize | Different targets |
| Lint enforcement in CI | None configured, but parity tests gate | Tooling configured but **lint CI disabled right now** | Madav at least *gates on something* |

**Reading of the table (confidence: high).** Open WebUI is built like a platform that expects thousands of self-hosters to run it in production, so it invests in typing, migrations, observability, and sandboxing. Madav is built like a fast-moving product with a clever document engine and a commendable parity-test habit, but it skipped the "boring infrastructure" layer (types, lint, structured errors, real sandboxing) — and that is exactly the layer that buys *stability*.

---
## 3. DEEP DIVE — complex Excel / data processing (your main pain point)

This is the section you care about most, so it is the most detailed. I separate **two different jobs** that get blurred together in conversation:

- **Job A — Reading/processing an existing complex spreadsheet** (you upload a messy workbook and ask questions or ask for analysis).
- **Job B — Authoring a new spreadsheet** (you ask Madav to produce a financial model / report as a downloadable .xlsx).

Madav and Open WebUI differ on *both*, and the instability you feel comes from how Madav does each.

### 3.1 How Madav does it today

**Madav has two delivery paths, gated by model strength** (`shared/office-rules.cjs → isDeckCapable(model)`, confidence: high):

```js
// shared/office-rules.cjs  (the gate, paraphrased from the read)
function isDeckCapable(model) {
  const m = String(model||"").toLowerCase();
  // MoE < 20B-active, or names containing nano/mini/flash/haiku/lite/7b/8b/... => NOT capable
  // opus/sonnet/gpt-5/gpt-4/4o/o1/o3/gemini-pro/deepseek/grok/30b+/... => capable
}
```

**Path 1 — "Weak model" (Python, shells out to the OS).** For models judged weak, `electron/session-manager.cjs` injects a *rigid recipe* (`weakDataProc()`):

```
(1) inspect with AT MOST 2 quick commands;
(2) write ONE script that reads the files, computes everything, and SAVES the .xlsx into this folder;
(3) run it ONCE — if it errors, FIX that SAME script and re-run, never write a new script;
(4) STOP and reply with ONE short sentence naming the file.
```

That script is executed by `runScriptInFolder()` in `electron/agent-openai.cjs`, which writes the model's Python to a temp file and runs the **system `python`** in the user's folder, with `PYTHONSAFEPATH=1` set in `runnerEnv()`. New files are detected by `emitNewOutputs()` diffing the folder before/after and rendered as a `FileOutCard`.

**Path 2 — "Capable model" (deterministic builder from a model-authored spec).** For strong models, Excel authoring does **not** run model code. The model emits a structured `officedoc` JSON spec; Madav's own code (`src/office.js → buildXlsx()` → `src/doc/xlsxTemplate.js → buildTemplateWorkbook()`) compiles it into a real workbook using **ExcelJS** (fallback **SheetJS**), turning id-references like `[Sheet!metric#period]` into real A1 formulas and applying styling/charts. **This part is actually well-conceived.**

> Note (confidence: high): the historical "bespoke `xlsxjs`" path — where the model wrote raw JS to build the sheet and it ran via `new AsyncFunction` in `xlsxWorker.js` — has been **retired** (`src/doc/xlsxWorker.js` is a no-op export; Excel now uses the template engine). But the self-repair machinery still references an "`xlsxjs` block" (the `madav:fixdoc` prompt in `src/App.jsx`), so there is **legacy surface area** and naming drift left over from the migration. The deck (pptx) path *still* uses `new AsyncFunction` in `deck/deckBuild.js`.

### 3.2 Why Madav's Excel is unstable — root causes tied to code (confidence: high)

These are the concrete failure modes, each mapped to where it lives:

**For Job A / Path 1 (reading + weak models):**

1. **Dependency on the user's system Python.** `runScriptInFolder()` runs `python` from `PATH`. If the user has no Python, the wrong Python, or missing `pandas`/`openpyxl`, every data task fails. Open WebUI never depends on a *user-provided* interpreter for this.
2. **Folder poisoning.** Your own `CLAUDE.md` documents this as "THE #1 CAUSE": a stray `json.py`/`inspect.py`/`random.py` left in the data folder shadows the stdlib, so `import pandas` crashes at startup and every run fails *silently*. `PYTHONSAFEPATH=1` mitigates it on Python ≥ 3.11 only. This is a class of bug that **cannot exist** in a bundled/WASM runtime.
3. **Weak-model flailing with no loop-breaker.** The rigid recipe is a *prompt* crutch, not a *code* guarantee. If the model writes two scripts, or loops re-running without fixing, there is no attempt-counter or circuit breaker — it just burns toward the **8-minute hard timeout** (`_tryProjectJob`) and produces nothing.
4. **Silent failure surfacing.** A failed run returns stderr to the model; the user often sees only "this took longer than expected" or a fabricated success. There is a false-success guard that appends a ⚠ warning when the model claims a file that does not exist — a band-aid over the real problem (the model shouldn't be writing the I/O code at all).

**For Job B / Path 2 (authoring from a spec):**

5. **No schema validation of the spec.** The model's JSON is parsed *leniently* (`_lenientParse`) and fed to the builder optimistically. A truncated stream, a trailing comma, or a wrong shape is "repaired" or partially accepted rather than validated against a contract. Open WebUI validates structured payloads with **Pydantic**; Madav validates nothing equivalent.
6. **Silent truncation = silent data loss (the worst one).** `buildXlsx()` does `sheets.slice(0, 12)`, rows `slice(0, 5000)`, columns `slice(0, 64)`, periods `Math.min(..., 60)`. Ask for a 15-sheet or 100-month model and you get a file that *looks complete but isn't*, with **no warning**. This is a trust-destroying bug, not a cosmetic one.
7. **Optimistic formula compilation.** `xlsxTemplate.js` resolves `[id]` references to A1 cells without verifying the id exists or that the result is acyclic. Missing refs resolve to `0`; cycles are only discovered when Excel opens the file and shows `#NAME?`/`#REF!`. Validation happens **after** the user sees the breakage, then offers a one-shot **Rebuild**.
8. **Lenient parse of a streaming spec.** The card watches a spec that is still streaming; strict parse while streaming, lenient at the end. If the end is truncated, the user gets "Couldn't build this document" after a 6-second timeout.
9. **One-shot recovery only.** `madav:fixdoc` sends *one* corrective prompt. If the model fails again, the user is stuck — there is no escalation ladder (e.g., "drop charts", "split sheets", "fall back to CSV").

**Cross-cutting:**

10. **`new AsyncFunction(code)` for decks** needs `'unsafe-eval'` in the CSP on both surfaces and relies on a worker that *manually* nulls `fetch`/`XMLHttpRequest`/`importScripts`. That is a hand-rolled sandbox, not a real one; the main-thread fallback runs model code **with no isolation at all** when the worker can't start.
11. **No budget cap on model output size** before the lenient parser runs — a pathological spec can chew CPU/memory.
12. **No telemetry** on any of the above, so you cannot see truncation/poisoning/timeout rates in aggregate; you only hear "it's unstable."

### 3.3 How Open WebUI handles the same problems (confidence: high — read directly from source)

**Job A (reading complex spreadsheets) — deterministic loaders, no model code.** `backend/open_webui/retrieval/loaders/main.py` dispatches by file type in `Loader._get_loader()`. For `.xls/.xlsx`:

```python
# loaders/main.py  (verbatim shape)
elif file_content_type in [
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] or file_ext in ['xls', 'xlsx']:
    try:
        from langchain_community.document_loaders import UnstructuredExcelLoader
        loader = UnstructuredExcelLoader(file_path)
    except ImportError:
        log.warning("...Falling back to pandas for Excel file loading...")
        loader = ExcelLoader(file_path)   # pandas: read every sheet, df.to_string()
```

Key robustness properties to copy:

- **It never asks the model to read the file.** A real library (Unstructured, or pandas via the `ExcelLoader` fallback that iterates `xls.sheet_names` and emits `df.to_string()`) does the parsing deterministically.
- **Layered fallbacks with *logged* degradation.** `try import Unstructured → except ImportError: log.warning(...) → pandas`. Failures are **logged**, not swallowed. Contrast Madav's `} catch {}`.
- **Pluggable extraction engines** for hard inputs: Tika, Docling, Azure Document Intelligence, MinerU, Mistral OCR, PaddleOCR — chosen by config, each isolated in its own loader class.
- **Async without blocking.** `aload()` wraps the synchronous parse in `asyncio.to_thread(...)` so a big workbook never freezes the event loop. (Madav's equivalent risk is the renderer/main thread; see Section 3.4.)
- **Encoding sanity.** `_detect_text_encoding()` is CJK-aware and validates that decoded text actually contains CJK characters before trusting a codec; everything is then run through `ftfy.fix_text()`. This is the kind of defensive-but-*loud* engineering Madav lacks.

**Job B-ish (computation) — real sandboxes, not eval.** When Open WebUI must *run* code, it uses a real **Jupyter kernel** over a WebSocket (`backend/open_webui/utils/code_interpreter.py`), with a typed result:

```python
class ResultModel(BaseModel):
    stdout: Optional[str] = ''
    stderr: Optional[str] = ''
    result: Optional[str] = ''     # captures images (base64 png) and text/plain

class JupyterCodeExecuter:
    # creates a kernel, runs code with a timeout, captures stream/execute_result/error,
    # and ALWAYS deletes the kernel in __aexit__ (proper lifecycle/cleanup)
```

And on the **frontend**, Open WebUI bundles **Pyodide** (Python compiled to WebAssembly — `pyodide@^0.28.2`, `@pyscript/core`) plus `npm run pyodide:fetch`, so Python (including pandas) runs **in the browser, in a WASM sandbox**, with no system Python and no folder to poison. For tool/function evaluation it uses **`RestrictedPython`** (a vetted safe-subset evaluator). Three different, *real* sandboxes for three different needs — versus Madav's one hand-rolled worker + an unguarded main-thread fallback.

### 3.4 The fundamental difference, stated plainly (confidence: high)

> **Open WebUI's stability is an architecture choice: deterministic libraries do the file I/O, and real sandboxes do the code execution. The language model is kept away from both the parser and the interpreter.** Madav's instability is also an architecture choice: the model authors the code/spec, and Madav executes it with weak isolation and silent failure modes. You will not fix this with prompt tweaks; the rigid-recipe prompt is proof that prompt-engineering is already being used as a structural crutch.

### 3.5 What Madav should adopt for Excel (confidence: high for direction; moderate for exact mechanism)

1. **Read deterministically.** Add a real spreadsheet *reader* (SheetJS is already a dependency on web; pandas/openpyxl on desktop/Pyodide) that extracts sheets → typed preview (sheet names, dims, headers, dtypes, a sample) and hands the model *data*, not a request to write a parser. Mirror Open WebUI's `ExcelLoader`: iterate sheets, summarize each.
2. **Validate the authoring spec against a schema** before building. Define the `officedoc` spec as a real schema (Zod on JS, mirroring Open WebUI's Pydantic). Reject/repair *before* `buildXlsx`, not after Excel shows `#REF!`.
3. **Kill silent truncation.** If a spec exceeds limits, either raise the limit, paginate across sheets, or **emit a visible warning card** ("Showing 12 of 15 sheets — the model exceeded the workbook cap"). Never drop data silently.
4. **Validate formulas at build time.** In `xlsxTemplate.js`, after resolving refs, run a pass that (a) flags unresolved ids, (b) detects cycles, (c) reports them as structured `issues` *before* download — reuse the existing `issues[]` channel that the deck path already has.
5. **Run any real computation in a real sandbox.** Adopt **Pyodide** on the web surface (exactly as Open WebUI does) so pandas/openpyxl run in-browser with no system Python; bundle a Python runtime on desktop. This single change eliminates folder poisoning, the system-Python dependency, and the unguarded main-thread eval fallback in one move — and it is **single-source** friendly (one engine in `core/`/`src/`, both surfaces inherit it), which fits your mandatory single-source rule.
6. **Add an escalation ladder to recovery**, not just one-shot Rebuild: retry → simplify (drop charts) → split (fewer sheets) → fall back to CSV, each step logged.

---
## 4. Coding-standards comparison — where Madav is weaker (and where it isn't)

This is the "analyze word by word" section. Each item names the concrete signal, the evidence, what Open WebUI does instead, and a verdict.

### 4.1 Static typing — **Madav weaker (confidence: high)**

- **Madav:** zero TypeScript. No `tsconfig.json`. Specs, tool payloads, and chat-adapter contracts are plain objects validated (if at all) by ad-hoc `if` checks.
- **Open WebUI:** frontend is **TypeScript** with `svelte-check --tsconfig ./tsconfig.json` wired into `npm run check`/`lint:types`; backend uses **Pydantic** models (e.g., `ResultModel`) so payloads validate at the boundary and fail loudly with field-level errors.
- **Why it matters for *your* problem:** the Excel spec is exactly the kind of structured payload that a schema would catch *before* it reaches the builder. Today a malformed spec is discovered when Excel renders `#REF!`.
- **Verdict:** Madav should adopt at minimum **Zod** schemas for the document specs and tool I/O (cheap, no full TS migration required), and ideally a gradual TS migration of `core/`.

### 4.2 Linting & formatting — **Madav weaker (confidence: high)**

- **Madav:** no ESLint, no Prettier, no config files found. Style is "by culture."
- **Open WebUI:** `ruff` (rules `E,F,W,I,UP,C90,Q,ICN`) + `black` (line-length 120) + `pylint` on the backend; ESLint + `@typescript-eslint` + Prettier on the frontend. Crucially, **`mccabe.max-complexity = 10`** — a hard ceiling on cyclomatic complexity per function.
- **Caveat (confidence: high):** Open WebUI's **lint CI workflows are currently disabled** (`.github/workflows/lint-backend.disabled`, `lint-frontend.disabled`). So they *configure* the tooling but do not currently *gate* on it. Madav at least gates on parity tests. Net: Open WebUI is ahead on having the tooling at all, but neither project is a paragon of enforced linting.
- **Verdict:** add ESLint + Prettier to Madav with a complexity rule; wire into the existing CI next to the parity gate.

### 4.3 Function/file size & modularity — **Madav weaker (confidence: high)**

- **Madav:** `src/components/Agents.jsx` is **2,958 lines**; `src/bridge/webBridge.js` is **1,810 lines** (auth + chat + tools + skills + storage + artifacts in one file); `electron/session-manager.cjs` is **1,249 lines**. These are god-files.
- **Open WebUI:** also has large files (it is a big project), but enforces `max-complexity = 10` per function and splits responsibilities across `routers/`, `retrieval/loaders/` (one class per engine), `utils/`. The per-loader-class pattern in `loaders/main.py` is the model to copy: each extraction strategy is its own small, testable class.
- **Verdict:** break the god-files along seams that already exist (the `src/bridge/` folder has 18 files but the logic still concentrates in one). Adopt "one strategy = one module/class," as the loaders do.

### 4.4 Error handling — **Madav weaker (confidence: high)**

- **Madav:** ~**528** empty `} catch {}` blocks. Many are deliberate (browser storage quota), but they log nothing, so genuine failures are indistinguishable from expected ones. There is no structured error type.
- **Open WebUI:** failures are **logged** (`log.warning(...)`, `logger.exception(...)`) and computation returns a **typed** `ResultModel(stdout, stderr, result)`; the Jupyter executor always cleans up the kernel in `__aexit__`. Errors are visible and structured.
- **Verdict:** replace silent swallows in the data/office paths with a tiny logged-error helper (even `catch (e) { logSwallow('storage', e) }`). Make the office/Excel path return a structured result with an `issues[]` channel everywhere (it already exists for decks).

### 4.5 Duplication / single source — **Madav weaker (confidence: high), but self-aware**

- **Madav:** the model-facing "office rule" exists in **three** places (`shared/office-rules.cjs`, `electron/agent-openai.cjs`, `src/office.js`) kept in sync by hand; `isDeckCapable` is duplicated likewise; the `weakDataProc` recipe is byte-identical across files on purpose. Your own `CLAUDE.md` codifies a **mandatory single-source rule** precisely because this hurt before.
- **Open WebUI:** the equivalent logic (loaders, executors) lives in one place per concern and is imported.
- **Verdict:** the duplication is forced by the CJS-vs-ESM split (web can't import `.cjs` at runtime). Fix it structurally: generate the ESM copy from the CJS source at build time, or move the shared text to a `.json`/`.txt` asset both import. This is squarely in line with your single-source mandate.

### 4.6 Code-execution safety — **Madav weaker (confidence: high)**

- **Madav:** `new AsyncFunction(code)` for decks, requiring `'unsafe-eval'` in the CSP on both surfaces, with a hand-nulled worker sandbox and an **unsandboxed main-thread fallback**. Data path shells to the OS interpreter.
- **Open WebUI:** Jupyter kernel (process isolation) + Pyodide (WASM isolation) + RestrictedPython (language-level isolation). No `eval` of model code in the privileged context.
- **Verdict:** this is the highest-leverage robustness *and* security gap. See Section 9, Critical items.

### 4.7 Database & migrations — **Madav weaker (confidence: moderate)**

- **Madav:** web persistence is LocalStorage/IndexedDB with manual migration helpers (`migrateLegacyIdb`); desktop uses JSON stores. Schema changes are ad hoc.
- **Open WebUI:** SQLAlchemy 2 + **Alembic** versioned migrations (+ peewee-migrate historically). Schema evolution is disciplined.
- **Verdict:** for Madav's scale this is lower priority, but a defined migration story for desktop stores would reduce "lost data on update" risk.

### 4.8 Observability — **Madav weaker (confidence: high)**

- **Madav:** `console.log("[madav] ...")`. No metrics, no traces.
- **Open WebUI:** built-in **OpenTelemetry** (traces, metrics, logs).
- **Verdict:** you cannot manage spreadsheet instability you cannot measure. Even a lightweight counter (truncation events, formula-repair events, timeouts, fallback-to-CSV) emitted to a local log + optional endpoint would let you see whether fixes work.

### 4.9 Testing — **roughly even, different shapes (confidence: high)**

- **Madav:** Vitest **parity** suite (~294 checks) using replay cassettes, plus CI jobs for parity / full / worker-chunk validation. Genuinely good for a two-surface app, but it is mostly *contract/parity* testing with mocked model/tool calls — few integration tests, and (critically) **no test that builds a large/complex .xlsx and asserts the output is correct and untruncated**.
- **Open WebUI:** `pytest` + `pytest-asyncio` + `pytest-docker` + **Playwright** (e2e) + **Cypress**.
- **Verdict:** keep the parity suite (it is a strength), but add **golden-file Excel tests**: feed known specs (including over-limit ones) and assert sheet counts, row counts, formula resolution, and that truncation raises a warning. This directly attacks your stability complaint.

### 4.10 Where Madav is *ahead* or equal — state it plainly (confidence: high)

- **Authoring real office files** with formulas/charts/multi-sheet KPI models — Open WebUI does not do this at all.
- **Cross-surface parity discipline** — a real, codified strength; Open WebUI has no equivalent because it is single-surface (server-rendered).
- **Conservative dependency surface** — Madav's obfuscator reserves dynamic-import names and avoids control-flow flattening for performance; the dependency list is far smaller and easier to audit than Open WebUI's sprawling `all` extra.
- **A thoughtful document template engine** (`xlsxTemplate.js`) — the *design* is good; the *guardrails* are missing.

**Bottom line of Section 4 (confidence: high):** Madav's weaknesses are concentrated in the "industrial" layers — types, lint, structured errors, sandboxing, observability — not in product cleverness. Those layers are exactly what produce the stability Open WebUI enjoys.

---

## 5. Feature-gap analysis (what each has that the other doesn't)

**Open WebUI has, Madav lacks (transferable, confidence: high):**

- Deterministic multi-engine **document ingestion** (Unstructured/Tika/Docling/Azure DI/MinerU/OCR) with logged fallbacks.
- **Real code sandboxes** (Jupyter, Pyodide, RestrictedPython).
- **RAG** with 9 vector DBs, hybrid BM25 + embeddings, `#`-command document/URL injection.
- **RBAC, SCIM 2.0, LDAP/AD, OAuth**, granular per-group permissions.
- **OpenTelemetry** observability; Redis-backed horizontal scaling.
- **Typed** end-to-end (TS + Pydantic), Alembic migrations.
- i18n, PWA, collaborative editing (yjs/pycrdt).

**Madav has, Open WebUI lacks (do not regress these, confidence: high):**

- **Authoring** downloadable xlsx/docx/pptx/pdf from chat.
- **Two surfaces (desktop + web) from one codebase** with parity tests.
- Desktop-native capabilities (terminal/node-pty, local file/secret storage, Telegram bot).
- A capability-gated weak-model pipeline (clever, even if fragile).

**Not transferable / out of scope (confidence: high):** Madav should *not* bolt on 9 vector DBs, SCIM, or a Jupyter-server dependency just because Open WebUI has them. The right imports are the **patterns** (deterministic IO, sandboxed execution, typed payloads, logged fallbacks, observability), not the enterprise surface area.

> **License caveat (confidence: high):** Open WebUI's README states the current codebase is under the *Open WebUI License* with an added requirement to **preserve the "Open WebUI" branding** (plus earlier contributions under their original licenses) — i.e. a source-available license, not a pure permissive one. **Learning from its architecture is fine; copying its source code into Madav is not** without honoring those terms. Reimplement the patterns; don't paste the files.

---
## 6. The Excel rebuild — concrete proposal (the centerpiece fix)

This is a sequenced plan to make complex-spreadsheet handling stable, written to fit your **single-source** and **search-backend** rules. It does not require throwing away the good parts (the spec → ExcelJS template engine).

**Target architecture (one engine, both surfaces):**

```
        ┌─────────────────────────── core/ (shared, single source) ───────────────────────────┐
        │                                                                                       │
READ →  │  spreadsheetReader(file)  → deterministic parse (SheetJS web / pandas-in-Pyodide)     │
        │     → typed Preview { sheets:[{name,rows,cols,headers,dtypes,sample}] }                │
        │                                                                                       │
AUTHOR →│  officedocSchema (Zod)  → validate(spec)  → buildWorkbook(spec)                        │
        │     → resolveFormulas() → detectCycles() → issues[]                                    │
        │     → if over-limit: paginate OR warn (never silent-drop)                              │
        │                                                                                       │
COMPUTE→│  runPython(code)  → Pyodide (web)  / bundled-python (desktop)  → typed Result          │
        │     (replaces system-python shell-out AND new AsyncFunction fallback)                  │
        └───────────────────────────────────────────────────────────────────────────────────────┘
```

**Step-by-step (each step is independently shippable):**

1. **Add a schema gate (Zod) for the `officedoc` spec.** New `core/officedocSchema.js`. `parseOfficeSpec()` in `src/office.js` validates against it and returns structured `issues` instead of leniently building. *Effort: S. Risk: low. Single-source: lives in core, both surfaces import.*

2. **Replace silent truncation with explicit limits + warnings.** In `buildXlsx()`/`xlsxTemplate.js`, when `slice(0,12)`/`slice(0,5000)` etc. would drop data, push an `issue` ("12 of 15 sheets shown") that renders on the card. Raise caps where safe. *Effort: S. Risk: low.*

3. **Validate formulas at build time.** After ref-resolution in `xlsxTemplate.js`, add `detectUnresolved()` + `detectCycles()`; surface via the existing `issues[]` channel *before* download, so the user never opens a `#REF!` file. *Effort: M. Risk: low.*

4. **Introduce a deterministic reader for Job A.** New `core/spreadsheetReader.js`: on web use the already-bundled **SheetJS** to read sheets → typed preview; on desktop, the same via Pyodide or node. The model receives *data*, not a request to write a parser. *Effort: M. Risk: medium (touches the data-tools trigger path).*

5. **Adopt Pyodide on the web surface for real computation.** Bundle Pyodide (as Open WebUI does with `pyodide:fetch`), expose `runPython(code)` from `core/`. Route the data-processing path through it instead of shelling to system Python. This **eliminates folder poisoning and the system-Python dependency** on web in one move. *Effort: L. Risk: medium. Big stability win.*

6. **Unify desktop computation on the same contract.** Desktop keeps a bundled Python (or Pyodide) behind the *same* `runPython` interface, so there is one execution contract — satisfying single-source. Retire the unguarded main-thread `AsyncFunction` fallback. *Effort: L. Risk: medium.*

7. **Add an escalation ladder to `madav:fixdoc`.** retry → simplify (drop charts) → split sheets → CSV fallback, each logged. *Effort: M. Risk: low.*

8. **Add golden-file Excel tests.** Feed known + over-limit specs; assert sheet/row counts, formula resolution, and that truncation raises a warning. Wire into the parity CI. *Effort: M. Risk: low. Locks the fix in place.*

> **Why this is the right shape (confidence: high):** steps 1–3 and 7–8 harden the part Madav already does well (spec → deterministic build) with the *validation and visibility* it lacks. Steps 4–6 import Open WebUI's actual stability source (deterministic reads + real sandbox) without importing its enterprise bulk. Everything lands in `core/`, honoring your single-source rule.

---

## 7. Prioritized implementation backlog

Sorted by priority. Each item: **what / why / where / effort (S/M/L) / risk**. "Effort" is engineering size, not your time — you are not expected to write any of this.

### 🔴 CRITICAL — do these first (stability + safety; they're the source of your pain)

- **C1. Kill silent data loss in Excel authoring.** *Why:* a file that looks complete but silently dropped sheets/rows destroys trust and is your worst current bug. *Where:* `src/office.js buildXlsx()`, `src/doc/xlsxTemplate.js`. *Effort: S. Risk: low.*
- **C2. Schema-validate the office spec before building (Zod).** *Why:* turns "Excel opens broken" into "caught before build." *Where:* new `core/officedocSchema.js`, `src/office.js parseOfficeSpec()`. *Effort: S–M. Risk: low.*
- **C3. Build-time formula validation (unresolved + cycles).** *Why:* eliminates `#REF!`/`#NAME?` surprises. *Where:* `src/doc/xlsxTemplate.js`. *Effort: M. Risk: low.*
- **C4. Replace system-Python shell-out with a real sandbox (Pyodide on web).** *Why:* removes folder poisoning, missing-interpreter failures, and the unguarded main-thread eval fallback — the structural causes of instability. *Where:* `electron/agent-openai.cjs runScriptInFolder`, new `core/runPython.js`, web bridge. *Effort: L. Risk: medium. Highest leverage.*
- **C5. Stop swallowing errors in the data/office paths.** *Why:* you cannot debug what you cannot see. *Where:* the ~528 `} catch {}` sites, prioritizing office/data ones. *Effort: M. Risk: low.*

### 🟠 HIGH — do these next (visibility, recovery, discipline)

- **H1. Deterministic spreadsheet reader for uploaded files (Job A).** *Where:* new `core/spreadsheetReader.js` (SheetJS/pandas). *Effort: M.*
- **H2. Escalation ladder for `madav:fixdoc`** (retry → simplify → split → CSV). *Where:* `src/App.jsx`, office card. *Effort: M.*
- **H3. Add ESLint + Prettier with a complexity ceiling**, wired into CI next to parity. *Effort: M. Risk: low.*
- **H4. Golden-file Excel tests** (incl. over-limit + complex-formula cases). *Where:* `tests/`. *Effort: M.*
- **H5. Lightweight observability counters** (truncation, formula-repair, timeout, fallback). *Effort: M.*
- **H6. Collapse the 3-copy office rule to one source** (generate ESM from CJS at build, or shared asset). *Where:* `shared/office-rules.cjs` → build step. *Effort: M.*

### 🟡 MEDIUM — meaningful, not urgent

- **M1. Adopt Zod schemas for tool I/O and chat-adapter payloads** (beyond the office spec). *Effort: M.*
- **M2. Break up god-files** (`Agents.jsx` 2,958 LOC, `webBridge.js` 1,810 LOC) along existing seams. *Effort: L.*
- **M3. Multi-engine reader fallback** (e.g., Tika/Docling-style optional engine for scanned/odd files), logged like Open WebUI. *Effort: L.*
- **M4. Budget caps on model output size** before lenient parse. *Effort: S.*
- **M5. Desktop store migration story** (versioned, à la Alembic-lite). *Effort: M.*
- **M6. Make timeouts adaptive/configurable** (8-min project, 20-s deck, 120-s script). *Effort: S.*

### 🟢 NICE-TO-HAVE — polish / future

- **N1. Gradual TypeScript migration of `core/`.** *Effort: L.*
- **N2. In-browser preview of generated spreadsheets** (render before download). *Effort: M.*
- **N3. Optional RAG-lite** over a project folder (deterministic chunk + local embeddings) for "answer from these files." *Effort: L.*
- **N4. OpenTelemetry exporter** if/when you want real dashboards. *Effort: M.*
- **N5. Pluggable OCR engine** for scanned PDFs/images (PaddleOCR/Tika), Open-WebUI-style. *Effort: L.*

---

## 8. Caveats, confidence, and what I could not verify

- **Madav internals (confidence: high, but time-sensitive).** All Madav findings come from a **read-only** pass while another session was active. Line numbers/counts (e.g., 2,958 LOC, ~528 catches, the slice limits) were accurate at read time but the other session may be changing files right now. Re-confirm exact lines before editing.
- **Open WebUI internals (confidence: high for fetched files).** `pyproject.toml`, `package.json`, `loaders/main.py`, `code_interpreter.py`, and the workflows listing were read directly from `main` today. The **lint-CI-disabled** claim is inferred from the `.disabled` filenames (high confidence) but I did not open each workflow's history.
- **Open WebUI test depth (confidence: moderate).** I confirmed the *tooling* (`pytest`, Playwright, Cypress) but did not enumerate test counts; do not quote a coverage number.
- **Pyodide-for-xlsx feasibility (confidence: moderate).** pandas and pure-Python `openpyxl` run under Pyodide in principle, and Open WebUI already bundles Pyodide — but a **feasibility spike** (bundle size, cold-start time, openpyxl write support) should precede committing to C4/step-5.
- **"Excel processing" ambiguity (confidence: high it matters).** I treated both *reading* and *authoring* because your complaint ("processing complex excel sheet") spans both; if you specifically mean only one, the backlog narrows accordingly.

---

## 9. Sources

Madav: read-only review of `C:\Projects\ClaudeCodeUI\Madav` (`core/`, `src/office.js`, `src/doc/xlsxTemplate.js`, `src/deck/deckBuild.js`, `electron/agent-openai.cjs`, `electron/session-manager.cjs`, `shared/office-rules.cjs`, `shared/csp.cjs`, `package.json`, `tests/`, `CLAUDE.md`).

Open WebUI (GitHub `open-webui/open-webui`, `main`, fetched 2026-06-23):
- [README.md](https://github.com/open-webui/open-webui/blob/main/README.md)
- [backend/open_webui/retrieval/loaders/main.py](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/retrieval/loaders/main.py)
- [backend/open_webui/utils/code_interpreter.py](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/utils/code_interpreter.py)
- [pyproject.toml](https://github.com/open-webui/open-webui/blob/main/pyproject.toml)
- [package.json](https://github.com/open-webui/open-webui/blob/main/package.json)
- [.github/workflows](https://github.com/open-webui/open-webui/tree/main/.github/workflows)
