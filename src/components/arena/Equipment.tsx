/**
 * Per-sport playing equipment glyphs for the arena.
 *
 * Each glyph is a small inline SVG with gradients + a specular highlight so
 * it reads as a physical object, not a flat icon. Sizes range 12–20px to
 * suit the relative scale of each piece of equipment.
 *
 * Glyphs are picked by sportId prefix — all `badminton-*` variants share one
 * shuttlecock, all `tt-*` share one ping-pong ball, etc.
 */
import type { CSSProperties, ReactNode } from 'react';

export type EquipmentSpec = {
  svg: ReactNode;
  /** CSS px size of the bounding box. */
  size: number;
  /** When true, the glyph rotates as it travels (gives a tumble feel). */
  spin?: boolean;
  /** CSS drop-shadow for legibility against the arena. */
  shadow?: string;
};

export function equipmentFor(sportId: string | null | undefined): EquipmentSpec {
  const s = (sportId ?? '').toLowerCase();
  if (s === 'cricket') return cricketBall();
  if (s === 'football') return football();
  if (s.startsWith('badminton')) return shuttlecock();
  if (s.startsWith('tt-')) return tableTennisBall();
  if (s.startsWith('pool')) return poolBall();
  if (s.startsWith('pickleball')) return pickleballBall();
  if (s === 'tug-of-war') return tugFlag();
  if (s === 'relay-race') return relayBaton();
  return genericBall();
}

/** Wrapper style — handles size + drop-shadow uniformly. */
export function equipmentWrapperStyle(spec: EquipmentSpec): CSSProperties {
  return {
    width: spec.size,
    height: spec.size,
    marginLeft: -spec.size / 2,
    marginTop: -spec.size / 2,
    filter: spec.shadow ? `drop-shadow(${spec.shadow})` : undefined,
  };
}

// ─── Cricket ball ────────────────────────────────────────────────────
function cricketBall(): EquipmentSpec {
  return {
    size: 14,
    spin: true,
    shadow: '0 1px 3px rgba(0,0,0,0.7)',
    svg: (
      <svg viewBox="0 0 14 14">
        <defs>
          <radialGradient id="cb-grad" cx="0.35" cy="0.32" r="0.85">
            <stop offset="0%" stopColor="#e35752" />
            <stop offset="55%" stopColor="#b9302c" />
            <stop offset="100%" stopColor="#5e1612" />
          </radialGradient>
        </defs>
        <circle cx="7" cy="7" r="6.2" fill="url(#cb-grad)" />
        {/* Seam — curved line with stitches */}
        <path
          d="M 1.6 5.8 Q 7 9 12.4 5.8"
          stroke="#fff8dc"
          strokeWidth="0.35"
          fill="none"
        />
        {Array.from({ length: 11 }).map((_, i) => {
          const t = i / 10;
          const x = 1.6 + t * 10.8;
          const y = 5.8 + Math.sin(t * Math.PI) * 3.2;
          return (
            <line
              key={i}
              x1={x}
              y1={y - 0.4}
              x2={x}
              y2={y + 0.4}
              stroke="#fff8dc"
              strokeWidth="0.3"
            />
          );
        })}
        {/* Specular highlight */}
        <ellipse cx="4.6" cy="4.1" rx="1.3" ry="0.7" fill="#fff" opacity="0.45" />
      </svg>
    ),
  };
}

// ─── Football ────────────────────────────────────────────────────────
function football(): EquipmentSpec {
  return {
    size: 16,
    spin: true,
    shadow: '0 1px 2px rgba(0,0,0,0.6)',
    svg: (
      <svg viewBox="0 0 16 16">
        <defs>
          <radialGradient id="fb-grad" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="60%" stopColor="#e8e6df" />
            <stop offset="100%" stopColor="#9a988e" />
          </radialGradient>
        </defs>
        <circle cx="8" cy="8" r="7.4" fill="url(#fb-grad)" stroke="#1a1a1a" strokeWidth="0.35" />
        {/* Centre pentagon */}
        <polygon points="8,4.5 11.3,6.9 10,10.7 6,10.7 4.7,6.9" fill="#101010" />
        {/* Surrounding hex hints — 3 visible from the front-facing view */}
        <polygon points="8,4.5 11.3,6.9 13.2,5.3 13.2,2.6 9.8,1.6" fill="none" stroke="#1a1a1a" strokeWidth="0.4" />
        <polygon points="11.3,6.9 10,10.7 12.6,12.4 14.3,9.6" fill="none" stroke="#1a1a1a" strokeWidth="0.4" />
        <polygon points="4.7,6.9 6,10.7 3.4,12.4 1.7,9.6" fill="none" stroke="#1a1a1a" strokeWidth="0.4" />
        <polygon points="8,4.5 4.7,6.9 2.8,5.3 2.8,2.6 6.2,1.6" fill="none" stroke="#1a1a1a" strokeWidth="0.4" />
        {/* Specular highlight */}
        <ellipse cx="5.2" cy="3.4" rx="1.4" ry="0.9" fill="#ffffff" opacity="0.55" />
      </svg>
    ),
  };
}

// ─── Shuttlecock ─────────────────────────────────────────────────────
function shuttlecock(): EquipmentSpec {
  return {
    size: 20,
    shadow: '0 1px 3px rgba(0,0,0,0.55)',
    svg: (
      <svg viewBox="0 0 20 20">
        <defs>
          <linearGradient id="sc-cork" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff8dc" />
            <stop offset="100%" stopColor="#c6a96b" />
          </linearGradient>
        </defs>
        {/* Feather skirt — fanned wedges */}
        {[-40, -20, 0, 20, 40].map((deg, i) => (
          <g key={i} transform={`rotate(${deg} 10 15)`}>
            <polygon
              points="10,15 9.1,3 10.9,3"
              fill="#fafafa"
              stroke="#cfcfcf"
              strokeWidth="0.18"
              strokeLinejoin="round"
            />
          </g>
        ))}
        {/* Twine — horizontal lines holding feathers */}
        <ellipse cx="10" cy="6.5" rx="6.4" ry="0.5" fill="none" stroke="#bf3a20" strokeWidth="0.25" />
        <ellipse cx="10" cy="9.5" rx="5.4" ry="0.4" fill="none" stroke="#bf3a20" strokeWidth="0.25" />
        {/* Cork base */}
        <ellipse cx="10" cy="16" rx="3.2" ry="2.5" fill="url(#sc-cork)" stroke="#7a5a1c" strokeWidth="0.3" />
        {/* Specular highlight on the cork */}
        <ellipse cx="8.6" cy="15.4" rx="1" ry="0.5" fill="#ffffff" opacity="0.55" />
      </svg>
    ),
  };
}

// ─── Table tennis ball ───────────────────────────────────────────────
function tableTennisBall(): EquipmentSpec {
  return {
    size: 10,
    shadow: '0 0 5px rgba(255,255,255,0.35)',
    svg: (
      <svg viewBox="0 0 10 10">
        <defs>
          <radialGradient id="tt-grad" cx="0.32" cy="0.3" r="0.85">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="65%" stopColor="#f0eee5" />
            <stop offset="100%" stopColor="#a39e8a" />
          </radialGradient>
        </defs>
        <circle cx="5" cy="5" r="4.4" fill="url(#tt-grad)" stroke="#666" strokeWidth="0.2" />
        <ellipse cx="3.3" cy="3.3" rx="1.3" ry="0.7" fill="#ffffff" opacity="0.85" />
      </svg>
    ),
  };
}

// ─── Pool ball (8-ball) ──────────────────────────────────────────────
function poolBall(): EquipmentSpec {
  return {
    size: 15,
    spin: true,
    shadow: '0 1px 3px rgba(0,0,0,0.85)',
    svg: (
      <svg viewBox="0 0 15 15">
        <defs>
          <radialGradient id="pb-grad" cx="0.35" cy="0.3" r="0.9">
            <stop offset="0%" stopColor="#3d3d3d" />
            <stop offset="60%" stopColor="#101010" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
        </defs>
        <circle cx="7.5" cy="7.5" r="6.8" fill="url(#pb-grad)" />
        {/* White circle with the 8 */}
        <circle cx="7.5" cy="7.1" r="2.7" fill="#f7f5ee" />
        <text
          x="7.5"
          y="8.5"
          fontSize="3.4"
          fontWeight="900"
          textAnchor="middle"
          fill="#101010"
          fontFamily="Anton, Impact, sans-serif"
        >
          8
        </text>
        {/* Specular highlight */}
        <ellipse cx="4.6" cy="4.2" rx="1.8" ry="1" fill="#ffffff" opacity="0.32" />
      </svg>
    ),
  };
}

// ─── Pickleball ──────────────────────────────────────────────────────
function pickleballBall(): EquipmentSpec {
  return {
    size: 14,
    shadow: '0 0 6px rgba(232,255,74,0.55)',
    svg: (
      <svg viewBox="0 0 14 14">
        <defs>
          <radialGradient id="pk-grad" cx="0.32" cy="0.3" r="0.85">
            <stop offset="0%" stopColor="#f7ff8a" />
            <stop offset="60%" stopColor="#d9e83a" />
            <stop offset="100%" stopColor="#8a9a1c" />
          </radialGradient>
        </defs>
        <circle cx="7" cy="7" r="6.4" fill="url(#pk-grad)" stroke="#6a7a18" strokeWidth="0.25" />
        {/* Characteristic holes */}
        {[
          [4, 3], [9.5, 3.2], [3, 6.5], [7, 6.5], [10.5, 7], [4.2, 10], [9.5, 10],
        ].map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r="0.85" fill="#7a8a18" />
            <circle cx={x} cy={y} r="0.4" fill="#3a4a08" />
          </g>
        ))}
        <ellipse cx="4.6" cy="3.6" rx="1.4" ry="0.7" fill="#ffffff" opacity="0.4" />
      </svg>
    ),
  };
}

// ─── Tug-of-war centre marker ────────────────────────────────────────
function tugFlag(): EquipmentSpec {
  return {
    size: 20,
    shadow: '0 1px 3px rgba(0,0,0,0.55)',
    svg: (
      <svg viewBox="0 0 20 20">
        <defs>
          <linearGradient id="tug-flag" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff6a3c" />
            <stop offset="100%" stopColor="#c2280a" />
          </linearGradient>
        </defs>
        {/* Pole */}
        <rect x="9.5" y="3" width="1" height="14" fill="#f5f1e8" />
        {/* Triangular pennant */}
        <polygon points="10,3 17,5 10,8" fill="url(#tug-flag)" stroke="#7a1f0a" strokeWidth="0.2" />
        {/* Crease line on the flag */}
        <line x1="12.5" y1="4.5" x2="15" y2="5.8" stroke="#7a1f0a" strokeWidth="0.25" />
        {/* Knot at base of pole */}
        <ellipse cx="10" cy="17" rx="1.8" ry="0.9" fill="#b88440" stroke="#6a4820" strokeWidth="0.2" />
      </svg>
    ),
  };
}

// ─── Relay baton ─────────────────────────────────────────────────────
function relayBaton(): EquipmentSpec {
  return {
    size: 20,
    spin: true,
    shadow: '0 1px 2px rgba(0,0,0,0.55)',
    svg: (
      <svg viewBox="0 0 20 6">
        <defs>
          <linearGradient id="baton-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffd866" />
            <stop offset="50%" stopColor="#f5c542" />
            <stop offset="100%" stopColor="#9c7818" />
          </linearGradient>
        </defs>
        {/* Body */}
        <rect x="1" y="1.5" width="18" height="3" rx="1.5" fill="url(#baton-grad)" />
        {/* End caps */}
        <ellipse cx="1.6" cy="3" rx="0.7" ry="1.4" fill="#6a4820" />
        <ellipse cx="18.4" cy="3" rx="0.7" ry="1.4" fill="#6a4820" />
        {/* Grip stripes */}
        <rect x="6" y="1.5" width="0.45" height="3" fill="#7a5a1c" />
        <rect x="13.5" y="1.5" width="0.45" height="3" fill="#7a5a1c" />
        {/* Highlight */}
        <rect x="2.5" y="1.8" width="15" height="0.5" rx="0.25" fill="#fff5c0" opacity="0.55" />
      </svg>
    ),
  };
}

// ─── Generic fallback ────────────────────────────────────────────────
function genericBall(): EquipmentSpec {
  return {
    size: 12,
    shadow: '0 0 6px color-mix(in oklab, var(--ink) 70%, transparent)',
    svg: (
      <svg viewBox="0 0 12 12">
        <defs>
          <radialGradient id="gb-grad" cx="0.35" cy="0.3" r="0.85">
            <stop offset="0%" stopColor="#f5f1e8" />
            <stop offset="100%" stopColor="#6a665e" />
          </radialGradient>
        </defs>
        <circle cx="6" cy="6" r="5.2" fill="url(#gb-grad)" />
      </svg>
    ),
  };
}
