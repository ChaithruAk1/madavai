export { normalizeTable, inferColumnType } from './normalize.js';
export { parseCsv, ingestCsv } from './csv.js';
export { ingestWorkbook } from './excel.js';
export { extractMarkdownTables, type RawTable } from './markdown.js';
export type { Table, Column, ColumnType } from '@madav/contracts';
