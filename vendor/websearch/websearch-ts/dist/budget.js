import { config } from "./config.js";
function monthKey() { return new Date().toISOString().slice(0, 7); }
// in-memory fallback (single process)
const mem = { month: "", spent: 0, paid: 0, free: 0 };
function rollMem() { const m = monthKey(); if (mem.month !== m) {
    mem.month = m;
    mem.spent = 0;
    mem.paid = 0;
    mem.free = 0;
} }
// shared store across replicas (only loaded if REDIS_URL is set)
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
let warnedMonth = "";
function maybeWarn(spent) {
    const m = monthKey();
    if (config.budgetMode === "soft" && spent > config.monthlyBudgetUsd && warnedMonth !== m) {
        warnedMonth = m;
        console.warn(`[websearch] soft budget exceeded: $${spent.toFixed(2)} > $${config.monthlyBudgetUsd}. Still serving (mode=soft). Raise MONTHLY_BUDGET_USD or call setBudget() when ready.`);
    }
}
export async function currentSpend() {
    const r = await getRedis();
    if (r)
        return Number((await r.get(`ws:spend:${monthKey()}`)) ?? 0);
    rollMem();
    return mem.spent;
}
// soft (default): always allowed — never stops your AI. hard: stops at the ceiling.
export async function canSpend(cost) {
    if (config.budgetMode === "soft")
        return true;
    return (await currentSpend()) + cost <= config.monthlyBudgetUsd;
}
export async function recordPaid(cost) {
    const r = await getRedis();
    if (r) {
        const k = `ws:spend:${monthKey()}`;
        const spent = Number(await r.incrbyfloat(k, cost));
        await r.expire(k, 60 * 60 * 24 * 40);
        await r.incr(`ws:paid:${monthKey()}`);
        maybeWarn(spent);
        return;
    }
    rollMem();
    mem.spent += cost;
    mem.paid++;
    maybeWarn(mem.spent);
}
export async function recordFree() {
    const r = await getRedis();
    if (r) {
        await r.incr(`ws:free:${monthKey()}`);
        return;
    }
    rollMem();
    mem.free++;
}
export async function usage() {
    const m = monthKey();
    const spent = await currentSpend();
    let paid = mem.paid, free = mem.free;
    const r = await getRedis();
    if (r) {
        paid = Number((await r.get(`ws:paid:${m}`)) ?? 0);
        free = Number((await r.get(`ws:free:${m}`)) ?? 0);
    }
    return {
        month: m,
        budgetUsd: config.monthlyBudgetUsd,
        spentUsd: +spent.toFixed(4),
        remainingUsd: +(config.monthlyBudgetUsd - spent).toFixed(4),
        paidCalls: paid,
        freeCalls: free,
        mode: config.budgetMode,
        overBudget: spent > config.monthlyBudgetUsd,
    };
}
// Flexibility: change the threshold/mode at runtime, no redeploy.
export function setBudget(usd) { config.monthlyBudgetUsd = usd; }
export function setBudgetMode(mode) { config.budgetMode = mode; }
