import { describe, it, expect } from "vitest";
import { toolsUnsupportedErr } from "../../src/bridge/toolSupport.js";

describe("toolsUnsupportedErr — only DEFINITIVE no-tools signals", () => {
  it("flags clear 'tools unsupported' errors", () => {
    for (const msg of [
      "No endpoints found that support tool use.",                 // OpenRouter
      "400 This model does not support tools",
      "tool calling is not supported by this model",
      "function calling is unsupported for this endpoint",
      "Unknown parameter: tools",
    ]) {
      expect(toolsUnsupportedErr(new Error(msg)), msg).toBe(true);
    }
  });

  it("does NOT flag transient / unrelated errors", () => {
    for (const msg of [
      "Failed to fetch",
      "NetworkError when attempting to fetch resource",
      "429 rate limited",
      "500 Internal Server Error",
      "Connection timed out",
      "The user aborted a request",
      "context length exceeded",
      "",
    ]) {
      expect(toolsUnsupportedErr(new Error(msg)), msg).toBe(false);
    }
  });

  it("handles non-Error inputs safely", () => {
    expect(toolsUnsupportedErr(null)).toBe(false);
    expect(toolsUnsupportedErr(undefined)).toBe(false);
    expect(toolsUnsupportedErr("model does not support tools")).toBe(true);
  });
});
