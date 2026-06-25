import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDataProject, webProjectAdapters } from '../src/index.js';
import { nodeProjectAdapters } from '../src/project/node.js';

const PLAN = '{"source":"sales","ops":[{"op":"aggregate","groupBy":["region"],"measures":[{"column":"revenue","fn":"sum","as":"Total"}]}]}';

test('desktop adapter: pipeline runs against a REAL folder and writes the styled .xlsx into it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'madav-proj-'));
  await writeFile(join(dir, 'sales.csv'), 'region,revenue\nNA,1000\nEU,800\nNA,500');
  const res = await runDataProject({ task: 'revenue by region', folder: dir, outputName: 'Result.xlsx' }, nodeProjectAdapters(async () => PLAN));
  assert.equal(res.ok, true);
  assert.ok((await readdir(dir)).includes('Result.xlsx'));
  const m: any = await import('exceljs'); const wb = new (m.default || m).Workbook();
  await wb.xlsx.load(new Uint8Array(await readFile(join(dir, 'Result.xlsx'))));
  assert.equal(wb.worksheets[0].getCell('A1').value, 'region');
});

test('web adapter: pipeline runs against uploaded File[] and hands back a Blob', async () => {
  const file = new File(['region,revenue\nNA,1000\nEU,800'], 'sales.csv', { type: 'text/csv' });
  let out: { name?: string; blob?: Blob } = {};
  const res = await runDataProject({ task: 'revenue by region', folder: '(web)' }, webProjectAdapters([file], async () => PLAN, (name, blob) => { out = { name, blob }; }));
  assert.equal(res.ok, true);
  assert.equal(out.name, 'Result.xlsx');
  assert.ok(out.blob && out.blob.size > 0);
});
