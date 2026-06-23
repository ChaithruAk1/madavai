// © 2026. Sage/Sara photo avatars — owner-supplied illustrations, APPENDED to the drawn-face gallery
// (the procedural faces stay; these are added). Resized copies live in src/assets/sage/ and are bundled
// by Vite. Each entry carries an `img` URL; SageFace renders it as a photo when present. Defined ONCE
// here so SageDock.jsx and Agents.jsx append the SAME looks -> the saved look index maps to the same
// face on every surface (the two galleries must stay identical).
const _imgs = import.meta.glob("../assets/sage/*.png", { eager: true, import: "default" });
export const SAGE_IMG_LOOKS = Object.entries(_imgs)
  .map(([p, url]) => {
    const file = p.split("/").pop();                 // "Sage-1.png" | "Sara-3.png"
    const female = /^sara/i.test(file);
    const n = parseInt((file.match(/(\d+)/) || ["", "0"])[1], 10) || 0;
    return { label: (female ? "Sara" : "Sage") + " — portrait " + n, img: url, female, _k: (female ? 1000 : 0) + n };
  })
  .sort((a, b) => a._k - b._k);

// User-uploaded avatars (added via the "+" in Sage's face picker). Stored as small data-URLs in
// localStorage so they persist across reloads and show on both Sage surfaces.
export function loadCustomLooks() {
  try { const a = JSON.parse(localStorage.getItem("be.sage.custom") || "[]"); return Array.isArray(a) ? a : []; } catch { return []; }
}
export function saveCustomLooks(list) {
  try { localStorage.setItem("be.sage.custom", JSON.stringify(Array.isArray(list) ? list : [])); } catch {}
}
