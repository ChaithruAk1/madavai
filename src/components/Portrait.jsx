// © 2026 Samskruthi Harish. BrainEdge — Proprietary. All rights reserved. See LICENSE.
// Portrait — BrainEdge's living agent faces. Original, procedural SVG portraits:
// every agent gets a deterministic human face (skin tone, hair style + color picked
// from its identity seed) wearing a uniform in its identity color. Moods animate via
// CSS (.pt-* in styles.css): idle blinks and breathes, "working" focuses, "happy" pops.
// No image assets, fully theme-aware, honors prefers-reduced-motion.

const SKINS = ["#f4cda6", "#eab68c", "#d99e6f", "#bd8458", "#96603c", "#6f4528"];
const HAIRC = ["#2c2924", "#4b3625", "#6e4a2a", "#8d8d8d", "#b86f2c", "#1f2a3a"];
const hashS = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

export default function Portrait({ seed = "", color = "var(--accent)", size = 40, mood = "idle", title }) {
  const h = hashS(String(seed));
  const skin = SKINS[h % SKINS.length];
  const hair = HAIRC[(h >> 3) % HAIRC.length];
  const style = (h >> 6) % 5;
  const ink = "#232830";
  const frame = { fill: `color-mix(in srgb, ${color} 15%, transparent)`, stroke: `color-mix(in srgb, ${color} 45%, transparent)` };
  return (
    <svg className={`pt ${mood}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={title || "agent"} style={{ flex: "none" }}>
      {title && <title>{title}</title>}
      <rect x="1" y="1" width="62" height="62" rx="14" style={frame} strokeWidth="1" />
      {/* uniform in the identity color */}
      <path d="M12 63 Q14 45 32 45 Q50 45 52 63 Z" fill={color} opacity="0.85" />
      <path d="M28 46 L32 51 L36 46 Z" fill="#fdfcfa" opacity="0.85" />
      <g className="pt-headg">
        <circle cx="18.5" cy="27" r="2.6" fill={skin} />
        <circle cx="45.5" cy="27" r="2.6" fill={skin} />
        <circle cx="32" cy="26" r="14" fill={skin} />
        {style === 0 && <path d="M18 24 Q18 10 32 10 Q46 10 46 24 Q44 15 32 14.5 Q20 15 18 24 Z" fill={hair} />}
        {style === 1 && <path d="M18 25 Q17 10 33 10 Q47 11 46 22 Q38 12 29 14.5 Q20 16 18 25 Z" fill={hair} />}
        {style === 2 && (
          <g fill={hair}>
            <circle cx="22" cy="15" r="5.2" /><circle cx="32" cy="11.5" r="6" /><circle cx="42" cy="15" r="5.2" />
            <circle cx="18.5" cy="21" r="4" /><circle cx="45.5" cy="21" r="4" />
          </g>
        )}
        {style === 3 && (
          <g fill={hair}>
            <path d="M18.5 23 Q19 11 32 10.5 Q45 11 45.5 23 Q42 14 32 13.8 Q22 14 18.5 23 Z" />
            <circle cx="32" cy="7.5" r="4.2" />
          </g>
        )}
        {style === 4 && <path d="M17.5 38 Q14 10 32 9.5 Q50 10 46.5 38 L42.5 38 Q45.5 16 32 15 Q18.5 16 21.5 38 Z" fill={hair} />}
        <g className="pt-brows" stroke={ink} strokeWidth="1.6" strokeLinecap="round" fill="none">
          <path d="M24.4 21.4 q3 -2 5.6 -0.4" />
          <path d="M34 21 q2.6 -1.6 5.6 0.4" />
        </g>
        <g className="pt-eyes" fill={ink}>
          <circle cx="27.2" cy="25.6" r="1.75" />
          <circle cx="36.8" cy="25.6" r="1.75" />
        </g>
        {mood === "happy" && (
          <g fill="#e88b8b" opacity="0.55">
            <ellipse cx="23.8" cy="29.8" rx="2.5" ry="1.4" />
            <ellipse cx="40.2" cy="29.8" rx="2.5" ry="1.4" />
          </g>
        )}
        {mood === "happy"
          ? <path d="M26.8 31 Q32 37.6 37.2 31 Q32 33.6 26.8 31 Z" fill="#5b3434" />
          : mood === "working"
            ? <path d="M28.8 33 L35.2 33" stroke={ink} strokeWidth="1.7" strokeLinecap="round" fill="none" />
            : <path d="M27.8 32 Q32 35 36.2 32" stroke={ink} strokeWidth="1.7" strokeLinecap="round" fill="none" />}
      </g>
    </svg>
  );
}
