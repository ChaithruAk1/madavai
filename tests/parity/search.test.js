import { describe, it, expect } from "vitest";
import { webSearch, pickProvider, formatResults } from "../../core/search.js";

const mockFetch = (json, ok = true, status = 200) => async () => ({ ok, status, json: async () => json });

describe("core/search — provider-agnostic web search (single source)", () => {
  it("pickProvider: chooses by key, honours explicit provider", () => {
    expect(pickProvider({})).toBe("duckduckgo");
    expect(pickProvider({ tavilyKey: "k" })).toBe("tavily");
    expect(pickProvider({ serperKey: "k" })).toBe("serper");
    expect(pickProvider({ braveKey: "k" })).toBe("brave");
    expect(pickProvider({ provider: "serper", tavilyKey: "k" })).toBe("serper");
  });

  it("returns null when no provider key (caller falls back to DuckDuckGo)", async () => {
    const r = await webSearch("space news", { fetchImpl: mockFetch({}), cfg: {} });
    expect(r).toBe(null);
  });

  it("Tavily: parses to unified {title,url,content}", async () => {
    const r = await webSearch("space", { fetchImpl: mockFetch({ results: [{ title: "T", url: "https://a.com", content: "snip" }] }), cfg: { tavilyKey: "k" } });
    expect(r).toEqual([{ title: "T", url: "https://a.com", content: "snip" }]);
  });

  it("Serper (Google): organic.link -> url, snippet -> content", async () => {
    const r = await webSearch("space", { fetchImpl: mockFetch({ organic: [{ title: "G", link: "https://g.com", snippet: "s" }] }), cfg: { serperKey: "k" } });
    expect(r).toEqual([{ title: "G", url: "https://g.com", content: "s" }]);
  });

  it("Brave: web.results.description -> content", async () => {
    const r = await webSearch("space", { fetchImpl: mockFetch({ web: { results: [{ title: "B", url: "https://b.com", description: "d" }] } }), cfg: { braveKey: "k" } });
    expect(r).toEqual([{ title: "B", url: "https://b.com", content: "d" }]);
  });

  it("throws on a provider HTTP error so the caller can fall back", async () => {
    await expect(webSearch("x", { fetchImpl: mockFetch({}, false, 401), cfg: { tavilyKey: "k" } })).rejects.toThrow();
  });

  it("formatResults shows the REAL url + title (what the model cites)", () => {
    const t = formatResults([{ title: "Headline", url: "https://x.com/a", content: "body text" }], "space");
    expect(t).toContain("https://x.com/a");
    expect(t).toContain("Headline");
  });
});
