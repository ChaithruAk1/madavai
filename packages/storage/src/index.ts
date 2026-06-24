// @madav/storage — the ONE storage envelope. Custody is a POLICY on a single path; the codebase never
// forks per privacy mode. Content is server-readable by default; e2ee-private / device-only encrypt
// client-side with the caller's key. (Secrets/keys are a separate always-sealed concern.)

export type Custody = 'server-readable' | 'e2ee-private' | 'device-only';

export interface Envelope {
  v: 1;
  custody: Custody;
  iv?: string;   // base64; present only when encrypted
  data: string;  // base64 — plaintext bytes for server-readable; AES-256-GCM ciphertext otherwise
}

const enc = new TextEncoder();
const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toBytes = (c: string | Uint8Array) => (typeof c === 'string' ? enc.encode(c) : c);
const needsKey = (c: Custody) => c !== 'server-readable';
function wc(): any { const c = (globalThis as any).crypto; if (!c || !c.subtle) throw new Error('Web Crypto unavailable in this runtime'); return c; }

/** Derive an AES-256-GCM key from a passphrase (PBKDF2-SHA256). For e2ee-private / device-only. */
export async function deriveKey(passphrase: string, salt: Uint8Array, iterations = 210000): Promise<unknown> {
  const c = wc();
  const base = await c.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return c.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** Seal content under a custody policy — ONE function, the policy selects the behaviour. */
export async function seal(content: string | Uint8Array, custody: Custody, key?: unknown): Promise<Envelope> {
  const data = toBytes(content);
  if (!needsKey(custody)) return { v: 1, custody, data: b64(data) };
  if (!key) throw new Error(`custody "${custody}" requires a key`);
  const c = wc();
  const iv = c.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await c.subtle.encrypt({ name: 'AES-GCM', iv }, key, data));
  return { v: 1, custody, iv: b64(iv), data: b64(ct) };
}

/** Open an envelope. server-readable needs no key; encrypted custody requires the matching key. */
export async function open(env: Envelope, key?: unknown): Promise<Uint8Array> {
  if (env.v !== 1) throw new Error('unknown envelope version');
  if (!needsKey(env.custody)) return unb64(env.data);
  if (!key) throw new Error(`custody "${env.custody}" requires a key to open`);
  if (!env.iv) throw new Error('missing iv');
  const c = wc();
  return new Uint8Array(await c.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data)));
}

export const openText = async (env: Envelope, key?: unknown) => new TextDecoder().decode(await open(env, key));
