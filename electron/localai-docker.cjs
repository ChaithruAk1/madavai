// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Desktop plumbing for the LocalAI media engine: detect Docker, guide its one-time install, and run/stop the
// LocalAI container in the background (the OpenAI-compatible engine for image/voice/video). This is genuine
// platform plumbing (process + Docker) that can't be shared; the model logic lives in @madav/models/localai.
const { spawn } = require("node:child_process");
const http = require("node:http");
const { shell } = require("electron");

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
  if (!ds.running) return { ok: false, dockerNotRunning: true, note: "Start Docker Desktop, then click Start again." };
  if (await apiUp("/readyz")) { prog("ready", 100); return { ok: true, already: true }; }

  const st = await localaiStatus();
  if (st.container === "stopped") { prog("starting", 50); await run("docker", ["start", CONTAINER]); }
  else if (st.container === "absent") {
    prog("pulling", 0);
    await new Promise((res) => {
      const p = spawn("docker", ["run", "-d", "--name", CONTAINER, "-p", PORT + ":" + PORT, "-v", "madav_localai_models:/models", IMAGE], { windowsHide: true });
      p.stderr.on("data", (d) => prog("pulling", 0, String(d).trim().slice(0, 90)));
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
