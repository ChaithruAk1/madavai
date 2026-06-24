// @madav/core — pure, provider-agnostic turn-loop helpers (no Node/browser APIs, no I/O, no model calls).
// Ported to TypeScript from the legacy single-source `core/turn-helpers.js`; behaviour preserved.

export interface ParseResult {
  ok: boolean;
  value: unknown;
  repaired: boolean;
  error?: string;
}

// Control characters built programmatically so the source stays printable ASCII.
const CTRL_RE = new RegExp(
  '[' +
    String.fromCharCode(0) + '-' + String.fromCharCode(8) +
    String.fromCharCode(11) + String.fromCharCode(12) +
    String.fromCharCode(14) + '-' + String.fromCharCode(31) +
    String.fromCharCode(127) + ']',
  'g',
);

/** Tolerant JSON repair ladder: parse model-emitted JSON that is "almost" valid. */
export function tolerantParse(raw: unknown): ParseResult {
  const s0 = String(raw == null ? '' : raw).trim();
  if (!s0) return { ok: true, value: {}, repaired: false };
  try {
    return { ok: true, value: JSON.parse(s0), repaired: false };
  } catch {
    /* fall through */
  }
  let s = s0;
  s = s.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/, '').trim();
  s = s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_m, inner: string) => '"' + inner.replace(/"/g, '\\"') + '"');
  s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g, '$1"$2"$3');
  s = s.replace(/,\s*([}\]])/g, '$1');
  s = s.replace(CTRL_RE, '');
  try {
    return { ok: true, value: JSON.parse(s), repaired: true };
  } catch {
    /* fall through */
  }
  // escape bare newlines/tabs inside string literals
  try {
    let out = '';
    let inStr = false;
    let esc = false;
    for (const ch of s) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = !inStr; out += ch; continue; }
      if (inStr && ch === '\n') { out += '\\n'; continue; }
      if (inStr && ch === '\t') { out += '\\t'; continue; }
      out += ch;
    }
    return { ok: true, value: JSON.parse(out), repaired: true };
  } catch {
    /* fall through */
  }
  // last resort: extract the largest balanced {...} block
  const start = s.indexOf('{');
  if (start >= 0) {
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') inStr = !inStr;
      else if (!inStr && ch === '{') depth++;
      else if (!inStr && ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return { ok: true, value: JSON.parse(s.slice(start, i + 1)), repaired: true };
          } catch {
            /* give up */
          }
          break;
        }
      }
    }
  }
  return { ok: false, value: {}, repaired: false, error: 'arguments were not valid JSON' };
}

export interface HeadTailOptions {
  headLines?: number;
  tailLines?: number;
  maxChars?: number;
}

/** Keep the head and tail of long text, eliding the middle (for logs/tool output). */
export function headTail(text: unknown, opts: HeadTailOptions = {}): string {
  const { headLines = 80, tailLines = 40, maxChars = 8000 } = opts;
  const t = String(text == null ? '' : text);
  if (t.length <= maxChars) {
    const lines = t.split('\n');
    if (lines.length <= headLines + tailLines) return t;
    const omitted = lines.length - headLines - tailLines;
    return lines.slice(0, headLines).join('\n') + `\n… (${omitted} lines omitted) …\n` + lines.slice(-tailLines).join('\n');
  }
  const head = t.slice(0, Math.floor(maxChars * 0.65));
  const tail = t.slice(-Math.floor(maxChars * 0.3));
  return head + `\n… (${t.length - head.length - tail.length} characters omitted) …\n` + tail;
}

/** Loop breaker: blocks an identical tool call repeated 3x in a row; tracks per-target failure streaks. */
export class CallGuard {
  private lastKey = '';
  private lastKeyCount = 0;
  private streaks = new Map<string, number>();
  reasks = 0;

  private key(name: string, args: unknown): string {
    let a = '';
    try {
      a = JSON.stringify(args);
    } catch {
      /* non-serialisable args */
    }
    return name + '|' + a.slice(0, 400);
  }

  repeatBlocked(name: string, args: unknown): boolean {
    const k = this.key(name, args);
    if (k === this.lastKey) this.lastKeyCount++;
    else {
      this.lastKey = k;
      this.lastKeyCount = 1;
    }
    return this.lastKeyCount >= 3;
  }

  noteResult(name: string, target: string | undefined, ok: boolean): void {
    const k = name + '|' + String(target || '');
    if (ok) this.streaks.delete(k);
    else this.streaks.set(k, (this.streaks.get(k) || 0) + 1);
  }

  failStreak(name: string, target?: string): number {
    return this.streaks.get(name + '|' + String(target || '')) || 0;
  }
}

/** Rough token estimate (~4 chars/token) for budgeting. */
export const estTokens = (x: unknown): number => {
  if (x == null) return 0;
  if (typeof x === 'string') return Math.ceil(x.length / 4);
  try {
    return Math.ceil(JSON.stringify(x).length / 4);
  } catch {
    return 0;
  }
};

/** Strip <think>…</think> chain-of-thought, keeping only the final answer. */
export function stripReasoning(str: unknown): string {
  if (!str) return (str as string) || '';
  let s = String(str).replace(/<think>[\s\S]*?<\/think>/gi, '');
  const i = s.lastIndexOf('</think>');
  if (i !== -1) s = s.slice(i + '</think>'.length);
  s = s.replace(/<think>[\s\S]*$/i, '');
  return s.replace(/^\s+/, '');
}

// ---------- chat message shape + stale-result compression ----------
export interface ChatMessage {
  role: string;
  content?: unknown;
  tool_calls?: Array<{ function?: { name?: string; arguments?: unknown }; id?: string; type?: string; [k: string]: unknown }>;
  _squashed?: boolean;
  [k: string]: unknown;
}

export function squashStale(
  history: ChatMessage[],
  { keepRecent = 14, cap = 180 }: { keepRecent?: number; cap?: number } = {},
): ChatMessage[] {
  const cut = history.length - keepRecent;
  for (let i = 1; i < cut; i++) {
    const m = history[i];
    if (!m) continue;
    const content = m.content;
    if (typeof content !== 'string') continue;
    const isTextModeResult = m.role === 'user' && content.startsWith('[result of ');
    if (m.role !== 'tool' && !isTextModeResult) continue;
    if (content.length <= cap || m._squashed) continue;
    const first = content.split('\n', 1)[0].slice(0, cap);
    m.content = first + ' … (older result compressed)';
    m._squashed = true;
  }
  return history;
}

// ---------- text-mode tool protocol + parser (assistant text only) ----------
export const TEXT_PROTOCOL = (toolList: string): string => `
You do not have native function calling here. To use a tool, output a fenced block EXACTLY like:
\`\`\`tool
{"name": "<tool name>", "args": { ... }}
\`\`\`
Rules: at most 2 tool blocks per reply; the args object must be valid JSON; after the block(s), STOP and wait for the results — do not invent them. When you are completely done, reply with your final answer and NO tool block.
Available tools:
${toolList}`;

export interface TextToolCall {
  id: string;
  name: string;
  arguments: string;
}

export function parseTextToolCalls(content: unknown): { calls: TextToolCall[]; stripped: string } {
  const calls: TextToolCall[] = [];
  const src = String(content || '');
  let m: RegExpExecArray | null;
  let i = 0;

  const reFence = /```tool\s*\n([\s\S]*?)```/g;
  while ((m = reFence.exec(src)) && calls.length < 2) {
    const p = tolerantParse(m[1]);
    const v = (p.ok ? p.value : null) as { name?: unknown; args?: unknown; arguments?: unknown } | null;
    if (v && v.name) {
      calls.push({ id: 'txt_' + Date.now().toString(36) + '_' + i++, name: String(v.name), arguments: JSON.stringify(v.args || v.arguments || {}) });
    }
  }

  if (!calls.length) {
    const reFn = /<function\s*=\s*([a-zA-Z0-9_.\-]+)\s*>([\s\S]*?)<\/function>/g;
    while ((m = reFn.exec(src)) && calls.length < 2) {
      const name = m[1];
      const body = m[2] || '';
      const args: Record<string, unknown> = {};
      const reParam = /<parameter\s*=\s*([a-zA-Z0-9_.\-]+)\s*>([\s\S]*?)<\/parameter>/g;
      let pm: RegExpExecArray | null;
      while ((pm = reParam.exec(body))) {
        let v: string | number | boolean = (pm[2] || '').trim();
        if (/^-?\d+(\.\d+)?$/.test(String(v))) v = Number(v);
        else if (v === 'true' || v === 'false') v = v === 'true';
        args[pm[1]] = v;
      }
      calls.push({ id: 'txt_' + Date.now().toString(36) + '_' + i++, name: String(name), arguments: JSON.stringify(args) });
    }
  }

  const stripped = src
    .replace(/```tool\s*\n[\s\S]*?```/g, '')
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function\s*=\s*[a-zA-Z0-9_.\-]+\s*>[\s\S]*?<\/function>/gi, '')
    .trim();
  return { calls, stripped };
}

// ---------- context budget + compaction ----------
export function buildCompactionMessages(history: ChatMessage[]): { role: string; content: string }[] {
  const body = history
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const role = m.role === 'tool' ? 'tool-result' : m.role;
      let c = typeof m.content === 'string' ? m.content : '';
      if (m.tool_calls) c += '\n[called: ' + m.tool_calls.map((t) => t.function && t.function.name).join(', ') + ']';
      return role.toUpperCase() + ': ' + c.slice(0, 2000);
    })
    .join('\n---\n')
    .slice(0, 60000);
  return [
    { role: 'system', content: "You compress an agent mission's history into working notes. Output ONLY the notes, no preamble." },
    { role: 'user', content: 'Compress this mission history into concise notes with EXACTLY these sections:\nGOAL: (the objective)\nDECISIONS: (choices made and why)\nFILES: (files read/changed + current state)\nDONE: (finished)\nREMAINS: (left to do)\n\n' + body },
  ];
}

export function applyCompaction(history: ChatMessage[], summary: unknown, keepLast = 4): ChatMessage[] {
  const sys = history[0] && history[0].role === 'system' ? history[0] : null;
  const tailEnd = history.length;
  let tailStart = tailEnd;
  let turns = 0;
  for (let i = tailEnd - 1; i > 0 && turns < keepLast; i--) {
    const h = history[i];
    if (h.role === 'user' || (h.role === 'assistant' && !h.tool_calls)) turns++;
    tailStart = i;
  }
  while (tailStart < tailEnd && history[tailStart].role === 'tool') tailStart++;
  const tail = history.slice(tailStart);
  const note: ChatMessage = { role: 'user', content: "[context notes — earlier history was compacted to stay within the model's memory]\n" + String(summary || '').slice(0, 12000) };
  history.length = 0;
  if (sys) history.push(sys);
  history.push(note, ...tail);
  return history;
}
