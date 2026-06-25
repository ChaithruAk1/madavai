// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// MadavLogo — the "Madav" wordmark from the USER-SUPPLIED image (madav-logo2.png, repo root).
// Owner-supplied artwork, rendered unmodified.
import logoUrl from "../../madav-logo2.png";

export default function MadavLogo({ height = 32, title = "Madav" }) {
  return (
    <img
      src={logoUrl}
      height={height}
      alt={title}
      style={{ display: "block", width: "auto" }}
      draggable={false}
    />
  );
}
