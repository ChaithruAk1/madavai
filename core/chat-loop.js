// core/chat-loop.js — ESM unified CHAT turn-loop (ADR-0001 / M2b).
//
// This is the platform-agnostic SHAPE of one chat turn: assemble messages -> stream the model
// -> parse tool calls -> execute tools -> emit UI events -> loop to a step cap. It contains NO
// Node, browser, or Electron APIs: every platform mechanic is reached through the injected
// adapter (stream / runTool / tools / emit), and every pure discipline helper comes from
// core/turn-helpers.js. Nothing in production calls this yet — M2c wraps the desktop engine as
// an adapter behind MADAV_CORE_CHAT and validates on desktop first; M2d does web. See
// docs/adr/0001-M2-CHAT-LOOP-DESIGN.md.
//
// Chat-loop adapter interface (extends core/adapter.contract.js):
//   stream(profile, messages, tools, { onDelta, signal })  -> { content, tool_calls? }
//   runTool(name, args, ctx)                                -> string | { content|stdout|stderr|... }
//   tools(mode, caps)                                       -> tool schema array   (optional if `tools` passed)
//   emit(event)                                             -> void                (UI event stream)

import { tolerantParse, headTail, squashStale, CallGuard, parseTextToolCalls, stripReasoning, TEXT_PROTOCOL, ctxWindowFor, estTokens, buildCompactionMessages, applyCompaction } from "./turn-helpers.js";

export const CHAT_ADAPTER_METHODS = ["stream", "runTool", "emit"]; // `tools` may instead arrive via opts
export const DEFAULT_STEP_CAP = 14;

/** { ok, missing[] } — does `adapter` expose the chat-loop methods? */
export function validateChatAdapter(adapter) {
  if (!adapter || typeof adapter !== "object") return { ok: false, missing: ["(adapter is not an object)"] };
  const missing = CHAT_ADAPTER_METHODS.filter((m) => typeof adapter[m] !== "function");
  return { ok: missing.length === 0, missing };
}

// Normalize whatever a tool returns into a single string for the result message.
function normalizeToolResult(r) {
  if (r == null) return "";
  if (typeof r === "string") return r;
  if (typeof r.content === "string") return r.content;
  if (typeof r.stdout === "string" || typeof r.stderr === "string") {
    return [r.stdout || "", r.stderr ? "[stderr] " + r.stderr : ""].filter(Boolean).join("\n");
  }
  try { return JSON.stringify(r); } catch { return String(r); }
}

// A native-protocol tool result: role "tool" carrying the originating call id. (Text-mode loops
// elsewhere render this as a user-role "[result of ...]" message — which squashStale also compresses.)
function toolResultMsg(call, content, textMode) {
  const text = String(content == null ? "" : content);
  // Tier-C (text-mode) models reject role:"tool"; their results return as a user-role marker message
  // (matches the desktop loop's pushToolResult). squashStale compresses both forms.
  if (textMode) return { role: "user", content: "[result of " + (callName(call) || "") + "]\n" + text };
  return { role: "tool", tool_call_id: (call && call.id) || "", content: text };
}

function callName(call) { return call && call.function ? call.function.name : (call && call.name); }
function callArgs(call) { return call && call.function ? call.function.arguments : (call && call.arguments); }

/**
 * Run ONE chat turn through the adapter. Returns { text, messages, steps, observedTools }.
 * Pure orchestration — all I/O is the adapter's; all repair/compaction is core/turn-helpers.
 */
export async function coreChatTurn({
  adapter, prompt, history = [], model = "", mode = "chat",
  tools, system = "", caps = {}, opts = {},
} = {}) {
  const chk = validateChatAdapter(adapter);
  if (!chk.ok) throw new Error("coreChatTurn: adapter incomplete; missing: " + chk.missing.join(", "));

  const stepCap = Number(opts.stepCap) > 0 ? Number(opts.stepCap) : DEFAULT_STEP_CAP;
  const signal = opts.signal;
  const toolset = tools || (typeof adapter.tools === "function" ? adapter.tools(mode, caps) : []);
  const profile = Object.assign({ model, mode, caps }, opts.profile || {});
  // Final-answer normalizer: desktop strips chain-of-thought (providers.cjs line 661); match it.
  const finalize = (opts && typeof opts.finalize === "function") ? opts.finalize : stripReasoning;

  // Assemble the working transcript: system, prior history, then the new user prompt.
  const messages = [];
  if (system) messages.push({ role: "system", content: String(system) });
  for (const m of history) messages.push(m);
  if (prompt != null && prompt !== "") messages.push({ role: "user", content: String(prompt) });

  const guard = new CallGuard();
  const observedTools = [];
  let steps = 0;
  let finalText = "";
  // Tier-C / no-native-tools support: text mode is sticky once active (initial from opts, or set by the
  // adapter's native->text fallback via resp.textMode). It changes the tool-result message shape and
  // injects the text protocol once, exactly like the desktop loop.
  let textMode = !!opts.textMode;
  const textToolList = () => (toolset || []).map((t) => "- " + (t.function && t.function.name) + " " + JSON.stringify((t.function && t.function.parameters && t.function.parameters.properties) || {}).slice(0, 160)).join("\n");
  // Auto-compaction (Wave 1.3): only when the adapter can summarize (desktop wires streamChat).
  let justCompacted = false;
  const ctxBudget = ctxWindowFor(model, opts.exactCtx);
  const canCompact = typeof adapter.summarize === "function";

  adapter.emit({ type: "turn_start", mode, model });

  while (steps < stepCap) {
    if (signal && signal.aborted) { adapter.emit({ type: "aborted" }); break; }
    steps++;

    // Wave 1.3 — auto-compaction: near the model's window, summarize history into working notes,
    // then rebuild as [system, notes, ...last turns]. Never compact two steps in a row.
    if (canCompact && !justCompacted && estTokens(messages) > 0.7 * ctxBudget) {
      adapter.emit({ type: "compacting", reason: "approaching the model's context window" });
      try {
        const summary = await adapter.summarize(buildCompactionMessages(messages), { profile, signal });
        applyCompaction(messages, String(summary || ""));
        for (let k = 1; k < messages.length; k++) {
          const hm = messages[k];
          if (hm && hm.role !== "system" && typeof hm.content === "string" && hm.content.length > 6000) hm.content = headTail(hm.content, { maxChars: 6000 });
        }
        justCompacted = true;
        adapter.emit({ type: "compacted" });
      } catch (e) {
        adapter.emit({ type: "compacted", error: String((e && e.message) || e) });
      }
    } else if (justCompacted) {
      justCompacted = false;
    }

    // Inject the text-mode tool protocol ONCE when text mode is active (lazy: covers the fallback case).
    if (textMode && messages[0] && messages[0].role === "system" && !messages[0]._protocolAdded) {
      messages[0].content += "\n" + TEXT_PROTOCOL(textToolList());
      messages[0]._protocolAdded = true;
    }

    // Keep the window lean: compress stale tool results before each model call.
    squashStale(messages);

    const onDelta = (d) => adapter.emit({ type: "delta", text: String(d == null ? "" : d) });
    const resp = (await adapter.stream(profile, messages, toolset, { onDelta, signal })) || {};
    const content = resp.content != null ? String(resp.content) : "";
    let toolCalls = Array.isArray(resp.tool_calls) ? resp.tool_calls : [];
    if (resp.textMode) textMode = true; // sticky: the adapter used (or fell back to) the text protocol

    // Text-mode fallback: a model with no native tool calling emits fenced tool blocks in its
    // text. parseTextToolCalls runs on ASSISTANT text ONLY (never tool results / page content).
    let assistantContent = content;
    if (!toolCalls.length && content) {
      const parsed = parseTextToolCalls(content);
      if (parsed.calls.length) {
        toolCalls = parsed.calls.map((c) => ({ id: c.id, function: { name: c.name, arguments: c.arguments } }));
        assistantContent = parsed.stripped;
      }
    }

    // Text mode: record the RAW assistant text (so the model sees its own fenced call) and DON'T attach
    // native tool_calls (the calls live in the text). Native mode is unchanged.
    const assistantMsg = { role: "assistant", content: textMode ? (resp._rawText || content || "") : assistantContent };
    // Each tool call on the assistant message MUST carry type:"function" — strict providers (NVIDIA NIM)
    // reject it otherwise (ChatCompletionMessageFunctionToolCallParam.type required). Matches the legacy loop.
    if (!textMode && toolCalls.length) assistantMsg.tool_calls = toolCalls.map((tc) => ({ id: tc.id, type: "function", function: tc.function }));
    messages.push(assistantMsg);

    if (!toolCalls.length) {
      finalText = finalize(assistantContent);
      adapter.emit({ type: "final", text: finalText });
      break;
    }

    for (const call of toolCalls) {
      const name = callName(call);
      const args = tolerantParse(callArgs(call)).value;

      // Loop breaker: refuse the 3rd identical consecutive call instead of spinning.
      if (guard.repeatBlocked(name, args)) {
        const blockMsg = "[harness] blocked a repeated identical call to " + name + " — try a different approach.";
        messages.push(toolResultMsg(call, blockMsg, textMode));
        adapter.emit({ type: "tool_blocked", id: call.id, name, args, message: blockMsg });
        continue;
      }

      observedTools.push(name);
      adapter.emit({ type: "tool_call", name, args });

      let resultText, ok = true;
      try {
        resultText = normalizeToolResult(await adapter.runTool(name, args, { id: call.id, mode, model, signal }));
      } catch (e) {
        ok = false;
        resultText = "[tool error] " + (e && e.message ? e.message : String(e));
      }
      resultText = headTail(resultText); // cap bulky output; keep head AND tail
      guard.noteResult(name, args && (args.path || args.file || args.target), ok);
      messages.push(toolResultMsg(call, resultText, textMode));
      adapter.emit({ type: "tool_result", name, ok });
    }
  }

  if (!finalText && steps >= stepCap) {
    finalText = "[harness] step cap reached (" + stepCap + ") without a final answer.";
    adapter.emit({ type: "cap_reached", stepCap });
  }

  adapter.emit({ type: "turn_end", steps });
  return { text: finalText, messages, steps, observedTools };
}
