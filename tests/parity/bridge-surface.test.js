import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../src/bridge/webBridge.js"), "utf8");

// The contract core + high-traffic methods the renderer relies on. If a refactor removes one,
// this fails before web silently loses a capability. (Static text check — webBridge imports
// browser globals, so we don't execute it here.)
const REQUIRED = [
  "start", "sendInput", "interrupt", "onEvent",
  "getSettings", "saveSettings", "listModels",
  "listSessions", "getSession", "authMe", "listCheckpoints",
  "listTasks", "createTask", "updateTask", "deleteTask", "getRuns", "runTaskNow", // S4: scheduled tasks
  "getAgentMemory", "setAgentMemory", "clearAgentMemory", "getAgentHistory", "getAgentStats",
  "listAgentVersions", "snapshotAgentVersion", "exportAgent", "importAgent", // Agent Ops (A2)
];

describe("web bridge surface", () => {
  for (const m of REQUIRED) {
    it(`webBridge defines ${m}()`, () => {
      const re = new RegExp(`(^|[^A-Za-z0-9_])${m}\\s*\\(`, "m");
      expect(re.test(src)).toBe(true);
    });
  }
});
