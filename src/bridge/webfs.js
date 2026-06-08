// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
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

// Resolve a "/"-separated relative path to a directory handle (and the final leaf name).
async function resolveParent(path, create = false) {
  const parts = String(path || "").split("/").map((p) => p.trim()).filter((p) => p && p !== ".");
  if (!parts.length) return { dir: root, leaf: "" };
  let dir = root;
  for (let i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i], { create });
  return { dir, leaf: parts[parts.length - 1] };
}

export async function listDir(path = "") {
  if (!root) throw new Error("No folder selected");
  let dir = root;
  const parts = String(path || "").split("/").map((p) => p.trim()).filter((p) => p && p !== ".");
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

// Replace the first occurrence of `find` with `replace` in a file (errors if not found / not unique-ish).
export async function editFile(path, find, replace) {
  const text = await readFile(path);
  const i = text.indexOf(find);
  if (i === -1) throw new Error("text to replace was not found in " + path);
  const next = text.slice(0, i) + replace + text.slice(i + find.length);
  await writeFile(path, next);
  return true;
}
