// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Desktop Flow Recorder — teach-by-demonstration for NATIVE WINDOWS APPS.
//
// How it works (no native node modules, no global hooks): a persistent PowerShell
// process subscribes to Windows UI AUTOMATION events — the same accessibility layer
// the desktop-driver uses to ACT. While recording, every control the user INVOKES
// (buttons, menu items) and every text field they LEAVE (final value, credential
// fields redacted by name) streams back as JSON lines. Stop → the active model
// distills the steps into a SKILL draft phrased in desktop_* tool calls, landing in
// the same Skill Forge approval queue. Replay = the existing desktop-driver tools.
//
// Honest limits: apps with poor accessibility metadata yield vague element names;
// typing is captured as "final value of field X" (deliberately not keystrokes).
const { spawn } = require("child_process");

const FORBIDDEN_SRC = "passw|cvv|cvc|card.?num|cardnumber|ccnum|cc-(number|exp|csc)|expir|ssn|social.?sec|secret|otp|\\bpin\\b";

// Static script — nothing user-controlled is interpolated (win-speech safety pattern).
const PS_SCRIPT = `
$ErrorActionPreference = "SilentlyContinue"
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$emit = { param($o) [Console]::Out.WriteLine(($o | ConvertTo-Json -Compress -Depth 3)); [Console]::Out.Flush() }
function AppOf($el) { try { (Get-Process -Id $el.Current.ProcessId -ErrorAction Stop).ProcessName } catch { "" } }
$script:lastEdit = $null
$focusHandler = [System.Windows.Automation.AutomationFocusChangedEventHandler]{
  param($src, $e)
  try {
    $el = [System.Windows.Automation.AutomationElement]$src
    # leaving a text field? capture its final value (never for password controls)
    if ($script:lastEdit -ne $null) {
      try {
        $prev = $script:lastEdit
        $vp = $null
        if ($prev.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
          $name = $prev.Current.Name
          $secret = $prev.Current.IsPassword -or ($name -match "${FORBIDDEN_SRC}")
          $val = if ($secret) { "(redacted - credential field)" } else { $vp.Current.Value }
          if ($val -ne $null -and $val -ne "") {
            & $emit @{ t = "fill"; app = (AppOf $prev); field = "$name"; value = ("$val".Substring(0, [Math]::Min(80, "$val".Length))) }
          }
        }
      } catch {}
      $script:lastEdit = $null
    }
    $ct = $el.Current.ControlType.ProgrammaticName -replace "ControlType.", ""
    if ($ct -eq "Edit" -or $ct -eq "Document") { $script:lastEdit = $el }
    else { & $emit @{ t = "focus"; app = (AppOf $el); role = $ct.ToLower(); name = "$($el.Current.Name)".Substring(0, [Math]::Min(70, "$($el.Current.Name)".Length)) } }
  } catch {}
}
$invokeHandler = [System.Windows.Automation.AutomationEventHandler]{
  param($src, $e)
  try {
    $el = [System.Windows.Automation.AutomationElement]$src
    $ct = $el.Current.ControlType.ProgrammaticName -replace "ControlType.", ""
    & $emit @{ t = "click"; app = (AppOf $el); role = $ct.ToLower(); name = "$($el.Current.Name)".Substring(0, [Math]::Min(70, "$($el.Current.Name)".Length)) }
  } catch {}
}
[System.Windows.Automation.Automation]::AddAutomationFocusChangedEventHandler($focusHandler)
[System.Windows.Automation.Automation]::AddAutomationEventHandler(
  [System.Windows.Automation.InvokePattern]::InvokedEvent,
  [System.Windows.Automation.AutomationElement]::RootElement,
  [System.Windows.Automation.TreeScope]::Subtree, $invokeHandler)
& $emit @{ t = "page"; url = "desktop"; title = "recording started" }
while ($true) { Start-Sleep -Seconds 1 }
`;

let active = null; // { proc, steps }

function start() {
  if (active) return { already: true, recording: true };
  const proc = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT], { windowsHide: true });
  const steps = [];
  let buf = "";
  proc.stdout.on("data", (d) => {
    buf += d.toString("utf8");
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith("{")) continue;
      try {
        const e = JSON.parse(line);
        e.at = Date.now();
        // Madav's own window generates noise — drop our own app's events.
        if (/^(madav|electron)$/i.test(e.app || "")) continue;
        steps.push(e);
        if (steps.length > 400) steps.splice(0, steps.length - 400);
      } catch {}
    }
  });
  proc.on("exit", () => { if (active && active.proc === proc) active = null; });
  active = { proc, steps };
  return { recording: true };
}

function status() { return { recording: !!active, steps: active ? active.steps.length : 0 }; }

async function stop() {
  if (!active) return { recording: false };
  const a = active; active = null;
  try { a.proc.kill(); } catch {}
  const steps = a.steps;
  if (steps.length < 3) return { recording: false, error: "too little recorded (need at least 3 actions)" };
  await distillDesktop(steps).catch(() => {});
  return { recording: false, steps: steps.length, note: "Draft created — approve it in Skills → Learned drafts (may take ~30s)." };
}

// Desktop-flavored distillation into the Skill Forge draft queue (approval mandatory).
async function distillDesktop(steps) {
  const settings = require("./settings.cjs");
  const profile = settings.activeProfile();
  if (!profile || !profile.baseUrl || !profile.model) return;
  const { streamChat } = require("./providers.cjs");
  const lines = steps.map((s) =>
    s.t === "click" ? `CLICKED ${s.role} "${s.name}" in app "${s.app}"`
    : s.t === "fill" ? `FILLED "${s.field}" with "${s.value}" in app "${s.app}"`
    : s.t === "focus" ? `FOCUSED ${s.role} "${s.name}" in app "${s.app}"`
    : `(${s.title || s.t})`).join("\n");
  const sys = `The user DEMONSTRATED a Windows DESKTOP workflow by hand; turn it into a reusable SKILL for an agent with desktop_apps/desktop_focus/desktop_read/desktop_click/desktop_type tools. Reply with ONLY the file content, no fence:
---
name: <kebab-case-short-name>
description: <one sentence: when Madav should use this desktop workflow>
---

# <Title>

<Numbered steps an agent should follow to repeat this workflow: which application to focus (by the app names recorded), what to click (by the visible control names), what to type where. Generalize obvious specifics into <placeholders>. Note that credential fields must be left for the human, and that the agent needs the Desktop capability plus that app on its allowlist. Skip FOCUSED noise that wasn't meaningful. Max 300 words.>`;
  const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 90000);
  let text = "";
  try { text = (await streamChat({ ...profile }, [{ role: "system", content: sys }, { role: "user", content: "RECORDED STEPS:\n" + lines.slice(0, 8000) }], { signal: ac.signal, onDelta: () => {} })).text || ""; }
  catch { return; } finally { clearTimeout(to); }
  const m = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text.trim().replace(/^```[a-z]*\n|```$/g, ""));
  if (!m) return;
  const name = ((/name:\s*(.+)/.exec(m[1]) || [])[1] || "").trim().replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  const description = ((/description:\s*(.+)/.exec(m[1]) || [])[1] || "").trim();
  if (!name || !description) return;
  const fs = require("fs");
  const path = require("path");
  const dataFile = path.join(require("electron").app.getPath("userData"), "skill-forge.json");
  let st; try { st = JSON.parse(fs.readFileSync(dataFile, "utf8")); } catch { st = { drafts: {} }; }
  st.drafts = st.drafts || {};
  st.drafts[name] = { name, description, body: text.trim(), evidence: ["(recorded by you on the desktop — " + steps.length + " UI events)"], at: Date.now() };
  try { fs.writeFileSync(dataFile, JSON.stringify(st, null, 2)); } catch {}
}

module.exports = { start, stop, status };
