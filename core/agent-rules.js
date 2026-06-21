// core/agent-rules.js — ESM SINGLE SOURCE for cross-surface agent prompt rules (ADR-0001 core migration).
// Imported by: web/renderer + server natively; desktop (electron/*.cjs) via dynamic await import().
// The data-tools rule differs BY EXECUTION MODEL (desktop shell+Node vs web Pyodide-only) — ONE source,
// the adapter's capabilities select the right text. Code is ONLY for READING/CRUNCHING uploaded data;
// the OUTPUT office file is ALWAYS built by the deterministic officedoc engine (see office-rules.js).
const DESKTOP_DATA_TOOLS = " DATA FILES: you can run code with run_bash to READ and CRUNCH real data files the user uploaded — Python (pandas + openpyxl) — for joins, aggregations and reconciliations over data you could not work out by hand. read_file returns spreadsheets as readable rows. NEVER name a script after a Python standard-library module (inspect.py, code.py, test.py, json.py, string.py, random.py) — it shadows the stdlib and breaks pandas with a 'partially initialized module / circular import' error; use a unique name like crunch_data.py. Use code ONLY to GET the numbers — never to BUILD the finished office file.";
const WEB_DATA_TOOLS = `You CAN run Python in the browser with run_python (pandas + openpyxl) to READ and CRUNCH real data files the user uploaded — read them by name (e.g. pandas.read_excel("Backlog.xlsx")), compute, and get the numbers. There is no system shell or pip — only run_python. NEVER name a script after a Python standard-library module (inspect/code/test/json/random/string) — it breaks imports. Use code ONLY to GET the numbers — never to BUILD the finished office file.`;
// caps.shell === true  -> desktop (run_bash + Node + exceljs);  otherwise -> web (run_python / Pyodide, no shell).
const SPREADSHEET_CRAFT = ` BUILDING THE OUTPUT FILE — ALWAYS via the office engine, NEVER by writing a script: a spreadsheet, Word doc, PDF or slide deck is ALWAYS delivered as ONE officedoc block (the office rule above gives the exact shape). The deterministic engine assigns every cell, writes every formula, draws native Excel charts and KPI tiles, and CANNOT produce a broken file — identical on web and desktop. Work the numbers out first (from the assumptions for a model, or with the code tools above when you must crunch a large uploaded dataset), then put the FINISHED numbers into the officedoc spec: for a financial model use inputs + periods + metrics so the engine writes the formulas; for plain output use columns + rows of values; add a kpis array and a charts array whenever a headline number, trend or breakdown helps. Do NOT paste a script as a code block, and do NOT save a spreadsheet by running code. The ONLY exception is a giant raw-data export of thousands of rows you genuinely cannot hand-list — only then write the .xlsx with a script and Madav shows the card. `;
export function dataToolsRule(caps = {}) { return (caps && caps.shell ? DESKTOP_DATA_TOOLS : WEB_DATA_TOOLS) + SPREADSHEET_CRAFT; }

// Does this user turn warrant the data/script path (run code that builds or works a spreadsheet)? SINGLE
// SOURCE for desktop (session-manager _turn) + web (Let's Chat). Triggers on EXPLICIT spreadsheet vocabulary
// (rare in plain chat) OR an analyse-my-files request; deliberately excludes ambiguous words
// (report/model/data/table) so normal conversation, writing, and Q&A stay on the fast plain-chat path.
export function needsDataTools(text) {
  const t = String(text || "").toLowerCase();
  if (/\b(xlsx|xlsm|\.xls\b|excel|spreadsheet|workbook|\.csv\b|csv|pivot table)\b/.test(t)) return true;
  if (/\b(analy[sz]e|process|aggregate|reconcile|summari[sz]e|tabulate|crunch)\b/.test(t)
      && /\b(these files|the files|my data|the data|uploaded|attached|source files|raw data|dataset)\b/.test(t)) return true;
  return false;
}

// Web-search answer guidance — ONE source for web + desktop (was a desktop `webSearchNote` string + a
// separate web copy). Make the model actually search, answer fully, and cite REAL results only — the
// anti-fabrication clause stops models inventing plausible-looking URLs/sources to satisfy "cite a source".
export const SEARCH_ANSWER_RULE = "You can search the web: call the web_search tool for anything current or beyond your training data — news, latest releases, prices, 'today'/'now', recent events. Do NOT say you cannot access the internet or browse; search first, then answer with what you ACTUALLY found, preferring the most recent result. Cite ONLY a source that appears in your search results and copy its real URL exactly — NEVER invent, guess, or reconstruct a URL, headline, outlet, or date. If the search returns nothing useful, say so plainly instead of making something up.";
