import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const preload = read("electron/preload.cjs");
const main = read("electron/main.cjs");
const mock = read("src/bridge/mockBridge.js");

const matchAll = (re, str, group = 1) => [...str.matchAll(re)].map((m) => m[group]);

// Channels the renderer asks for, and channels the main process actually handles.
const invoked = new Set(matchAll(/ipcRenderer\.(?:invoke|send)\(\s*["'`]([\w:]+)["'`]/g, preload));
const handled = new Set([
  ...matchAll(/ipcMain\.(?:handle|on)\(\s*["'`]([\w:]+)["'`]/g, main),
]);

// Method names exposed on window.brainedge, and methods implemented by the mock.
const preloadMethods = new Set(matchAll(/^\s{2}([a-zA-Z]\w*):\s*(?:async\s*)?\(/gm, preload));
const mockMethods = new Set([
  ...matchAll(/^\s{2}(?:async\s+)?([a-zA-Z]\w*)\s*\(/gm, mock),
  ...matchAll(/^\s{2}([a-zA-Z]\w*):\s*(?:async\s*)?\(/gm, mock),
]);

// Core methods every bridge must implement (catches drift that breaks the app).
const CORE = [
  "start", "sendInput", "interrupt", "getSettings", "saveSettings", "listModels",
  "listSessions", "getSession", "deleteSession",
  "listSaved", "saveResponse", "updateSaved", "removeSaved",
  "listSkills", "listDir",
];

describe("IPC contract", () => {
  it("every channel the renderer invokes is handled in main", () => {
    const missing = [...invoked].filter((ch) => !handled.has(ch));
    expect(missing, `preload invokes channels with no ipcMain handler: ${missing.join(", ")}`).toEqual([]);
  });

  it("preload exposes all core methods", () => {
    const missing = CORE.filter((m) => !preloadMethods.has(m));
    expect(missing, `preload missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("mock bridge implements all core methods (dev parity)", () => {
    const missing = CORE.filter((m) => !mockMethods.has(m));
    expect(missing, `mockBridge missing: ${missing.join(", ")}`).toEqual([]);
  });
});
