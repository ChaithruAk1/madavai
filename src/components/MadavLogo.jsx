// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// MadavLogo — the "Madav" wordmark from the USER-SUPPLIED image (madav-logo2.png, repo root).
// Owner-supplied artwork, rendered unmodified. Pass `tagline` to show "built to think with you."
// beneath it; its colour is theme-aware (white on dark, brand blue #0849F8 on light) via
// .madav-tagline in styles.css — ONE definition, used on the splash and the top bar.
import logoUrl from "../../madav-logo2.png";

export default function MadavLogo({ height = 32, title = "Madav", tagline = false }) {
  const img = (
    <img
      src={logoUrl}
      height={height}
      alt={title}
      style={{ display: "block", width: "auto" }}
      draggable={false}
    />
  );
  if (!tagline) return img;
  return (
    <span className="madav-logo-stack">
      {img}
      <span className="madav-tagline">built to think with you.</span>
    </span>
  );
}
