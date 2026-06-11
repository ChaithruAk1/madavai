// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// win-speech.cjs — Windows-NATIVE speech-to-text, zero keys, zero network.
// Uses the OS speech recognizer (System.Speech — ships with Windows) through a
// short-lived PowerShell process: listen once on the default microphone, return
// the dictated text. Hardened: recognizer-culture fallback (en-US → any installed),
// UTF-8 output, named failure markers mapped to friendly messages, no babble
// timeout (background noise must not abort listening), hard kill timeout.
// SECURITY: the PowerShell command is a fixed template; the only interpolated
// value is a clamped integer. Nothing user-controlled enters the command.
const { spawn } = require("child_process");

let _busy = false;

function available() {
  return process.platform === "win32";
}

// Listen once on the default mic; resolve { text } or { error }.
function recognizeOnce(timeoutSec = 10) {
  if (!available()) return Promise.resolve({ error: "Windows speech is only available on Windows." });
  if (_busy) return Promise.resolve({ error: "Already listening — speak now." });
  const t = Math.max(4, Math.min(30, Math.round(Number(timeoutSec) || 10))); // clamped integer — see security note
  _busy = true;
  const ps = [
    "$ErrorActionPreference='Stop'",
    "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8",
    "Add-Type -AssemblyName System.Speech",
    // Prefer the en-US recognizer (best dictation); fall back to whatever is installed.
    "$rec=$null",
    "try { $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine([System.Globalization.CultureInfo]::GetCultureInfo('en-US')) } catch {}",
    "if (-not $rec) { $all = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers(); if ($all.Count -eq 0) { [Console]::Error.Write('E_NORECOG'); exit 2 }; $rec = New-Object System.Speech.Recognition.SpeechRecognitionEngine($all[0]) }",
    "try { $rec.SetInputToDefaultAudioDevice() } catch { [Console]::Error.Write('E_NOMIC'); exit 3 }",
    "$rec.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))",
    "$rec.EndSilenceTimeout=[TimeSpan]::FromSeconds(1.4)",
    `$res = $rec.Recognize([TimeSpan]::FromSeconds(${t}))`,
    "if ($res -and $res.Text) { [Console]::Out.Write($res.Text) } else { [Console]::Error.Write('E_SILENT') }",
    "$rec.Dispose()",
  ].join("; ");
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    const finish = (r) => { if (!done) { done = true; _busy = false; resolve(r); } };
    let child;
    try {
      child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", ps], { windowsHide: true });
    } catch (e) {
      return finish({ error: "Couldn't start the Windows speech engine: " + String((e && e.message) || e) });
    }
    child.stdout.on("data", (d) => { out += String(d); });
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", (e) => finish({ error: "Windows speech failed: " + String((e && e.message) || e) }));
    child.on("close", () => {
      const text = out.trim();
      if (text) return finish({ text });
      if (err.includes("E_NORECOG")) return finish({ error: "Windows has no speech recognizer installed for your language. Add one in Windows Settings → Time & Language → Speech." });
      if (err.includes("E_NOMIC")) return finish({ error: "No microphone found — check it's plugged in and allowed in Windows Settings → Privacy → Microphone." });
      if (err.includes("E_SILENT")) return finish({ error: "I didn't catch anything — tap the mic and speak right away, a little louder." });
      const detail = err.trim().split("\n")[0].slice(0, 160);
      finish({ error: detail ? "Windows speech error: " + detail : "I didn't catch anything — try again." });
    });
    // Hard stop: never leave a stray recognizer running.
    setTimeout(() => { try { child.kill(); } catch {} finish({ error: "Listening timed out — tap the mic and speak right away." }); }, (t + 8) * 1000);
  });
}

module.exports = { available, recognizeOnce };
