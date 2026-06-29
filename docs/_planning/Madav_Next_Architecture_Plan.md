# Madav Next — End-to-End Architecture & Technology Transformation Plan

**Prepared for:** Chaithru (owner, Madav)
**Date:** 2026-06-23
**Status:** PLAN ONLY. No repository code was written; the Madav working tree was reviewed **read-only** (another session was active). This is the blueprint you asked to ratify before any build step.
**Companion doc:** `Madav_vs_OpenWebUI_Analysis.md` (the comparison this plan acts on).

---

## ✅ BUILD STATUS — updated 2026-06-25 (what is complete vs the plan below)

This banner is the TRUTH of where the code stands now; the plan that follows is the original blueprint. Legend: ✅ built (code-complete in the repo, verified as far as a non-Mac / non-prod sandbox allows) · 🟡 partial / flag-guarded OFF · ⏳ deferred / parked · 🧪 needs your run (deploy/test) to certify.

### Phased roadmap — status
| Phase | Scope | Status |
|---|---|---|
| **0 — Foundations** | deterministic ingestors, xlsx writer, compute executor, structured logging (insight), verify gate, no-model preview | ✅ built |
| **1 — Cloud spine** | storage-custody envelope, typed API contracts (Zod, client=server), gateway (auth/rate-limit/proxy/realtime on Redis), Postgres+Drizzle, object storage, server-readable sync + multi-device, local-model tier | ✅ built (code) · 🧪 deploy to certify |
| **2 — Jobs & workers** | durable job/worker tier, runners-as-cloud-jobs, encrypted connector vault (KMS), server-side remote MCP, cloud scheduled tasks, compute sandbox (Pyodide + microVM) | ✅ built (code) · 🧪 deploy to certify |
| **3 — Knowledge & enterprise** | RAG (chunking, hybrid retrieval, pgvector, OpenAI+local embedder), RBAC policy + gateway enforcement + per-user workspaces, crash-reporting, scale-out (health/ready probes + request log) | ✅ built · 🟡 RBAC/RAG/crash flags OFF by default (enablement gated on your review) |
| **4 — E2EE Private mode** | seal/open (AES-256-GCM + PBKDF2) + custody policy | 🟡 foundation only · ⏳ **parked** (full feature needs approval + external crypto review) |

### Built in the last 2 days (agent-engine + product-hardening pass)
- ✅ **Madav's OWN native agent engine** — the third-party **Claude Agent SDK is fully removed** (file, dependency, and all branches). Every model (Anthropic included) now runs **one clean agent loop**. This realizes the "one strong loop" principle (the Open WebUI concept).
- ✅ **Projects de-hacked** — the keyword "lane router" + the prompt-hijacking deterministic report engine were **deleted from the codebase**; capable models follow the prompt directly; weak models are steered to a Recommended model instead of a hidden pipeline.
- ✅ **Document engine single-sourced** — one office rule + capability gate, guarded by a parity test across all 3 copies. xlsx/docx/pdf = deterministic templates; pptx = bespoke `deckjs` for strong models.
- ✅ **Branding + UI** — new MADAV wordmark + M everywhere (incl. desktop icon), theme-aware tagline, default accent `#00aabd`, Sage bottom-right + minimized.
- ✅ **Repo hygiene** — orphaned old-engine/runner/SDK files removed; comprehensive `.gitignore`.
- ✅ **macOS build wired** — mac/dmg config + `.icns` + hardened-runtime entitlements (incl. the JIT keys the doc engine needs) + the one platform guard; signing/notarization runbook (`MAC-DESKTOP-BUILD-SCOPE.md`). Build/sign/test still needs a Mac or CI.

### Not done (your court)
🧪 Deploy the cloud tier + turn Phase-3 flags ON in prod · 🧪 run the whole-app E2E certification (`E2E-CERTIFICATION-CHECKLIST.md`) · ⏳ SSO/SCIM (designed, not built) · ⏳ E2EE Phase 4 (parked) · 🧪 macOS build + Apple sign/notarize on a Mac/CI.

---

## 0. How to read this

Each major claim carries a **confidence tag** (high / moderate / low). Section 1 challenges your stated goal before accepting it — that is deliberate, not contrarian. Sections 6–7 are the architecture. Section 10 is the "Madav = or > Open WebUI on every row" table you asked for, built honestly. Section 11 is the phased roadmap you would execute. Section 13 lists the genuine decisions only you can make.

**The plan in one paragraph (confidence: high).** Madav's defining asset is a single shared `core/` consumed by two surfaces (desktop + web) through an adapter pattern. The fastest way to *lose* to Open WebUI would be to copy its split Python-backend / TS-frontend shape, because that split makes true code-sharing impossible — exactly the thing Madav does better than Open WebUI today. So Madav Next goes the other way: **one TypeScript `core/` running across three runtimes — desktop, web, and a new horizontally-scalable cloud tier — with deterministic services for I/O, real sandboxes for code, a local-first client backed by server-readable cloud sync (secrets always vaulted, with an optional end-to-end-encrypted Private mode), and a thin server that never touches your inference cost.** That architecture is more robust than Open WebUI on the rows that matter to Madav, deliberately lighter on the rows that don't, and it scales to 1M users at a fraction of the cost of apps that proxy inference.

---

## 1. Your goal, restated — and one part challenged

**You asked for three things:** (a) blend the best of Open WebUI's architecture with the best of Madav into "one of the finest" architectures; (b) when borrowing from Open WebUI, make it look *built for Madav*, not copied; (c) ensure a future "architecture & technology" comparison rates Madav **= or > Open WebUI on every row**; all while keeping Madav's mission — a Claude experience over **local + multiple cloud apps**, on desktop and web — and scaling to **1M users**.

**(a), (b), (d) I accept as-is.** They are correct ambitions and the rest of this document delivers them.

**(c) I am challenging (confidence: high).** "Match Open WebUI on *every* row" is the wrong literal target, because several Open WebUI rows are **bulk that would make Madav worse if copied**:

- **9 vector databases.** Open WebUI supports Chroma, PGVector, Qdrant, Milvus, Elasticsearch, OpenSearch, Pinecone, S3Vector, Oracle 23ai. That breadth exists because self-hosters demand "use the DB I already run." Madav is a hosted SaaS + desktop app; **two** vector options (pgvector + one scale option) is the *correct* engineering choice. Matching nine would be nine integrations to test, secure, and support for zero user benefit.
- **A Jupyter-server dependency** for code execution. Madav already runs **Pyodide** in the browser — lighter, safer, no server to operate. Adopting Jupyter would be a *regression* in operational simplicity.
- **The self-hosted-appliance shape** (Docker/Helm/Kustomize, LDAP/SCIM-first, "operate entirely offline"). That is Open WebUI's identity, not Madav's. Madav is a hosted product with a privacy-respecting local-first client.

**So I am redefining "= or > on every row" as the success metric (confidence: high):** Madav must be **best-in-class on the rows that serve its mission and 1M-user robustness** (typed contracts, stateless scale, real sandboxes, observability, connector breadth, authoring, two-surface parity), and **deliberately, defensibly different on the enterprise-RAG-appliance rows** — where the comparison table will show Madav's choice *and the one-line reason it is the right call*. A reviewer reading that table will conclude Madav is **the better-engineered system for what Madav is**, which is a stronger claim than "Madav cloned Open WebUI's feature list." If you truly want literal parity on the appliance rows too, say so in Section 13 and I will add them — but I would be arguing against your interests.

---

## 2. What I will *not* let you copy from Open WebUI (protect Madav's moat)

Before the borrowing list, the guardrails (confidence: high). These are Madav advantages that a naive "be like Open WebUI" would destroy:

1. **Do not adopt a separate-language backend.** Open WebUI is Python backend + TypeScript frontend; they **cannot share types or logic** across that line and must hand-write/generate the bridge. Madav's `core/` is shared JS today. Keep mono-language so `core/` can be shared across desktop, web, *and* the new cloud tier. This is the single most important "don't."
2. **Do not proxy inference through your servers.** Today Madav streams LLM tokens **client → provider directly** (BYO key), so your servers bear *none* of the token-generation cost. Open WebUI (as a server app) typically sits in the inference path. Keeping inference client-direct is a 10–100× cost advantage at 1M users. Protect it.
3. **Do not abandon zero-knowledge for *secrets*.** Provider keys and connector tokens must stay vaulted/device-held — never readable plaintext on the server. *Content* (chats/projects) is **server-readable + encrypted-at-rest by default** (ratified, Section 13) to enable Claude-like server features, with an optional **E2EE Private mode** (Section 7.8). The moat is *vaulted secrets + an optional private mode*, not zero-knowledge-everything.
4. **Do not rewrite the React UI into Svelte.** Open WebUI uses Svelte; that is irrelevant to Madav. A UI rewrite is months of risk for no user-visible gain. Modernize React (TypeScript, modularization), do not replace it.
5. **Do not bolt on the enterprise-RAG bulk** (9 vector DBs, SCIM-first, Jupyter). Add a modular subset only where a real user needs it.

---

## 3. Madav's North Star & non-negotiables (the design constraints)

Every decision below is checked against these (confidence: high — derived from the codebase and your CLAUDE.md rules):

- **N1 — The Claude experience over local + many cloud apps.** Orchestration (Claude Agent SDK + MCP), connectors, agents/teams, skills, recipes are the product. They must get *stronger and reach the web at scale*, not be diluted.
- **N2 — Two surfaces, one codebase.** Desktop (Electron) + web from a shared `core/` via adapters. Non-negotiable; it becomes *three* runtimes (add cloud).
- **N3 — Single source of truth.** Your mandatory rule: one shared implementation; never two copies. The architecture must make single-source *easier*, not harder, as it grows.
- **N4 — Privacy tiers.** Secrets (provider keys, connector tokens) are always vaulted/zero-knowledge. Content (chats/projects) is **server-readable + encrypted-at-rest by default** to power Claude-like features and multi-device, with an offline-capable local cache and an optional **E2EE Private mode**.
- **N5 — Real document authoring.** xlsx/docx/pptx/pdf generation is a differentiator Open WebUI lacks. Make it deterministic and validated (per the prior analysis), never regress it.
- **N6 — Weak-model robustness.** The PROTECTED weak-model pipeline (recipes, INSPECT_PY, bounded repair) must survive every change — re-verified as a release gate.
- **N7 — Efficient for a small team.** Robust ≠ maximal. Prefer a modular monolith you can operate over microservices you cannot. Defer complexity until load demands it.
- **N8 — Local & private inference (your hardware, your choice).** Users can run open models on their own machine (desktop) or point Madav at any local/self-run endpoint, and **manage those models from Madav's UI**. Madav is never locked to one provider; multi-model + local-first inference is a first-class path, not an afterthought.

---

## 4. Current-state truth (grounded) and the blockers to 1M

**What Madav already does *well* (confidence: high — read from code):**

- **Shared `core/` + adapter pattern** (`core/chat-loop.js`, `core/model-router.js`, `core/turn-helpers.js`, `core/recipes.js`, `core/project-runner.js`, `core/search.js`). Genuinely strong; the spine of everything below.
- **Multi-provider routing** with cooldown/fallback already centralized (Anthropic + OpenAI-compatible + local via OpenRouter/Ollama/vLLM/NIM).
- **Pyodide sandbox on web** already runs `INSPECT_PY` and authored scripts in-browser (`src/bridge/projectEngineWeb.js`). Madav is *already* doing the safe-execution thing for the web project path.
- **Deterministic `INSPECT_PY`** (pandas profiler) — a Madav-owned single source for data shape.
- **Client-direct inference streaming**; the server is a thin OAuth + Stripe + CORS/search proxy.
- **Local-first privacy** with device-held secrets (web localStorage; desktop `safeStorage` encryption).
- **Rich desktop-native tier**: MCP connectors, terminal (node-pty), voice, Telegram, local models, UI automation.

**The 9 hard blockers to 1M users (confidence: high):**

| # | Blocker | Evidence | Consequence at scale |
|---|---|---|---|
| B1 | **Server holds in-memory state** (OAuth `pending` Map, rate-limit `hits` Map) | `server/auth-server.mjs` (code comment: "Swap for a shared store if you run multiple instances") | Cannot run >1 instance correctly; no horizontal scale |
| B2 | **No Redis, no job queue, no workers** | not found in deps/code | No server-side background work; can't run tasks/agents/research for web users |
| B3 | **Scheduled tasks are desktop-only** | `webBridge.js`: "Scheduled tasks run in the desktop app" | Web users get no automation; core feature absent on the scaling surface |
| B4 | **MCP connectors are desktop-only** | `webBridge.js`: "Connecting an MCP server runs in the desktop app" | Web users can't use cloud apps — directly undercuts the mission |
| B5 | **No multi-device sync** (chats/projects/tasks live on one device) | IndexedDB/localStorage only | A user on phone+laptop sees two different Madavs |
| B6 | **No types, no lint, ~528 silent catches, 3-copy office rule** | prior analysis | Defect rate rises with team/codebase size; outages hide |
| B7 | **No observability** (`console.log` only) | prior analysis | You cannot run a 1M-user service you cannot see |
| B8 | **Single Render instance, JSON-file fallback DB** | `render.yaml` (plan: starter), `server/store.mjs` | No capacity, no HA, no DR |
| B9 | **Model-authored code + eval surface remains** (decks via `new AsyncFunction`; desktop shells to system Python) | prior analysis | Instability + security surface that worsens with volume |

Everything in Sections 5–11 exists to convert these nine into strengths without breaking N1–N7.

---
## 5. The ten design principles of "Madav Next"

These are the rules the architecture obeys. Every later choice traces back to one of them (confidence: high).

1. **One language, one core, three runtimes.** TypeScript everywhere. `core/` (typed) is consumed by desktop (Electron), web (browser), and a new **cloud** runtime (server workers). Python exists *only inside sandboxes* (Pyodide / microVM), never as a second backend language. This is what lets single-source scale.
2. **Typed contracts at every boundary.** Zod schemas (compile-time + runtime) define API requests, tool I/O, document specs, job payloads, connector configs. Because client and server share a language, they **share the schema object itself** — no generated bridge. (Open WebUI cannot do this across its Python/TS line.)
3. **Deterministic I/O, sandboxed compute, model kept away from both.** Files are read/written by real libraries; any code the model produces runs only in an isolated sandbox; the model never touches the parser or the privileged interpreter. (The lesson from the Excel analysis, made architectural.)
4. **Cloud-canonical content, zero-knowledge secrets, offline-capable clients.** Synced content is canonical in the cloud, **encrypted at rest and readable** by Madav services (so server-side Claude-like features work); the device keeps an **offline cache** for local-first UX. **Secrets** are never server-readable (vaulted/device-held). An optional **E2EE Private mode** flips a workspace's content to zero-knowledge.
5. **Stateless services + shared state stores.** No instance-local memory for anything that must survive a second instance. State lives in Postgres/Redis/object-storage. Every service scales by adding copies.
6. **Modular monolith first, extract under load.** One deployable backend with hard internal module boundaries (gateway, orchestration, connectors, jobs, documents, sync). Extract a module into its own service only when its scaling profile demands it. No premature microservices.
7. **Async by default for anything slow.** Research, agents/teams, scheduled tasks, document builds, ingestion run on a durable job queue with retries — never inside the request that the user is waiting on.
8. **Inference stays at the edge (client→provider).** Madav orchestrates and never proxies token streams unless CORS forces it. Servers carry coordination, not GPU cost.
9. **Single-source enforced by tooling, not discipline.** Duplication (the 3-copy office rule) is removed structurally and *prevented* by lint rules + a shared-package layout, so the rule survives team growth.
10. **Observability and tests are part of "done."** Every service emits OpenTelemetry traces/metrics/logs; every shared module has typed tests; the PROTECTED weak-model E2E is a release gate. You can see, and prove, that it works.

---

## 6. Target architecture blueprint

### 6.1 The shape: one core, three runtimes, a stateless cloud spine

```
                                 ┌──────────────────────────────────────────────┐
                                 │            CLIENTS (two surfaces)             │
                                 │                                              │
   ┌───────────────┐   typed     │   Desktop (Electron)         Web / PWA       │
   │   PROVIDERS    │◀────────────┤   • local MCP (stdio)        • browser       │
   │ Anthropic /    │  inference  │   • terminal, voice          • Pyodide       │
   │ OpenAI-compat /│  streams    │   • local models             • IndexedDB     │
   │ local models   │  DIRECT     │   • safeStorage              • cache only    │
   └───────────────┘  (no proxy) │        │  both import  ▼  shared core         │
                                 │   ┌──────────────────────────────────────┐   │
                                 │   │   core/ (TypeScript, SINGLE SOURCE)  │   │
                                 │   │  orchestration · model-router ·      │   │
                                 │   │  recipes · project-runner · tools ·  │   │
                                 │   │  search · office-spec · schemas      │   │
                                 │   └──────────────────────────────────────┘   │
                                 └───────────────┬──────────────────────────────┘
                                   HTTPS (typed) │  + WebSocket (events/sync)
                                                 ▼
        ┌────────────────────────────────────────────────────────────────────────────┐
        │                 MADAV CLOUD  (stateless, horizontally scaled)               │
        │                                                                            │
        │  ┌──────────────┐  ┌────────────────┐  ┌───────────────┐  ┌──────────────┐ │
        │  │  Gateway     │  │  Orchestration │  │  Connectors   │  │  Documents   │ │
        │  │ auth/ratelim │  │  (core in      │  │  remote MCP + │  │  authoring + │ │
        │  │ sessions/WS  │  │   cloud runtime)│  │  OAuth vault  │  │  Ingestors   │ │
        │  └──────────────┘  └────────────────┘  └───────────────┘  └──────────────┘ │
        │  ┌──────────────┐  ┌────────────────┐  ┌───────────────┐  ┌──────────────┐ │
        │  │  Jobs/Workers│  │  Compute       │  │  Sync (cloud) │  │  Search proxy│ │
        │  │ BullMQ tasks │  │  sandbox pool  │  │  enc-at-rest  │  │  house key   │ │
        │  │ agents/teams │  │  (microVM)     │  │  +private opt │  │  cache       │ │
        │  └──────────────┘  └────────────────┘  └───────────────┘  └──────────────┘ │
        │         (one deployable "modular monolith" — modules extractable later)     │
        └───────────────┬───────────────┬───────────────┬───────────────┬────────────┘
                        ▼               ▼               ▼               ▼
                 ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐
                 │ Postgres   │  │  Redis     │  │  Object    │  │ pgvector   │
                 │ (Drizzle + │  │ sessions/  │  │  storage   │  │ (optional  │
                 │  Alembic-  │  │ queue/     │  │  S3 (cipher│  │  Knowledge)│
                 │  style mig)│  │ ratelimit/ │  │  -text)    │  │            │
                 │            │  │ pub-sub    │  │            │  │            │
                 └────────────┘  └────────────┘  └────────────┘  └────────────┘
```

### 6.2 The tiers (responsibilities, technology, and *why*)

**Client tier (desktop + web/PWA) — keep React, add TypeScript.** Renders UI, holds the local-first cache (IndexedDB/safeStorage), runs the **shared `core/`** for in-client turns, runs **Pyodide** for light local compute, and streams inference **directly** to the provider. Desktop adds local-only powers (stdio MCP, terminal, voice, local models). *Why React stays:* rewriting the UI buys nothing the user can see and risks everything; the win is types + modularization, not a framework swap.

**Cloud spine — a stateless modular monolith in TypeScript.** Chosen technology (confidence: high for direction, moderate for exact framework): **Node/Bun + Fastify + Zod + Drizzle ORM**, one deployable with hard module seams:

- **Gateway:** OAuth/OIDC, session validation, **rate-limiting and OAuth-state moved to Redis** (kills blocker B1), WebSocket hub for events/sync fan-out, multi-tenant request context.
- **Orchestration:** the **same `core/`** turn loop running server-side for cloud jobs (so web users get agent/team/research runs without a desktop). One orchestration implementation, three runtimes.
- **Connectors:** server-side **remote MCP** execution + a per-user **encrypted OAuth token vault** (envelope encryption via KMS). Brings cloud-app connectors to the web (kills B4). Local stdio MCP stays on desktop (a genuine platform exception).
- **Documents:** deterministic **authoring** (the spec→builder engine, hardened per the prior analysis) + native **Ingestors** (deterministic readers — the Open WebUI loader pattern, reimplemented in Madav's vocabulary).
- **Jobs/Workers:** **BullMQ on Redis** for scheduled tasks, agents/teams, deep research, document builds, ingestion (kills B2/B3). Durable, retried, observable.
- **Compute:** a pooled **server-side sandbox** (microVM/gVisor, or a managed sandbox provider) for heavy/untrusted code the client can't run; light code stays in client Pyodide.
- **Sync:** stores chats/projects/tasks server-side (**encrypted at rest, readable**) for multi-device (kills B5); an optional **E2EE Private mode** stores ciphertext for zero-knowledge workspaces (preserves N4 for that segment).
- **Search proxy:** the existing single search backend (`core/search.js`) with the house key, plus Redis caching.

*Why a modular monolith, not microservices (confidence: high):* your team is small and the workloads are coupled by the shared `core/`. One deployable with clean seams gives you horizontal scale (run N copies) without the operational tax of N services. You extract the one hot module (likely Jobs/Compute) into its own service **only when its scaling curve diverges** — the seams make that a refactor, not a rewrite.

**Data tier.** Postgres (canonical: users, billing, connector vault, task defs, run history, **synced content encrypted-at-rest**, audit) with **versioned migrations**; Redis (sessions, queues, rate-limits, pub/sub); **object storage** (S3-compatible) for generated docs/uploads (encrypted at rest; ciphertext for Private-mode workspaces); **pgvector** for optional Knowledge. One vector system to start — not nine.

### 6.3 The unification that makes this elegant (confidence: high)

The same `core/` module that runs a chat turn on the desktop and in the browser **also runs inside a cloud worker**. A scheduled task for a web user is the *identical* orchestration code path as a desktop run — only the adapter (where Python executes, where files live, where events emit) differs. That is your existing adapter pattern extended to a third runtime. It means: build a capability once in `core/`, get it on **all three** surfaces. No other comparable product (Open WebUI included) has this property, because none of them kept one language across client and server.

---
## 7. Pillar deep-dives

Each pillar states the decision, why it beats or matches Open WebUI, where it lands in the codebase (single-source), and the main risk.

### 7.1 One TypeScript core, three runtimes + shared typed contracts

**Decision (confidence: high).** Migrate `core/` to **TypeScript** first; define all cross-boundary shapes as **Zod** schemas that live in `core/contracts/` and are imported *unchanged* by client and server. Migrate the server to TS next, the renderer last (gradual, file-by-file; `.js`/`.jsx` and `.ts`/`.tsx` coexist during migration).

**Why ≥ Open WebUI.** Open WebUI is typed too (TS + Pydantic), but its types **stop at the language border** — the Python backend and TS frontend cannot share a schema object; they hand-write or codegen the contract and drift. Madav, mono-language, gets **one schema, both sides, zero drift**. That is strictly better single-source than Open WebUI can achieve. (Confidence: high.)

**Where it lands.** `core/contracts/*.ts` (new), consumed by `server/**` and `src/**` and `electron/**`. Removes the 3-copy office rule by construction: the office spec/schema is *one* TS module everyone imports.

**Risk.** A big-bang TS migration would stall the product. Mitigation: enable `allowJs`, migrate `core/` modules one at a time behind tests, never block feature work. Effort: L, spread over phases.

### 7.2 The cloud spine: stateless gateway, Redis, streaming fan-out

**Decision (confidence: high).** Move OAuth-state and rate-limit buckets from in-memory Maps to **Redis** (kills B1). Put **sessions** in Redis. Add a **WebSocket hub** for server→client events (job progress, sync updates, multi-device presence), with Redis pub/sub so any instance can deliver to any connected client. Keep inference **client-direct**; the gateway proxies model calls only when CORS forces it (as today).

**Why ≥ Open WebUI.** Open WebUI also uses Redis for multi-worker WebSocket scaling — this brings Madav to parity on horizontal scale, while Madav *keeps* its inference-offload cost advantage that Open WebUI lacks. (Confidence: high.)

**Where it lands.** `server/gateway/**` (new module boundary inside the monolith). The current `auth-server.mjs` decomposes into `gateway/auth`, `gateway/ratelimit`, `gateway/ws`, `gateway/proxy` — same process, clean seams.

**Risk.** WebSocket fan-out and presence add moving parts. Mitigation: ship Redis-backed rate-limit/OAuth first (small, high value), add the WS hub in a later phase only when cloud jobs need progress push.

### 7.3 Connectors & secrets at scale — local stdio (desktop) + remote cloud (server vault)

**Decision (confidence: high).** Split connectors by transport along the natural platform line:
- **Desktop keeps local stdio MCP** (local apps, terminal, filesystem) — these *cannot* run in the cloud and are a genuine desktop advantage.
- **Cloud gains remote MCP** (HTTP/SSE connectors: Notion, Slack, Gmail, GitHub, Stripe, etc.) executed server-side, with a per-user **encrypted token vault** (envelope encryption; data-encryption-keys wrapped by a KMS master key; tokens decrypted only in-memory for the duration of a call). This brings cloud-app connectors to **web users** (kills B4) — the core of your mission "multiple cloud applications."
- The **connector registry, tool-name mapping (`mcp__server__tool`), and OAuth orchestration logic stay in shared `core/`** so desktop and cloud behave identically.

**Why ≥ Open WebUI.** Open WebUI's "tools" are mostly server-side Python functions and a tool registry; Madav's connector model is **MCP-native and spans local + remote**, which is a broader, more standards-aligned integration surface than Open WebUI offers. With the cloud vault added, Madav matches Open WebUI on "cloud integrations at scale" and exceeds it on "local app + terminal integration." (Confidence: moderate-high.)

**Where it lands.** `core/connectors/**` (registry, mapping, OAuth state machine — shared), `server/connectors/**` (remote MCP runtime + vault), `electron/mcp-manager.cjs` (local stdio runtime, refactored to the shared core contract).

**Risk.** A server-side token vault is a high-value attack target. Mitigation: KMS-wrapped keys, least-privilege, short-lived decryption, full audit log, per-tenant isolation, and a security review gate before launch (Section 7.10).

### 7.4 Cloud execution & durable jobs — tasks, agents, teams, research for everyone

**Decision (confidence: high).** Introduce a **job/worker tier on BullMQ + Redis** (kills B2). Port the desktop runners (`task-runner.cjs`, `mission-runner.cjs`) onto the shared `core/` orchestration so the **same logic** runs as a cloud worker. Then:
- **Scheduled tasks** run in the cloud for web users (kills B3) — no desktop required. Desktop still runs local-targeted tasks.
- **Agents/teams** execute headless as durable jobs with retries and run history persisted in Postgres.
- **Deep research** becomes a job (fan-out search → fetch → verify → synthesize) instead of a long foreground request.
- **Document builds and ingestion** run as jobs for large inputs.

**Escalation to durable workflows (confidence: moderate).** Start with BullMQ (simple, Redis-native). If agent/research workflows grow to long, multi-step, must-not-lose-progress runs, adopt **Temporal** for durable execution. Do *not* start with Temporal — it is operational weight you don't yet need (principle 6).

**Why ≥ Open WebUI.** Open WebUI relies on its **Pipelines** plugin framework and external schedulers for heavy/automated work; Madav gets **first-class, typed, observable jobs running the same orchestration core as interactive chat** — a cleaner story than Open WebUI's bolt-on pipelines. (Confidence: moderate.)

**Where it lands.** `core/jobs/**` (job definitions/contracts, runner logic — shared), `server/workers/**` (BullMQ processors), reuse `core/recipes.js` + `core/project-runner.js` unchanged.

**Risk.** Background jobs invoking user providers/keys raises the question "whose key runs a cloud task?" Mitigation: explicit per-task key policy (user-supplied key stored E2EE and used only for that task, or a Madav house key with billing) — a Section 13 decision.

### 7.5 Code execution & sandboxing — unify what already exists, add server Compute

**Decision (confidence: high).** Make sandboxed execution a **first-class shared service**, not scattered paths:
- **Client/light:** keep and *standardize* **Pyodide** (already used in `projectEngineWeb.js`) behind a `core/` `runCode()` contract; use it on the web for INSPECT/author/run.
- **Desktop/local:** keep the bundled/subprocess Python behind the *same* `runCode()` contract, retaining the destructive-command guard and `PYTHONSAFEPATH`.
- **Cloud/heavy or untrusted:** add a **server-side sandbox pool** (Firecracker/gVisor microVMs or a managed sandbox provider) for jobs that exceed Pyodide's reach (big files, native deps).
- **Retire `new AsyncFunction` as a *privileged* path.** Deck/code generation runs only inside a sandbox (worker/Pyodide/microVM); the unguarded main-thread eval fallback is removed.

**Why ≥ Open WebUI.** Open WebUI uses Jupyter (server) + Pyodide (client) + RestrictedPython (tools). Madav reaches the *same three-tier sandbox maturity* but with a **lighter operational footprint** (Pyodide-first, microVM pool only for the heavy tail, no always-on Jupyter server). Parity on safety, better on ops. (Confidence: moderate-high.)

**Where it lands.** `core/sandbox/runCode.ts` (contract + Pyodide impl shared), `server/compute/**` (microVM pool), `electron/run-*.cjs` (local impl to the same contract).

**Risk.** Pyodide can't run every Python package the model might import. Mitigation: a capability manifest (supported packages), micropip for pure-Python wheels, and automatic fallback to the cloud microVM pool for unsupported imports — logged, never silent.

### 7.6 Documents — deterministic authoring + native "Ingestors"

**Decision (confidence: high).** Two clean halves, both deterministic, neither dependent on the model writing I/O code:
- **Authoring (Madav's differentiator):** keep the spec→builder engine; apply the prior analysis's hardening — **Zod schema gate, no silent truncation, build-time formula validation, structured `issues[]`, escalation ladder**. This is unique to Madav; Open WebUI cannot author spreadsheets.
- **Ingesting (absorb Open WebUI's strength, natively):** a new **`Ingestors`** subsystem — deterministic readers for xlsx/csv/docx/pdf/pptx that extract a typed preview (sheets, dims, headers, dtypes, samples), extending the existing `INSPECT_PY` rather than asking the model to parse. Pluggable engines (native pandas/openpyxl first; optional OCR/Tika/Docling-style engine later) with **logged** fallbacks — the Open WebUI loader pattern, reimplemented in Madav's words and code.

**Why ≥ Open WebUI.** Open WebUI **only ingests**; Madav will ingest *and* author with equal rigor. On ingestion Madav reaches parity (same deterministic, layered approach); on authoring Madav is in a category Open WebUI doesn't occupy. (Confidence: high.)

**Where it lands.** `core/documents/authoring/**` (spec, schema, builders — shared), `core/documents/ingestors/**` (reader contract + `INSPECT` extension — shared), with platform execution via the `runCode()` sandbox contract.

**Risk.** Scope creep into "support every file type." Mitigation: ship the 5 formats users actually upload (xlsx/csv/pdf/docx/pptx); add engines by demand, each logged and tested.

---
### 7.7 Data tier — Postgres + migrations, Redis, object storage, one vector store

**Decision (confidence: high).** Make **Postgres the canonical store** for server-owned data (users, billing, connector vault, task definitions, run history, audit, and synced content — encrypted at rest, server-readable by default, ciphertext for Private mode), with **versioned migrations** (Drizzle migrations — the TypeScript-native equivalent of Open WebUI's Alembic). **Redis** for sessions/queues/rate-limits/pub-sub. **Object storage (S3-compatible)** for generated documents and uploads, **encrypted at rest** (server-readable by default; ciphertext for Private mode). **pgvector** for optional Knowledge. The cloud is canonical for synced content; the device keeps an **offline cache** (IndexedDB/safeStorage) for local-first UX.

**Why ≥ Open WebUI.** Open WebUI offers SQLite/Postgres/MySQL + Alembic + 9 vector DBs. Madav matches on the relational + migration story and **deliberately picks one vector store** (pgvector, with a documented scale-out option) — the right call for a hosted product, justified in the table rather than hidden. (Confidence: high.)

**Where it lands.** `server/db/**` (Drizzle schema + migrations), `core/contracts/**` (shared row/DTO types). 

**Risk.** Migrations on a 1M-row table can lock. Mitigation: expand-contract migration discipline, online index builds, tested on a staging copy — codified in the runbook.

### 7.8 Storage & privacy tiers — server-readable by default, on one encryption abstraction

**The ratified model (confidence: high).** Per Section 13, Madav uses **tiered privacy on a single encryption abstraction** — not zero-knowledge-everything, and not naive plaintext:

- **Secrets (provider API keys, connector OAuth tokens) — always zero-knowledge.** Device-held on desktop (`safeStorage`); on the server, a KMS-wrapped vault where plaintext exists only in memory for the duration of a call. Never server-readable. The strong half of the old promise — *"your keys never touch our servers"* — stays literally true.
- **Content (chats, projects, tasks) — server-readable, encrypted-at-rest, by default.** This is the deliberate choice that *enables* Claude-like server features (server-side memory, search/RAG over your data, cloud agents acting on history) and effortless multi-device. The cloud is canonical; the device keeps an **offline cache** for local-first UX.
- **Optional E2EE "Private mode"** — a per-workspace switch that flips that workspace's content to client-encrypted ciphertext (zero-knowledge), with server-side features gracefully degrading there. Shipped later, off the critical path.
- **One pipe, a key-custody policy.** All three are the *same* storage path with a `custody` parameter (`server-readable` | `e2ee-private` | `device-only`). You do **not** fork the codebase; you choose custody per workspace. Build `server-readable` first; add the other policies later without rearchitecting — which is exactly the single-source way to keep options open.

**Why this serves the goals.** Fastest path to "stable, fast, and like Claude": the default is the simple, well-trodden Claude.ai-class model (encrypted at rest, readable), so every server-side Claude feature you copy in future *just works*; multi-device is trivial; support and debugging are normal. Privacy-sensitive users still get an E2EE option no hosted Open WebUI deployment offers.

**The brand note (confidence: high — a product decision, now ratified).** This changes the current public line "*keys and chats never touch our servers*": the **keys** half remains true; the **chats** half does not, by default. Reposition as *"your keys are always yours; an end-to-end-encrypted Private mode is available for sensitive work."* Still stronger than Claude.ai's posture, and honest.

**Why ≥ / = Open WebUI.** A hosted Open WebUI deployment is also custodial (the operator can read content); Madav's default matches that **and** adds an E2EE Private mode hosted Open WebUI does not offer, while keeping secrets vaulted. Parity by default, an edge for the privacy segment. (Confidence: moderate-high.)

**Where it lands.** `core/storage/**` (record model, the `custody` policy, the encryption-envelope interface — shared), `server/storage/**` (encrypted-at-rest content store + delta/sync API), `core/sync/**` (multi-device delta/merge — custody-agnostic). E2EE crypto for Private mode is an additive module behind the same envelope.

**Risk.** Server-readable content makes Madav a **content custodian** — a new responsibility (encryption at rest, access control, breach blast-radius, retention/deletion, compliance). Mitigation: encryption at rest + strict access controls + tenant isolation + audit logging from day one; E2EE Private mode for the segment that needs zero-knowledge; a clear data-handling policy. (See the updated threat model in 7.10.)

### 7.9 Identity, multi-tenancy, RBAC, SSO/SCIM — modular, enterprise-ready

**Decision (confidence: high).** Keep consumer OAuth (Google/GitHub) as today. Add a **tenant/workspace** concept (a user belongs to one or more workspaces) with **RBAC** (owner/admin/member/viewer) enforced at the gateway and in row-level access. Make **SSO (OIDC/SAML) and SCIM provisioning** an **optional enterprise module**, dark by default, lit per workspace. Audit logs for sensitive actions (connector grants, data export, admin).

**Why ≥ Open WebUI.** Open WebUI has rich RBAC + SCIM + LDAP because it targets enterprises self-hosting for many users. Madav reaches **functional parity on the access-control rows that a 1M-user SaaS needs** while keeping the enterprise directory features modular (not forced on every consumer). Parity where it matters; lighter where it doesn't. (Confidence: moderate.)

**Where it lands.** `core/auth/**` (RBAC policy — shared), `server/identity/**` (SSO/SCIM adapters, optional).

**Risk.** RBAC retrofits are painful if added late. Mitigation: introduce the tenant/role columns and the policy-check seam in Phase 0–1 (cheap), even if SSO/SCIM ships much later.

### 7.10 Observability, security & the threat model

**Observability (confidence: high).** **OpenTelemetry** across gateway, orchestration, jobs, connectors, compute (traces/metrics/logs); structured logs replacing `console.log`; error tracking (Sentry-class); product metrics (turn latency, tool success rate, **document truncation/repair events**, sandbox fallbacks, job durations). You manage 1M users by seeing them. This brings Madav to **parity** with Open WebUI's built-in OTel and beyond on product-specific signals.

**Security & threat model (confidence: high — this is mandatory at scale).** The new surfaces each get an explicit control:

| Asset / surface | Threat | Control |
|---|---|---|
| Connector token vault | Token theft / lateral access | KMS-wrapped DEKs, in-memory-only decryption, least privilege, per-tenant isolation, audit |
| Sandbox (client + cloud) | Sandbox escape, resource abuse | Pyodide WASM isolation; microVM (Firecracker/gVisor) for cloud; CPU/mem/time quotas; no ambient credentials in sandbox |
| Synced content (default, server-readable) | DB/server compromise exposes content | Encryption at rest, strict access control, tenant isolation, audit log, retention/deletion policy; **E2EE Private mode** for sensitive tenants |
| E2EE Private mode (optional) | Server reading opted-in content | Zero-knowledge by construction; server holds ciphertext only |
| Model-authored code | Injection into privileged context | No `eval` in privileged scope; all generated code runs sandboxed; destructive-command guard retained |
| Multi-tenant data | Cross-tenant leakage | Tenant-scoped queries, row-level checks, tested isolation |
| Inference keys & connector tokens | Exfiltration | Client-direct by default; **vaulted (never server-readable)** if synced; never logged |
| CSP | XSS / eval abuse | Tighten CSP; `unsafe-eval` only where the sandboxed worker needs it, on both surfaces |

A **security review is a release gate** for the secrets/connector vault, the server-readable content store, E2EE Private mode, and the cloud sandbox (use your existing `security-review` workflow). (Confidence: high.)

### 7.11 Knowledge / RAG — modular, Madav-native, optional

**Decision (confidence: moderate).** Offer a **modular Knowledge** capability: deterministic ingestion (the `Ingestors` from 7.6) → chunk → embed → **pgvector** with **hybrid retrieval** (BM25 + vector), surfaced through Madav's existing **Projects** concept ("ask across this project's files"). One vector store, one embedding path to start. It is **opt-in**, not the center of gravity (Madav authors and orchestrates; RAG is a feature, not the identity).

**Why = Open WebUI (deliberately not >).** Open WebUI is a RAG platform; Madav need not out-RAG it. Reaching "solid, hybrid, pgvector-backed RAG inside Projects" is **parity for Madav's needs**, and the table will say so plainly. Spending to match nine vector DBs would be waste. (Confidence: high on the strategy.)

**Where it lands.** `core/knowledge/**` (chunking/retrieval contracts — shared), `server/knowledge/**` (embedding + pgvector). Deferred to a later phase.

**Risk.** RAG can balloon. Mitigation: keep it inside Projects, one store, demand-driven.

### 7.12 Two-surface + PWA/mobile delivery over one typed API

**Decision (confidence: high).** Treat desktop, web, and **PWA/mobile** as clients of the **same typed API + same `core/`**. Ship the web app as an installable **PWA** (offline cache, push) — covering mobile without a separate native codebase initially. Desktop remains the thick client with local powers; invest in **auto-update, code-signing, crash reporting** for desktop at scale.

**Why ≥ Open WebUI.** Open WebUI is single-surface (server-rendered web + PWA). Madav delivers **desktop + web + PWA from one codebase with a shared core and shared types** — a breadth and consistency Open WebUI structurally cannot match. Clear Madav win. (Confidence: high.)

**Where it lands.** `src/**` (PWA manifest/service worker), shared `core/` unchanged; `electron/**` updater/signing.

**Risk.** Desktop distribution at scale (signing, updates, crashes) is real work. Mitigation: a dedicated desktop-release runbook + auto-update infra in the hardening phase.

### 7.13 Local models & private inference — Ollama-class, the Madav way

**Decision (confidence: high).** Make local models a **first-class, managed** capability (N8), not just "another endpoint." A shared `core/models/local` contract (`list / pull (+progress) / delete / create-variant / health`) abstracts the local runtime; the shared `src/` model picker gains a **Local models** section (installed list, pull-by-name with progress, delete, and "create a variant" = base model + system prompt + params). The **model-builder already exists** as Madav's Agents/Personas — a local-model variant is just an Agent pinned to a local base — so we reuse it rather than inventing a parallel concept.

**Two tiers (deliberately staged, per the robustness + efficiency rules):**
- **Tier 1 — connect + manage (high value, low risk):** detect and (optionally one-click) install **Ollama**/llama.cpp on desktop, then drive its REST API (`/api/tags`, `/api/pull`, `/api/create`, `/api/delete`, `/api/generate`) through the shared contract. Inference runs on the **user's own hardware** — a genuine desktop-native advantage. Web connects to a user-run local endpoint where the origin allows.
- **Tier 2 — deeper, later:** an optional **bundled runtime** (ship/auto-provision a runtime so non-technical users get local models with zero setup) and optional **in-browser WebGPU** small models (transformers.js / WebLLM) for the web surface. Staged because bundling a multi-GB runtime across the GPU-driver matrix (CUDA/Metal/ROCm/Vulkan) is real installer + maintenance weight — even Open WebUI mostly *connects to* Ollama and co-packages it rather than reimplementing inference.

**Why ≥ / = Open WebUI.** On the **desktop**, Madav matches Open WebUI's manage/pull/create UX **and** runs on the user's local hardware, with the model-builder already native (Agents). On the **web**, both are limited to small WebGPU models or a connect-to-local endpoint — physics, not a Madav gap. Net: **parity-to-win on desktop, honest parity on web.** (Confidence: moderate-high.)

**Where it lands.** `core/models/local/**` (the lifecycle contract — shared), shared `src/**` picker UI, `electron/**` (desktop runtime manager: detect/install/drive Ollama; bundled runtime later), and a thin web adapter (connect-to-endpoint; optional WebGPU). Single-source: one contract + one UI; only the runtime backend differs per surface (allowed platform plumbing).

**Risk.** Local runtimes are a moving target (versions, model/quant formats, hardware variance) and bundling is heavy. Mitigation: ship Tier 1 (connect/manage) first behind the shared contract; keep the bundled runtime and WebGPU as opt-in Tier 2; never block a turn on a slow local pull (async + progress UI).

---
## 8. The "native, not copied" doctrine + translation table

You asked that anything borrowed from Open WebUI read as **built by and for Madav**. That is achieved by **reimplementing patterns on top of Madav's existing vocabulary and architecture**, with original code — never by copying source (which is also required by Open WebUI's license: BSD-3-style with a branding-preservation clause; copying files would carry obligations, reimplementing ideas does not). The good news: Madav already has native concepts for almost everything Open WebUI does, so absorption is natural, not bolted-on.

**Doctrine (confidence: high):**
1. **Express every borrowed capability in Madav's nouns** — Workrooms, Projects, Agents, Teams, Skills, Recipes, Connectors, Ingestors, Compute, Knowledge — not Open WebUI's nouns.
2. **Route it through the shared `core/`** so it inherits Madav's adapter pattern, model router, recipes, and permission gates — making it behave like the rest of Madav by construction.
3. **Original implementation, Madav naming, Madav UX.** Same *idea* as Open WebUI, different *code, names, and feel*.
4. **No copied source, no copied branding, no copied license-encumbered assets.**

**Translation table — Open WebUI concept → Madav-native construct:**

| Open WebUI concept | Madav-native equivalent (built on what Madav already has) |
|---|---|
| Document **Loaders** (Unstructured/Tika/Docling/pandas) | **Ingestors** — extend the existing `INSPECT_PY` profiler into a deterministic reader subsystem in `core/documents/ingestors/` |
| **Code interpreter** (Jupyter) + Pyodide | **Compute** — the existing Pyodide path standardized via `core/sandbox/runCode()`, plus a cloud microVM pool |
| **Pipelines / Functions** plugin framework | **Skills + Recipes** (already native) — Markdown playbooks + proven-script replay, now runnable as cloud jobs |
| **Tools** (Python function registry) | **Connectors** (already native, MCP-based) — local stdio on desktop, remote in the cloud vault |
| **Knowledge / RAG** + 9 vector DBs | **Knowledge** inside **Projects** — pgvector hybrid retrieval, one store |
| **Channels / multi-user** | **Workrooms / Teams** (already native) |
| **Model Builder** (custom characters) | **Agents / Personas** (already native, with archetypes + 50+ personas) |
| **Observability** (built-in OTel) | **Insight** — OTel + Madav product metrics (truncation/repair/job signals) |
| **RBAC / SCIM / LDAP** | **Workspaces + Roles** (new, modular) — consumer OAuth default, enterprise SSO/SCIM optional |
| **Persistent Artifact Storage** | **Sync** — server-readable & encrypted-at-rest, multi-device; optional **E2EE Private mode** |

A reviewer auditing the result will see Madav concepts end-to-end, implemented in Madav's TypeScript core — which is the literal truth, because the capabilities are absorbed into Madav's own constructs rather than pasted in.

---

## 9. Scaling to 1M users — capacity, the cost advantage, SLOs

### 9.1 The structural advantage you must not give up (confidence: high)

Most "AI apps" die at scale because they **proxy inference** — every token streams through their servers and bills their GPU budget. **Madav does not**: inference is **client → provider direct (BYO key)**. At 1M users, Madav's servers carry **coordination, sync, connectors, jobs, search** — all cheap, bursty, and cacheable — **not** token generation. This makes 1M users *plausible on a modest backend* and is the reason this plan is realistic rather than aspirational. Every decision above protects this property.

### 9.2 Per-tier scaling strategy

| Tier | Scales by | Bottleneck | Mitigation |
|---|---|---|---|
| Gateway/API | Stateless replicas behind a load balancer | Connection count, auth checks | Redis sessions/rate-limit; autoscale on CPU/RPS |
| WebSocket hub | Stateless replicas + Redis pub/sub | Concurrent sockets | Shard by tenant; horizontal add |
| Orchestration (cloud) | Stateless replicas (same `core/`) | Provider rate limits (not CPU) | Per-user concurrency caps; queue overflow |
| Jobs/Workers | Add worker processes | Long jobs hogging workers | Priority queues; separate queues per job class; concurrency limits |
| Compute (sandbox) | Pool of microVMs | CPU/mem of heavy runs | Quotas, autoscaled pool, Pyodide-first to keep load off it |
| Postgres | Read replicas + partitioning | Write hotspots, big tables | Partition run-history/sync by tenant/time; expand-contract migrations |
| Redis | Cluster mode | Memory, hot keys | Shard; TTL discipline; separate cache vs queue instances |
| Object storage | Effectively infinite (S3) | Egress cost | CDN for static; lifecycle policies |

### 9.3 SLOs to design against (confidence: moderate — targets to ratify)

- API p99 latency < 300 ms (excluding model streaming, which is client-direct).
- Chat turn start (first token) < 1.5 s p95.
- Job pickup latency < 5 s p95; scheduled-task firing within ±30 s of schedule.
- Availability 99.9% (consumer) → 99.95% (enterprise tier).
- Zero cross-tenant data exposure (hard invariant, tested).
- Sync delta apply < 2 s p95 across devices.

### 9.4 Cost envelope (order-of-magnitude, confidence: low-moderate — for sizing intuition, not budgeting)

Because inference is offloaded, the dominant costs are Postgres, Redis, workers, object storage, and bandwidth. For ~1M registered / low-hundreds-of-thousands MAU, this is a **mid-size managed-infra footprint** (a clustered Postgres, a Redis cluster, an autoscaling worker fleet, S3 + CDN), not a GPU fleet. The microVM Compute pool is the main variable cost and is bounded by quotas and Pyodide-first routing. A real capacity/cost model is a Phase-1 exercise once telemetry exists.

### 9.5 Resilience & DR (confidence: high on the need)

Multi-AZ from the start (managed Postgres/Redis); backups + point-in-time recovery; tested restore; graceful degradation (if Jobs is down, interactive chat still works; if Connectors is down, local desktop connectors still work). **Multi-region is a late-phase item**, added when latency/sovereignty demands it — not day one (principle 6).

---

## 10. Target "Architecture & Technology" table — Madav = or > Open WebUI

This is the Section-2 table from the comparison, re-scored **after this plan is implemented**. "Madav target" is the post-transformation state. Verdict is judged on Madav's mission + 1M-robustness (per Section 1's reframed metric).

| Dimension | Open WebUI | **Madav (target)** | Verdict |
|---|---|---|---|
| Language/single-source | TS frontend + **Python backend** (cannot share types across the line) | **Mono-TypeScript**; one `core/` + shared Zod contracts across desktop/web/cloud | **Madav > ** (true single-source client↔server) |
| Backend | FastAPI + Pydantic + SQLAlchemy/Alembic | Fastify + Zod + Drizzle + migrations, stateless modular monolith | **=** (typed, migrated, layered) |
| Frontend | SvelteKit + TS | React + **TypeScript** + modularized + design system | **=** (typed UI; framework is a wash) |
| Surfaces | Single (web + PWA) | **Desktop + Web + PWA from one codebase + shared core** | **Madav >** |
| Inference cost path | Often server-proxied | **Client→provider direct** (servers bear no token cost) | **Madav >** (structural cost win) |
| Reading files | Deterministic loaders (good) | **Ingestors** — deterministic, layered, logged (same pattern, native) | **=** |
| Authoring files (xlsx/docx/pptx/pdf) | **Not supported** | Deterministic, schema-validated, formula-checked authoring | **Madav >** (category OWUI lacks) |
| Code execution | Jupyter (server) + Pyodide + RestrictedPython | **Compute**: Pyodide-first + cloud microVM pool (lighter ops, same safety) | **=** safety, **Madav >** ops simplicity |
| Connectors/integrations | Server-side tools + Pipelines | **MCP-native: local stdio (desktop) + remote vault (cloud)** | **Madav >** (broader, standards-based) |
| **Local & private inference** | Ollama integration + model builder (server self-host) | **Managed local models** (pull/create/manage) on the **user's own hardware** (desktop); model-builder = native Agents; connect-to-endpoint + optional WebGPU on web | **Madav >** desktop; **=** web |
| Database | SQLite/PG/MySQL + Alembic | Postgres + Drizzle migrations + Redis + S3 | **=** |
| Vector DBs | **9 options** | **pgvector (+1 scale option)** — deliberate | **Madav = (by design)**; divergence justified |
| Async/jobs | Pipelines + external schedulers | **First-class BullMQ jobs on the same `core/`** (tasks/agents/research) | **=**/**Madav >** (unified with chat) |
| Privacy | Self-hosted (you run it) | Hosted; **content encrypted-at-rest & server-readable by default** (Claude.ai-class) + **always-vaulted secrets** + **optional E2EE Private mode** | **=** by default; **Madav >** with Private mode or on secret handling |
| Identity/RBAC/SSO | RBAC + SCIM + LDAP (enterprise-first) | Workspaces + RBAC; **optional** SSO/SCIM module | **=** where it matters; lighter by design |
| Observability | Built-in OpenTelemetry | **Insight**: OTel + Madav product metrics | **=**/**Madav >** (product-specific signals) |
| Horizontal scale | Redis + multi-worker | Redis + stateless replicas + workers | **=** |
| Lint/format/types in CI | Configured (lint CI currently disabled) | **ESLint+Prettier+tsc, gated in CI** alongside parity tests | **Madav >** (actually enforced) |
| Testing | pytest + Playwright + Cypress | Parity suite + unit/integration + Playwright + **golden-file doc tests** + load tests | **=**/**Madav >** |
| Deployment shape | Docker/Helm/Kustomize self-host | Hosted SaaS (containers/autoscale) + signed desktop app | Different by design (both valid) |

**Net (confidence: moderate-high):** after implementation, Madav is **> Open WebUI on the rows central to its mission** (single-source, surfaces, authoring, connectors, cost path, enforced standards), **= on the industrial rows** (typed backend, migrations, sandboxing safety, observability, horizontal scale, testing, and privacy-by-default with an optional E2EE edge), and **deliberately divergent — with a stated reason — on the enterprise-RAG-appliance rows** (vector-DB count, SSO-first, self-host shape). That satisfies your "= or >" goal under an honest definition, and it would survive scrutiny.

---
## 11. Phased roadmap (0 → 4) — sequenced, shippable, measurable

Each phase is independently valuable, preserves N1–N7, and is checked for **single-source** compliance and **PROTECTED weak-model pipeline** survival (re-run that E2E as the release gate every phase). Effort tags are engineering size (S/M/L/XL), not your time.

> **Re-sequenced after the ratified decisions (2026-06-23):** because content sync is now **server-readable**, multi-device (B5) is resolved *early and simply* in Phase 1 instead of waiting on E2EE. The hard crypto work (E2EE Private mode) moves **off the critical path** to an optional Phase 4 item. The spine ships sooner.

### Phase 0 — Foundations & truth (de-risk; no new user features)
**Objective:** make the codebase typed, observable, and honest before scaling anything.
**Scope:** migrate `core/` to TypeScript with shared **Zod contracts**; remove the 3-copy office rule structurally; add **ESLint+Prettier+tsc** gated in CI next to parity tests; replace silent `} catch {}` in office/data paths with logged errors; add **OpenTelemetry + structured logging** to the server; ship the **Excel-stability hardening** from the prior analysis (schema gate, no silent truncation, formula validation, escalation ladder, golden-file tests).
**Exit metrics:** 0 lint/type errors in CI; office/data paths emit structured logs; golden-file doc tests green; PROTECTED weak-model E2E green. **Effort: L.**
**Why first:** every later phase is safer on a typed, observable base; this also directly fixes your current Excel pain.

### Phase 1 — Stateless cloud spine + server-readable sync (scale + multi-device)
**Objective:** run more than one server instance correctly, and make Madav the same on every device.
**Scope:** move OAuth-state + rate-limits + sessions to **Redis** (kills B1); decompose `auth-server.mjs` into gateway modules (auth/ratelimit/proxy/ws) within the monolith; introduce **Postgres as canonical** + **Drizzle migrations** (kills B8); add **object storage**; stand up **shared typed API contracts**; build the **storage/encryption abstraction** and ship **server-readable content sync + multi-device** (kills B5) with secrets staying vaulted; **(parallel client workstream) ship local-model management Tier 1** — detect/one-click-install Ollama and drive its lifecycle (pull/create/delete) from the shared model picker, with Agents as the model-builder (N8); add load tests (k6).
**Exit metrics:** N identical instances pass an isolation test; p99 API < 300 ms under load; an edit on laptop appears on phone < 2 s; secrets verified never server-readable; a user pulls and runs a local Ollama model from Madav's UI; migrations clean on staging. **Effort: L–XL.**

### Phase 2 — Cloud execution & connectors (deliver the mission on the web)
**Objective:** web users get cloud connectors + server-run automation.
**Scope:** **BullMQ job/worker tier** (kills B2); port task/agent/team/research runners onto shared `core/` as cloud jobs; **server-side remote MCP + encrypted connector vault** (kills B4); **cloud scheduled tasks** (kills B3); standardize **`runCode()`** (Pyodide-first) and add the **cloud microVM Compute pool**; retire the unguarded `AsyncFunction` fallback (mitigates B9).
**Exit metrics:** a web-only user connects Notion/Slack/Gmail and runs a scheduled task with no desktop; jobs observable end-to-end; security review of the vault + sandbox passed. **Effort: XL.**
**Single-source check:** runners must be the *same* `core/` logic as desktop — no parallel cloud copy.

### Phase 3 — Knowledge, enterprise & hardening (scale-out & up-market)
**Objective:** optional RAG, enterprise readiness, and 1M-grade resilience.
**Scope:** **Knowledge** (pgvector hybrid retrieval inside Projects); **Workspaces + RBAC**, optional **SSO/SCIM**; multi-AZ + read replicas + partitioning; desktop **auto-update/signing/crash-reporting**; **multi-region** only if latency/sovereignty requires; **local-model Tier 2** (optional bundled runtime + in-browser WebGPU small models); full DR drill.
**Exit metrics:** load test to target concurrency with SLOs met; DR restore rehearsed; enterprise pilot on SSO. **Effort: XL.**

### Phase 4 — Optional: E2EE Private mode + advanced privacy (off critical path)
**Objective:** offer zero-knowledge content to the segment that wants it, without disrupting the default.
**Scope:** implement the `e2ee-private` custody policy behind the existing storage envelope (client-side `XChaCha20-Poly1305`, user-held master key via Argon2id, multi-device key exchange, recovery code); per-workspace toggle; graceful degradation of server-side features in private workspaces.
**Exit metrics:** a Private-mode workspace stores only ciphertext (verified); default workspaces unchanged; external crypto review passed. **Effort: L–XL.** **Prioritize only when a privacy-sensitive segment or enterprise requires it.**

**Sequencing note (confidence: high):** Phases 0→1→2 are the spine and should be in order. Phase 3 (Knowledge/enterprise) and Phase 4 (E2EE Private mode) are demand-driven and do not block the spine. Do **not** attempt Phase 2+ before Phase 0 — typing and observability are what make the hard phases safe.

---

## 12. Anti-over-engineering — what NOT to build (or defer)

Robust ≠ maximal. Explicit "don'ts" (confidence: high), because the easiest way to fail at 1M is to over-build for it on day one:

- **No microservices yet.** Modular monolith until a module's scaling curve forces extraction. Microservices now = operational tax your team can't pay.
- **No Temporal yet.** BullMQ first; adopt durable workflows only when research/agent runs demand them.
- **No 9 vector DBs, ever.** pgvector + one scale option. Justify the divergence; don't apologize for it.
- **No Jupyter server.** Pyodide-first + microVM tail.
- **No multi-region on day one.** Multi-AZ first; region expansion when data demands.
- **No UI framework rewrite.** Modernize React; don't chase Svelte.
- **No server-side inference proxying** beyond the CORS fallback. Protect the cost moat.
- **No plaintext storage of *secrets*.** Provider keys and connector tokens are always vaulted/encrypted, never server-readable. (Content *is* server-readable encrypted-at-rest by ratified decision — that's deliberate; secrets are the hard line.)
- **No big-bang TypeScript migration.** Gradual, `allowJs`, behind tests.
- **Don't regress the PROTECTED weak-model pipeline** to chase elegance. It is a release gate, not a refactor target.

---

## 13. Decisions only you can make (ratify before build)

These are genuine forks; my recommendation is first, with the reason. (Confidence on recommendations: high unless noted.)

> **RATIFIED 2026-06-23:** Decisions **1** and **2** are confirmed by the owner and are now the keystone the build plans against. Decisions 3–8 remain open.

1. ✅ **Backend language — mono-TypeScript. RATIFIED.** One TS `core/` across desktop/web/cloud; Python confined to sandboxes (Pyodide/microVM) + optional bounded workers. Reinforced by the "keep adopting Claude features" requirement: the Claude Agent SDK, Claude Code, and the MCP SDK are TypeScript-first, so absorbing future Claude concepts is near copy-paste in TS and a translation tax in any other language.
2. ✅ **Storage/privacy model — tiered, server-readable content by default. RATIFIED.** Secrets always vaulted/zero-knowledge; **content (chats/projects) server-readable + encrypted-at-rest by default** (Claude.ai-class) to power Claude-like server features and multi-device; **optional E2EE Private mode** as a later, off-critical-path policy on the same encryption abstraction (Section 7.8). Accepted tradeoff: Madav becomes a content custodian and the public "chats never touch our servers" line is repositioned to "your keys are always yours; Private E2EE mode available."
3. **Whose key runs a cloud job?** *Recommend: a metered Madav house key with billing for cloud jobs (simplest, and consistent with server-readable content), plus an option to supply your own key per task.* Affects pricing + privacy. Pick the default.
4. **Knowledge/RAG priority.** *Recommend: Phase 4, modular, inside Projects.* Confirm it's not a Phase-1 ask (it would slow the spine).
5. **Enterprise (SSO/SCIM/RBAC) timing.** *Recommend: seam in Phase 1, feature in Phase 4.* Earlier only if a paying enterprise is waiting.
6. **Hosting target.** *Recommend: containers on an autoscaling platform (keep it boring) — stay on a PaaS as long as it scales, move to K8s only if forced.* Confirm appetite.
7. **Mobile.** *Recommend: PWA first; native only if a store presence is required.* Confirm.
8. **Literal vs reframed "≥ Open WebUI."** *Recommend: the reframed metric in Section 1.* If you want literal parity on the appliance rows, I'll add them (and argue against it).

---

## 14. Confidence & caveats

- **Architecture direction (confidence: high).** The mono-TS / one-core-three-runtimes / deterministic-IO + sandbox / server-readable sync (optional E2EE Private mode) / stateless-modular-monolith design is well-supported by what Madav already is and what 1M users require.
- **Current-state facts (confidence: high, time-sensitive).** Grounded in a read-only review while another session was active; line-level details (in-memory rate-limit/OAuth-state, Pyodide-on-web, INSPECT_PY, desktop-only MCP/scheduler, no Redis/queue, client-direct streaming, OAuth+Stripe server) were accurate at read time — re-confirm before building, as the other session may change them.
- **E2EE Private mode (optional, deferred) (confidence: moderate).** Now off the critical path — default sync is server-readable. When Private mode is built (Phase 4), key-management/multi-device/recovery needs a dedicated security spike + external review before enabling.
- **Cost/SLO numbers (confidence: low-moderate).** Sizing intuition only; a real capacity model is a Phase-1 task once telemetry exists.
- **"= or > Open WebUI" (confidence: moderate-high).** True under the reframed, mission-weighted metric in Section 1; *not* claimed as literal feature-for-feature parity on the enterprise-RAG-appliance rows, which Madav should deliberately not match.
- **Scope (confidence: high).** This is a plan, not an implementation. No repository code was written; nothing in the Madav tree was modified.

---

### One-line summary
Go mono-TypeScript and run one shared `core/` across desktop, web, and a new stateless cloud tier; read with deterministic Ingestors and run code only in sandboxes; keep secrets vaulted and content server-readable for speed and Claude-like features (optional E2EE Private mode later); keep inference client-direct; and grow a modular monolith into scale rather than over-building microservices — and Madav becomes better-engineered than Open WebUI for what Madav is, at 1M users, without ever looking copied.
