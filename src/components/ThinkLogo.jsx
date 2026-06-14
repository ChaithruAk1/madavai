// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// ThinkLogo — Madav's avatar / brand mark. Now renders the owner's "M" monogram (MadavMark,
// from madav-m.png) instead of the old synapse spark, so the M logo shows everywhere this mark
// appears (chat avatar, brand spots, etc.). Same (size) API as before, so every call site works
// unchanged. (The previous `animated` prop is accepted but ignored — MadavMark has its own
// subtle breathing animation via the .mm class.)
import MadavMark from "./MadavMark.jsx";

export default function ThinkLogo({ size = 22 }) {
  return <MadavMark size={size} />;
}
