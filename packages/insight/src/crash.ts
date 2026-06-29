/** A structured, bounded crash record. Captured LOCALLY only — never sent anywhere by this module. */
export interface CrashReport {
  id: string;
  ts: string;
  kind: 'uncaughtException' | 'unhandledRejection' | 'window.error' | 'unhandledrejection' | 'react';
  name?: string;
  message: string;
  stack?: string;
  meta?: Record<string, unknown>;
}

/** Turn ANY thrown value (Error, string, object) into a deterministic, length-capped CrashReport. */
export function formatCrash(kind: CrashReport['kind'], err: unknown, meta: Record<string, unknown> = {}): CrashReport {
  const e = err && typeof err === 'object' ? (err as { name?: string; message?: string; stack?: string }) : undefined;
  const message = e && e.message ? String(e.message) : String(err);
  const stack = e && e.stack ? String(e.stack) : undefined;
  return {
    id: 'crash_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    ts: new Date().toISOString(),
    kind,
    ...(e && e.name ? { name: String(e.name) } : {}),
    message: message.slice(0, 1000),
    ...(stack ? { stack: stack.slice(0, 8000) } : {}),
    ...(Object.keys(meta).length ? { meta } : {}),
  };
}

/** A capped ring of the most-recent crash reports (oldest dropped). Persistence layers (file / localStorage) wrap this. */
export class CrashBuffer {
  private items: CrashReport[] = [];
  constructor(private cap = 50) { this.cap = Math.max(1, cap); }
  add(r: CrashReport): void { this.items.push(r); if (this.items.length > this.cap) this.items.splice(0, this.items.length - this.cap); }
  all(): CrashReport[] { return this.items.slice(); }
  clear(): void { this.items = []; }
  get size(): number { return this.items.length; }
}
