import { describe, it, expect } from "vitest";
import { searchWeb, pickProvider, parseDuckResults, formatResults } from "../../core/search.js";

// URL-aware mock: provider endpoints return JSON; DuckDuckGo returns HTML text.
const ddgHtml = '<a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnews.com%2Fa">DDG Title</a>';
const mk = ({ provJson, provOk = true, html = ddgHtml } = {}) => async (url) => {
  if (/duckduckgo/.test(url)) return { ok: true, status: 200, text: async () => html, json: async () => ({}) };
  return { ok: provOk, status: provOk ? 200 : 401, json: async () => provJson || {}, text: async () => "" };
};

describe("core/search — ONE complete backend (provider → DuckDuckGo)", () => {
  it("pickProvider chooses by key / explicit", () => {
    expect(pickProvider({})).toBe("duckduckgo");
    expect(pickProvider({ tavilyKey: "k" })).toBe("tavily");
    expect(pickProvider({ provider: "serper", tavilyKey: "k" })).toBe("serper");
  });

  it("Tavily results when the key works", async () => {
    const r = await searchWeb("space", { fetchImpl: mk({ provJson: { results: [{ title: "T", url: "https://a.com", content: "c" }] } }), cfg: { tavilyKey: "k" } });
    expect(r).toEqual([{ title: "T", url: "https://a.com", content: "c" }]);
  });

  it("Serper (Google) mapping", async () => {
    const r = await searchWeb("space", { fetchImpl: mk({ provJson: { organic: [{ title: "G", link: "https://g.com", snippet: "s" }] } }), cfg: { serperKey: "k" } });
    expect(r).toEqual([{ title: "G", url: "https://g.com", content: "s" }]);
  });

  it("falls back to DuckDuckGo when there is NO key", async () => {
    const r = await searchWeb("space", { fetchImpl: mk({}), cfg: {} });
    expect(r).toEqual([{ title: "DDG Title", url: "https://news.com/a", content: "" }]);
  });

  it("falls back to DuckDuckGo when the provider ERRORS (e.g. out of credits)", async () => {
    const r = await searchWeb("space", { fetchImpl: mk({ provOk: false }), cfg: { tavilyKey: "k" } });
    expect(r).toEqual([{ title: "DDG Title", url: "https://news.com/a", content: "" }]);
  });

  it("parseDuckResults decodes the real target URL", () => {
    expect(parseDuckResults(ddgHtml)).toEqual([{ title: "DDG Title", url: "https://news.com/a", content: "" }]);
  });

  it("formatResults shows the REAL url + a no-results message", () => {
    expect(formatResults([{ title: "H", url: "https://x.com/a", content: "b" }], "s")).toContain("https://x.com/a");
    expect(formatResults([], "s")).toContain("no web results");
  });
});
