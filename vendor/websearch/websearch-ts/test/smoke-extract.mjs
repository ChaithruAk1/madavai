globalThis.fetch = async () => ({ ok: true, headers: { get: () => "text/html" }, text: async () => `
  <html><head><title>T</title></head><body>
  <nav><a href="/x">NAVJUNK menu home about contact</a></nav>
  <article><h1>Photosynthesis</h1>
  <p>PHOTOSYNTHESIS is the process by which green plants convert sunlight into chemical energy stored in glucose. It occurs in the chloroplasts and involves light-dependent and light-independent reactions across the thylakoid membranes.</p>
  <p>During photosynthesis, plants absorb carbon dioxide and water, using light energy to produce oxygen and sugars that fuel growth and development over time.</p>
  </article>
  <footer>FOOTERJUNK copyright 2026 contact privacy</footer>
  </body></html>` });
const { fetchAndExtract } = await import("../dist/extract.js");
const text = await fetchAndExtract("https://example.com/photo");
if (!text || !/PHOTOSYNTHESIS/i.test(text)) throw new Error("article not extracted: " + text);
if (/NAVJUNK|FOOTERJUNK/.test(text)) throw new Error("boilerplate not stripped -> Readability NOT active");
console.log("[ok] Readability extraction ACTIVE (article kept, nav + footer stripped)");
console.log("EXTRACTION TEST PASSED");
