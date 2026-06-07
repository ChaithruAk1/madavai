import { describe, it, expect } from "vitest";
import explainer from "../../electron/error-explainer.cjs";

const { signature } = explainer;

describe("error-explainer signature", () => {
  it("collapses volatile numbers/ids/urls so the same error class maps to one key", () => {
    const a = signature('OpenAI-compatible 404: {"error":{"message":"No endpoints found that support image input","code":404}}');
    const b = signature('OpenAI-compatible 500: {"error":{"message":"No endpoints found that support image input","code":500}}');
    expect(a).toBe(b);
  });

  it("ignores request ids / hashes and urls", () => {
    const a = signature("rate limited req_9f8e7d6c5b4a at https://api.example.com/v1/chat");
    const b = signature("rate limited req_0011223344ff at https://api.other.com/v1/chat");
    expect(a).toBe(b);
  });

  it("distinguishes genuinely different errors", () => {
    expect(signature("invalid api key")).not.toBe(signature("model not found"));
  });

  it("returns a trimmed, bounded key", () => {
    const s = signature("X".repeat(500));
    expect(s.length).toBeLessThanOrEqual(140);
  });
});
