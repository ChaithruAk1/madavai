import { createHash } from "node:crypto";
import { config } from "./config.js";
const mem = new Map();
function key(obj) { return "ws:cache:" + createHash("sha256").update(JSON.stringify(obj)).digest("hex"); }
let redis = null;
let redisTried = false;
async function getRedis() {
    if (!config.redisUrl)
        return null;
    if (redisTried)
        return redis;
    redisTried = true;
    try {
        const name = "ioredis";
        const mod = await import(name);
        const IORedis = mod.default ?? mod;
        redis = new IORedis(config.redisUrl);
    }
    catch {
        redis = null;
    }
    return redis;
}
export async function cacheGet(obj) {
    const k = key(obj);
    const r = await getRedis();
    if (r) {
        const v = await r.get(k);
        return v ? JSON.parse(v) : null;
    }
    const it = mem.get(k);
    if (!it)
        return null;
    if (Date.now() > it.exp) {
        mem.delete(k);
        return null;
    }
    return it.v;
}
export async function cacheSet(obj, val) {
    const k = key(obj);
    const r = await getRedis();
    if (r) {
        await r.set(k, JSON.stringify(val), "EX", config.cacheTtlSec);
        return;
    }
    mem.set(k, { v: val, exp: Date.now() + config.cacheTtlSec * 1000 });
}
