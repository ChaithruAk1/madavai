import type { Cell } from '@madav/contracts';

/** Raw tabular block lifted from model text, before normalization. */
export interface RawTable { name: string; header: string[]; rows: Cell[][]; }

const splitRow = (line: string): string[] => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
};

// A markdown header/body separator, e.g. |---|:--:|---|
const isSep = (line: string): boolean =>
  line.includes('-') && /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/.test(line);

const coerce = (s: string): Cell => {
  const t = s.trim();
  if (t === '') return null;
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) { const n = Number(t.replace(/,/g, '')); if (Number.isFinite(n)) return n; }
  if (/^-?\d+(\.\d+)?$/.test(t)) { const n = Number(t); if (Number.isFinite(n)) return n; }
  if (t === 'true' || t === 'TRUE') return true;
  if (t === 'false' || t === 'FALSE') return false;
  return s;
};

/**
 * Find GitHub-style markdown tables anywhere in free text. This is the weak-model bridge: even the
 * smallest model emits a markdown table, and the app turns it into a real spreadsheet deterministically —
 * the model never has to know any office/JSON format.
 */
export function extractMarkdownTables(text: string): RawTable[] {
  const lines = String(text ?? '').split(/\r?\n/);
  const out: RawTable[] = [];
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].includes('|') || !isSep(lines[i + 1])) continue;
    const header = splitRow(lines[i]);
    const rows: Cell[][] = [];
    let j = i + 2;
    for (; j < lines.length; j++) {
      if (lines[j].trim() === '' || !lines[j].includes('|')) break;
      rows.push(splitRow(lines[j]).map(coerce));
    }
    out.push({ name: `Table ${out.length + 1}`, header, rows });
    i = j - 1;
  }
  return out;
}
