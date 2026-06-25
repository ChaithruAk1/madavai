// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// MadavMark — the M monogram from the USER-SUPPLIED image (madav-m2.png, repo root); owner artwork, unmodified.
// Used where a square mark fits better than the full wordmark (hero greeting).
// Animation (.mm in styles.css): soft fade-in, then a gentle breathing float.
// prefers-reduced-motion renders it static.
import mUrl from "../../madav-m2.png";

export default function MadavMark({ size = 40, title = "Madav" }) {
  return (
    <img
      className="mm"
      src={mUrl}
      width={size}
      height={size}
      alt={title}
      draggable={false}
      style={{ flex: "none", display: "block" }}
    />
  );
}
