export function installMockFetch() {
  globalThis.fetch = async (input, _init) => {
    const url = String(input);
    if (url.includes("serper")) {
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({
        organic: [
          { title: "RAG - Wikipedia", link: "https://en.wikipedia.org/wiki/RAG", snippet: "retrieval augmented generation grounds models with sources" },
          { title: "Dup", link: "https://en.wikipedia.org/wiki/RAG", snippet: "duplicate link should be removed" },
          { title: "Weather", link: "https://example.com/weather", snippet: "cold in oslo today" },
        ],
      }) };
    }
    // page fetch for extraction
    return { ok: true, headers: { get: () => "text/html" },
      text: async () => "<html><body><p>Retrieval augmented generation grounds models with fresh sources.</p></body></html>" };
  };
}
