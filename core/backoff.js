// core/backoff.js — SINGLE SOURCE for transient-failure retry + a concurrency gate. Pure logic; the
// caller injects fetch. Used by the SERVER (shared free-tier "house" key) and DESKTOP (the user's own
// key) so rate-limit handling is identical everywhere instead of reinvented per surface.

// Retry a request on a transient rate-limit / overload (HTTP 429 or 503) with exponential backoff +
// jitter, honoring a Retry-After header when present. Returns the FINAL Response — a persistent limit
// still comes back (status 429) so the caller surfaces its normal friendly message.
export async function fetchWithBackoff(fetchImpl, url, opts = {}, { tries = 3, baseMs = 500, capMs = 8000 } = {}) {
  let res;
  for (let i = 0; i < tries; i++) {
    res = await fetchImpl(url, opts);
    const st = res && res.status;
    if (st !== 429 && st !== 503) return res;
    if (i === tries - 1) return res;
    if (opts.signal && opts.signal.aborted) return res;
    let ra = 0;
    try { ra = Number(res.headers && res.headers.get && res.headers.get("retry-after")) || 0; } catch {}
    const wait = (ra > 0 ? Math.min(ra * 1000, capMs) : Math.min(capMs, baseMs * Math.pow(2, i))) + Math.floor(Math.random() * 250);
    try { if (res.body && typeof res.body.cancel === "function") await res.body.cancel(); } catch {}
    await new Promise((r) => setTimeout(r, wait));
  }
  return res;
}

// In-process concurrency gate: at most `max` holders at once; extra callers WAIT (FIFO) up to
// `timeoutMs`, after which acquire() resolves false so the caller can shed load (e.g. return 503).
// Keeps many simultaneous callers from collectively blowing a SHARED upstream rate limit. Single
// instance only — a multi-instance deployment would back this with Redis.
export function makeConcurrencyGate(max = 4, timeoutMs = 20000) {
  let active = 0; const waiters = [];
  function acquire() {
    if (active < max) { active++; return Promise.resolve(true); }
    return new Promise((resolve) => {
      const w = { resolve, done: false };
      w.timer = setTimeout(() => { if (w.done) return; w.done = true; const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); resolve(false); }, timeoutMs);
      waiters.push(w);
    });
  }
  function release() {
    const w = waiters.shift();
    if (w) { if (w.done) return release(); w.done = true; clearTimeout(w.timer); w.resolve(true); } // hand the slot off — active unchanged
    else if (active > 0) active--;
  }
  return { acquire, release, stats: () => ({ active, waiting: waiters.length, max }) };
}
