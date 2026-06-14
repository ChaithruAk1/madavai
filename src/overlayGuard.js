// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// GLOBAL OVERLAY GUARD — keeps every floating menu / flyout / popover inside the viewport.
// One MutationObserver watches for these elements appearing anywhere in the app and clamps them so
// they can never extend past the top, bottom, left or right edge. This makes "stay on screen" an
// automatic, app-wide behavior instead of a per-component fix.
//
// How it clamps, in order: (1) cap the element's size to the viewport so an over-tall/wide menu
// scrolls internally instead of overflowing; (2) measure where it actually sits and nudge it back on
// screen using MARGINS (not transform — so it never fights the pop-in scale/translate animation).
// It's idempotent (resets its own adjustments each pass) and cheap (text-node DOM churn from
// streaming is skipped; it only acts when an actual menu element is added).

// The floating surfaces in Madav. Add a class here (or put `mad-pop` on a new overlay) and it's covered.
const SEL = ".plus-menu, .plus-fly, .plus-sub, .model-menu, .slash-menu, .msg-menu, .hd-pop, .sb-acct-menu, .plus-flyout, .mad-pop";
const M = 8; // viewport breathing margin

function clampInViewport(el) {
  if (!el || !el.isConnected) return;
  try {
    const vw = window.innerWidth, vh = window.innerHeight;
    // 1) reset our previous nudges so re-clamping is idempotent
    el.style.marginTop = ""; el.style.marginLeft = "";
    // 2) cap size to the viewport (menu scrolls internally rather than overflowing)
    const maxH = vh - 2 * M, maxW = vw - 2 * M;
    let r = el.getBoundingClientRect();
    if (r.height > maxH) { el.style.maxHeight = maxH + "px"; if (getComputedStyle(el).overflowY === "visible") el.style.overflowY = "auto"; }
    if (r.width > maxW) { el.style.maxWidth = maxW + "px"; if (getComputedStyle(el).overflowX === "visible") el.style.overflowX = "auto"; }
    // 3) re-measure and nudge any overflowing edge back inside, via margins
    r = el.getBoundingClientRect();
    let dx = 0, dy = 0;
    if (r.right > vw - M) dx = (vw - M) - r.right;
    if (r.left + dx < M) dx = M - r.left;       // left wins if both overflow (small screens)
    if (r.bottom > vh - M) dy = (vh - M) - r.bottom;
    if (r.top + dy < M) dy = M - r.top;          // top wins if both overflow
    if (dx) el.style.marginLeft = Math.round(dx) + "px";
    if (dy) el.style.marginTop = Math.round(dy) + "px";
  } catch { /* never let a clamp throw into the app */ }
}

// Clamp after layout settles (two rAFs: lets the open animation/flyout positioning run first).
function clampSoon(el) { requestAnimationFrame(() => requestAnimationFrame(() => clampInViewport(el))); }

let started = false;
export function startOverlayGuard() {
  if (started || typeof document === "undefined" || !document.body) return;
  started = true;
  const handle = (node) => {
    if (!(node instanceof HTMLElement)) return; // skip text nodes (streaming churn) — cheap
    if (node.matches && node.matches(SEL)) clampSoon(node);
    if (node.querySelector && node.querySelector(SEL)) node.querySelectorAll(SEL).forEach(clampSoon);
  };
  const mo = new MutationObserver((muts) => { for (const m of muts) for (const n of m.addedNodes) handle(n); });
  mo.observe(document.body, { childList: true, subtree: true });
  // Re-clamp whatever is open when the window resizes.
  let rt = 0;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => document.querySelectorAll(SEL).forEach(clampInViewport), 60); });
}
