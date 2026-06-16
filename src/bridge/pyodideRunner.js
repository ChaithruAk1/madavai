// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Browser-side Python (Pyodide / WebAssembly) — the WEB equivalent of desktop run_bash, with NO
// server. Lets web Chat / Collaborate / Agents / Projects run the agent's data scripts (pandas +
// openpyxl) entirely client-side: private (data never leaves the browser), free, and sandboxed by
// the browser itself. Loaded lazily on first use; pandas/openpyxl fetched on demand and cached.
const PYODIDE_VERSION = "0.26.4";
const PYODIDE_BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
let _py = null, _loading = null;

async function load(onStatus) {
  if (_py) return _py;
  if (_loading) return _loading;
  _loading = (async () => {
    if (!globalThis.loadPyodide) {
      onStatus && onStatus("Downloading Python runtime…");
      await new Promise((res, rej) => {
        const sc = document.createElement("script");
        sc.src = PYODIDE_BASE + "pyodide.js";
        sc.onload = res; sc.onerror = () => rej(new Error("Couldn't load the Python runtime (Pyodide) — check your connection."));
        document.head.appendChild(sc);
      });
    }
    const py = await globalThis.loadPyodide({ indexURL: PYODIDE_BASE });
    onStatus && onStatus("Loading pandas + openpyxl…");
    await py.loadPackage(["pandas", "openpyxl"]); // numpy is pulled in as a dependency
    _py = py;
    return py;
  })();
  try { return await _loading; } finally { _loading = null; }
}

function b64ToBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function bytesToB64(bytes) { let s = ""; const CH = 0x8000; for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH)); return btoa(s); }

// Run `code` in a fresh /work dir with `files` available. files: [{ name, content, encoding:"utf8"|"base64" }].
// Returns { ok, stdout, stderr, files:[{ name, base64 }] } where files = anything NEW the script wrote to /work.
export async function runPython(code, files = [], onStatus) {
  const py = await load(onStatus);
  const FS = py.FS, work = "/work";
  try { FS.mkdir(work); } catch {}
  // clear any prior run's files so outputs are unambiguous
  for (const n of FS.readdir(work)) { if (n === "." || n === "..") continue; try { FS.unlink(work + "/" + n); } catch {} }
  const inputNames = new Set();
  for (const f of files) {
    const p = work + "/" + f.name; inputNames.add(f.name);
    if (f.encoding === "base64") FS.writeFile(p, b64ToBytes(f.content || ""));
    else FS.writeFile(p, f.content == null ? "" : String(f.content));
  }
  let out = "", err = "";
  try { py.setStdout({ batched: (s) => { out += s + "\n"; } }); py.setStderr({ batched: (s) => { err += s + "\n"; } }); } catch {}
  onStatus && onStatus("Running…");
  let ok = true;
  try {
    py.runPython("import os; os.chdir('" + work + "')");
    await py.runPythonAsync(code);
  } catch (e) { ok = false; err += "\n" + String((e && e.message) || e); }
  const produced = [];
  for (const n of FS.readdir(work)) {
    if (n === "." || n === ".." || inputNames.has(n)) continue;
    try { produced.push({ name: n, base64: bytesToB64(FS.readFile(work + "/" + n)) }); } catch {}
  }
  return { ok, stdout: (out || "").slice(-12000), stderr: (err || "").slice(-4000), files: produced };
}

export function pyodideReady() { return !!_py; }
