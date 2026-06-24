// @madav/core — cross-runtime agent prompt rules. Code is ONLY for READING/CRUNCHING uploaded data;
// the OUTPUT office file is ALWAYS built by the deterministic document engine. ONE source.
const DESKTOP_DATA_TOOLS =
  ' DATA FILES: you can run code with run_bash to READ and CRUNCH real data files the user uploaded — Python (pandas + openpyxl) — for joins, aggregations and reconciliations. NEVER name a script after a Python standard-library module (inspect.py, code.py, test.py, json.py, string.py, random.py) — it shadows the stdlib and breaks pandas; use a unique name like crunch_data.py. Use code ONLY to GET the numbers — never to BUILD the finished office file.';
const WEB_DATA_TOOLS =
  'You CAN run Python in the browser with run_python (pandas + openpyxl) to READ and CRUNCH real data files the user uploaded — read them by name (e.g. pandas.read_excel("Backlog.xlsx")), compute, and get the numbers. There is no system shell or pip — only run_python. NEVER name a script after a Python standard-library module — it breaks imports. Use code ONLY to GET the numbers — never to BUILD the finished office file.';
const SPREADSHEET_CRAFT =
  ' BUILDING THE OUTPUT FILE — ALWAYS via the document engine, NEVER by writing a script: a spreadsheet, Word doc, PDF or slide deck is ALWAYS delivered as ONE document spec. The deterministic engine assigns every cell, writes every formula, draws native charts and KPI tiles, and CANNOT produce a broken file. Work the numbers out first, then put the FINISHED numbers into the spec. The ONLY exception is a giant raw-data export of thousands of rows you genuinely cannot hand-list. ';

export function dataToolsRule(caps: { shell?: boolean } = {}): string {
  return (caps && caps.shell ? DESKTOP_DATA_TOOLS : WEB_DATA_TOOLS) + SPREADSHEET_CRAFT;
}

export function needsDataTools(text: unknown): boolean {
  const t = String(text || '').toLowerCase();
  if (/\b(xlsx|xlsm|\.xls\b|excel|spreadsheet|workbook|\.csv\b|csv|pivot table)\b/.test(t)) return true;
  if (
    /\b(analy[sz]e|process|aggregate|reconcile|summari[sz]e|tabulate|crunch)\b/.test(t) &&
    /\b(these files|the files|my data|the data|uploaded|attached|source files|raw data|dataset)\b/.test(t)
  )
    return true;
  return false;
}

export const SEARCH_ANSWER_RULE =
  "You can search the web: call the web_search tool for anything current or beyond your training data — news, latest releases, prices, 'today'/'now', recent events. Do NOT say you cannot access the internet; search first, then answer with what you ACTUALLY found, preferring the most recent result. Cite ONLY a source that appears in your search results and copy its real URL exactly — NEVER invent, guess, or reconstruct a URL, headline, outlet, or date.";
