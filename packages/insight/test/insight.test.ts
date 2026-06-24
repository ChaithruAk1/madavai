import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger, guarded, type LogEvent } from '../src/index.js';

test('emits structured, leveled events with base + call fields', () => {
  const out: LogEvent[] = [];
  const log = createLogger({ sink: (e) => out.push(e), base: { svc: 'documents' } });
  log.warn('rows_clamped', { sheet: 'Big', kept: 10000, of: 12500 });
  assert.equal(out[0].level, 'warn');
  assert.equal(out[0].event, 'rows_clamped');
  assert.equal(out[0].svc, 'documents');
  assert.equal(out[0].kept, 10000);
  assert.ok(out[0].ts);
});

test('guarded logs and returns the fallback instead of swallowing', () => {
  const out: LogEvent[] = [];
  const log = createLogger({ sink: (e) => out.push(e) });
  const v = guarded(log, 'parse_failed', () => { throw new Error('boom'); }, 42);
  assert.equal(v, 42);
  assert.equal(out[0].level, 'error');
  assert.equal(out[0].error, 'boom');
});
