// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// WEB crash capture — single-source twin of electron/crashReport.cjs. Uses the SAME @madav/insight formatCrash,
// stores a capped list in localStorage. LOCAL ONLY (no network). Flag-guarded (MADAV_CRASH_REPORTS); zero UI change.
import { formatCrash } from "@madav/insight";

const KEY = "madav.crashReports"; const CAP = 50;
function crashOn() { try { return localStorage.getItem("MADAV_CRASH_REPORTS") === "1"; } catch { return false; } }

function record(kind, err, meta) {
  try {
    const r = formatCrash(kind, err, meta || {});
    let list = []; try { const j = JSON.parse(localStorage.getItem(KEY) || "[]"); if (Array.isArray(j)) list = j; } catch {}
    list.push(r); if (list.length > CAP) list = list.slice(-CAP);
    localStorage.setItem(KEY, JSON.stringify(list));
    return r;
  } catch { return null; }
}
export function listCrashReports() { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } }
export function clearCrashReports() { try { localStorage.removeItem(KEY); } catch {} }

/** Install window error handlers once. No-op unless MADAV_CRASH_REPORTS==="1". Safe to call unconditionally. */
export function installCrashReporter() {
  try {
    if (!crashOn() || typeof window === "undefined" || window.__madavCrashInstalled) return;
    window.__madavCrashInstalled = true;
    window.addEventListener("error", (e) => record("window.error", (e && e.error) || (e && e.message), { src: e && e.filename, line: e && e.lineno }));
    window.addEventListener("unhandledrejection", (e) => record("unhandledrejection", e && e.reason));
  } catch {}
}
