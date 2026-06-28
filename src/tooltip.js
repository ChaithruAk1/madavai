// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// ONE global tooltip engine. Makes every native `title` (and any [data-tip]) appear INSTANTLY and
// consistently — no ~1s OS delay — app-wide, web + desktop, with zero per-component changes. This is
// the single source for hover/focus hints: change the timing or look here and it updates everywhere.
let tipEl = null, started = false, showTimer = 0, active = null;
const SHOW_DELAY = 110;                 // fast, but no flicker on pass-through
const SEL = "[title], [data-tip]";

function ensure() {
  if (tipEl) return tipEl;
  tipEl = document.createElement("div");
  tipEl.className = "mad-tip";
  tipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tipEl);
  return tipEl;
}
function place(target) {
  const t = ensure(), r = target.getBoundingClientRect(), tr = t.getBoundingClientRect();
  const M = 8, vw = window.innerWidth, vh = window.innerHeight;
  let top = r.bottom + 7;
  if (top + tr.height > vh - M) top = r.top - 7 - tr.height;       // flip above if no room below
  if (top < M) top = M;
  let left = Math.max(M, Math.min(r.left + r.width / 2 - tr.width / 2, vw - tr.width - M));
  t.style.top = Math.round(top) + "px";
  t.style.left = Math.round(left) + "px";
}
function show(target, text) {
  const t = ensure();
  t.textContent = text;
  t.style.display = "block";
  place(target);
  requestAnimationFrame(() => t.classList.add("on"));
}
function hide() {
  clearTimeout(showTimer);
  if (tipEl) { tipEl.classList.remove("on"); tipEl.style.display = "none"; }
  if (active && active.hasAttribute("data-tip-title")) {           // restore native title for a11y
    active.setAttribute("title", active.getAttribute("data-tip-title"));
    active.removeAttribute("data-tip-title");
  }
  active = null;
}
function arm(node) {
  const text = node.getAttribute("data-tip") || node.getAttribute("title");
  if (!text) return;
  if (node.hasAttribute("title")) {                                // suppress the slow OS tooltip
    node.setAttribute("data-tip-title", node.getAttribute("title"));
    node.removeAttribute("title");
  }
  active = node;
  clearTimeout(showTimer);
  showTimer = setTimeout(() => { if (active === node && node.isConnected) show(node, text); }, SHOW_DELAY);
}
export function startTooltips() {
  if (started || typeof document === "undefined") return;
  started = true;
  document.addEventListener("mouseover", (e) => {
    const node = e.target && e.target.closest && e.target.closest(SEL);
    if (!node || node === active) return;
    if (active) hide();
    arm(node);
  });
  document.addEventListener("mouseout", (e) => {
    if (!active) return;
    const to = e.relatedTarget;
    if (to && active.contains && active.contains(to)) return;       // still inside same target
    hide();
  });
  document.addEventListener("focusin", (e) => {
    const node = e.target && e.target.closest && e.target.closest(SEL);
    if (node) { if (active) hide(); arm(node); }
  });
  document.addEventListener("focusout", hide);
  window.addEventListener("scroll", hide, true);
  document.addEventListener("click", hide, true);
  window.addEventListener("blur", hide);
}
