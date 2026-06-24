import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectorVault, MemoryVaultStore } from '../src/index.js';
import { deriveKey } from '@madav/storage';

const rand = (n: number) => (globalThis as any).crypto.getRandomValues(new Uint8Array(n));
async function make() {
  const store = new MemoryVaultStore();
  const key = await deriveKey('vault-master', rand(16));
  return { vault: new ConnectorVault(store, key), store };
}

test('a stored token is ciphertext at rest — the secret never appears in the stored row', async () => {
  const { vault, store } = await make();
  await vault.put('u1', 'slack', { accessToken: 'xoxb-SUPER-SECRET-123' });
  const raw = await store.get('tok:u1:slack');
  assert.equal(raw!.custody, 'e2ee-private');
  assert.ok(!JSON.stringify(raw).includes('SUPER-SECRET'), 'plaintext must not be in the at-rest envelope');
});

test('the token round-trips with the vault key', async () => {
  const { vault } = await make();
  await vault.put('u1', 'notion', { accessToken: 'ntn_ABC', refreshToken: 'r1', scope: 'read' });
  const t = await vault.get('u1', 'notion');
  assert.equal(t!.accessToken, 'ntn_ABC'); assert.equal(t!.refreshToken, 'r1');
});

test('a different key cannot open a stored token', async () => {
  const store = new MemoryVaultStore();
  const v1 = new ConnectorVault(store, await deriveKey('key-1', rand(16)));
  await v1.put('u1', 'gmail', { accessToken: 'tok' });
  const v2 = new ConnectorVault(store, await deriveKey('key-2', rand(16)));
  await assert.rejects(() => v2.get('u1', 'gmail'));
});

test('list returns connected providers (not tokens); remove disconnects', async () => {
  const { vault } = await make();
  await vault.put('u1', 'slack', { accessToken: 'a' });
  await vault.put('u1', 'notion', { accessToken: 'b' });
  assert.deepEqual(await vault.list('u1'), ['notion', 'slack']);
  await vault.remove('u1', 'slack');
  assert.deepEqual(await vault.list('u1'), ['notion']);
});
