// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
//
// "Enable terminal access" — one click in the desktop app provisions the BrainEdge CLI so a paying
// user can run `brainedge` in any terminal WITHOUT touching config files or re-entering their API key.
// It (1) reuses the provider creds already in Settings, (2) mints a long-lived CLI token tied to the
// live subscription, (3) writes ~/.brainedge/config.json, and (4) puts a `brainedge` command on PATH.
const { app } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execSync, execFileSync } = require("node:child_process");
const settings = require("./settings.cjs");
const auth = require("./auth.cjs");

const configPath = () => path.join(os.homedir(), ".brainedge", "config.json");

// Find the bundled CLI entry (dev tree, packaged resources, or unpacked asar).
function cliPath() {
  const cands = [
    path.join(__dirname, "..", "cli", "brainedge.mjs"),
    path.join(process.resourcesPath || "", "cli", "brainedge.mjs"),
    path.join(process.resourcesPath || "", "app.asar.unpacked", "cli", "brainedge.mjs"),
  ];
  return cands.find((p) => { try { return fs.existsSync(p); } catch { return false; } }) || cands[0];
}

function nodeInfo() {
  try { return { ok: true, version: execSync("node -v", { stdio: "pipe" }).toString().trim() }; }
  catch { return { ok: false }; }
}

// Create a `brainedge` launcher on the user's PATH — no admin rights, no npm needed.
function installCommand() {
  const cli = cliPath();
  try {
    if (process.platform === "win32") {
      const binDir = path.join(app.getPath("userData"), "bin");
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, "brainedge.cmd"), `@node "${cli}" %*\r\n`);
      // Append to the USER PATH only if it's not already there (User scope = no admin prompt).
      try {
        const d = binDir.replace(/'/g, "''");
        execFileSync("powershell", ["-NoProfile", "-Command",
          `$d='${d}'; $p=[Environment]::GetEnvironmentVariable('Path','User'); if($p -notlike "*$d*"){[Environment]::SetEnvironmentVariable('Path', ($p.TrimEnd(';') + ';' + $d),'User')}`,
        ], { stdio: "pipe" });
      } catch {}
      return { method: "path", dir: binDir, note: "Open a NEW terminal, then run: brainedge" };
    }
    const binDir = path.join(os.homedir(), ".local", "bin");
    fs.mkdirSync(binDir, { recursive: true });
    const sh = path.join(binDir, "brainedge");
    fs.writeFileSync(sh, `#!/bin/sh\nexec node "${cli}" "$@"\n`); fs.chmodSync(sh, 0o755);
    return { method: "path", dir: binDir, note: "Make sure ~/.local/bin is on your PATH, then run: brainedge" };
  } catch (e) {
    return { method: "manual", note: `Run it directly: node "${cli}"`, error: String(e.message || e) };
  }
}

async function enableCli(authBaseUrl) {
  const node = nodeInfo();
  const s = settings.load();
  const prof = (s.profiles && s.profiles[s.activeProfileId]) || Object.values(s.profiles || {})[0];
  if (!prof || !prof.baseUrl || !prof.model) return { ok: false, error: "Add a provider and pick a model in Settings first." };
  const tok = await auth.cliToken(authBaseUrl);
  if (tok.error) return { ok: false, error: tok.error === "unauthenticated" ? "Sign in first." : ("Couldn't authorize: " + tok.error) };
  const cfg = { baseUrl: prof.baseUrl, apiKey: prof.apiKey || "", model: prof.model, kind: prof.kind || "openai", authBaseUrl, token: tok.token };
  try { fs.mkdirSync(path.dirname(configPath()), { recursive: true }); fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2)); }
  catch (e) { return { ok: false, error: "Couldn't write the config file: " + String(e.message || e) }; }
  const command = installCommand();
  return { ok: true, node, model: prof.model, provider: prof.name || "", subscription: tok.status, command };
}

function cliStatus() {
  const node = nodeInfo();
  let configured = false; try { configured = fs.existsSync(configPath()); } catch {}
  let onPath = false; try { execSync(process.platform === "win32" ? "where brainedge" : "command -v brainedge", { stdio: "pipe" }); onPath = true; } catch {}
  return { node, configured, onPath };
}

function disableCli() { try { fs.unlinkSync(configPath()); } catch {} return { ok: true }; }

module.exports = { enableCli, cliStatus, disableCli };
