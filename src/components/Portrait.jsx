// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
// Portrait — Madav's living agent faces. Original, procedural SVG portraits.
// Every agent gets a UNIQUE deterministic face (independent hash streams: skin, hair
// style + color, glasses, beard, freckles, earrings). The uniform wears the identity
// color. Moods animate via CSS (.pt-* in styles.css):
//   idle     — gentle smile, blinking, breathing
//   hello    — beaming open smile + friendly head tilt (ready to help)
//   working  — focused eyes, concentrating
//   running  — leaning forward, motion streaks (actively on a task)
//   happy    — delighted beam, blush, a little pop
//   cheer    — both arms raised in a "yeah!" (a mission finished)
//   sleeping — eyes closed, a drifting "z z z" (resting, ready for work)
// No image assets, theme-aware, honors prefers-reduced-motion.

const SKINS = ["#f4cda6", "#eab68c", "#d99e6f", "#bd8458", "#96603c", "#6f4528"];
const HAIRC = ["#2c2924", "#4b3625", "#6e4a2a", "#8d8d8d", "#b86f2c", "#1f2a3a"];
const hashS = (s) => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

export default function Portrait({ seed = "", color = "var(--accent)", size = 40, mood = "idle", title,
  skin: skinOv, hair: hairOv, beard: beardOv, glasses: glassesOv, style: styleOv,
  lashes = false, earring: earringOv }) {
  const s = String(seed);
  // Looks are deterministic from the seed, but any trait can be pinned via a prop
  // (used for fixed characters like Sage/Sara). Styles 7-8 (long hair, side bun)
  // are reachable only via the style prop — random faces stay in 0-6.
  const skin = skinOv || SKINS[hashS(s + "skin") % SKINS.length];
  const hair = hairOv || HAIRC[hashS(s + "hairc") % HAIRC.length];
  const style = styleOv != null ? styleOv : hashS(s + "style") % 7;
  const glasses = glassesOv != null ? glassesOv : hashS(s + "spec") % 10 < 3;
  const beard = beardOv != null ? beardOv : (!glasses && hashS(s + "beard") % 10 < 2);
  const freckles = hashS(s + "frk") % 10 < 2;
  const earring = earringOv != null ? earringOv : hashS(s + "ear") % 10 < 2;
  const ink = "#262b34";
  const shade = `color-mix(in srgb, ${skin} 62%, #6b4226)`;
  const sleeping = mood === "sleeping";
  const cheer = mood === "cheer";
  const running = mood === "running";
  const smileOpen = mood === "hello" || mood === "happy" || cheer;
  const frame = { fill: `color-mix(in srgb, ${color} 15%, transparent)`, stroke: `color-mix(in srgb, ${color} 45%, transparent)` };
  return (
    <svg className={`pt ${mood}`} width={size} height={size} viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-label={title || "agent"} style={{ flex: "none" }}>
      {title && <title>{title}</title>}
      <rect x="1" y="1" width="62" height="62" rx="14" style={frame} strokeWidth="1" />
      {/* raised arms — only in "cheer": sleeve-colored, hands up in a V */}
      {cheer && (
        <g className="pt-arms">
          <path d="M22 47 Q16 38 12.5 30" stroke={color} strokeWidth="6.5" strokeLinecap="round" fill="none" opacity="0.92" />
          <path d="M42 47 Q48 38 51.5 30" stroke={color} strokeWidth="6.5" strokeLinecap="round" fill="none" opacity="0.92" />
          <circle cx="11.6" cy="27.6" r="3.4" fill={skin} />
          <circle cx="52.4" cy="27.6" r="3.4" fill={skin} />
        </g>
      )}
      {/* neck + uniform in the identity color */}
      <rect x="28.5" y="34" width="7" height="9" rx="2.5" fill={skin} />
      <path d="M11 63 Q13 44 32 44 Q51 44 53 63 Z" fill={color} opacity="0.88" />
      <path d="M27.5 45 L32 51 L36.5 45 Z" fill="#fdfcfa" opacity="0.9" />
      {/* motion streaks — only in "running" */}
      {running && (
        <g className="pt-streaks" stroke={color} strokeWidth="1.6" strokeLinecap="round" opacity="0.5">
          <path d="M3 30 L10 30" /><path d="M2 36 L11 36" /><path d="M4 42 L9 42" />
        </g>
      )}
      <g className="pt-headg">
        <circle cx="18.6" cy="26.5" r="2.9" fill={skin} />
        <circle cx="45.4" cy="26.5" r="2.9" fill={skin} />
        <circle cx="18.9" cy="26.5" r="1.2" fill={shade} opacity="0.55" />
        <circle cx="45.1" cy="26.5" r="1.2" fill={shade} opacity="0.55" />
        {earring && <circle cx="45.6" cy="29.4" r="1" fill="#e8c468" />}
        <ellipse cx="32" cy="25.5" rx="13.3" ry="13.9" fill={skin} />
        {style === 0 && <path d="M18.6 23.5 Q18.6 9.5 32 9.5 Q45.4 9.5 45.4 23.5 Q43.5 14.5 32 14 Q20.5 14.5 18.6 23.5 Z" fill={hair} />}
        {style === 1 && <path d="M18.6 24.5 Q17.6 9.5 33 9.5 Q46.4 10.5 45.4 21.5 Q37.5 11.5 28.5 14 Q20 16 18.6 24.5 Z" fill={hair} />}
        {style === 2 && (
          <g fill={hair}>
            <circle cx="22" cy="14.5" r="5.4" /><circle cx="32" cy="11" r="6.2" /><circle cx="42" cy="14.5" r="5.4" />
            <circle cx="18.3" cy="20.5" r="4.1" /><circle cx="45.7" cy="20.5" r="4.1" />
          </g>
        )}
        {style === 3 && (
          <g fill={hair}>
            <path d="M18.7 22.5 Q19.2 10.5 32 10 Q44.8 10.5 45.3 22.5 Q41.8 13.5 32 13.3 Q22.2 13.5 18.7 22.5 Z" />
            <circle cx="32" cy="7" r="4.4" />
          </g>
        )}
        {style === 4 && <path d="M17.6 38 Q14 9.5 32 9 Q50 9.5 46.4 38 L42.4 38 Q45.4 15.5 32 14.5 Q18.6 15.5 21.6 38 Z" fill={hair} />}
        {style === 5 && <path d="M18.6 25 Q18 10 32 9.8 Q46 10 45.4 25 L43.6 25 Q44.4 13.5 33 13.2 Q26 13 23.4 17 Q20.5 20 20.4 25 Z" fill={hair} />}
        {style === 6 && (
          <g fill={hair}>
            <path d="M19.6 21.5 Q19.6 8 32 8 Q44.4 8 44.4 21.5 L42.4 21.5 Q42.4 12.5 32 12.5 Q21.6 12.5 21.6 21.5 Z" />
            <path d="M19.6 21.5 L21.6 21.5 L21.6 16 Q19.6 17.5 19.6 21.5 Z" /><path d="M44.4 21.5 L42.4 21.5 L42.4 16 Q44.4 17.5 44.4 21.5 Z" />
          </g>
        )}
        {/* style 7 — long center-parted hair framing the face (explicit-only) */}
        {style === 7 && (
          <path d="M16.8 43.5 Q13.2 9 32 8.6 Q50.8 9 47.2 43.5 L41.6 43.5 Q44.6 15.5 32.8 14.3 L32 16.4 L31.2 14.3 Q19.4 15.5 22.4 43.5 Z" fill={hair} />
        )}
        {/* style 8 — swept bangs + side bun (explicit-only) */}
        {style === 8 && (
          <g fill={hair}>
            <path d="M18.6 24.5 Q17.8 9.8 32 9.6 Q46.2 9.8 45.4 24.5 L43.5 24.5 Q44.2 13.5 31 13.6 Q24.5 14 21.8 18.5 Q19.5 21 19.4 24.5 Z" />
            <circle cx="46.6" cy="13.4" r="4.4" />
          </g>
        )}
        {/* brows */}
        <g className="pt-brows" stroke={ink} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.85">
          <path d="M23.8 20.8 q3.2 -2.1 6 -0.5" />
          <path d="M34.2 20.3 q2.8 -1.6 6 0.5" />
        </g>
        {/* eyes — open (with light), or closed arcs when sleeping */}
        {sleeping ? (
          <g stroke={ink} strokeWidth="1.6" strokeLinecap="round" fill="none">
            <path d="M24.4 25.4 q2.5 2.2 5 0" />
            <path d="M34.6 25.4 q2.5 2.2 5 0" />
          </g>
        ) : (
          <g className="pt-eyes">
            <ellipse cx="26.9" cy="25" rx="2.7" ry="3" fill="#fff" />
            <ellipse cx="37.1" cy="25" rx="2.7" ry="3" fill="#fff" />
            <circle cx="27.2" cy="25.4" r="1.55" fill={ink} />
            <circle cx="37.4" cy="25.4" r="1.55" fill={ink} />
            <circle cx="27.8" cy="24.7" r="0.55" fill="#fff" />
            <circle cx="38" cy="24.7" r="0.55" fill="#fff" />
            {lashes && (
              <g stroke={ink} strokeWidth="1" strokeLinecap="round" opacity="0.85">
                <path d="M24.3 23.2 L23 22.2" /><path d="M25.4 22.4 L24.5 21.2" />
                <path d="M39.7 23.2 L41 22.2" /><path d="M38.6 22.4 L39.5 21.2" />
              </g>
            )}
          </g>
        )}
        {glasses && !sleeping && (
          <g stroke={ink} strokeWidth="1.3" fill="none" opacity="0.8">
            <rect x="22.6" y="21.6" width="8.6" height="7" rx="3.2" />
            <rect x="32.8" y="21.6" width="8.6" height="7" rx="3.2" />
            <path d="M31.2 24.6 L32.8 24.6" />
          </g>
        )}
        {freckles && (
          <g fill={shade} opacity="0.6">
            <circle cx="23.6" cy="28.4" r="0.5" /><circle cx="25.4" cy="29.3" r="0.5" /><circle cx="24.2" cy="30.2" r="0.5" />
            <circle cx="40.4" cy="28.4" r="0.5" /><circle cx="38.6" cy="29.3" r="0.5" /><circle cx="39.8" cy="30.2" r="0.5" />
          </g>
        )}
        <path d="M31 28.2 q1.1 1.7 2.3 0" stroke={shade} strokeWidth="1.3" strokeLinecap="round" fill="none" opacity="0.75" />
        {(smileOpen) && (
          <g fill="#e88b8b" opacity="0.5">
            <ellipse cx="23.4" cy="29.6" rx="2.6" ry="1.5" />
            <ellipse cx="40.6" cy="29.6" rx="2.6" ry="1.5" />
          </g>
        )}
        {beard && <path d="M22.5 29 Q23 37.5 32 38.2 Q41 37.5 41.5 29 Q41.5 35 32 35.6 Q22.5 35 22.5 29 Z" fill={hair} opacity="0.9" />}
        {/* mouth */}
        {smileOpen ? (
          <g>
            <path d="M26.4 31 Q32 38.6 37.6 31 Q32 33.4 26.4 31 Z" fill="#5b3434" />
            <path d="M28.2 31.3 Q32 33.2 35.8 31.3 L35.8 32.6 Q32 34.2 28.2 32.6 Z" fill="#fff" opacity="0.92" />
          </g>
        ) : sleeping ? (
          <ellipse cx="32" cy="32.4" rx="1.7" ry="2.2" fill="#5b3434" opacity="0.7" />
        ) : (running || mood === "working") ? (
          <path d="M28.8 32.6 L35.2 32.6" stroke={ink} strokeWidth="1.7" strokeLinecap="round" fill="none" />
        ) : (
          <path d="M27.4 31.4 Q32 35 36.6 31.4" stroke={ink} strokeWidth="1.8" strokeLinecap="round" fill="none" />
        )}
      </g>
      {/* drifting z z z — only when sleeping */}
      {sleeping && (
        <g className="pt-zzz" fill={color} fontFamily="var(--sans, sans-serif)" fontWeight="700">
          <text x="46" y="20" fontSize="7">z</text>
          <text x="51" y="14" fontSize="9">z</text>
          <text x="56" y="9" fontSize="6">z</text>
        </g>
      )}
    </svg>
  );
}
