import { describe, it, expect } from "vitest";
import { fetchWithBackoff, makeConcurrencyGate } from "../../core/backoff.js";

const resp = (status) => ({ status, headers: { get: () => null }, body: null });

describe("fetchWithBackoff — retry transient 429/503", () => {
  it("retries on 429 then returns the success", async () => {
    let n = 0;
    const res = await fetchWithBackoff(async () => (++n < 3 ? resp(429) : resp(200)), "u", {}, { tries: 5, baseMs: 1, capMs: 5 });
    expect(res.status).toBe(200); expect(n).toBe(3);
  });
  it("returns the last 429 after exhausting tries (caller still gets the friendly error)", async () => {
    let n = 0;
    const res = await fetchWithBackoff(async () => { n++; return resp(429); }, "u", {}, { tries: 3, baseMs: 1 });
    expect(res.status).toBe(429); expect(n).toBe(3);
  });
  it("does not retry a 200", async () => {
    let n = 0;
    await fetchWithBackoff(async () => { n++; return resp(200); }, "u", {}, { tries: 3, baseMs: 1 });
    expect(n).toBe(1);
  });
  it("stops retrying when the signal is aborted", async () => {
    let n = 0; const signal = { aborted: true };
    const res = await fetchWithBackoff(async () => { n++; return resp(429); }, "u", { signal }, { tries: 5, baseMs: 1 });
    expect(n).toBe(1); expect(res.status).toBe(429);
  });
});

describe("makeConcurrencyGate — cap + queue + load-shed", () => {
  it("caps concurrency, queues, and hands the slot to the next waiter on release", async () => {
    const g = makeConcurrencyGate(2, 1000);
    expect(await g.acquire()).toBe(true);
    expect(await g.acquire()).toBe(true);
    let third; const p = g.acquire().then((ok) => (third = ok));
    await new Promise((r) => setTimeout(r, 5));
    expect(third).toBe(undefined);          // still waiting
    expect(g.stats().waiting).toBe(1);
    g.release();                             // hand the slot off
    await p;
    expect(third).toBe(true);
    expect(g.stats().active).toBe(2);
  });
  it("sheds load: a waiter that times out resolves false", async () => {
    const g = makeConcurrencyGate(1, 10);
    await g.acquire();
    expect(await g.acquire()).toBe(false);   // waited 10ms, no slot -> false
  });
});
