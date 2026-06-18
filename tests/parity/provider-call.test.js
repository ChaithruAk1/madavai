import { describe, it, expect } from "vitest";
import { completeOnce } from "../../server/provider-call.mjs";

function mockFetch(cap, response, ok = true, status = 200) {
  return async (url, opts) => { cap.url = url; cap.opts = opts; cap.body = JSON.parse(opts.body); return { ok, status, json: async () => response, text: async () => JSON.stringify(response) }; };
}

describe("provider-call completeOnce (S3b) — one non-streaming completion -> text", () => {
  it("openai-ish: posts /chat/completions, stream:false, parses choices[0].message.content", async () => {
    const cap = {};
    const out = await completeOnce({ kind: "openai", baseUrl: "https://openrouter.ai/api/v1", apiKey: "K", model: "x:free", prompt: "hi", fetchImpl: mockFetch(cap, { choices: [{ message: { content: "hello" } }] }) });
    expect(out).toBe("hello");
    expect(cap.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(cap.body.stream).toBe(false);
    expect(cap.body.max_tokens).toBe(2000);
    expect(cap.body.messages).toEqual([{ role: "user", content: "hi" }]);
    expect(cap.opts.headers.Authorization).toBe("Bearer K");
  });
  it("openai-ish: appends /v1 when baseUrl lacks it", async () => {
    const cap = {};
    await completeOnce({ kind: "openai", baseUrl: "https://api.example.com", apiKey: "K", model: "m", prompt: "p", fetchImpl: mockFetch(cap, { choices: [{ message: { content: "x" } }] }) });
    expect(cap.url).toBe("https://api.example.com/v1/chat/completions");
  });
  it("anthropic: posts /v1/messages, parses content[].text, sends version header", async () => {
    const cap = {};
    const out = await completeOnce({ kind: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "K", model: "claude", prompt: "hi", fetchImpl: mockFetch(cap, { content: [{ type: "text", text: "ans" }] }) });
    expect(out).toBe("ans");
    expect(cap.url).toBe("https://api.anthropic.com/v1/messages");
    expect(cap.opts.headers["x-api-key"]).toBe("K");
    expect(cap.opts.headers["anthropic-version"]).toBe("2023-06-01");
  });
  it("throws on non-OK upstream (surfaces status)", async () => {
    await expect(completeOnce({ kind: "openai", baseUrl: "https://api.openai.com/v1", apiKey: "K", model: "m", prompt: "p", fetchImpl: mockFetch({}, { error: "nope" }, false, 401) })).rejects.toThrow(/401/);
  });
  it("requires model + prompt", async () => {
    await expect(completeOnce({ kind: "openai", baseUrl: "https://x/v1", model: "", prompt: "p", fetchImpl: async () => ({}) })).rejects.toThrow(/model/);
    await expect(completeOnce({ kind: "openai", baseUrl: "https://x/v1", model: "m", prompt: "", fetchImpl: async () => ({}) })).rejects.toThrow(/prompt/);
  });
});
