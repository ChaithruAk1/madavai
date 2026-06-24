import { seal, openText, type Envelope } from '@madav/storage';

/** A connector OAuth token (a secret). Secrets are ALWAYS sealed — never server-readable at rest. */
export interface ConnectorToken { accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string }

/** Where sealed envelopes are persisted. In-memory now; per-tenant Postgres rows at deploy. */
export interface VaultStore {
  put(key: string, env: Envelope): Promise<void>;
  get(key: string): Promise<Envelope | null>;
  del(key: string): Promise<void>;
  keys(prefix: string): Promise<string[]>;
}

export class MemoryVaultStore implements VaultStore {
  private m = new Map<string, Envelope>();
  async put(k: string, e: Envelope) { this.m.set(k, e); }
  async get(k: string) { return this.m.get(k) ?? null; }
  async del(k: string) { this.m.delete(k); }
  async keys(prefix: string) { return [...this.m.keys()].filter((k) => k.startsWith(prefix)); }
}

/**
 * Per-user, per-provider token vault. Tokens are sealed with the vault key (from KMS in production) under
 * e2ee-private custody, so the stored row is ciphertext only; the plaintext exists in memory just long
 * enough to make a tool call. `list` returns provider names, never tokens.
 */
export class ConnectorVault {
  constructor(private store: VaultStore, private key: unknown) {}
  private id(userId: string, provider: string) { return `tok:${userId}:${provider}`; }

  async put(userId: string, provider: string, token: ConnectorToken): Promise<void> {
    const env = await seal(JSON.stringify(token), 'e2ee-private', this.key);
    await this.store.put(this.id(userId, provider), env);
  }
  async get(userId: string, provider: string): Promise<ConnectorToken | null> {
    const env = await this.store.get(this.id(userId, provider));
    if (!env) return null;
    return JSON.parse(await openText(env, this.key)) as ConnectorToken;
  }
  async remove(userId: string, provider: string): Promise<void> { await this.store.del(this.id(userId, provider)); }
  async list(userId: string): Promise<string[]> {
    const keys = await this.store.keys(`tok:${userId}:`);
    return keys.map((k) => k.split(':')[2]!).sort();
  }
}
