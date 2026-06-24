import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskKeyOf, makeRecipe, matchRecipe, upsertRecipe, recipeInScope, recipePromptBlock, type Recipe } from '../src/index.js';

test('taskKeyOf: month/year/number collapse to the same key', () => {
  assert.equal(taskKeyOf('DTC report for March 2026'), taskKeyOf('DTC report for April 2027'));
  assert.match(taskKeyOf('Q3 sales 2025'), /\{quarter\}.*\{year\}/);
});

test('makeRecipe: caps scripts (4) and outputs (8), sets taskKey', () => {
  const r = makeRecipe({
    task: 'Build the March report',
    scripts: Array.from({ length: 6 }, (_, i) => ({ name: 's' + i + '.py', content: 'print(' + i + ')' })),
    outputs: Array.from({ length: 12 }, (_, i) => 'out' + i + '.xlsx'),
    model: 'm',
  });
  assert.equal(r.scripts.length, 4);
  assert.equal(r.outputs.length, 8);
  assert.ok(r.taskKey.includes('{month}'));
});

test('matchRecipe: newest match for the same key wins; different task -> null', () => {
  const a = makeRecipe({ task: 'sales report for Jan' }); a.createdAt = 1;
  const b = makeRecipe({ task: 'sales report for Feb' }); b.createdAt = 2; // same key (month param)
  const list: Recipe[] = [a, b];
  assert.equal(matchRecipe(list, 'sales report for March'), b);
  assert.equal(matchRecipe(list, 'something else entirely'), null);
});

test('upsertRecipe: one per key (newest wins), capped at 50', () => {
  let list: Recipe[] = [];
  list = upsertRecipe(list, makeRecipe({ task: 'report for Jan' }));
  list = upsertRecipe(list, makeRecipe({ task: 'report for Feb' })); // same key -> replaces
  assert.equal(list.length, 1);
});

test('recipeInScope: rejects a foreign absolute path, allows in-folder / no-folder', () => {
  const foreign = makeRecipe({ task: 't', scripts: [{ name: 's.py', content: 'open("D:\\Other\\x.xlsx")' }] });
  assert.equal(recipeInScope(foreign, 'C:\\Proj\\Mine'), false);
  assert.equal(recipeInScope(foreign, ''), true); // no folder to scope against
  const local = makeRecipe({ task: 't', scripts: [{ name: 's.py', content: 'open("C:\\Proj\\Mine\\x.xlsx")' }] });
  assert.equal(recipeInScope(local, 'C:\\Proj\\Mine'), true);
});

test('recipePromptBlock: includes the proven script', () => {
  const r = makeRecipe({ task: 't', scripts: [{ name: 'build.py', content: 'do()' }], outputs: ['r.xlsx'] });
  const block = recipePromptBlock(r);
  assert.match(block, /PROVEN RECIPE/);
  assert.match(block, /build\.py/);
  assert.match(block, /r\.xlsx/);
});
