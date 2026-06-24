// @madav/core — the platform-agnostic shape of ONE chat turn: assemble messages -> stream the model
// -> parse tool calls -> run tools -> emit UI events -> loop to a step cap. No Node/browser/Electron:
// every platform mechanic is reached through the injected adapter; every discipline helper is pure.

import {
  tolerantParse, headTail, squashStale, CallGuard, parseTextToolCalls, stripReasoning,
  TEXT_PROTOCOL, estTokens, buildCompactionMessages, applyCompaction, type ChatMessage,
} from './turn-helpers.js';
import { ctxWindowFor } from './models/context-window.js';
import { isDeckCapable } from './models/capability.js';
import { createRunGuard, guardStopMessage } from './run-guard.js';

export const CHAT_ADAPTER_METHODS = ['stream', 'runTool', 'emit'] as const;
export const DEFAULT_STEP_CAP = 14;

export interface UiEvent { type: string; [k: string]: unknown; }
export interface ToolSchema { type?: string; function?: { name?: string; description?: string; parameters?: { type?: string; properties?: Record<string, unknown>; required?: string[]; [k: string]: unknown } } & Record<string, unknown>; [k: string]: unknown; }
export interface ToolCall { id?: string; type?: string; function?: { name?: string; arguments?: unknown }; name?: string; arguments?: unknown; [k: string]: unknown; }
export interface StreamResponse { content?: unknown; tool_calls?: ToolCall[]; textMode?: boolean; _rawText?: string; [k: string]: unknown; }

export interface ChatAdapter {
  stream(profile: unknown, messages: ChatMessage[], tools: ToolSchema[], opts: { onDelta: (d: unknown) => void; signal?: AbortSignal }): Promise<StreamResponse> | StreamResponse;
  runTool(name: string, args: unknown, ctx: unknown): unknown | Promise<unknown>;
  emit(event: UiEvent): void;
  tools?(mode: string, caps: unknown): ToolSchema[];
  summarize?(messages: unknown, opts: unknown): Promise<unknown> | unknown;
}

export interface CoreChatTurnOptions {
  adapter: ChatAdapter;
  prompt?: unknown;
  history?: ChatMessage[];
  model?: string;
  mode?: string;
  tools?: ToolSchema[];
  system?: string;
  caps?: unknown;
  opts?: {
    stepCap?: number;
    signal?: AbortSignal;
    profile?: Record<string, unknown>;
    finalize?: (s: string) => string;
    textMode?: boolean;
    exactCtx?: number;
    nudgeFollowThrough?: boolean;
    cleanupReasoning?: boolean;
  };
}
export interface CoreChatTurnResult { text: string; messages: ChatMessage[]; steps: number; observedTools: string[]; }

export function validateChatAdapter(adapter: unknown): { ok: boolean; missing: string[] } {
  if (!adapter || typeof adapter !== 'object') return { ok: false, missing: ['(adapter is not an object)'] };
  const a = adapter as Record<string, unknown>;
  const missing = CHAT_ADAPTER_METHODS.filter((m) => typeof a[m] !== 'function');
  return { ok: missing.length === 0, missing };
}

function normalizeToolResult(r: unknown): string {
  if (r == null) return '';
  if (typeof r === 'string') return r;
  const o = r as { content?: unknown; stdout?: unknown; stderr?: unknown };
  if (typeof o.content === 'string') return o.content;
  if (typeof o.stdout === 'string' || typeof o.stderr === 'string') {
    return [o.stdout || '', o.stderr ? '[stderr] ' + o.stderr : ''].filter(Boolean).join('\n');
  }
  try { return JSON.stringify(r); } catch { return String(r); }
}
function callName(call: ToolCall): string { return String((call && call.function ? call.function.name : call && call.name) || ''); }
function callArgs(call: ToolCall): unknown { return call && call.function ? call.function.arguments : call && call.arguments; }
function toolResultMsg(call: ToolCall, content: unknown, textMode: boolean): ChatMessage {
  const text = String(content == null ? '' : content);
  if (textMode) return { role: 'user', content: '[result of ' + (callName(call) || '') + ']\n' + text };
  return { role: 'tool', tool_call_id: (call && call.id) || '', content: text };
}

const LEAK_MARKERS = [
  /\bthe user (?:asked|wants|requested|is asking|said|wanted)\b/i,
  /\buser (?:asked|wants|told) me\b/i,
  /\bI should (?:pick|choose|present|search|provide|give|select|use|find|answer|go with)\b/i,
  /\blet me (?:search|look up|look for|find|pick|choose|go with)\b/i,
  /\bas the (?:headline|answer|source|response|final)\b/i,
];
function looksLikeLeakedReasoning(text: unknown): boolean {
  const t = String(text == null ? '' : text);
  if (t.length < 40) return false;
  let n = 0;
  for (const re of LEAK_MARKERS) if (re.test(t)) { n++; if (n >= 2) return true; }
  return false;
}
const CLEANUP_SYSTEM =
  'You are a text cleaner. The draft below is an assistant reply that accidentally includes its own internal thinking. Return ONLY the final answer meant for the user: the facts, the result, and any links exactly as written. Remove every line of reasoning, planning, or meta-commentary. Output only the cleaned answer.';
async function cleanupLeakedReasoning(adapter: ChatAdapter, profile: unknown, text: string, signal?: AbortSignal): Promise<string> {
  const msgs: ChatMessage[] = [{ role: 'system', content: CLEANUP_SYSTEM }, { role: 'user', content: String(text) }];
  const r = await adapter.stream(profile, msgs, [], { onDelta: () => {}, signal });
  return r && typeof r.content === 'string' ? r.content.trim() : '';
}
function announcesNextAction(text: unknown): boolean {
  const t = String(text == null ? '' : text).trim();
  if (!t) return false;
  return /\b(let me|let'?s|i'?ll|i will|i'?m going to|i need to|i should|now i'?ll|next,?\s*i)\b[^.?!\n]{0,80}\b(search|look up|look for|try|find|fetch|retrieve|run|use|call|query|browse|continue|gather|verify|check)\b/i.test(t);
}

/** Run ONE chat turn through the adapter. Pure orchestration — all I/O is the adapter's. */
export async function coreChatTurn(
  { adapter, prompt, history = [], model = '', mode = 'chat', tools, system = '', caps = {}, opts = {} }: CoreChatTurnOptions,
): Promise<CoreChatTurnResult> {
  const chk = validateChatAdapter(adapter);
  if (!chk.ok) throw new Error('coreChatTurn: adapter incomplete; missing: ' + chk.missing.join(', '));

  const stepCap = Number(opts.stepCap) > 0 ? Number(opts.stepCap) : DEFAULT_STEP_CAP;
  const signal = opts.signal;
  const toolset: ToolSchema[] = tools || (typeof adapter.tools === 'function' ? adapter.tools(mode, caps) : []);
  const profile = Object.assign({ model, mode, caps }, opts.profile || {});
  const finalize = typeof opts.finalize === 'function' ? opts.finalize : stripReasoning;

  const messages: ChatMessage[] = [];
  if (system) messages.push({ role: 'system', content: String(system) });
  for (const m of history) messages.push(m);
  if (prompt != null && prompt !== '') messages.push({ role: 'user', content: String(prompt) });

  const guard = new CallGuard();
  const runGuard = createRunGuard({ maxMs: 8 * 60 * 1000 });
  const observedTools: string[] = [];
  let steps = 0;
  let finalText = '';
  let textMode = !!opts.textMode;
  const textToolList = () =>
    (toolset || []).map((t) => '- ' + (t.function && t.function.name) + ' ' + JSON.stringify((t.function && t.function.parameters && t.function.parameters.properties) || {}).slice(0, 160)).join('\n');
  let justCompacted = false;
  let nudgedFollowThrough = false;
  const ctxBudget = ctxWindowFor(model, opts.exactCtx);
  const canCompact = typeof adapter.summarize === 'function';

  adapter.emit({ type: 'turn_start', mode, model });

  while (steps < stepCap) {
    if (signal && signal.aborted) { adapter.emit({ type: 'aborted' }); break; }
    steps++;
    { const g = runGuard.check(); if (g.stop) { finalText = guardStopMessage(g.code); adapter.emit({ type: 'guard_stop', code: g.code }); adapter.emit({ type: 'final', text: finalText }); break; } }

    if (canCompact && !justCompacted && estTokens(messages) > 0.7 * ctxBudget) {
      adapter.emit({ type: 'compacting', reason: "approaching the model's context window" });
      try {
        const summary = await adapter.summarize!(buildCompactionMessages(messages), { profile, signal });
        applyCompaction(messages, String(summary || ''));
        for (let k = 1; k < messages.length; k++) {
          const hm = messages[k];
          if (hm && hm.role !== 'system' && typeof hm.content === 'string' && hm.content.length > 6000) hm.content = headTail(hm.content, { maxChars: 6000 });
        }
        justCompacted = true;
        adapter.emit({ type: 'compacted' });
      } catch (e) {
        adapter.emit({ type: 'compacted', error: String((e as Error)?.message || e) });
      }
    } else if (justCompacted) {
      justCompacted = false;
    }

    const sys0 = messages[0];
    if (textMode && sys0 && sys0.role === 'system' && !sys0['_protocolAdded']) {
      sys0.content = String(sys0.content || '') + '\n' + TEXT_PROTOCOL(textToolList());
      sys0['_protocolAdded'] = true;
    }

    squashStale(messages);

    const onDelta = (d: unknown) => adapter.emit({ type: 'delta', text: String(d == null ? '' : d) });
    const resp: StreamResponse = (await adapter.stream(profile, messages, toolset, { onDelta, signal })) || {};
    const content = resp.content != null ? String(resp.content) : '';
    let toolCalls: ToolCall[] = Array.isArray(resp.tool_calls) ? resp.tool_calls : [];
    if (resp.textMode) textMode = true;

    let assistantContent = content;
    if (!toolCalls.length && content) {
      const parsed = parseTextToolCalls(content);
      if (parsed.calls.length) {
        toolCalls = parsed.calls.map((c) => ({ id: c.id, function: { name: c.name, arguments: c.arguments } }));
        assistantContent = parsed.stripped;
      }
    }

    const assistantMsg: ChatMessage = { role: 'assistant', content: textMode ? (resp._rawText || content || '') : assistantContent };
    if (!textMode && toolCalls.length) assistantMsg.tool_calls = toolCalls.map((tc) => ({ id: tc.id, type: 'function', function: tc.function }));
    messages.push(assistantMsg);

    if (!toolCalls.length) {
      if (opts.nudgeFollowThrough && !nudgedFollowThrough && toolset && toolset.length && announcesNextAction(assistantContent)) {
        nudgedFollowThrough = true;
        messages.push({ role: 'user', content: "You described a next step but didn't take it. If you still need a tool, call it now — otherwise give your complete final answer." });
        adapter.emit({ type: 'nudge', reason: 'announced a next step without acting' });
        continue;
      }
      finalText = finalize(assistantContent);
      if (opts.cleanupReasoning === true && !isDeckCapable(model) && looksLikeLeakedReasoning(finalText)) {
        try {
          adapter.emit({ type: 'cleanup' });
          const cleaned = await cleanupLeakedReasoning(adapter, profile, finalText, signal);
          if (cleaned && cleaned.length <= finalText.length * 1.1 && !looksLikeLeakedReasoning(cleaned)) {
            finalText = cleaned;
            if (typeof assistantMsg.content === 'string') assistantMsg.content = cleaned;
          }
        } catch { /* keep original */ }
      }
      if (!String(finalText || '').trim()) {
        const blocks = String(assistantContent || '').match(/```[\s\S]*?```/g) || [];
        const spec = blocks.find((b) => /```(?:officedoc|deckjs|xlsxjs|docxjs|pdfjs)\b/i.test(b) || /"type"\s*:\s*"(?:xlsx|docx|pptx|pdf)"/.test(b) || /"(?:sheets|slides|sections)"\s*:/.test(b));
        if (spec) finalText = spec;
      }
      if (!String(finalText || '').trim()) finalText = "The model returned an empty response, so there's no answer to show. Please try again, rephrase, or switch to a more capable model.";
      adapter.emit({ type: 'final', text: finalText });
      break;
    }

    for (const call of toolCalls) {
      const name = callName(call);
      const args = tolerantParse(callArgs(call)).value;
      if (guard.repeatBlocked(name, args)) {
        const blockMsg = '[guard] blocked a repeated identical call to ' + name + ' — try a different approach.';
        messages.push(toolResultMsg(call, blockMsg, textMode));
        adapter.emit({ type: 'tool_blocked', id: call.id, name, args, message: blockMsg });
        continue;
      }
      observedTools.push(name);
      adapter.emit({ type: 'tool_call', name, args });
      let resultText: string;
      let ok = true;
      try {
        resultText = normalizeToolResult(await adapter.runTool(name, args, { id: call.id, mode, model, signal }));
      } catch (e) {
        ok = false;
        resultText = '[tool error] ' + ((e as Error)?.message || String(e));
      }
      resultText = headTail(resultText);
      const a = args as Record<string, unknown> | null;
      guard.noteResult(name, a ? String(a['path'] || a['file'] || a['target'] || '') : '', ok);
      messages.push(toolResultMsg(call, resultText, textMode));
      adapter.emit({ type: 'tool_result', name, ok });
    }
    { const sig = toolCalls.map((c) => callName(c) + ':' + String(callArgs(c) == null ? '' : callArgs(c)).slice(0, 300)).join('+'); const n = runGuard.note(sig); if (n.stop) { finalText = guardStopMessage(n.code); adapter.emit({ type: 'guard_stop', code: n.code }); adapter.emit({ type: 'final', text: finalText }); break; } }
  }

  if (!finalText && steps >= stepCap) {
    finalText = '[guard] step cap reached (' + stepCap + ') without a final answer.';
    adapter.emit({ type: 'cap_reached', stepCap });
    adapter.emit({ type: 'final', text: finalText });
  } else if (!String(finalText || '').trim()) {
    finalText = signal && signal.aborted ? 'Run stopped before an answer was produced.' : 'The run ended without an answer. Please try again or switch to a more capable model.';
    adapter.emit({ type: 'final', text: finalText });
  }

  adapter.emit({ type: 'turn_end', steps });
  return { text: finalText, messages, steps, observedTools };
}
