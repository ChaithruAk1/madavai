# Madav Web ↔ Desktop — Parity Scorecard

**Date:** 2026-06-18 · **Basis:** the capability manifest (`src/bridge/webCapabilities.js`), the bridge delta
(`webBridge.js` vs `mockBridge.js`, which mirrors the desktop `window.madav` contract), the web server routes
(`server/*.mjs`), and the production build output. Every row cites where the claim comes from. Confidence is
stated per section. This is a snapshot **after** Phase 2 (project sync, deep research, RAG-lite, agent memory)
and Phase 3 (MCP connectors, scheduled runs S1–S4).

> Reading guide: desktop is the baseline and remains untouched by any of this work. "Realized" means a
> manifest entry that said *coming/managed* is now actually built and wired on web.

---

## 1. Headline (confidence: high)

Of **17** tracked capabilities, **4 are inherently desktop-only** and are correctly *not* built on web. Of the
**13 web-addressable** capabilities:

- **5 at full / realized parity** — chat, sandboxed Python, deep research, MCP connectors, scheduled tasks.
- **5 partial-but-usable** — chat tool-loop, folder-linked projects (Chrome/Edge), generated-file delivery,
  team member tools, skill authoring.
- **2 pending a managed-service build** — browser automation, Telegram/mobile. (**Voice transcription is now done** — BYO Whisper via `/proxy/transcribe`, parity with desktop.)

Plus **3 capabilities not called out as manifest rows but now real on web**: project/Workroom sync, RAG-lite
knowledge retrieval, and agent memory + track record. And one quiet win: **client-side office-document
generation (xlsx/docx/pdf/deck) runs in the web build** (the `deckWorker` + `exceljs`/`mammoth`/`jspdf`/
`pptxgen` chunks bundle for web), so producing real files is at parity, not desktop-only.

**Bottom line:** the *core assistant loop* — chat, Python/data work, document generation, deep research,
connectors, and scheduled automation — is at or near parity on web today. The real remaining gaps are a short
list of partial features, three vendor-gated managed services, and a cluster of advanced agent operations
(swarms, versioning, portability, missions) that are server-feasible but not yet wired.

---

## 2. Capability matrix (the 17 tracked)

| Capability | Desktop | Web (delivered) | Evidence | Verdict |
|---|---|---|---|---|
| `chat.basic` | ✅ | ✅ Parity | webBridge `start/sendInput/onEvent`; direct-to-provider streaming | **Parity** |
| `exec.python` | ✅ | ✅ Parity | sandboxed Python (manifest PARITY) | **Parity** |
| Office docs (xlsx/docx/pdf/deck) | ✅ | ✅ Parity | bespoke client engine; web build emits `deckWorker`+`exceljs`/`mammoth`/`jspdf`/`pptxgen` | **Parity** |
| `research.deep` | ✅ | ✅ Realized | `deepResearch.js` → `deep_research` tool wired (COWORK+CHAT tools, executeTool) | **Parity\*** (client-orchestrated multi-search) |
| `mcp.connectors` | ✅ | ✅ Realized | OAuth sign-in (`connectorSignIn`), server vault + broker, connector UI (P3.4/3.5) | **Parity\*** (remote MCP; stdio is desktop-only) |
| `tasks.scheduled` | ✅ | ✅ Realized | S1–S4: `/tasks` CRUD, `scheduler.mjs` claim-first tick, `schedule-next.mjs` tz, shared UI via `webBridge` | **Parity\*** (managed runner; Render-sleep caveat) |
| Project/Workroom sync | ✅ | ✅ Realized | `/projects` routes + `pjPull/pjMaybePush` (P2) | **Parity** |
| RAG-lite knowledge | ✅ | ✅ Realized | `ragLite.js` chunk+rank into `systemPrompt` (P2) | **Parity** (lite) |
| Agent memory + track record | ✅ | ✅ Realized | `agentMemory.js` injected into `agentBlock`; `getAgentMemory` (P2) | **Functional parity** (mgmt methods not surfaced) |
| `chat.toolLoop` | ✅ | ◑ Partial | CHAT_TOOLS = search/fetch/image/deep_research/remember + MCP tools | **Partial** (improved; richer loop pending shared core) |
| `projects.folder` | ✅ | ◑ Browser-limited | `chooseFolder` via File System Access (Chrome/Edge only) | **Partial by browser** |
| `projects.fileOutput` | ✅ | ◑ Partial | files download in-browser vs open-in-app | **Partial** |
| `team.memberTools` | ✅ | ◑ Partial | web team members text-only | **Partial** |
| `skills.authoring` | ✅ | ◑ Partial | built-in packs read-only; `createSkill/importSkill*` desktop-only | **Partial** (authoring = Phase 4) |
| `automation.browser` | ✅ | ⏳ Pending | manifest SERVICE; no managed browser built | **Not yet** (vendor-gated) |
| `comms.messaging` (Telegram) | ✅ | ⏳ Pending | `applyMessaging/messagingStatus` stub "desktop app only" | **Not yet** (vendor-gated) |
| `voice.transcribe` | ✅ | ✅ Realized | mic capture + `/proxy/transcribe` → user's OpenAI/Groq Whisper key | **Parity** (BYO) |
| `exec.shell` / terminal | ✅ | ⛔ Desktop-only | `enableCli/termCreate` stub; a real shell needs the local machine | **Correctly excluded** |
| `file.openInApp` | ✅ | ⛔ Desktop-only | opening Excel/Word natively needs the OS | **Correctly excluded** |
| `automation.desktop` | ✅ | ⛔ Desktop-only | controlling local apps | **Correctly excluded** |
| `qa.selfHeal` (Repair Bay) | ✅ | ⛔ Desktop-only | maintenance tooling | **Correctly excluded** |

\* "Parity\*" = functionally equivalent for the common case, with an architecture-honest caveat noted.

---

## 3. What should NOT be built on web (confidence: high)

These are correct desktop-only boundaries — building them on web would be wrong, not just hard:

- **System shell / terminal & CLI provisioning** — a browser cannot run a real shell or write a PATH entry.
  Web offers sandboxed Python instead. (`enableCli`, `termCreate`)
- **Open-in-native-app & native desktop automation** — needs the local OS and installed apps.
- **Local Git clone/pull and a watched local folder daemon** (`cloneRepo`, `pullGithub`, `linkProjectFolder`,
  `addKnowledgeFile`) — web uses one-shot File System Access; a persistent local watcher is desktop's job.
- **Self-test / Repair Bay** — local maintenance tooling.
- **Local listener webhooks** (`webhookStatus/applyWebhooks`) — a bound local port; a *managed* webhook ingress
  could exist later, but the local-port version shouldn't be on web.

These stay as honest, messaged degradations via the capability manifest — never silent failures.

---

## 4. The real remaining web gap (confidence: high on list, medium on effort)

Server-feasible items not bound to the desktop, roughly in value order:

> Update (2026-06-18, later same day): the agent-ops management surface, skill authoring, and voice
> transcription listed below were **shipped** this session — they're struck through. What genuinely remains:

1. ~~Advanced agent operations~~ — **mostly done**: agent-memory management
   (`setAgentMemory`/`clearAgentMemory`/`getAgentHistory`/`getAgentStats`), versioning
   (`listAgentVersions`/`snapshotAgentVersion`), and portability (`exportAgent`/`importAgent`) all shipped
   (client-side). **Only swarms (`runSwarm`/`cancelSwarm`/`onSwarmEvent`) + missions (`getMission`) remain —
   PARKED** (they force a server-side multi-agent loop; needs an explicit go + design note).
2. **Managed-service pair** (each vendor-gated, design-note-first): `automation.browser` (e.g. Browserless) and
   `comms.messaging` (managed Telegram bot). (`voice.transcribe` is **done** — BYO Whisper via
   `/proxy/transcribe`.) The scheduled-runs work (S3/S4) is the template: design + threat note → additive
   routes → adapter.
3. ~~Skill authoring on web~~ — **shipped** (merge engine + bridge CRUD + zip/play import + web-gated editor).
4. **Partial → full**: per-member team tools (`team.memberTools`) and richer `chat.toolLoop` — both wait on the
   shared-core extraction (ADR-0001), which is the larger structural play. **This is now the main remaining work.**

---

## 5. Manifest drift to fix (confidence: high)

`src/bridge/webCapabilities.js` is now **stale** for delivered features — its user-facing messages still say
"coming/on the way" for things that shipped:

- `research.deep` — message "multi-source research is on the way" → **delivered** (deep_research). 
- `mcp.connectors` — "(coming to web)" → **delivered**.
- `tasks.scheduled` — accurate (managed runner) but no longer "coming".
- `chat.toolLoop` — "limited until the shared core lands" → understates the search/fetch/image/deep_research/MCP
  loop now present.

Recommendation: update these statuses/messages so the UI stops telling users a shipped feature is unavailable.
This is a **web-only renderer change** (desktop reads its own capabilities), low-risk, but it changes
user-facing copy — I'll propose the exact diffs and get your sign-off before editing (per the project rules).

---

## 6. How to re-verify this scorecard

- Capability statuses: `src/bridge/webCapabilities.js`.
- Bridge delta: `comm -23 <(methods mockBridge) <(methods webBridge)` → the missing-method list in §4.
- Delivered features: parity tests `tests/parity/*.test.js` (179 passing, 31 files) + the per-phase sections in
  `docs/PARITY-PHASE-TESTS.md`.
- Office-on-web: a production build emits `deckWorker` + `exceljs`/`mammoth`/`jspdf`/`pptxgen` chunks.

**Confidence summary:** high on *what exists vs not* (verified against source); medium on the *effort* to close
§4 (not yet scoped); the only judgement calls are the "Parity\*" labels, which are deliberately caveated.
