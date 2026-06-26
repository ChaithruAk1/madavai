// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Desktop plumbing for the LocalAI media engine: detect Docker, guide its one-time install, and run/stop the
// LocalAI container in the background (the OpenAI-compatible engine for image/voice/video). This is genuine
// platform plumbing (process + Docker) that can't be shared; the model logic lives in @madav/models/localai.
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { shell } = require("electron");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Best-effort: bring Docker Desktop up ourselves so the user doesn't have to hunt for it.
function launchDocker() {
  try {
    if (process.platform === "darwin") { spawn("open", ["-a", "Docker"]); return true; }
    if (process.platform === "win32") {
      const cands = [
        process.env.ProgramFiles && path.join(process.env.ProgramFiles, "Docker", "Docker", "Docker Desktop.exe"),
        process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "Docker", "Docker", "Docker Desktop.exe"),
        process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Docker", "Docker Desktop.exe"),
      ].filter(Boolean);
      for (const c of cands) { try { if (fs.existsSync(c)) { spawn(c, [], { detached: true, stdio: "ignore", windowsHide: true }).unref(); return true; } } catch {} }
      try { spawn("cmd", ["/c", "start", "", "Docker Desktop"], { windowsHide: true }); return true; } catch {}
    }
  } catch {}
  return false;
}

const CONTAINER = "madav-localai";
const IMAGE = "localai/localai:latest";
const PORT = 8080;

function run(cmd, args) {
  return new Promise((res) => {
    let out = "", err = "";
    try {
      const p = spawn(cmd, args, { windowsHide: true });
      p.stdout.on("data", (d) => (out += d.toString()));
      p.stderr.on("data", (d) => (err += d.toString()));
      p.on("error", () => res({ code: 127, out: "", err: "not found" }));
      p.on("close", (c) => res({ code: c == null ? 0 : c, out, err }));
    } catch { res({ code: 127, out: "", err: "not found" }); }
  });
}
function apiUp(path) {
  return new Promise((r) => {
    const req = http.get({ host: "127.0.0.1", port: PORT, path, timeout: 1500 }, (res) => { res.resume(); r(res.statusCode >= 200 && res.statusCode < 500); });
    req.on("error", () => r(false));
    req.on("timeout", () => { req.destroy(); r(false); });
  });
}

async function dockerStatus() {
  const v = await run("docker", ["version", "--format", "{{.Server.Version}}"]);
  if (v.code === 0 && v.out.trim()) return { installed: true, running: true, version: v.out.trim() };
  const v2 = await run("docker", ["--version"]);
  if (v2.code === 0) return { installed: true, running: false, note: "Docker is installed but not started — open Docker Desktop and wait for it to be running." };
  return { installed: false, running: false, note: "Docker isn't installed — needed once to run the LocalAI media engine." };
}

async function localaiStatus() {
  const api = await apiUp("/readyz");
  let container = "absent";
  const ps = await run("docker", ["ps", "-a", "--filter", "name=" + CONTAINER, "--format", "{{.Names}} {{.State}}"]);
  if (ps.code === 0 && ps.out.includes(CONTAINER)) container = /running/i.test(ps.out) ? "running" : "stopped";
  return { api, container };
}

async function installDocker() { await shell.openExternal("https://www.docker.com/products/docker-desktop/"); return { ok: true, opened: true }; }

async function startLocalAi(onProgress) {
  const prog = (phase, pct, line) => { try { onProgress && onProgress({ phase, pct, line }); } catch {} };
  const ds = await dockerStatus();
  if (!ds.installed) { await installDocker(); return { ok: false, needsDocker: true, opened: true, note: "Install Docker Desktop (we opened the page), then click Start again." }; }
  if (!ds.running) {
    prog("docker", 5, "Starting Docker Desktop…");
    launchDocker();
    let up = false;
    for (let i = 0; i < 45; i++) { const s = await dockerStatus(); if (s.running) { up = true; break; } prog("docker", Math.min(40, 5 + i), "Waiting for Docker to start… (the first start can take a minute)"); await sleep(2000); }
    if (!up) return { ok: false, dockerNotRunning: true, note: "Docker Desktop is starting up — give it a minute to finish, then click Set up LocalAI again." };
  }
  if (await apiUp("/readyz")) { prog("ready", 100); return { ok: true, already: true }; }

  const st = await localaiStatus();
  if (st.container === "stopped") { prog("starting", 50); await run("docker", ["start", CONTAINER]); }
  else if (st.container === "absent") {
    prog("pulling", 0, "preparing the engine image (a few GB, one time)…");
    let total = 0, done = 0;
    await new Promise((res) => {
      const p = spawn("docker", ["run", "-d", "--name", CONTAINER, "-p", PORT + ":" + PORT, "-v", "madav_localai_models:/models", IMAGE], { windowsHide: true });
      const onData = (buf) => String(buf).split(/\r?\n/).forEach((line) => {
        if (/Pulling fs layer/i.test(line)) total++;
        if (/Pull complete/i.test(line)) done++;
        const pct = total ? Math.min(99, Math.round((done / total) * 100)) : 0;
        if (line.trim()) prog("pulling", pct, line.trim().slice(0, 90));
      });
      p.stderr.on("data", onData); p.stdout.on("data", onData);
      p.on("error", () => res()); p.on("close", () => res());
    });
  }
  for (let i = 0; i < 90; i++) { // first boot pulls the image + backends; can take a while
    if (await apiUp("/readyz")) { prog("ready", 100); return { ok: true }; }
    prog("booting", Math.min(95, 40 + i));
    await new Promise((r) => setTimeout(r, 2000));
  }
  return { ok: true, note: "LocalAI started; it may still be initializing in the background." };
}

async function stopLocalAi() { const r = await run("docker", ["stop", CONTAINER]); return { ok: r.code === 0, error: r.code === 0 ? undefined : (r.err || "").trim() }; }

module.exports = { dockerStatus, localaiStatus, installDocker, startLocalAi, stopLocalAi };
