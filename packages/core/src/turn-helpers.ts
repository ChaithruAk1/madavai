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
