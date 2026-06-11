// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Embedded terminal backend. Prefers a REAL PTY (node-pty) so full-screen TUI apps work perfectly
// inside the app — vim, and Madav's own live slash-menu / truecolor UI. If node-pty isn't built
// for this Electron yet, it transparently falls back to a pipe shell (commands/builds still work).
// Run `npm run rebuild` once to enable PTY mode.
const { spawn } = require("node:child_process");

// Prefer a prebuilt PTY (no compiler needed), then fall back to a locally-built node-pty.
let pty = null;
for (const m of ["@homebridge/node-pty-prebuilt-multiarch", "node-pty"]) { try { pty = require(m); break; } catch {} }

const sessions = new Map(); // id -> { kind, proc|term, wc }
let counter = 0;

function shellCmd() {
  if (process.platform === "win32") return { cmd: "powershell.exe", args: ["-NoLogo", "-NoProfile"] };
  return { cmd: process.env.SHELL || "bash", args: ["-i"] };
}

function create(wc, opts = {}) {
  const id = "t" + (++counter);
  const { cmd, args } = shellCmd();
  const cwd = opts.cwd || process.env.USERPROFILE || process.env.HOME || process.cwd();
  const env = { ...process.env, FORCE_COLOR: "1", TERM: "xterm-256color" };
  const send = (data) => { try { if (!wc.isDestroyed()) wc.send("madav:term:data", { id, data: typeof data === "string" ? data : data.toString("utf8") }); } catch {} };
  const exit = (code) => { try { if (!wc.isDestroyed()) wc.send("madav:term:exit", { id, code }); } catch {} sessions.delete(id); };

  // ---- preferred: real PTY ----
  if (pty) {
    try {
      const term = pty.spawn(cmd, args, { name: "xterm-256color", cols: opts.cols || 100, rows: opts.rows || 30, cwd, env });
      term.onData(send);
      term.onExit(({ exitCode }) => exit(exitCode));
      sessions.set(id, { kind: "pty", term, wc });
      return { id, shell: cmd, pty: true };
    } catch { /* fall through to pipe */ }
  }

  // ---- fallback: pipe shell ----
  let proc;
  try { proc = spawn(cmd, args, { cwd, env, windowsHide: true }); }
  catch (e) { return { error: String((e && e.message) || e) }; }
  proc.stdout.on("data", send);
  proc.stderr.on("data", send);
  proc.on("exit", exit);
  proc.on("error", (e) => send("\r\n[shell error: " + ((e && e.message) || e) + "]\r\n"));
  sessions.set(id, { kind: "pipe", proc, wc });
  return { id, shell: cmd, pty: false };
}

function input(id, data) {
  const s = sessions.get(id); if (!s) return true;
  try { if (s.kind === "pty") s.term.write(data); else if (s.proc.stdin && s.proc.stdin.writable) s.proc.stdin.write(data); } catch {}
  return true;
}
function resize(id, cols, rows) {
  const s = sessions.get(id);
  if (s && s.kind === "pty" && cols > 0 && rows > 0) { try { s.term.resize(cols, rows); } catch {} }
  return true;
}
function kill(id) {
  const s = sessions.get(id); if (!s) return true;
  try { if (s.kind === "pty") s.term.kill(); else s.proc.kill(); } catch {}
  sessions.delete(id); return true;
}
function killAll() { for (const [id] of sessions) kill(id); }

module.exports = { create, input, resize, kill, killAll, hasPty: () => !!pty };
