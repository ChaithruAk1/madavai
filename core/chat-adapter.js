// core/chat-adapter.js — ESM SINGLE SOURCE for the chat adapter logic (ADR-0001 / M2d).
// ONE implementation shared by desktop and web: stream-shaping (+ native->text fallback), runTool
// (permission gate + tool UI events), summarize (compaction), and the semantic-event -> UI-event
// mapping. The ONLY per-surface bits are injected as `platform`:
//   streamChatTools(profile, messages, tools, {onDelta, signal}) -> { content, toolCalls:[{id,name,arguments}] }
//   streamChat(profile, messages, {onDelta, signal}) -> { text }     (tier-C text protocol + compaction)
//   parseTextToolCalls(text) -> { calls, stripped }
//   execLeaf(name, args, ctx) -> output                              (the per-tool executor)
//   ui(kind, data) -> void          (platform emit sink: desktop emit({kind,data}); web emit(sessId,kind,data))
//   authorize(name, args, id) -> { decision, auto }                  (optional permission gate)
//   isAuto(name) -> bool ; toolset ; textMode ; now
//
// Event ownership: runTool emits tool_use/tool_result (permission-coupled), so coreChatTurn's own
// semantic tool_call/tool_result are NOT re-rendered. assistant_delta streams; assistant_message +
// result close the turn.
export function makeChatAdapter(platform = {}) {
  const {
    streamChatTools, streamChat, parseTextToolCalls,
    execLeaf, ui, toolset = [], authorize,
    isAuto = () => true, textMode = false, now = () => Date.now(),
  } = platform;
  const started = now();
  let inText = !!textMode; // sticky once the native->text fallback fires
  let _compactId = "";

  return {
    tools() { return toolset; },

    async stream(profile, messages, tools, { onDelta, signal } = {}) {
      const textPath = async () => {
        const tr = await streamChat(profile, messages, { onDelta: () => {}, signal });
        const text = (tr && tr.text) || "";
        const { calls, stripped } = parseTextToolCalls(text);
        return {
          content: stripped,
          tool_calls: (calls || []).map((c) => ({ id: c.id, function: { name: c.name, arguments: c.arguments } })),
          textMode: true, _rawText: text,
        };
      };
      if (inText) return textPath();
      try {
        const r = (await streamChatTools(profile, messages, tools, { onDelta, signal })) || {};
        return {
          content: r.content || "",
          tool_calls: (r.toolCalls || []).map((t) => ({ id: t.id, function: { name: t.name, arguments: t.arguments } })),
          textMode: false,
        };
      } catch (e) {
        // Native function-calling unsupported -> fall back to the text protocol (sticky), like the legacy loop.
        if (/tool|function/i.test(String((e && e.message) || ""))) { inText = true; return textPath(); }
        throw e;
      }
    },

    // Owns the tool UI events (emit tool_use BEFORE running, tool_result AFTER).
    async runTool(name, args, ctx = {}) {
      const id = ctx.id || "";
      const dec = authorize ? await authorize(name, args, id) : { decision: "run", auto: !!isAuto(name) };
      ui("tool_use", { id, name, input: args, auto: !!dec.auto });
      if (dec.decision === "blocked" || dec.decision === "denied") {
        const out = dec.decision === "blocked" ? "(blocked: plan mode is read-only)" : "(user declined this tool call)";
        ui("permission_denied", { id, name, reason: dec.decision === "blocked" ? "plan mode (read-only)" : "declined" });
        ui("tool_result", { id, output: out });
        return out;
      }
      let output;
      try { output = await execLeaf(name, args, ctx); }
      catch (e) { output = "ERROR: " + ((e && e.message) || e); }
      output = String(output == null ? "" : output);
      ui("tool_result", { id, output: output.slice(0, 4000) });
      return output;
    },

    // Plain completion for auto-compaction (no tools); coreChatTurn calls this near the window limit.
    async summarize(messages, { profile, signal } = {}) {
      const r = await streamChat(profile, messages, { onDelta: () => {}, signal });
      return (r && r.text) || "";
    },

    // Map coreChatTurn's semantic lifecycle events -> platform UI events via ui(kind, data).
    emit(event) {
      const t = event && event.type;
      if (t === "delta") {
        ui("assistant_delta", { text: event.text });
      } else if (t === "tool_call" || t === "tool_result") {
        // owned by runTool (permission-coupled) — do not double-render
      } else if (t === "tool_blocked") {
        ui("tool_use", { id: event.id || "", name: event.name, input: event.args || {}, auto: true });
        ui("tool_result", { id: event.id || "", output: event.message || "(blocked)" });
      } else if (t === "final") {
        ui("assistant_message", { stop_reason: "end_turn" });
        ui("result", { subtype: "success", duration_ms: now() - started });
      } else if (t === "cap_reached") {
        ui("result", { subtype: "max_steps", duration_ms: now() - started });
      } else if (t === "compacting") {
        _compactId = "compact_" + String(now()).toString(36);
        ui("tool_use", { id: _compactId, name: "compact_context", input: { reason: event.reason || "" }, auto: true });
      } else if (t === "compacted") {
        ui("tool_result", { id: _compactId, output: event.error ? "(compaction skipped: " + event.error + ")" : "Mission history compacted into working notes (goal, decisions, files, remaining work)." });
      }
      // turn_start / turn_end -> no UI equivalent (init is pre-loop; result closes the turn)
    },
  };
}
