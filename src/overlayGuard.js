// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// GLOBAL OVERLAY GUARD — keeps every floating menu / flyout / popover inside the viewport.
// One MutationObserver watches for these elements appearing anywhere in the app and clamps them so
// they can never extend past the top, bottom, left or right edge — current overlays and any future
// ones. App-wide, automatic, instead of a per-component fix.
//
// How it clamps: (1) cap the element's size to the viewport so an over-tall/wide menu scrolls
// internally; (2) work out the fitted on-screen position; (3) move it there by setting top/left
// RELATIVE TO ITS OFFSET PARENT (computed from getBoundingClientRect, which already accounts for any
// ancestor transforms/animations — so this is robust where margin- or transform-nudging is not).
// Idempotent (remembers + restores its own changes), cheap (text-node churn from streaming is
// skipped), and never throws into the app.

// Floating surfaces. Add a class here, or put `mad-pop` on a new overlay, and it's covered.
const SEL = ".plus-menu, .plus-fly, .plus-sub, .model-menu, .slash-menu, .msg-menu, .hd-pop, .sb-acct-menu, .mad-pop";
const M = 8; // viewport breathing margin

function clampInViewport(el) {
  if (!el || !el.isConnected) return;
  try {
    const vw = window.innerWidth, vh = window.innerHeight;
    // Undo any previous clamp so re-clamping (resize / re-open) starts clean.
    if (el.dataset.ogClamped) {
      el.style.top = el.dataset.ogTop || ""; el.style.left = el.dataset.ogLeft || "";
      el.style.right = el.dataset.ogRight || ""; el.style.bottom = el.dataset.ogBottom || "";
      el.style.maxHeight = el.dataset.ogMaxh || ""; el.style.maxWidth = el.dataset.ogMaxw || "";
      delete el.dataset.ogClamped;
    }
    // 1) cap size to the viewport (so it scrolls instead of overflowing)
    let r = el.getBoundingClientRect();
    let sizedH = el.style.maxHeight, sizedW = el.style.maxWidth;
    if (r.height > vh - 2 * M) { sizedH = (vh - 2 * M) + "px"; if (getComputedStyle(el).overflowY === "visible") el.style.overflowY = "auto"; }
    if (r.width > vw - 2 * M) { sizedW = (vw - 2 * M) + "px"; if (getComputedStyle(el).overflowX === "visible") el.style.overflowX = "auto"; }
    if (sizedH !== el.style.maxHeight) el.style.maxHeight = sizedH;
    if (sizedW !== el.style.maxWidth) el.style.maxWidth = sizedW;
    // 2) does it overflow any edge now?
    r = el.getBoundingClientRect();
    const overflow = r.top < M || r.left < M || r.bottom > vh - M || r.right > vw - M;
    if (!overflow) return; // already fully on-screen → leave it (keeps its open animation)
    // 3) fitted viewport position, then expressed relative to the offset parent
    let vTop = r.top, vLeft = r.left;
    if (vTop + r.height > vh - M) vTop = vh - M - r.height;
    if (vTop < M) vTop = M;
    if (vLeft + r.width > vw - M) vLeft = vw - M - r.width;
    if (vLeft < M) vLeft = M;
    const op = el.offsetParent; // null for position:fixed → coords are already viewport-relative
    const opr = op ? op.getBoundingClientRect() : { top: 0, left: 0 };
    el.dataset.ogTop = el.style.top; el.dataset.ogLeft = el.style.left;
    el.dataset.ogRight = el.style.right; el.dataset.ogBottom = el.style.bottom;
    el.dataset.ogMaxh = el.dataset.ogMaxh || el.style.maxHeight; el.dataset.ogMaxw = el.dataset.ogMaxw || el.style.maxWidth;
    el.dataset.ogClamped = "1";
    el.style.top = Math.round(vTop - opr.top) + "px";
    el.style.left = Math.round(vLeft - opr.left) + "px";
    el.style.bottom = "auto"; el.style.right = "auto";
  } catch { /* never let a clamp throw into the app */ }
}

// Clamp after layout settles (rAF lets the flyout's own positioning run first), then once more a
// beat later to catch the pop-in animation finishing.
function clampSoon(el) {
  requestAnimationFrame(() => { clampInViewport(el); setTimeout(() => clampInViewport(el), 180); });
}

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
