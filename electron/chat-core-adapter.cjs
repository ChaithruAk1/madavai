// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// electron/chat-core-adapter.cjs — ADR-0001 / M2c.1. The DESKTOP adapter for core/chat-loop.js
// coreChatTurn (chat mode). It wraps the existing desktop primitives into the loop's
// stream / runTool / tools / emit interface, and translates coreChatTurn's semantic events into
// the desktop IPC events the renderer already understands ({ kind, data }).
//
// ADDITIVE / NOT WIRED: nothing requires this yet. The flag cutover (M2c.3) routes
// runOpenAIAgentTurn (chat only) through coreChatTurn(makeDesktopChatAdapter(...)) behind
// MADAV_CORE_CHAT — that step touches the live loop and is gated on desktop validation.
//
// Dependency-injected so it is unit-testable off the main process and validated against the REAL
// recorded cassettes (tests/parity/fixtures/desktop-chat-*.json) without the runtime:
//   streamChatTools(profile, messages, tools, {onDelta, signal}) -> { content, toolCalls:[{id,name,arguments}] }
//   streamChat / parseTextToolCalls — the tier-C text protocol (optional)
//   execLeaf(name, args, ctx) -> output            (the per-tool executor; real one wired at cutover)
//   emit({ kind, data })                            (desktop IPC sink)
//   isAuto(name) -> bool                            (permission: did it run without approval)

// Event ownership on desktop:
//  - tool_use / tool_result are emitted by runTool (they are coupled to the permission decision),
//    so coreChatTurn's own semantic tool_call/tool_result events are intentionally NOT re-rendered.
//  - assistant_delta comes from streaming; assistant_message + result close the turn.
function makeDesktopChatAdapter(deps = {}) {
  const {
    streamChatTools, streamChat, parseTextToolCalls,
    execLeaf, emit, toolset = [], authorize,
    isAuto = () => true, textMode = false, now = () => Date.now(),
  } = deps;
  const started = now();

  return {
    tools() { return toolset; },

    async stream(profile, messages, tools, { onDelta, signal } = {}) {
      if (textMode) {
        const tr = await streamChat(profile, messages, { onDelta: () => {}, signal });
        const text = (tr && tr.text) || "";
        const { calls, stripped } = parseTextToolCalls(text);
        return {
          content: stripped,
          tool_calls: (calls || []).map((c) => ({ id: c.id, function: { name: c.name, arguments: c.arguments } })),
          _rawText: text,
        };
      }
      const r = (await streamChatTools(profile, messages, tools, { onDelta, signal })) || {};
      return {
        content: r.content || "",
        tool_calls: (r.toolCalls || []).map((t) => ({ id: t.id, function: { name: t.name, arguments: t.arguments } })),
      };
    },

    // Owns the tool UI events (desktop emits tool_use BEFORE running, tool_result AFTER).
    async runTool(name, args, ctx = {}) {
      const id = ctx.id || "";
      const dec = authorize ? await authorize(name, args, id) : { decision: "run", auto: !!isAuto(name) };
      emit({ kind: "tool_use", data: { id, name, input: args, auto: !!dec.auto } });
      if (dec.decision === "blocked" || dec.decision === "denied") {
        const out = dec.decision === "blocked" ? "(blocked: plan mode is read-only)" : "(user declined this tool call)";
        emit({ kind: "permission_denied", data: { id, name, reason: dec.decision === "blocked" ? "plan mode (read-only)" : "declined" } });
        emit({ kind: "tool_result", data: { id, output: out } });
        return out;
      }
      let output;
      try { output = await execLeaf(name, args, ctx); }
      catch (e) { output = "ERROR: " + ((e && e.message) || e); }
      output = String(output == null ? "" : output);
      emit({ kind: "tool_result", data: { id, output: output.slice(0, 4000) } });
      return output;
    },

    // Map coreChatTurn's semantic lifecycle events -> desktop IPC events.
    emit(event) {
      const t = event && event.type;
      if (t === "delta") {
        emit({ kind: "assistant_delta", data: { text: event.text } });
      } else if (t === "tool_call" || t === "tool_result") {
        // owned by runTool on desktop (permission-coupled) — do not double-render
      } else if (t === "tool_blocked") {
        emit({ kind: "tool_use", data: { id: event.id || "", name: event.name, input: event.args || {}, auto: true } });
        emit({ kind: "tool_result", data: { id: event.id || "", output: event.message || "(blocked)" } });
      } else if (t === "final") {
        emit({ kind: "assistant_message", data: { stop_reason: "end_turn" } });
        emit({ kind: "result", data: { subtype: "success", duration_ms: now() - started } });
      } else if (t === "cap_reached") {
        emit({ kind: "result", data: { subtype: "max_steps", duration_ms: now() - started } });
      }
      // turn_start / turn_end -> no desktop equivalent (init is pre-loop; result above closes it)
    },
  };
}

module.exports = { makeDesktopChatAdapter };
