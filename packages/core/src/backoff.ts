// @madav/core — transient-failure retry + a concurrency gate. Pure logic; the caller injects fetch.
type FetchLike = (url: string, opts: { signal?: { aborted?: boolean }; [k: string]: unknown }) => Promise<{ status?: number; headers?: { get?: (k: string) => string | null }; body?: { cancel?: () => Promise<void> } } & Record<string, unknown>>;

export async function fetchWithBackoff(
  fetchImpl: FetchLike,
  url: string,
  opts: { signal?: { aborted?: boolean }; [k: string]: unknown } = {},
  { tries = 3, baseMs = 500, capMs = 8000 }: { tries?: number; baseMs?: number; capMs?: number } = {},
) {
  let res: Awaited<ReturnType<FetchLike>> | undefined;
  for (let i = 0; i < tries; i++) {
    res = await fetchImpl(url, opts);
    const st = res && res.status;
    if (st !== 429 && st !== 503) return res;
    if (i === tries - 1) return res;
    if (opts.signal && opts.signal.aborted) return res;
    let ra = 0;
    try { ra = Number(res.headers && res.headers.get && res.headers.get('retry-after')) || 0; } catch { /* ignore */ }
    const wait = (ra > 0 ? Math.min(ra * 1000, capMs) : Math.min(capMs, baseMs * Math.pow(2, i))) + Math.floor(Math.random() * 250);
    try { if (res.body && typeof res.body.cancel === 'function') await res.body.cancel(); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, wait));
  }
  return res;
}

export interface ConcurrencyGate {
  acquire(): Promise<boolean>;
  release(): void;
  stats(): { active: number; waiting: number; max: number };
}
interface Waiter { resolve: (v: boolean) => void; done: boolean; timer?: ReturnType<typeof setTimeout>; }

export function makeConcurrencyGate(max = 4, timeoutMs = 20000): ConcurrencyGate {
  let active = 0;
  const waiters: Waiter[] = [];
  function acquire(): Promise<boolean> {
    if (active < max) { active++; return Promise.resolve(true); }
    return new Promise<boolean>((resolve) => {
      const w: Waiter = { resolve, done: false };
      w.timer = setTimeout(() => {
        if (w.done) return;
        w.done = true;
        const i = waiters.indexOf(w);
        if (i >= 0) waiters.splice(i, 1);
        resolve(false);
      }, timeoutMs);
      waiters.push(w);
    });
  }
  function release(): void {
    const w = waiters.shift();
    if (w) { if (w.done) return release(); w.done = true; if (w.timer) clearTimeout(w.timer); w.resolve(true); }
    else if (active > 0) active--;
  }
  return { acquire, release, stats: () => ({ active, waiting: waiters.length, max }) };
}
