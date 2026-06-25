// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Native Anthropic tool-use adapter — the PURE pieces (no network), so Madav's own agent loop talks to
// the Anthropic Messages API directly (no third-party agent SDK). Shared by the desktop provider layer;
// fully unit-testable. Converts the loop's OpenAI-shaped messages/tools <-> Anthropic, and reduces the
// Anthropic streaming events into the SAME { content, toolCalls } shape the loop already consumes.

/** OpenAI function-tools -> Anthropic tools. */
export function toAnthropicTools(tools) {
  return (tools || []).map((t) => {
    const f = (t && t.function) || t || {};
    return { name: f.name, description: f.description || '', input_schema: f.parameters || { type: 'object', properties: {} } };
  });
}

/**
 * OpenAI-shaped messages -> { system, turns } for Anthropic.
 * - system role(s) -> top-level `system` string.
 * - assistant.tool_calls -> `tool_use` content blocks (input = parsed arguments).
 * - role:"tool" results -> `tool_result` blocks, merged into ONE user message per assistant turn.
 * - string content is passed as-is; array (multimodal) content is passed through.
 */
export function toAnthropicMessages(messages) {
  const system = (messages || []).filter((m) => m.role === 'system')
    .map((m) => (typeof m.content === 'string' ? m.content : '')).filter(Boolean).join('\n') || undefined;
  const turns = [];
  for (const m of messages || []) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const block = { type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '') };
      const last = turns[turns.length - 1];
      if (last && last.role === 'user' && Array.isArray(last.content) && last.content.every((b) => b && b.type === 'tool_result')) last.content.push(block);
      else turns.push({ role: 'user', content: [block] });
      continue;
    }
    if (m.role === 'assistant') {
      const content = [];
      if (m.content) content.push({ type: 'text', text: typeof m.content === 'string' ? m.content : '' });
      for (const tc of m.tool_calls || []) {
        let input = {}; try { input = JSON.parse((tc.function && tc.function.arguments) || '{}'); } catch {}
        content.push({ type: 'tool_use', id: tc.id, name: tc.function && tc.function.name, input });
      }
      turns.push({ role: 'assistant', content: content.length ? content : [{ type: 'text', text: ' ' }] });
      continue;
    }
    turns.push({ role: 'user', content: Array.isArray(m.content) ? m.content : String(m.content ?? '') });
  }
  return { system, turns };
}

/**
 * Stateful reducer over Anthropic streaming events. push() one parsed SSE json at a time;
 * text() is the running assistant text (for incremental UI streaming); result() is the final
 * { content, toolCalls:[{id,name,arguments}] } — arguments is the JSON string, exactly like the OpenAI path.
 */
export function createToolStreamReducer() {
  let content = '';
  const blocks = {};
  return {
    push(ev) {
      const t = ev && ev.type;
      if (t === 'content_block_start') {
        const cb = ev.content_block || {};
        blocks[ev.index] = cb.type === 'tool_use' ? { type: 'tool_use', id: cb.id, name: cb.name, json: '' } : { type: 'text' };
      } else if (t === 'content_block_delta') {
        const b = blocks[ev.index]; const d = ev.delta || {};
        if (d.type === 'text_delta') content += d.text || '';
        else if (d.type === 'input_json_delta' && b) b.json += d.partial_json || '';
      }
    },
    text() { return content; },
    result() {
      const toolCalls = Object.values(blocks)
        .filter((b) => b.type === 'tool_use' && b.name)
        .map((b, i) => ({ id: b.id || ('call_' + i + '_' + Math.random().toString(36).slice(2, 7)), name: b.name, arguments: b.json || '{}' }));
      return { content, toolCalls };
    },
  };
}
