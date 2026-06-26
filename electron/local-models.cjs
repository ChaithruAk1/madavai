// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Desktop bridge for Local Models — wires the shared @madav/models registry (Ollama / HuggingFace / LM Studio)
// into Electron IPC: detect, search, list, running (health), pull (streamed progress), remove, and one-click
// runtime install. SINGLE SOURCE: all model logic lives in @madav/models (built dist, ESM); this only adds the
// desktop plumbing (a `lms` CLI runner + installer download/spawn). Build first: node scripts/verify-packages.mjs
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const https = require("node:https");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { shell, app } = require("electron");
const localaiDocker = require("./localai-docker.cjs");

const DIST = path.join(__dirname, "..", "packages", "models", "dist", "src");
const imp = (rel) => import(pathToFileURL(path.join(DIST, rel)).href);

function makeLmsCli() {
  const LMS = process.platform === "win32" ? "lms.exe" : "lms";
  return {
    run(args) {
      return new Promise((resolve) => {
        let out = "", err = "";
        try {
          const p = spawn(LMS, args, { windowsHide: true });
          p.stdout.on("data", (d) => (out += d.toString()));
          p.stderr.on("data", (d) => (err += d.toString()));
          p.on("error", () => resolve({ code: 127, stdout: "", stderr: "lms not found" }));
          p.on("close", (code) => resolve({ code: code == null ? 0 : code, stdout: out, stderr: err }));
        } catch { resolve({ code: 127, stdout: "", stderr: "lms not found" }); }
      });
    },
    async *stream(args) {
      const p = spawn(LMS, args, { windowsHide: true });
      let buf = "", done = false, resolveNext = null;
      const queue = [];
      const push = (l) => { if (resolveNext) { const r = resolveNext; resolveNext = null; r(l); } else queue.push(l); };
      p.stdout.on("data", (d) => { buf += d.toString(); let nl; while ((nl = buf.indexOf("\n")) >= 0) { push(buf.slice(0, nl)); buf = buf.slice(nl + 1); } });
      const end = () => { if (buf.trim()) push(buf.trim()); done = true; if (resolveNext) { const r = resolveNext; resolveNext = null; r(null); } };
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
function saveMedia(prefix, b64, mime) {
  try {
    const base = (app && app.getPath && (app.getPath("pictures") || app.getPath("downloads"))) || os.tmpdir();
    const dir = path.join(base, "Madav Media"); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, prefix + "_" + Date.now().toString(36) + "." + extFor(mime));
    fs.writeFileSync(file, Buffer.from(b64, "base64")); return file;
  } catch { return ""; }
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
  ipcMain.handle("localModels:browse", async (_e, id) => { const r = await rt(id); try { return r ? await r.browse() : []; } catch (e) { return { error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:system", async () => { try { return { totalRamGB: Math.round(os.totalmem() / 1e9 * 10) / 10, freeRamGB: Math.round(os.freemem() / 1e9 * 10) / 10, platform: process.platform, arch: process.arch }; } catch { return { totalRamGB: 0 }; } });
  ipcMain.handle("localModels:pull", async (_e, id, name) => {
    const r = await rt(id); if (!r) return { ok: false, error: "Unknown provider" };
    try { await r.pull(name, (p) => send("localModels:pullProgress", Object.assign({ id, name }, p))); send("localModels:pullProgress", { id, name, status: "success", done: true }); return { ok: true }; }
    catch (e) { send("localModels:pullProgress", { id, name, status: "error", error: String((e && e.message) || e), done: true }); return { ok: false, error: String((e && e.message) || e) }; }
  });
  ipcMain.handle("localModels:dockerStatus", async () => { try { return await localaiDocker.dockerStatus(); } catch (e) { return { installed: false, running: false, error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:localaiStatus", async () => { try { return await localaiDocker.localaiStatus(); } catch { return { api: false, container: "absent" }; } });
  ipcMain.handle("localModels:localaiStop", async () => { try { return await localaiDocker.stopLocalAi(); } catch (e) { return { ok: false, error: String((e && e.message) || e) }; } });
  ipcMain.handle("localModels:install", async (_e, id) => {
    try {
      if (id === "ollama" || id === "huggingface") return await installOllama((p) => send("localModels:installProgress", Object.assign({ id }, p)));
      if (id === "lmstudio") return await installLmStudio();
      if (id === "localai") return await localaiDocker.startLocalAi((p) => send("localModels:installProgress", Object.assign({ id }, p)));
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
      const file = saveMedia("image", img.b64, img.mime);
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
      return { b64: img.b64, mime: img.mime, file: saveMedia("image", img.b64, img.mime) };
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
      const file = saveMedia("voice", a.b64, a.mime);
      return { b64: a.b64, mime: a.mime, file };
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
      const file = saveMedia("video", v.b64, v.mime);
      return { b64: v.b64, mime: v.mime, file };
    } catch (e) { return { error: String((e && e.message) || e) }; }
  });
}

module.exports = { register };
