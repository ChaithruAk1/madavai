// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// MadavLogo — the "Madav" circuit-trace wordmark from the USER-SUPPLIED image.
// madav-logo1.png (repo root) = the owner's original, untouched. madav-logo1-tight.png
// = same pixels with the empty transparent margins cropped off (the original is ~70%
// padding, which would render the wordmark at half size in the top bar). Artwork itself
// is unmodified. (Earlier assets: madav-logo.png.jpeg dark-bg; /madav-logo.svg recreation.)
import logoUrl from "../../madav-logo1-tight.png";

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
