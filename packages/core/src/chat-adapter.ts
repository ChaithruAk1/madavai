// @madav/core — ONE chat-adapter factory shared by every runtime: stream-shaping (+ native->text fallback),
// runTool (permission gate + tool UI events), summarize (compaction), and semantic-event -> UI-event mapping.
// The only per-runtime bits are injected as `platform`; the result is the adapter coreChatTurn consumes.
import { parseTextToolCalls as coreParseTextToolCalls, type ChatMessage } from './turn-helpers.js';
import type { ChatAdapter, ToolSchema, UiEvent } from './chat-loop.js';

export interface AdapterPlatform {
  streamChatTools: (profile: unknown, messages: ChatMessage[], tools: ToolSchema[], opts: { onDelta: (d: unknown) => void; signal?: unknown }) => Promise<{ content?: string; toolCalls?: Array<{ id?: string; name?: string; arguments?: unknown }> }>;
  streamChat: (profile: unknown, messages: ChatMessage[], opts: { onDelta: (d: unknown) => void; signal?: unknown }) => Promise<{ text?: string }>;
  execLeaf: (name: string, args: unknown, ctx: Record<string, unknown>) => unknown | Promise<unknown>;
  ui: (kind: string, data: Record<string, unknown>) => void;
  toolset?: ToolSchema[];
  parseTextToolCalls?: (text: unknown) => { calls: Array<{ id: string; name: string; arguments: string }>; stripped: string };
  authorize?: (name: string, args: unknown, id: string) => Promise<{ decision: string; auto?: boolean }> | { decision: string; auto?: boolean };
  isAuto?: (name: string) => boolean;
  textMode?: boolean;
  now?: () => number;
}

export function makeChatAdapter(platform: AdapterPlatform): ChatAdapter {
  const {
    streamChatTools, streamChat, execLeaf, ui, toolset = [], authorize,
    parseTextToolCalls = coreParseTextToolCalls,
    isAuto = () => true, textMode = false, now = () => Date.now(),
  } = platform;
  const started = now();
  let inText = !!textMode;
  let compactId = '';

  return {
    tools() { return toolset; },

    async stream(profile, messages, tools, { onDelta, signal } = { onDelta: () => {} }) {
      const textPath = async () => {
        const tr = await streamChat(profile, messages, { onDelta: () => {}, signal });
        const text = (tr && tr.text) || '';
        const { calls, stripped } = parseTextToolCalls(text);
        return { content: stripped, tool_calls: (calls || []).map((c) => ({ id: c.id, function: { name: c.name, arguments: c.arguments } })), textMode: true, _rawText: text };
      };
      if (inText) return textPath();
      try {
        const r = (await streamChatTools(profile, messages, tools, { onDelta, signal })) || {};
        return { content: r.content || '', tool_calls: (r.toolCalls || []).map((t) => ({ id: t.id, function: { name: t.name, arguments: t.arguments } })), textMode: false };
      } catch (e) {
        if (/tool|function/i.test(String((e as Error)?.message || ''))) { inText = true; return textPath(); }
        throw e;
      }
    },

    async runTool(name, args, ctx) {
      const c = (ctx || {}) as Record<string, unknown>;
      const id = (c['id'] as string) || '';
      const dec = authorize ? await authorize(name, args, id) : { decision: 'run', auto: !!isAuto(name) };
      ui('tool_use', { id, name, input: args, auto: !!dec.auto });
      if (dec.decision === 'blocked' || dec.decision === 'denied') {
        const out = dec.decision === 'blocked' ? '(blocked: plan mode is read-only)' : '(user declined this tool call)';
        ui('permission_denied', { id, name, reason: dec.decision === 'blocked' ? 'plan mode (read-only)' : 'declined' });
        ui('tool_result', { id, output: out });
        return out;
      }
      let output: unknown;
      let image: unknown;
      try {
        const r = await execLeaf(name, args, c);
        if (r && typeof r === 'object' && !Array.isArray(r) && ('output' in (r as object) || 'image' in (r as object))) {
          output = (r as { output?: unknown }).output;
          image = (r as { image?: unknown }).image;
        } else output = r;
      } catch (e) { output = 'ERROR: ' + ((e as Error)?.message || e); }
      const outStr = String(output == null ? '' : output);
      ui('tool_result', { id, output: outStr.slice(0, 4000), ...(image ? { image } : {}) });
      return outStr;
    },

    async summarize(messages, opts) {
      const o = (opts || {}) as { profile?: unknown; signal?: unknown };
      const r = await streamChat(o.profile, messages as ChatMessage[], { onDelta: () => {}, signal: o.signal });
      return (r && r.text) || '';
    },

    emit(event: UiEvent) {
      const t = event && event.type;
      if (t === 'delta') ui('assistant_delta', { text: event['text'] });
      else if (t === 'tool_call' || t === 'tool_result') { /* owned by runTool */ }
      else if (t === 'tool_blocked') {
        ui('tool_use', { id: (event['id'] as string) || '', name: event['name'], input: event['args'] || {}, auto: true });
        ui('tool_result', { id: (event['id'] as string) || '', output: event['message'] || '(blocked)' });
      } else if (t === 'final') {
        ui('assistant_message', { stop_reason: 'end_turn', text: event['text'] });
        ui('result', { subtype: 'success', duration_ms: now() - started });
      } else if (t === 'cap_reached') {
        ui('result', { subtype: 'max_steps', duration_ms: now() - started });
      } else if (t === 'compacting') {
        compactId = 'compact_' + now().toString(36);
        ui('tool_use', { id: compactId, name: 'compact_context', input: { reason: event['reason'] || '' }, auto: true });
      } else if (t === 'compacted') {
        ui('tool_result', { id: compactId, output: event['error'] ? '(compaction skipped: ' + event['error'] + ')' : 'Mission history compacted into working notes.' });
      }
    },
  };
}
