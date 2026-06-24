import type { Cell, Table } from '@madav/contracts';
import type { Issue } from '../excel/issues.js';
import { normalizeTable } from './normalize.js';

/** Deterministic RFC-4180-ish CSV: double-quote escaping, quoted commas/newlines, CRLF or LF. */
export function parseCsv(text: string): string[][] {
  const s = String(text ?? '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQ = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) {
      if (ch === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch === '\r') { /* handled at \n */ }
    else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const coerce = (s: string): Cell => {
  const t = s.trim();
  if (t === '') return null;
  if (/^-?\d+(\.\d+)?$/.test(t)) { const n = Number(t); if (Number.isFinite(n)) return n; }
  if (t === 'true' || t === 'TRUE') return true;
  if (t === 'false' || t === 'FALSE') return false;
  return s;
};

export function ingestCsv(name: string, text: string, opts: { header?: boolean } = {}): { table: Table; issues: Issue[] } {
  const raw = parseCsv(text);
  const hasHeader = opts.header !== false;
  const header: Cell[] = hasHeader ? (raw[0] ?? []).map((x) => String(x)) : [];
  const bodyRaw = hasHeader ? raw.slice(1) : raw;
  const body: Cell[][] = bodyRaw.map((r) => r.map(coerce));
  return normalizeTable(name || 'Sheet1', header, body);
}
