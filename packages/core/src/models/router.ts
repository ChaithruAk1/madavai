// @madav/core/models — single-source model routing for every runtime.
// The user's live picker model is always tried first; on a retryable failure Madav walks the ordered
// fallback chain for the turn's category, with a short per-process cooldown so a just-failed model isn't
// re-hit. Pure logic + a cooldown map; platform supplies the real stream call as `attempt`.

export type RouteCategory = 'general' | 'agentic' | 'coding' | 'vision';
export const ROUTE_CATEGORIES: RouteCategory[] = ['general', 'agentic', 'coding', 'vision'];

export interface Profile {
  id?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  kind?: string;
  name?: string;
  [k: string]: unknown;
}
export interface Candidate {
  key: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  kind: string;
  name: string;
  ref: string;
  [k: string]: unknown;
}
export interface ErrorLike {
  status?: number;
  statusCode?: number;
  code?: string;
  message?: string;
  name?: string;
  streamed?: boolean;
  retryAfter?: unknown;
  headers?: { get?: (k: string) => string | null } & Record<string, unknown>;
}

/** Category derived from surface + image + data need (deterministic; no topic guessing). */
export function categoryFor({ mode, hasImage, needsData }: { mode?: string; hasImage?: boolean; needsData?: boolean } = {}): RouteCategory {
  if (hasImage) return 'vision';
  const m = String(mode || '').toLowerCase();
  if (m === 'code' || m === 'build') return 'coding';
  if (needsData) return 'agentic';
  if (['cowork', 'agent', 'agents', 'project', 'team', 'teams'].includes(m)) return 'agentic';
  return 'general';
}

// ---- cooldowns (per-process; transient rate-limit memory; resets on restart) ----
const _cool = new Map<string, number>();
export function noteFailure(key: string, retryMs?: number | null): void {
  if (!key) return;
  const ms = Math.min(Math.max(retryMs || 60000, 20000), 5 * 60000); // clamp 20s .. 5m
  _cool.set(key, Date.now() + ms);
}
export function onCooldown(key: string): boolean {
  const t = _cool.get(key);
  if (!t) return false;
  if (t <= Date.now()) { _cool.delete(key); return false; }
  return true;
}
export function clearCooldowns(): void { _cool.clear(); }

const keyOf = (baseUrl: string | undefined, model: string | undefined): string =>
  `${String(baseUrl || '').replace(/\/$/, '')}|${model}`;

function resolveRef(ref: string, profiles: Record<string, Profile>): Candidate | null {
  if (!ref || typeof ref !== 'string' || !ref.includes('::')) return null;
  const i = ref.indexOf('::');
  const pid = ref.slice(0, i);
  const model = ref.slice(i + 2);
  const p = (profiles || {})[pid];
  if (!p || !String(p.apiKey || '').trim() || !model) return null;
  return { ...p, model, key: keyOf(p.baseUrl, model), kind: p.kind || 'openai', name: p.name || pid, ref };
}

/** Ordered candidate list for this turn: selected model first, then the category's fallback chain. */
export function resolveCandidates(
  { category, selected, profiles = {}, routing = {} }:
  { category: string; selected?: Profile | null; profiles?: Record<string, Profile>; routing?: Record<string, string[]> } = { category: 'general' },
): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (c: Candidate | null): void => {
    if (c && c.model && c.baseUrl && !seen.has(c.key) && !onCooldown(c.key)) {
      seen.add(c.key);
      out.push(c);
    }
  };
  if (selected && selected.model && selected.baseUrl) {
    push({ ...selected, key: keyOf(selected.baseUrl, selected.model), model: selected.model, kind: selected.kind || 'openai', name: selected.name || 'selected', ref: (selected.id ? selected.id + '::' : '') + selected.model });
  }
  for (const ref of (routing && routing[category]) || []) push(resolveRef(ref, profiles));
  return out;
}

/** Reroute fires ONLY on transient/availability errors — never auth (401/403), bad request (400/404/422), or billing (402). */
export function isRetryable(e: ErrorLike | null | undefined): boolean {
  const st = e && (e.status || e.statusCode);
  return st === 429 || st === 408 || st === 409 || st === 425 || st === 500 || st === 502 || st === 503 || st === 504;
}

export function retryAfterMs(e: ErrorLike | null | undefined): number | null {
  try {
    const h = e && e.headers;
    const hdr =
      (e && e.retryAfter) ||
      (h && (typeof h.get === 'function' ? h.get('retry-after') : (h as Record<string, unknown>)['retry-after']));
    if (hdr == null || hdr === '') return null;
    const secs = Number(hdr);
    if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
    const when = Date.parse(String(hdr));
    if (Number.isFinite(when)) return Math.max(0, when - Date.now());
  } catch {
    /* ignore */
  }
  return null;
}

function failureReason(e: ErrorLike | undefined): string {
  const st = e && (e.status || e.statusCode);
  if (st === 429) return 'is rate-limited (too busy)';
  if (st === 402) return 'is out of credit';
  if (st === 401 || st === 403) return 'rejected the API key';
  if (st === 404) return 'is unavailable';
  if (st && st >= 500 && st < 600) return 'hit a server error';
  const m = (e && e.message ? String(e.message) : '').trim();
  if (!m) return 'failed';
  const short = m.length > 140 ? m.slice(0, 140).replace(/\s+\S*$/, '') + '…' : m;
  return 'failed — ' + short;
}

function chainExhaustedError(failed: { c: Candidate; e: ErrorLike }[]): Error {
  if (!failed || !failed.length) return new Error('model-router: no usable model candidates');
  const first = failed[0]!;
  const who = (first.c && first.c.name ? first.c.name + ' ' : '') + ((first.c && first.c.model) || 'your model');
  const others = failed.length - 1;
  const extra = others > 0 ? ' and ' + others + ' backup model' + (others > 1 ? 's' : '') + ' also failed' : '';
  const err = new Error(who + ' ' + failureReason(first.e) + extra + '. Try again in a moment, or pick a different model.') as Error & ErrorLike & { cause?: unknown };
  if (first.e) { err.status = first.e.status || first.e.statusCode; err.code = first.e.code; err.cause = first.e; }
  return err;
}

/** The fallback loop: try candidates in order; on failure cool the model and advance; abort/streamed surface immediately. */
export async function runChain<T>(
  { candidates, attempt, onReroute }:
  { candidates: Candidate[]; attempt: (c: Candidate, i: number) => Promise<T>; onReroute?: (info: { from: Candidate; to: Candidate; error: ErrorLike }) => void },
): Promise<T> {
  const list = (candidates || []).filter((c) => c && c.model && c.baseUrl);
  if (!list.length) throw new Error('model-router: no usable model candidates');
  const failed: { c: Candidate; e: ErrorLike }[] = [];
  for (let i = 0; i < list.length; i++) {
    const c = list[i]!;
    try {
      return await attempt(c, i);
    } catch (e) {
      const err = e as ErrorLike;
      if (err && (err.name === 'AbortError' || err.streamed)) throw e;
      noteFailure(c.key, retryAfterMs(err));
      failed.push({ c, e: err });
      const next = list[i + 1];
      if (next && typeof onReroute === 'function') {
        try { onReroute({ from: c, to: next, error: err }); } catch { /* ignore */ }
      }
    }
  }
  throw chainExhaustedError(failed);
}
