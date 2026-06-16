// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// SINGLE SOURCE for the Content-Security-Policy on BOTH surfaces. The bespoke engine REQUIRES
// script-src 'unsafe-eval' + worker-src 'self' blob: — encoded here so web and desktop can NEVER drift
// on it. Desktop (electron/main.cjs) require()s this; web (server/auth-server.mjs) imports it. (CLAUDE.md)
const EVAL = "'unsafe-eval'";                 // bespoke engine runs model code in a sandboxed worker
const WORKER = "worker-src 'self' blob:";     // the bespoke workers
function buildCSP(opts) {
  opts = opts || {};
  if (opts.web) {
    return [
      "default-src 'self'",
      "script-src 'self' " + EVAL + " https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "media-src blob: data:",
      "connect-src 'self' https:",
      "frame-src 'self' blob: data: about:",
      WORKER,
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join("; ");
  }
  const isDev = !!opts.isDev;
  const script = isDev ? "'self' 'unsafe-inline' " + EVAL : "'self' " + EVAL;
  const connect = isDev ? "'self' https: ws://localhost:5174 http://localhost:5174" : "'self' https:";
  return [
    "default-src 'self'",
    "script-src " + script,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src " + connect,
    WORKER,
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}
module.exports = { buildCSP };
