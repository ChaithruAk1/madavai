# Scope — Drop the Claude Agent SDK, unify on Madav's own agent loop
_"Built by Madav all the way down." Read-only analysis of the real code; effort is small because the harness already exists._

## The key finding
Your own loop (`electron/agent-openai.cjs`, ~1058 lines) is a **complete, mature agent harness**, already in production for every non‑Anthropic/weak model:
- **Tools:** `read_file/write_file/edit_file/run_bash/search_text/find_files` (= Read/Write/Edit/Bash/Grep/Glob) + skills, web search/fetch, image, browser, `ask_user`, `call_agent`.
- **Loop:** bounded multi‑step tool‑use loop (`for step < MAX_STEPS`).
- **MCP connectors:** `mcp.openAiTools()` / `mcp.callTool()` — already integrated.
- **Permissions:** `askPermission`, modes (`default/acceptEdits/bypassPermissions`), reads auto‑approved, connector tools always ask; plus a **destructive‑bash deny‑list**.
- **Subagents, reviewer, skills** — already there.

The SDK wrapper (`agent-transport.cjs`, 136 lines) only supplies the **native‑Anthropic agentic loop**. The reason it's needed: the tool‑calling model layer `_streamChatTools` speaks **OpenAI tool format only** (`delta.tool_calls`); the native Anthropic API uses `tool_use`/`tool_result` content blocks at `/v1/messages`. Plain Anthropic chat already routes natively (`streamAnthropic`); only **Anthropic tool‑use** is missing.

## The gap (this is the whole job)
**One new function:** `_streamAnthropicTools(profile, messages, tools, opts)` in `providers.cjs` that:
1. Converts the loop's OpenAI‑shaped `tools` → Anthropic `tools` (`{name, description, input_schema}`).
2. Converts OpenAI‑shaped `messages` → Anthropic format: pull `system` to the top‑level param; map assistant `tool_calls` → `tool_use` blocks and the `tool` role → `tool_result` blocks.
3. POSTs to `/v1/messages` (streaming), accumulating `tool_use` blocks from Anthropic's SSE event types (`content_block_start/delta/stop`, `message_delta`).
4. Returns the **same `{ content, toolCalls }` shape** the loop already consumes — so the 1058‑line harness is **unchanged**.

Then route by kind (mirroring how `streamChat` already does for plain chat): `streamChatTools` → `kind==="anthropic" ? _streamAnthropicTools : _streamChatTools`. And route Anthropic **agent turns** through `runOpenAIAgentTurn` instead of `agent-transport.cjs`.

## Pieces you'd then own (today the SDK owns them)
- The Anthropic tool‑use wire format + streaming parse (the new function).
- Anthropic API error/retry semantics for the agent path (your router already has reroute/retry — extend it).
- Anything the SDK auto‑did that you want kept: `settingSources` (auto‑loading project/`CLAUDE.md`) — **likely a non‑issue**: your loop is fed the system prompt by `session-manager` (project instructions/office rules already injected), so verify parity rather than rebuild. The SDK's `plan` permission mode is a small add if you want it.
- Future Anthropic harness improvements: you'd reimplement them instead of bumping a version (the real ongoing cost).

## Effort (the number)
Because the harness exists, this is **~3–5 engineer‑days**, not weeks:

| Task | Est. |
|---|---|
| `_streamAnthropicTools` adapter (format map + SSE tool‑use parse) + unit tests with a fake Anthropic stream | 1.5–2.5 d |
| Route `streamChatTools` by kind + flag‑guard the agent path | 0.5 d |
| Parity verification (system prompt, project context, `plan` mode, subagents, event shape) | 0.5–1 d |
| Real‑Anthropic‑API testing (your key) + fixes; then delete `agent-transport.cjs` + the SDK dep | 0.5–1 d (your run) |

## Flag‑guarded migration (nothing breaks while you test)
1. **Build the adapter** + tests (no behavior change; not wired).
2. **Flag `MADAV_NATIVE_AGENT`** (env desktop / localStorage web): OFF → Anthropic agents use the SDK (today's path, unchanged). ON → Anthropic agents route through `runOpenAIAgentTurn` + `_streamAnthropicTools`.
3. **You test** with a real Anthropic key on staging; confirm tools/permissions/MCP/skills all behave on Claude models via the own loop.
4. **Flip default + decommission:** once proven, make native the default, then remove `agent-transport.cjs` and `@anthropic-ai/claude-agent-sdk` from `package.json`. (Decommission gated on your sign‑off, per your rule.)

## Bonus (single‑source win)
Today Anthropic agents emit SDK‑shaped events and everything else emits the loop's events. Unifying means **one event shape for all models** — less code, fewer divergence bugs.

## What only your run confirms
The native Anthropic tool‑use behavior against the **real** `/v1/messages` API (streaming, tool_result round‑trips, long tool chains) — I can build + unit‑test the adapter against a faked stream, but Claude's live API + your key is the proof. And as before: not a legal certification of independence, just the architecture.


---

## STATUS — IMPLEMENTED (adapter + flag‑guarded routing), 2026‑06‑25
- **`core/anthropic-tools.js`** — pure `toAnthropicTools` / `toAnthropicMessages` / `createToolStreamReducer`. 13/13 unit checks (mappers + full‑stream integration). No I/O, no deps.
- **`electron/providers.cjs`** — `_streamAnthropicTools(profile, messages, tools, opts)` POSTs `/v1/messages` (stream, `tool_choice:auto`) reusing `fetchWithBackoff`/`ensureOk`/`sseLines`/`stripReasoning`; returns the **same** `{content, toolCalls}` shape as the OpenAI path. `streamChatTools` now routes by `kind`: `anthropic → _streamAnthropicTools`, else → `_streamChatTools`.
- **`electron/session-manager.cjs`** — `const useNativeAgent = () => process.env.MADAV_NATIVE_AGENT === "1";` plus **5 guards** so flag‑ON Claude turns fall through to the own‑loop branches every other model already uses (the 3 SDK `runAgentTurn` dispatches stay byte‑identical when OFF).
- **Verified without a key:** `node --check` on all three files; 13/13 native‑adapter checks; OFF path proven unchanged by inspection (SDK calls untouched inside the guards).
- **Remaining (your run):** keyed staging test (Tests A/B/C in E2E §12). **Decommission of `agent-transport.cjs` + the `@anthropic-ai/claude-agent-sdk` dependency stays gated on your sign‑off** — not done here.

---

## FINAL SDK REMOVAL — PREPPED, ready to execute after the native default is verified (E2E Part 5)
Native is now the DEFAULT (`useNativeAgent = () => process.env.MADAV_NATIVE_AGENT !== "0"`). The Agent SDK
(`agent-transport.cjs` + the `@anthropic-ai/claude-agent-sdk` package) remains ONLY as the `=0` escape
hatch. Once Part 5 of the certification checklist passes (Claude agents work natively), the SDK can be
deleted in one pass. Exact, bounded change set:

1. **`electron/session-manager.cjs`** — drop the SDK fallback so Anthropic ALWAYS uses the own loop:
   - remove the import: `const { runAgentTurn } = require("./agent-transport.cjs");` (top).
   - remove the `useNativeAgent` helper + comment, and the **4** `&& !useNativeAgent()` guards, collapsing
     each Anthropic branch to the own-loop path:
       • the chat-data branch (`profile.kind === "anthropic" && !useNativeAgent()` → SDK) → delete the SDK
         arm; Anthropic falls through to `runOpenAIAgentTurn`.
       • the project-turn branches (`anthropic && useFolder && !useNativeAgent()` and the
         `else if (anthropic && !useNativeAgent())`) → delete both SDK arms; keep the final `else`
         (`runOpenAIAgentTurn`) for all models.
       • the agent-inject guard (`s.agent && anthropic && !s._agentInjected && !useNativeAgent()`) → delete
         (the own loop injects via `globalInstructions`).
       • the `_agentTurn` branch (`anthropic && !useNativeAgent()` → SDK) → delete; use the own-loop else.
   - remove the now-unused `s.sdkSessionId` plumbing (optional; harmless if left).
2. **Delete `electron/agent-transport.cjs`** (the SDK wrapper — its only caller is gone). `git rm`.
3. **`package.json`** — remove the `"@anthropic-ai/claude-agent-sdk": "^0.3.150"` line; run `npm install`.
4. **Verify:** `node --check electron/session-manager.cjs`; grep that `runAgentTurn` / `agent-transport` /
   `claude-agent-sdk` / `useNativeAgent` are all gone; rebuild; re-run E2E Part 5 (now there is no escape
   hatch — native is the only path).

**Risk:** low once Part 5 passes — it only deletes the (now-unused) SDK arms. Fully reversible via git.
**Owner action required first:** confirm E2E Part 5 (native Claude agents) is green on your machine + key.
