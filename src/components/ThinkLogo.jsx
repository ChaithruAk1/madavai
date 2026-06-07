// BrainEdge mark — a firing synapse: a central node with radiating spokes to
// six satellite nodes that pulse in sequence, plus an expanding "firing" ring.
// Reusable at any size; scales cleanly down to the chat avatar.
// Colors are CSS-driven (.think-logo classes) so the mark follows the chosen accent.
export default function ThinkLogo({ size = 22, animated = true }) {
  const pts = [
    [25, 16], [20.5, 23.8], [11.5, 23.8], [7, 16], [11.5, 8.2], [20.5, 8.2],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="think-logo" aria-hidden="true">
      {/* expanding "firing" ring — only when animated (static base is invisible) */}
      {animated && (
        <circle className="tl-ring" cx="16" cy="16" r="4" fill="none" strokeWidth="1.2" opacity="0">
          <animate attributeName="r" values="4;13" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;0" dur="2.4s" repeatCount="indefinite" />
        </circle>
      )}

      {/* spokes flicker as the synapse fires */}
      {pts.map(([x, y], i) => (
        <line className="tl-line" key={"s" + i} x1="16" y1="16" x2={x} y2={y} strokeWidth="1.5" strokeLinecap="round" opacity="0.55">
          {animated && <animate attributeName="opacity" values="0.3;0.9;0.3" dur="1.8s" begin={`${i * 0.18}s`} repeatCount="indefinite" />}
        </line>
      ))}

      {/* satellite nodes — all pulse, two glow with the secondary accent */}
      {pts.map(([x, y], i) => (
        <circle className={i % 3 === 0 ? "tl-accent" : "tl-main"} key={"n" + i} cx={x} cy={y} r="1.9">
          {animated && <animate attributeName="r" values="1.5;2.8;1.5" dur="1.8s" begin={`${i * 0.18}s`} repeatCount="indefinite" />}
          {animated && <animate attributeName="opacity" values="0.45;1;0.45" dur="1.8s" begin={`${i * 0.18}s`} repeatCount="indefinite" />}
        </circle>
      ))}

      {/* core, gently breathing */}
      <circle className="tl-main" cx="16" cy="16" r="3.2">
        {animated && <animate attributeName="r" values="3;3.9;3" dur="2.4s" repeatCount="indefinite" />}
      </circle>
    </svg>
  );
}
