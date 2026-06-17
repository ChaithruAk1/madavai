import { describe, it, expect } from "vitest";
import {
  CAPABILITIES, CAPABILITY_IDS, WEB_STATUS,
  getCapability, webStatus, isAvailableOnWeb, webMessage, isValidStatus,
} from "../../src/bridge/webCapabilities.js";

describe("web capability manifest", () => {
  it("every capability has a valid status, a label, and a string message", () => {
    expect(CAPABILITY_IDS.length).toBeGreaterThan(0);
    for (const id of CAPABILITY_IDS) {
      const c = CAPABILITIES[id];
      expect(isValidStatus(c.status), `${id} status`).toBe(true);
      expect(typeof c.label).toBe("string");
      expect(c.label.length).toBeGreaterThan(0);
      expect(typeof c.message).toBe("string");
    }
  });

  it("non-parity capabilities carry a user-facing message (no silent degrade)", () => {
    for (const id of CAPABILITY_IDS) {
      const c = CAPABILITIES[id];
      if (c.status !== WEB_STATUS.PARITY) {
        expect(c.message.length, `${id} must explain itself`).toBeGreaterThan(0);
      }
    }
  });

  it("accessors behave", () => {
    expect(getCapability("does.not.exist")).toBe(null);
    expect(webStatus("exec.shell")).toBe(WEB_STATUS.DESKTOP_ONLY);
    expect(isAvailableOnWeb("exec.shell")).toBe(false);    // desktop-only
    expect(isAvailableOnWeb("exec.python")).toBe(true);    // parity
    expect(isAvailableOnWeb("mcp.connectors")).toBe(true); // service
    expect(webMessage("file.openInApp").length).toBeGreaterThan(0);
    expect(isValidStatus("nonsense")).toBe(false);
  });
});
