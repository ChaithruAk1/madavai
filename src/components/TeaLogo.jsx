// Reusable animated tea-cup logo (steam rises). Drop it anywhere for brand cohesion.
export default function TeaLogo({ size = 22, color = "#9fb0ff" }) {
  return (
    <svg className="tea-logo" viewBox="0 0 28 28" width={size} height={size} aria-hidden="true">
      <g className="steam" stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none">
        <path d="M10 7.5c-1.3-1.2 1.3-2.4 0-3.7" />
        <path d="M14 7.5c-1.3-1.2 1.3-2.4 0-3.7" />
        <path d="M18 7.5c-1.3-1.2 1.3-2.4 0-3.7" />
      </g>
      <path d="M5 11h13.5v4.6A5.4 5.4 0 0 1 13.1 21h-2.7A5.4 5.4 0 0 1 5 15.6V11z" fill={color} />
      <path d="M18.5 12.2h2.1a2.5 2.5 0 0 1 0 5H18.5" fill="none" stroke={color} strokeWidth="1.6" />
      <path d="M6.5 23.2h11" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
