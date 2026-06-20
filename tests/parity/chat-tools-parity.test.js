import { describe, it, expect } from "vitest";
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { SHARED_CHAT_TOOLS, SHARED_CHAT_TOOL_NAMES, WEB_SEARCH_SCHEMA, WEB_FETCH_SCHEMA, CREATE_IMAGE_SCHEMA, DEEP_RESEARCH_SCHEMA } from "../../core/chat-tools.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

describe("chat tool schemas — ONE source, both surfaces import it (no drift)", () => {
  it("core exposes the four shared chat tools with required params", () => {
    expect(SHARED_CHAT_TOOL_NAMES).toEqual(["web_search", "web_fetch", "create_image", "deep_research"]);
    expect(WEB_SEARCH_SCHEMA.function.parameters.required).toEqual(["query"]);
    expect(WEB_FETCH_SCHEMA.function.parameters.required).toEqual(["url"]);
    expect(CREATE_IMAGE_SCHEMA.function.parameters.required).toEqual(["prompt"]);
    expect(DEEP_RESEARCH_SCHEMA.function.parameters.required).toEqual(["query"]);
    for (const t of SHARED_CHAT_TOOLS) { expect(t.type).toBe("function"); expect(typeof t.function.description).toBe("string"); }
  });
  it("web imports the shared schemas (does not redefine them inline)", () => {
    const web = read("src/bridge/webBridge.js");
    expect(web).toMatch(/from "\.\.\/\.\.\/core\/chat-tools\.js"/);
    // the old inline web_search/web_fetch schema literals must be gone from the chat tool set
    expect(web).not.toMatch(/name: "web_fetch", description: "Fetch a web page and return its readable text/);
  });
  it("desktop imports the shared schemas (does not redefine them inline)", () => {
    const ao = read("electron/agent-openai.cjs");
    expect(ao).toMatch(/core\/chat-tools\.js/);
  });
});
