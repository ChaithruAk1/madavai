import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seal, open, openText, deriveKey, type Envelope } from '../src/index.js';

const rand = (n: number) => (globalThis as any).crypto.getRandomValues(new Uint8Array(n));

test('server-readable: stored readable, opens with no key', async () => {
  const env = await seal('quarterly numbers', 'server-readable');
  assert.equal(env.custody, 'server-readable');
  assert.equal(env.iv, undefined);
  assert.equal(await openText(env), 'quarterly numbers');
});

test('e2ee-private: actually encrypted, round-trips with the right key', async () => {
  const key = await deriveKey('correct horse battery staple', rand(16));
  const env: Envelope = await seal('private memo', 'e2ee-private', key);
  assert.ok(env.iv && env.data.length > 0);
  assert.notEqual(Buffer.from(env.data, 'base64').toString(), 'private memo'); // not plaintext
  assert.equal(await openText(env, key), 'private memo');
});

test('e2ee-private: a wrong key cannot open it', async () => {
  const k1 = await deriveKey('pass-one', rand(16));
  const k2 = await deriveKey('pass-two', rand(16));
  const env = await seal('top secret', 'e2ee-private', k1);
  await assert.rejects(() => open(env, k2));
});

test('encrypted custody without a key is refused (no silent plaintext)', async () => {
  await assert.rejects(() => seal('x', 'e2ee-private'));
});
