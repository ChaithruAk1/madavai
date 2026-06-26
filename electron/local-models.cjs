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
const { shell } = require("electron");

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
  ipcMain.handle("localModels:install", async (_e, id) => {
    try {
      if (id === "ollama" || id === "huggingface") return await installOllama((p) => send("localModels:installProgress", Object.assign({ id }, p)));
      if (id === "lmstudio") return await installLmStudio();
      return { ok: false, error: "Unknown provider" };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  });
}

module.exports = { register };
