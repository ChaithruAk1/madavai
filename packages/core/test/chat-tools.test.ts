import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHARED_CHAT_TOOLS, SHARED_CHAT_TOOL_NAMES, WEB_SEARCH_SCHEMA } from '../src/index.js';

test('shared chat tools expose the expected names', () => {
  assert.deepEqual(SHARED_CHAT_TOOL_NAMES, ['web_search', 'web_fetch', 'create_image', 'deep_research']);
});
test('each schema is a function tool with required params', () => {
  for (const t of SHARED_CHAT_TOOLS) {
    assert.equal(t.type, 'function');
    assert.ok(t.function && t.function.name);
    assert.ok(t.function!.parameters && Array.isArray(t.function!.parameters.required));
  }
});
test('web_search requires a query', () => {
  assert.deepEqual(WEB_SEARCH_SCHEMA.function!.parameters!.required, ['query']);
});
