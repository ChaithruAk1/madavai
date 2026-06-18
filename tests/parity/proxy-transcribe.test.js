import { describe, it, expect } from "vitest";
import fs from "node:fs"; import path from "node:path"; import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.resolve(here, "../../server/auth-server.mjs"), "utf8");
const web = fs.readFileSync(path.resolve(here, "../../src/bridge/webBridge.js"), "utf8");
const routeSeg = src.slice(src.indexOf('p === "/proxy/transcribe"'), src.indexOf('p === "/proxy/transcribe"') + 2400);
const txSeg = web.slice(web.indexOf("async transcribe({ b64, mime }"), web.indexOf("async transcribe({ b64, mime }") + 1400);

describe("voice transcription — /proxy/transcribe (BYO Whisper)", () => {
  it("defines an authed, size-capped, SSRF-allowlisted route that forwards to the Whisper endpoint", () => {
    expect(src).toContain('p === "/proxy/transcribe" && req.method === "POST"');
    expect(routeSeg).toMatch(/verify\(bearer\(req\)\)/);
    expect(routeSeg).toMatch(/isAllowedProxyHost\(baseUrl\)/);
    expect(routeSeg).toMatch(/25 \* 1024 \* 1024/);
    expect(routeSeg).toContain("audio/transcriptions");
    expect(routeSeg).toContain('Authorization: "Bearer " + apiKey');
  });
  it("webBridge.transcribe selects an OpenAI/Groq profile and posts to the proxy", () => {
    expect(txSeg).toContain("openai");
    expect(txSeg).toContain("groq");
    expect(txSeg).toContain("/proxy/transcribe");
    expect(txSeg).toContain("Whisper-capable key");
  });
});
