export type Level = 'debug' | 'info' | 'warn' | 'error';
export interface LogEvent { ts: string; level: Level; event: string; [k: string]: unknown }
export type Sink = (e: LogEvent) => void;

const jsonSink: Sink = (e) => {
  const c = console as unknown as Record<string, (s: string) => void>;
  (c[e.level] ?? c.log)(JSON.stringify(e));
};

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  child(base: Record<string, unknown>): Logger;
}

/** A structured, leveled logger. Every record is one JSON event with a timestamp — no free-text console noise. */
export function createLogger(opts: { sink?: Sink; base?: Record<string, unknown> } = {}): Logger {
  const sink = opts.sink ?? jsonSink;
  const base = opts.base ?? {};
  const at = (level: Level) => (event: string, fields: Record<string, unknown> = {}) =>
    sink({ ts: new Date().toISOString(), level, event, ...base, ...fields });
  return { debug: at('debug'), info: at('info'), warn: at('warn'), error: at('error'), child: (m) => createLogger({ sink, base: { ...base, ...m } }) };
}

/** Run a fallible op; on throw, LOG a structured error (never swallow silently) and return the fallback. */
export function guarded<T>(log: Logger, event: string, fn: () => T, fallback: T): T {
  try { return fn(); } catch (e) { log.error(event, { error: e instanceof Error ? e.message : String(e) }); return fallback; }
}

export { formatCrash, CrashBuffer, type CrashReport } from './crash.js';
