// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// Embedded terminal — a real shell rendered inside the app with xterm.js. Streams to/from the main
// process (electron/terminal.cjs). Type `brainedge` here to run the agent without leaving the app.
import { useEffect, useRef, useState } from "react";
import { Terminal as TerminalIcon, Plus, Check, Download, Monitor } from "lucide-react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import "xterm/css/xterm.css";
import { bridge, isWeb } from "../bridge/index.js";

export default function TerminalPanel({ cwd }) {
  const hostRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const idRef = useRef(null);
  const [mode, setMode] = useState(null);

  useEffect(() => {
    if (isWeb || !bridge.termCreate) return;
    const term = new Terminal({
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      fontSize: 13, cursorBlink: true, scrollback: 8000, convertEol: false,
      theme: { background: "#0b0d12", foreground: "#e4e8f0", cursor: "#14c4d8", selectionBackground: "#2a3550",
        black: "#0b0d12", brightBlack: "#5a6680", red: "#e06c5b", green: "#3ecf8e", yellow: "#e0b341",
        blue: "#6ea8fe", magenta: "#9280f8", cyan: "#14c4d8", white: "#e4e8f0" },
    });
    const fit = new FitAddon(); term.loadAddon(fit);
    term.open(hostRef.current); try { fit.fit(); } catch {}
    termRef.current = term; fitRef.current = fit;

    let unsub = () => {}, unsubExit = () => {};
    (async () => {
      const r = await bridge.termCreate({ cwd: cwd || null });
      if (!r || r.error) { term.writeln("\x1b[31mCouldn't start a shell: " + ((r && r.error) || "unknown") + "\x1b[0m"); return; }
      idRef.current = r.id; setMode(r.pty ? "pty" : "compat");
      unsub = bridge.onTermData(({ id, data }) => { if (id === idRef.current) term.write(data); });
      unsubExit = bridge.onTermExit(({ id }) => { if (id === idRef.current) term.writeln("\r\n\x1b[2m[process exited — reopen Terminal to start a new shell]\x1b[0m"); });
      const isPty = !!r.pty; let buf = "";
      if (isPty) {
        term.onData((d) => bridge.termInput(idRef.current, d)); // real PTY: the shell edits the line
      } else {
        // Compatibility line editor — a pipe shell has no line discipline, so we handle editing here.
        term.writeln("\x1b[2mcompatibility shell · basic line editing · run `npm run rebuild` for full PTY (history, arrows, tab)\x1b[0m");
        term.onData((d) => {
          if (d === "\r" || d === "\n") { bridge.termInput(idRef.current, buf + "\n"); term.write("\r\n"); buf = ""; return; }
          if (d === "\x7f" || d === "\b") { if (buf.length) { buf = buf.slice(0, -1); term.write("\b \b"); } return; }     // backspace
          if (d === "\x03") { bridge.termInput(idRef.current, "\x03"); buf = ""; term.write("^C\r\n"); return; }            // Ctrl+C
          if (d === "\x15") { while (buf.length) { buf = buf.slice(0, -1); term.write("\b \b"); } return; }                 // Ctrl+U clear line
          if (d === "\t" || d.charCodeAt(0) === 0x1b) return; // ignore tab + arrow/escape sequences (keeps cursor sane)
          const printable = d.replace(/[\x00-\x1f]/g, "");
          if (printable) { buf += printable; term.write(printable); }
        });
      }
      term.focus();
    })();

    const onResize = () => { try { fit.fit(); if (idRef.current) bridge.termResize(idRef.current, term.cols, term.rows); } catch {} };
    window.addEventListener("resize", onResize);
    let ro; try { ro = new ResizeObserver(onResize); ro.observe(hostRef.current); } catch {}
    return () => {
      window.removeEventListener("resize", onResize);
      try { ro && ro.disconnect(); } catch {}
      unsub(); unsubExit();
      if (idRef.current) bridge.termKill(idRef.current);
      try { term.dispose(); } catch {}
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (text) => { if (idRef.current) { bridge.termInput(idRef.current, text + "\r"); termRef.current && termRef.current.focus(); } };

  if (isWeb) {
    const perks = [
      "Run any command — git, npm, builds, tests, scripts",
      "Start and watch dev servers and long-running processes",
      "Run the BrainEdge agent (brainedge) right in your shell",
      "Full access to your machine and installed tools",
    ];
    return (
      <div style={{ height: "100%", display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 460, textAlign: "center", border: "1px solid var(--line)", borderRadius: 16, padding: "30px 28px", background: "var(--bg-2)" }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, display: "grid", placeItems: "center", margin: "0 auto 14px", background: "rgba(19,196,214,.12)", color: "#13c4d8" }}><TerminalIcon size={26} /></div>
          <h2 style={{ margin: "0 0 6px", fontSize: 19 }}>Terminal lives in the desktop app</h2>
          <p style={{ color: "var(--text-2)", fontSize: 13, margin: "0 0 18px", lineHeight: 1.5 }}>A real shell needs access to your computer, which a browser can't provide. Get the BrainEdge desktop app to unlock it.</p>
          <div style={{ textAlign: "left", margin: "0 auto 20px", display: "grid", gap: 9 }}>
            {perks.map((p) => (
              <div key={p} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 12.5, color: "var(--text)" }}>
                <Check size={15} color="#3ecf8e" style={{ flexShrink: 0, marginTop: 1 }} /> <span>{p}</span>
              </div>
            ))}
          </div>
          <button className="btn primary" onClick={() => bridge.openExternal?.(typeof location !== "undefined" ? location.origin + "/download" : "/download")} style={{ display: "inline-flex", gap: 7, alignItems: "center" }}>
            <Download size={15} /> Get the desktop app
          </button>
          <p style={{ color: "var(--text-3)", fontSize: 11.5, margin: "14px 0 0", display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}><Monitor size={12} /> Available for Windows · macOS · Linux</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: "#0b0d12" }}>
      <div style={{ padding: "9px 14px", borderBottom: "1px solid var(--line)", display: "flex", gap: 10, alignItems: "center", fontSize: 12.5 }}>
        <span style={{ color: "#14c4d8", display: "inline-flex", gap: 6, alignItems: "center" }}><TerminalIcon size={14} /> Terminal</span>
        {cwd && <span style={{ color: "var(--text-3)" }}>· {cwd}</span>}
        {mode && <span title={mode === "pty" ? "Full PTY — TUI apps and the live menu work here" : "Compatibility mode — run `npm run rebuild` for full PTY"} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 999, border: "1px solid var(--line)", color: mode === "pty" ? "#3ecf8e" : "var(--text-3)" }}>{mode === "pty" ? "PTY" : "compat"}</span>}
        <button className="chip" style={{ marginLeft: "auto" }} onClick={() => run("brainedge")} title="Start the BrainEdge agent in this shell"><Plus size={12} /> Run brainedge</button>
      </div>
      <div ref={hostRef} style={{ flex: 1, padding: "8px 10px", overflow: "hidden" }} />
    </div>
  );
}
