// Minimal electron stub so main-process .cjs modules can be imported in node tests.
import os from "os";
import path from "path";
import fs from "fs";

const dir = path.join(os.tmpdir(), "brainedge-test");
try { fs.mkdirSync(dir, { recursive: true }); } catch {}

export const app = { getPath: () => dir };
export const ipcMain = { handle: () => {}, on: () => {} };
export const dialog = {};
export const shell = { openExternal: () => {} };
export class BrowserWindow {}
export default { app, ipcMain, dialog, shell, BrowserWindow };
