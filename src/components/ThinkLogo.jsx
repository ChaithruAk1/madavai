// Thinkflux mark — a firing synapse: a central node with radiating spokes to
// six satellite nodes, two of which pulse (the "flux"). Reusable at any size;
// scales cleanly down to the 17px chat avatar.
export default function ThinkLogo({ size = 22, color = "#9fb0ff", accent = "#38e8d0" }) {
  const pts = [
    [25, 16], [20.5, 23.8], [11.5, 23.8], [7, 16], [11.5, 8.2], [20.5, 8.2],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className="think-logo" aria-hidden="true">
      {pts.map(([x, y], i) => (
        <line key={"s" + i} x1="16" y1="16" x2={x} y2={y} stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      ))}
      {pts.map(([x, y], i) => (
        <circle key={"n" + i} cx={x} cy={y} r="1.7" fill={i % 3 === 0 ? accent : color}>
          {i % 3 === 0 && (
            <animate attributeName="opacity" values="1;0.35;1" dur="2.2s" begin={`${i * 0.25}s`} repeatCount="indefinite" />
          )}
        </circle>
      ))}
      <circle cx="16" cy="16" r="3" fill={color} />
    </svg>
  );
}
