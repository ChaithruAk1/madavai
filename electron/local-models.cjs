// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Desktop bridge for Local Models — wires the shared @madav/models registry (Ollama / HuggingFace / LM Studio)
// into Electron IPC: detect, search, list, running (health), pull (streamed progress), remove, and one-click
// runtime install. SINGLE SOURCE: all model logic lives in @madav/models (built dist, ESM); this only adds the
// desktop plumbing (a `lms` CLI runner + installer download/spawn). Build first: node scripts/verify-packages.mjs
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const https = require("node:https");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { shell, app } = require("electron");
const localaiDocker = require("./localai-docker.cjs");

const DIST = path.join(__dirname, "..", "packages", "models", "dist", "src");
const imp = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

function cpuSnapshot() { const c = os.cpus() || []; let idle = 0, total = 0; for (const cpu of c) { for (const t in cpu.times) total += cpu.times[t]; idle += cpu.times.idle; } return { idle, total }; }
let _cpuPrev = cpuSnapshot();
function cpuPercent() { const cur = cpuSnapshot(); const di = cur.idle - _cpuPrev.idle, dt = cur.total - _cpuPrev.total; _cpuPrev = cur; if (dt <= 0) return 0; return Math.max(0, Math.min(100, Math.round((1 - di / dt) * 100))); }
function gpuInfo() {
  return new Promise((resolve) => {
    try {
      const p = spawn("nvidia-smi", ["--query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"], { windowsHide: true });
      let out = ""; p.stdout.on("data", (d) => (out += d.toString())); p.on("error", () => resolve(null));
      p.on("close", () => { try { const line = (out.trim().split("\n")[0] || ""); if (!line) return resolve(null); const f = line.split(",").map((x) => x.trim()); resolve({ name: f[0], utilPct: Number(f[1]) || 0, vramUsedGB: Math.round(Number(f[2]) / 1024 * 10) / 10, vramTotalGB: Math.round(Number(f[3]) / 1024 * 10) / 10, tempC: Number(f[4]) || 0 }); } catch { resolve(null); } });
    } catch { resolve(null); }
  });
}

function makeLmsCli() {
  const LMS = process.platform === "win32" ? "lms.exe" : "lms";
  // The lms CLI emits ANSI colour codes that leak into parsed model names (e.g. "[2m (1 variant)[22m").
  // Disable colour at the source AND strip any escape sequences defensively.
  const NOCOLOR_ENV = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", CLICOLOR: "0", CLICOLOR_FORCE: "0", TERM: "dumb" };
  const stripAnsi = (x) => String(x).replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
  return {
    run(args) {
      return new Promise((resolve) => {
        let out = "", err = "";
        try {
          const p = spawn(LMS, args, { windowsHide: true, env: NOCOLOR_ENV });
          p.stdout.on("data", (d) => (out += d.toString()));
          p.stderr.on("data", (d) => (err += d.toString()));
          p.on("error", () => resolve({ code: 127, stdout: "", stderr: "lms not found" }));
          p.on("close", (code) => resolve({ code: code == null ? 0 : code, stdout: stripAnsi(out), stderr: stripAnsi(err) }));
        } catch { resolve({ code: 127, stdout: "", stderr: "lms not found" }); }
      });
    },
    async *stream(args, signal) {
      const p = spawn(LMS, args, { windowsHide: true, env: NOCOLOR_ENV });
      if (signal) { const onAbort = () => { try { p.kill(); } catch {} }; if (signal.aborted) onAbort(); else signal.addEventListener("abort", onAbort, { once: true }); }
      let buf = "", done = false, resolveNext = null;
      const queue = [];
      const push = (l) => { if (resolveNext) { const r = resolveNext; resolveNext = null; r(l); } else queue.push(l); };
      p.stdout.on("data", (d) => { buf += d.toString(); let nl; while ((nl = buf.indexOf("\n")) >= 0) { push(stripAnsi(buf.slice(0, nl))); buf = buf.slice(nl + 1); } });
      const end = () => { if (buf.trim()) push(stripAnsi(buf.trim())); done = true; if (resolveNext) { const r = resolveNext; resolveNext = null; r(null); } };
      p.on("close", end); p.on("error", end);
      for (;;) {
        if (queue.length) { yield queue.shift(); continue; }
        if (done) return;
        const l = await new Promise((r) => (resolveNext = r));
        if (l == null) return;
        yield l;
      }
    },
  };
}

let _reg = null;
async function runtimes() {
  if (_reg) return _reg;
  const { createRuntimes } = await imp("index.js");
  _reg = createRuntimes({ lmsCli: makeLmsCli() });
  return _reg;
}
async function rt(id) { const r = await runtimes(); return r[id] || null; }

function download(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u) => https.get(u, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return get(res.headers.location); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      const total = parseInt(res.headers["content-length"] || "0", 10); let got = 0;
      res.on("data", (c) => { got += c.length; if (onProgress) onProgress(total ? Math.round((got / total) * 100) : 0); });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
    }).on("error", reject);
    get(url);
  });
}

async function installOllama(onProgress) {
  if (process.platform === "win32") {
    const exe = path.join(os.tmpdir(), "OllamaSetup.exe");
    onProgress({ phase: "downloading", pct: 0 });
    await download("https://ollama.com/download/OllamaSetup.exe", exe, (pct) => onProgress({ phase: "downloading", pct }));
    onProgress({ phase: "installing", pct: 100 });
    await new Promise((res) => { try { const p = spawn(exe, ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART"], { windowsHide: true, detached: true }); p.on("close", () => res()); p.on("error", () => res()); } catch { res(); } });
    return { ok: true };
  }
  await shell.openExternal("https://ollama.com/download");
  return { ok: true, opened: true };
}
async function installLmStudio() { await shell.openExternal("https://lmstudio.ai/download"); return { ok: true, opened: true }; }

function extFor(mime) { const m = String(mime || "").toLowerCase(); if (/png/.test(m)) return "png"; if (/jpe?g/.test(m)) return "jpg"; if (/webp/.test(m)) return "webp"; if (/gif/.test(m)) return "gif"; if (/mpeg|mp3/.test(m)) return "mp3"; if (/wav/.test(m)) return "wav"; if (/ogg/.test(m)) return "ogg"; if (/webm/.test(m)) return "webm"; if (/mp4/.test(m)) return "mp4"; return "bin"; }
function saveMedia(prefix, b64, mime, outDir) {
  try {
    let dir = outDir && String(outDir).trim();
    if (!dir) { const base = (app && app.getPath && (app.getPath("pictures") || app.getPath("downloads"))) || os.tmpdir(); dir = path.join(base, "Madav Media"); }
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, prefix + "_" + Date.now().toString(36) + "." + extFor(mime));
    fs.writeFileSync(file, Buffer.from(b64, "base64")); return file;
  } catch { return ""; }
}

// ---- Local-engine auto-start: install once, then Madav runs them itself on every launch (no manual steps after a reboot) ----
const LOCALAI_FLAG = () => { try { return path.join(app.getPath("userData"), "localai-enabled.flag"); } catch { return ""; } };
function ollamaRunning() { return new Promise((r) => { const req = http.get({ host: "127.0.0.1", port: 11434, path: "/api/version", timeout: 1200 }, (res) => { res.resume(); r(true); }); req.on("error", () => r(false)); req.on("timeout", () => { req.destroy(); r(false); }); }); }
function ollamaInstalled() { return new Promise((r) => { try { const c = spawn("ollama", ["--version"], { windowsHide: true }); c.on("error", () => r(false)); c.on("close", (code) => r(code === 0)); } catch { r(false); } }); }
function ollamaServe() { try { spawn("ollama", ["serve"], { detached: true, stdio: "ignore", windowsHide: true }).unref(); } catch {} }
async function autoStartEngines() {
  try { if (!(await ollamaRunning()) && (await ollamaInstalled())) ollamaServe(); } catch {}          // Ollama: installed but down -> start it
  try { const f = LOCALAI_FLAG(); if (f && fs.existsSync(f)) localaiDocker.startLocalAi(() => {}).catch(() => {}); } catch {} // LocalAI: only if set up before -> Docker + container up silently
}

function register(ipcMain, getWin) {
  const send = (ch, payload) => { try { const w = getWin && getWin(); if (w && w.webContents) w.webContents.send(ch, payload); } catch {} };
  ipcMain.handle("localModels:providers", async () => { const r = await runtimes(); return Object.values(r).map((x) => ({ id: x.id, label: x.label })); });
  ipcMain.handle("localModels:detect", async (_e, id) => { const r = await rt(id); return r ? r.detect() : { available: false, note: "Unknown provider" }; });
  ipcMain.handle("localModels:search", async (_e, id, q) => { const r = await rt(id); try { return r ? await r.search(q || "") : []; } catch (e) { return { error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:list", async (_e, id) => { const r = await rt(id); try { return r ? await r.list() : []; } catch { return []; } });
  ipcMain.handle("localModels:running", async (_e, id) => { const r = await rt(id); try { return r ? await r.running() : []; } catch { return []; } });
  ipcMain.handle("localModels:remove", async (_e, id, name) => { const r = await rt(id); try { await r.remove(name); return { ok: true }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:stop", async (_e, id, name) => { const r = await rt(id); try { await r.stop(name); return { ok: true }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:load", async (_e, id, name, opts) => { const r = await rt(id); try { if (r && r.load) await r.load(name, opts); return { ok: true }; } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:browse", async (_e, id) => { const r = await rt(id); try { return r ? await r.browse() : []; } catch (e) { return { error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:system", async () => { try { return { totalRamGB: Math.round(os.totalmem() / 1e9 * 10) / 10, freeRamGB: Math.round(os.freemem() / 1e9 * 10) / 10, platform: process.platform, arch: process.arch }; } catch { return { totalRamGB: 0 }; } });
  ipcMain.handle("localModels:serverStatus", async () => {
    const out = { system: {}, providers: [] };
    try { const total = os.totalmem(), free = os.freemem(); out.system = { totalRamGB: Math.round(total / 1e9 * 10) / 10, freeRamGB: Math.round(free / 1e9 * 10) / 10, usedRamGB: Math.round((total - free) / 1e9 * 10) / 10, ramPct: Math.round((1 - free / total) * 100), cpuPct: cpuPercent(), gpu: await gpuInfo() }; } catch {}
    try { const r = await runtimes(); out.providers = await Promise.all(Object.values(r).map(async (x) => { try { const det = await x.detect(); const run = det.available ? await x.running() : []; return { id: x.id, label: x.label, available: !!det.available, version: det.version, running: run }; } catch { return { id: x.id, label: x.label, available: false, running: [] }; } })); } catch {}
    return out;
  });
  const _pulls = new Map();   // id::name -> AbortController, so an in-flight download can be cancelled mid-way
  ipcMain.handle("localModels:pull", async (_e, id, name) => {
    const r = await rt(id); if (!r) return { ok: false, error: "Unknown provider" };
    const key = id + "::" + name;
    const ctrl = new AbortController(); _pulls.set(key, ctrl);
    try { await r.pull(name, (p) => send("localModels:pullProgress", Object.assign({ id, name }, p)), ctrl.signal); send("localModels:pullProgress", { id, name, status: "success", done: true }); return { ok: true }; }
    catch (e) {
      const msg = String((e && e.message) || e);
      if (ctrl.signal.aborted || /abort|cancel/i.test(msg)) { send("localModels:pullProgress", { id, name, status: "cancelled", cancelled: true, done: true }); return { ok: false, cancelled: true }; }
      send("localModels:pullProgress", { id, name, status: "error", error: msg, done: true }); return { ok: false, error: msg };
    }
    finally { _pulls.delete(key); }
  });
  // Cancel an in-flight download. Aborts the client stream/process; a partial Ollama pull stays resumable.
  ipcMain.handle("localModels:pullCancel", async (_e, id, name) => { const c = _pulls.get(id + "::" + name); if (!c) return { ok: false, error: "no active download" }; try { c.abort(); } catch {} return { ok: true }; });
  // HuggingFace-ranked media recommendations for Let's Create (download-ranked + size-checked by pipeline_tag).
  ipcMain.handle("localModels:recommendMedia", async () => { const r = await rt("localai"); try { return (r && r.recommend) ? await r.recommend() : []; } catch (e) { return { error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:dockerStatus", async () => { try { return await localaiDocker.dockerStatus(); } catch (e) { return { installed: false, running: false, error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:localaiStatus", async () => { try { return await localaiDocker.localaiStatus(); } catch { return { api: false, container: "absent" }; } });
  ipcMain.handle("localModels:localaiStop", async () => { try { return await localaiDocker.stopLocalAi(); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:install", async (_e, id) => {
    try {
      if (id === "ollama" || id === "huggingface") return await installOllama((p) => send("localModels:installProgress", Object.assign({ id }, p)));
      if (id === "lmstudio") return await installLmStudio();
      if (id === "localai") { const _r = await localaiDocker.startLocalAi((p) => send("localModels:installProgress", Object.assign({ id }, p))); try { if (_r && _r.ok) { const _f = LOCALAI_FLAG(); if (_f) fs.writeFileSync(_f, "1"); } } catch {} return _r; }
      return { ok: false, error: "Unknown provider" };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });

  // Let's Create — image generation via the LocalAI engine. Saves a copy to the user's Pictures/Madav Media.
  ipcMain.handle("localMedia:image", async (_e, req) => {
    const { model, prompt, size } = req || {};
    try {
      const r = await rt("localai");
      if (!r || !r.generateImage) return { error: "LocalAI engine isn't available — set it up in Local Models." };
      if (!model) return { error: "Pick an image model first." };
      const img = await r.generateImage(String(model), String(prompt || ""), { size });
      const file = saveMedia("image", img.b64, img.mime, req.outDir);
      return { b64: img.b64, mime: img.mime, file };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });

  // Let's Create — edit an existing image from an instruction (img2img) via LocalAI.
  ipcMain.handle("localMedia:imageEdit", async (_e, req) => {
    const { model, prompt, srcB64, srcMime, size } = req || {};
    try {
      const r = await rt("localai");
      if (!r || !r.editImage) return { error: "LocalAI engine isn't available — set it up in Local Models." };
      if (!model) return { error: "Pick an image model first." };
      if (!srcB64) return { error: "No source image to edit." };
      const img = await r.editImage(String(model), String(prompt || ""), String(srcB64), String(srcMime || "image/png"), { size });
      return { b64: img.b64, mime: img.mime, file: saveMedia("image", img.b64, img.mime, req.outDir) };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });

  // Let's Create — describe / answer a question about an image (vision) via LocalAI.
  ipcMain.handle("localMedia:describe", async (_e, req) => {
    const { model, prompt, imageB64, imageMime } = req || {};
    try {
      const r = await rt("localai");
      if (!r || !r.describeImage) return { error: "LocalAI engine isn't available — set it up in Local Models." };
      if (!model) return { error: "Pick a vision model first." };
      if (!imageB64) return { error: "No image to describe." };
      return await r.describeImage(String(model), String(prompt || ""), String(imageB64), String(imageMime || "image/png"));
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });

  // Let's Create — text-to-speech via LocalAI; saves a copy to Pictures/Madav Media.
  ipcMain.handle("localMedia:speech", async (_e, req) => {
    const { model, input, voice } = req || {};
    try {
      const r = await rt("localai");
      if (!r || !r.generateSpeech) return { error: "LocalAI engine isn't available — set it up in Local Models." };
      if (!model) return { error: "Pick a voice model first." };
      const a = await r.generateSpeech(String(model), String(input || ""), { voice: voice || undefined });
      const file = saveMedia("voice", a.b64, a.mime, req.outDir);
      return { b64: a.b64, mime: a.mime, file };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });

  // Let's Create — text-to-music via LocalAI; saves a copy to Pictures/Madav Media.
  ipcMain.handle("localMedia:music", async (_e, req) => {
    const { model, prompt } = req || {};
    try {
      const r = await rt("localai");
      if (!r || !r.generateMusic) return { error: "LocalAI engine isn't available — set it up in Local Models." };
      if (!model) return { error: "Pick a music model first." };
      const a = await r.generateMusic(String(model), String(prompt || ""));
      return { b64: a.b64, mime: a.mime, file: saveMedia("music", a.b64, a.mime, req.outDir) };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });

  // Let's Create — speech-to-text via LocalAI (audio bytes come from the renderer as base64).
  ipcMain.handle("localMedia:transcribe", async (_e, req) => {
    const { model, audioB64, mime, filename } = req || {};
    try {
      const r = await rt("localai");
      if (!r || !r.transcribe) return { error: "LocalAI engine isn't available — set it up in Local Models." };
      if (!model) return { error: "Pick a transcription model first." };
      if (!audioB64) return { error: "Choose an audio file first." };
      return await r.transcribe(String(model), String(audioB64), String(mime || "audio/wav"), String(filename || "audio.wav"));
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });

  // Let's Create — text-to-video via LocalAI (heavy/slow; saves a copy to Pictures/Madav Media).
  ipcMain.handle("localMedia:video", async (_e, req) => {
    const { model, prompt, seconds, startImageB64, startImageMime } = req || {};
    try {
      const r = await rt("localai");
      if (!r || !r.generateVideo) return { error: "LocalAI engine isn't available — set it up in Local Models." };
      if (!model) return { error: "Pick a video model first." };
      const startImage = startImageB64 ? ("data:" + (startImageMime || "image/png") + ";base64," + startImageB64) : undefined;
      const v = await r.generateVideo(String(model), String(prompt || ""), { seconds: seconds ? Number(seconds) : undefined, startImage });
      const file = saveMedia("video", v.b64, v.mime, req.outDir);
      return { b64: v.b64, mime: v.mime, file };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });
}

module.exports = { register, autoStartEngines };
