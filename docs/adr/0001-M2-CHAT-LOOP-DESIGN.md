# ADR-0001 / M2 — Chat turn-loop → shared core (design + sub-steps)

**Status: DESIGN.** The chat turn-loop is the real single-source prize (genuine duplication, no parity test,
the root of the ~85% divergence). It is also the **highest-risk, multi-session** work in the program. This
maps the cut and sequences it so desktop never regresses. Harness-first, strangler (chat only), desktop-first,
flag-guarded — per ADR-0001.

## The two loops today
| | Desktop `runOpenAIAgentTurn` (`agent-openai.cjs`) | Web `runAgentTurn`/cowork (`webBridge.js`) |
|---|---|---|
| Shape | assemble prompt → stream model → parse tool calls → exec tools → loop (≤12–14 steps) | same shape, ≤16 steps |
| Tools | `TOOLS`, `run_bash`, browser, desktop-driver, MCP, research, scouts | `run_python`, `/proxy`, file tools, MCP |
| Exec | `child_process` + guards | Pyodide / `/proxy` |
| Stream | `streamChatTools` (Node) | `streamChatTools` (browser) |
| Emit | IPC → `webContents` | in-process listener set |
| Helpers | `electron/harness.cjs` (`squashStale`, `ctxWindowFor`, `CallGuard`, textMode) | `src/shared/harness.js` (`tolerantParse`, `headTail`, `squashStale`) — **duplicated** |

The **shape** is shared; everything else is platform mechanics → adapter.

## Target shape
```
core/chat-loop.js (ESM)  →  export async function coreChatTurn({ adapter, prompt, history, model, mode, tools, opts })
  // assembles prompt (uses core rules), streams via adapter.stream, parses tool calls (core helpers),
  // executes via adapter.runTool, emits via adapter.emit, loops to a step cap. NO Node/browser APIs directly.
```
Adapter interface the loop needs (extends `core/adapter.contract.js`):
- `stream(profile, messages, tools, {onDelta, signal})` → desktop + web already have `streamChatTools`.
- `runTool(name, args, ctx)` → desktop `execTool` (child_process), web `executeTool` (pyodide/proxy).
- `tools(mode, caps)` → each surface supplies its capability-appropriate tool set/schemas.
- `emit(event)` → IPC vs listener.
- `now/persist/parse` → core-internal where pure.

## Sub-steps (each verifiable; desktop validated before web)
- **M2a — pure helpers → core (low risk).** Extract the genuinely-duplicated pure functions
  (`tolerantParse`, `headTail`, `squashStale`, `CallGuard`, `ctxWindowFor`, textMode bits) into
  `core/turn-helpers.js` (ESM). Web imports natively; desktop's `harness.cjs` imports via the proven cached
  `import()`. Byte-identical; harness goldens unchanged. **This is the safe first build slice.**
- **M2b — core loop skeleton (additive, no cutover).** Author `core/chat-loop.js` using the adapter interface;
  unit-test it with a mock adapter (replay a recorded turn). Nothing in production calls it yet.
- **M2c — desktop adapter + flag.** Wrap desktop's exec/stream/emit/tools as an adapter; behind
  `MADAV_CORE_CHAT=1`, route `runOpenAIAgentTurn` (chat mode only) through `coreChatTurn`. Old engine stays the
  default. **Validate on desktop**: harness replay of recorded chat turns byte-equal + by-eye + a data/Excel turn.
- **M2d — flip desktop default**, after sign-off. Then **web adapter + cutover**; web parity tests.
- **M2e — retire** the duplicated chat path; lock with a behavior-version stamp + golden parity tests.

## Controls (non-negotiable)
Harness measures every step (record desktop turn → replay vs core). One mode at a time (chat only here).
Desktop adopts + is validated before web. Flag-guarded side-by-side until sign-off. Agent/project/team modes
are OUT of M2 (later, and M4/project re-runs the 🔒 PROTECTED `Report_March.xlsx` scenario).

## Honest scope
This is multi-session. M2a is a clean, safe slice I can build + statically verify now. M2b is additive
(mock-tested). M2c onward each need your desktop runtime validation and an explicit go — they touch the live
engine. No blind single-pass rewrite.

## Recommended start
**M2a** — extract the duplicated pure turn-helpers into `core/turn-helpers.js`, both surfaces import the one
source. Lowest risk, real dedup, and the core loop (M2b) will build on it.
