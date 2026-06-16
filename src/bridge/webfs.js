// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// Browser filesystem for the WEB app's "Let's Collaborate" — backed by the File System Access API
// (Chrome/Edge). The user picks a real folder on their computer; the assistant reads/writes/edits
// files in it directly from the browser. No shell/terminal (browsers can't run commands).

let root = null;       // FileSystemDirectoryHandle of the chosen folder
let rootName = "";

export const supported = () => typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
export const hasRoot = () => !!root;
export const rootLabel = () => rootName;

// Prompt the user to choose a folder (must be called from a user gesture, e.g. a button click).
export async function pickDirectory() {
  if (!supported()) return { error: "Folder access needs Chrome or Edge (the File System Access API). Use the desktop app in other browsers." };
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    root = handle; rootName = handle.name;
    return { name: handle.name };
  } catch (e) {
    if (e && e.name === "AbortError") return { error: "" }; // user cancelled the picker
    return { error: String((e && e.message) || e) };
  }
}

export function clear() { root = null; rootName = ""; }

// SECURITY: reject absolute paths, home-dir shortcuts and ".." traversal before touching any
// directory handle. The File System Access API scopes handles to the picked folder, but we
// refuse suspect paths outright (belt and braces) rather than rely on browser behavior.
function safeParts(path) {
  const raw = String(path || "");
  if (raw.startsWith("/") || raw.startsWith("~") || raw.startsWith("\\")) throw new Error(`Invalid path "${raw}": paths must be relative to the chosen folder (no leading "/", "\\" or "~")`);
  const parts = raw.split(/[\\/]/).map((p) => p.trim()).filter((p) => p && p !== ".");
  if (parts.includes("..")) throw new Error(`Invalid path "${raw}": ".." segments are not allowed`);
  return parts;
}

// Resolve a "/"-separated relative path to a directory handle (and the final leaf name).
async function resolveParent(path, create = false) {
  const parts = safeParts(path);
  if (!parts.length) return { dir: root, leaf: "" };
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create });
  return { dir, leaf: parts[parts.length - 1] };
}

export async function listDir(path = "") {
  if (!root) throw new Error("No folder selected");
  let dir = root;
  const parts = safeParts(path);
  for (const part of parts) dir = await dir.getDirectoryHandle(part);
  const out = [];
  for await (const [name, handle] of dir.entries()) out.push({ name, type: handle.kind === "directory" ? "dir" : "file" });
  out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
  return out;
}

export async function readFile(path) {
  if (!root) throw new Error("No folder selected");
  const { dir, leaf } = await resolveParent(path);
  const fh = await dir.getFileHandle(leaf);
  const file = await fh.getFile();
  return await file.text();
}

export async function writeFile(path, content) {
  if (!root) throw new Error("No folder selected");
  const { dir, leaf } = await resolveParent(path, true);
  const fh = await dir.getFileHandle(leaf, { create: true });
  const w = await fh.createWritable();
  await w.write(content ?? "");
  await w.close();
  return true;
}

// Binary I/O (base64) for non-text files like .xlsx — used by the in-browser Python runner.
export async function readBinaryB64(path) {
  if (!root) throw new Error("No folder selected");
  const { dir, leaf } = await resolveParent(path);
  const fh = await dir.getFileHandle(leaf);
  const buf = new Uint8Array(await (await fh.getFile()).arrayBuffer());
  let str = ""; const CH = 0x8000; for (let i = 0; i < buf.length; i += CH) str += String.fromCharCode.apply(null, buf.subarray(i, i + CH));
  return btoa(str);
}
export async function writeBinaryB64(path, b64) {
  if (!root) throw new Error("No folder selected");
  const { dir, leaf } = await resolveParent(path, true);
  const bin = atob(b64 || ""); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  const fh = await dir.getFileHandle(leaf, { create: true });
  const w = await fh.createWritable(); await w.write(u); await w.close();
  return true;
}

// Replace the first occurrence of `find` with `replace` in a file (errors if not found / not unique-ish).
export async function editFile(path, find, replace) {
  const text = await readFile(path);
  const i = text.indexOf(find);
  if (i === -1) throw new Error("text to replace was not found in " + path);
  const next = text.slice(0, i) + replace + text.slice(i + find.length);
  await writeFile(path, next);
  return true;
}

export async function deleteFile(path) {
  if (!root) throw new Error("No folder selected");
  const { dir, leaf } = await resolveParent(path);
  await dir.removeEntry(leaf);
  return true;
}

// Recursively list file paths (skips node_modules/.git and other dot-dirs). Capped for safety.
export async function walk(maxFiles = 4000) {
  if (!root) throw new Error("No folder selected");
  const out = [];
  async function rec(dir, prefix) {
    for await (const [name, h] of dir.entries()) {
      if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue;
      const path = prefix ? prefix + "/" + name : name;
      if (h.kind === "directory") { if (out.length < maxFiles) await rec(h, path); }
      else out.push(path);
      if (out.length >= maxFiles) return;
    }
  }
  await rec(root, "");
  return out;
}

const TEXT_EXT = /\.(js|jsx|ts|tsx|mjs|cjs|css|scss|html|htm|json|md|txt|py|java|c|h|cpp|cs|go|rb|php|vue|svelte|yml|yaml|sh|xml|sql|toml|ini|env)$/i;

// Search text across files (text files only). Returns [{path, line, text}].
export async function search(query, maxMatches = 100) {
  if (!root || !query) return [];
  const q = query.toLowerCase();
  const files = await walk();
  const out = [];
  for (const path of files) {
    if (out.length >= maxMatches) break;
    if (!TEXT_EXT.test(path)) continue;
    let text; try { text = await readFile(path); } catch { continue; }
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(q)) { out.push({ path, line: i + 1, text: lines[i].trim().slice(0, 200) }); if (out.length >= maxMatches) break; }
    }
  }
  return out;
}
