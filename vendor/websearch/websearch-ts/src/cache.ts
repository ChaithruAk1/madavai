import { createHash } from "node:crypto";
import { config } from "./config.js";

const mem = new Map<string, { v: unknown; exp: number }>();
function key(obj: unknown): string { return "ws:cache:" + createHash("sha256").update(JSON.stringify(obj)).digest("hex"); }

let redis: any = null;
let redisTried = false;
async function getRedis(): Promise<any> {
  if (!config.redisUrl) return null;
  if (redisTried) return redis;
  redisTried = true;
  try { const name: string = "ioredis"; const mod: any = await import(name); const IORedis = mod.default ?? mod; redis = new IORedis(config.redisUrl); }
  catch { redis = null; }
  return redis;
}
export async function cacheGet<T>(obj: unknown): Promise<T | null> {
  const k = key(obj);
  const r = await getRedis();
  if (r) { const v = await r.get(k); return v ? JSON.parse(v) as T : null; }
  const it = mem.get(k);
  if (!it) return null;
  if (Date.now() > it.exp) { mem.delete(k); return null; }
  return it.v as T;
}
export async function cacheSet(obj: unknown, val: unknown): Promise<void> {
  const k = key(obj);
  const r = await getRedis();
  if (r) { await r.set(k, JSON.stringify(val), "EX", config.cacheTtlSec); return; }
  mem.set(k, { v: val, exp: Date.now() + config.cacheTtlSec * 1000 });
}
