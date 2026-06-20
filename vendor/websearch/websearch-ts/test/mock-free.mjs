export function installMockFetch() {
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("serper")) {
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({
        organic: [{ title: "G", link: "https://google-result.com/a", snippet: "google grade snippet" }] }) };
    }
    if (url.includes("fake-searxng")) {
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({
        results: [{ title: "F", url: "https://free-result.org/a", content: "free tier snippet" }] }) };
    }
    return { ok: true, headers: { get: () => "text/html" }, text: async () => "<html><body><p>page text</p></body></html>" };
  };
}
