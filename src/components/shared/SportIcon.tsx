import type { ReactElement, SVGProps } from 'react';
import type { ArenaType } from '@/types/sport';

/**
 * Color-graded sport glyph. Each sport renders in its real-world
 * palette so users can identify the sport at a glance without
 * reading the name — cricket = red ball + tan bat, football =
 * black-and-white panels, badminton = white shuttle, 8-ball =
 * black with white "8", and so on.
 *
 * Resolution priority:
 *   1. Sport NAME (case-insensitive substring) — covers the
 *      standard 16 + any admin-added sport whose name contains a
 *      recognised keyword.
 *   2. arenaType fallback — for admin sports without a recognised
 *      name.
 *   3. Generic gold trophy.
 *
 * Default size 24px so the glyph reads cleanly on row headers and
 * cards; callers can override per usage. ViewBox 24×24 with full
 * fill colors (no `currentColor` body) so the icon stays itself
 * regardless of the surrounding text color. */
const VB = '0 0 24 24';

export function SportIcon({
  sportName,
  arenaType,
  size = 24,
  ...rest
}: {
  sportName: string | null | undefined;
  arenaType?: ArenaType | null;
  size?: number;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  const Glyph = resolve(sportName, arenaType);
  return <Glyph width={size} height={size} viewBox={VB} {...rest} />;
}

function resolve(
  name: string | null | undefined,
  arenaType: ArenaType | null | undefined,
): (props: SVGProps<SVGSVGElement>) => ReactElement {
  const n = (name ?? '').toLowerCase();
  if (n.includes('cricket')) return CricketIcon;
  if (n.includes('football') || n.includes('soccer')) return FootballIcon;
  if (n.includes('badminton')) return ShuttlecockIcon;
  if (n.includes('pickleball')) return PickleballIcon;
  if (n.includes('table tennis') || n.includes('ping')) return TableTennisIcon;
  if (n.includes('pool') || n.includes('snooker') || n.includes('billiard'))
    return EightBallIcon;
  if (n.includes('tug')) return TugOfWarIcon;
  if (n.includes('relay') || n.includes('race') || n.includes('run'))
    return BatonIcon;
  if (n.includes('chess')) return ChessIcon;
  if (n.includes('tennis')) return TennisIcon;
  if (n.includes('basket')) return BasketballIcon;
  if (n.includes('volley')) return VolleyballIcon;

  switch (arenaType ?? undefined) {
    case 'pitch':
      return FootballIcon;
    case 'field':
      return CricketIcon;
    case 'court':
      return ShuttlecockIcon;
    case 'table':
      return TableTennisIcon;
    case 'board':
      return ChessIcon;
    case 'rope':
      return TugOfWarIcon;
    case 'track':
      return BatonIcon;
    default:
      return TrophyIcon;
  }
}

// ── Palette ─────────────────────────────────────────────────────
// Real-world-ish colors. Slightly muted so they sit on the dark
// CHEQ theme without screaming.
const C = {
  cricketRed: '#e63946',
  cricketSeam: '#ffffff',
  batTan: '#c98a3c',
  batHandle: '#3a2a18',
  white: '#f5f1e8',
  black: '#0e0e10',
  shuttleCork: '#f5f1e8',
  shuttleAccent: '#c98a3c',
  pickleYellow: '#f4d03f',
  pickleHole: '#0e0e10',
  pingPaddle: '#c43229',
  pingBall: '#f5f1e8',
  poolBlack: '#0e0e10',
  poolNum: '#f5f1e8',
  ropeTan: '#b07a3a',
  flagRed: '#e63946',
  batonOrange: '#ff6a1f',
  knightDark: '#222',
  tennisGreen: '#cce82d',
  basketOrange: '#e57427',
  volleyBlue: '#4ad4ff',
  trophyGold: '#f5c542',
  trophyShadow: '#a17a17',
  line: '#1a1815',
};

// ── Glyphs ──────────────────────────────────────────────────────

function CricketIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      {/* bat blade */}
      <rect
        x="2"
        y="11"
        width="11"
        height="4"
        rx="0.8"
        transform="rotate(-45 7.5 13)"
        fill={C.batTan}
        stroke={C.line}
        strokeWidth="0.6"
      />
      {/* handle */}
      <rect
        x="11"
        y="6"
        width="2"
        height="5"
        rx="0.6"
        transform="rotate(-45 12 8.5)"
        fill={C.batHandle}
      />
      {/* ball */}
      <circle cx="17" cy="17" r="3.6" fill={C.cricketRed} stroke={C.line} strokeWidth="0.6" />
      <path
        d="M14 17a3.6 3.6 0 0 1 6 0"
        stroke={C.cricketSeam}
        strokeWidth="0.6"
        fill="none"
      />
    </svg>
  );
}

function FootballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" fill={C.white} stroke={C.line} strokeWidth="0.8" />
      <polygon points="12,7 15.4,9.4 14.1,13.4 9.9,13.4 8.6,9.4" fill={C.black} />
      <path
        d="M12 2.5L15.4 9.4M21.5 12L14.1 13.4M9.9 13.4L7.7 21.3M3 12L8.6 9.4M16.3 20.3L14.1 13.4"
        stroke={C.black}
        strokeWidth="0.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ShuttlecockIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      {/* feather skirt */}
      <polygon points="5,21 19,21 15,11 9,11" fill={C.white} stroke={C.line} strokeWidth="0.6" />
      <path d="M9 11l-1 10M12 11v10M15 11l1 10M7 16l1 5M16 16l1 5" stroke={C.shuttleAccent} strokeWidth="0.5" />
      {/* cork */}
      <ellipse cx="12" cy="11" rx="3" ry="2" fill={C.shuttleCork} stroke={C.line} strokeWidth="0.6" />
      <ellipse cx="12" cy="10.5" rx="3" ry="1.2" fill={C.cricketRed} />
    </svg>
  );
}

function PickleballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" fill={C.pickleYellow} stroke={C.line} strokeWidth="0.8" />
      {[
        [9, 8],
        [14, 9],
        [10, 13],
        [15, 14],
        [8.5, 15.5],
        [13, 6.5],
        [16.5, 12],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r="0.85" fill={C.pickleHole} />
      ))}
    </svg>
  );
}

function TableTennisIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      {/* paddle face */}
      <circle cx="10" cy="10" r="6" fill={C.pingPaddle} stroke={C.line} strokeWidth="0.8" />
      {/* handle */}
      <rect
        x="13"
        y="13.5"
        width="7"
        height="2.4"
        rx="0.6"
        transform="rotate(45 16.5 14.7)"
        fill={C.batHandle}
      />
      {/* ball */}
      <circle cx="19" cy="6" r="2" fill={C.pingBall} stroke={C.line} strokeWidth="0.5" />
    </svg>
  );
}

function EightBallIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" fill={C.poolBlack} stroke={C.line} strokeWidth="0.8" />
      <circle cx="12" cy="12" r="4" fill={C.white} />
      <text
        x="12"
        y="14.3"
        textAnchor="middle"
        fontSize="5.6"
        fontWeight="800"
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fill={C.poolBlack}
      >
        8
      </text>
    </svg>
  );
}

function TugOfWarIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      {/* rope */}
      <path
        d="M2 12c3-3 6 3 10 0s6-3 10 0"
        stroke={C.ropeTan}
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* center flag pole */}
      <rect x="11.6" y="6" width="0.8" height="12" fill={C.black} />
      {/* flag */}
      <polygon points="12.4,6 18,8 12.4,10.5" fill={C.flagRed} stroke={C.line} strokeWidth="0.5" />
    </svg>
  );
}

function BatonIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      {/* baton body */}
      <rect
        x="3"
        y="10"
        width="18"
        height="4"
        rx="2"
        transform="rotate(-20 12 12)"
        fill={C.batonOrange}
        stroke={C.line}
        strokeWidth="0.6"
      />
      {/* grip stripes */}
      <line x1="7" y1="13.5" x2="9" y2="11" stroke={C.black} strokeWidth="0.6" />
      <line x1="9" y1="14.5" x2="11" y2="12" stroke={C.black} strokeWidth="0.6" />
      <line x1="14" y1="11.7" x2="16" y2="9.2" stroke={C.black} strokeWidth="0.6" />
    </svg>
  );
}

function ChessIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      {/* board base */}
      <rect x="3" y="20" width="18" height="2" rx="0.4" fill={C.knightDark} />
      {/* knight */}
      <path
        d="M9 20c0-3 1.5-4 2.5-5.5C9 14 8 12 9 9c.5-1 1-2 2.5-2.5 0-1 .5-1.5 1.5-1.5.5 1 .5 1.5.5 2 1.5 1 2.5 2.5 3 4 .5 1.5.5 3 .5 4 0 3.5-2 5-4 5z"
        fill={C.knightDark}
        stroke={C.line}
        strokeWidth="0.4"
      />
      <circle cx="15.2" cy="9" r="0.7" fill={C.white} />
    </svg>
  );
}

function TennisIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" fill={C.tennisGreen} stroke={C.line} strokeWidth="0.8" />
      <path
        d="M4 7c4 1.5 6 5 6 9.5M20 17c-4-1.5-6-5-6-9.5"
        stroke={C.white}
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function BasketballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" fill={C.basketOrange} stroke={C.line} strokeWidth="0.8" />
      <path
        d="M3 12h18M12 2.5v19M5 5.5C8 8 8 16 5 18.5M19 5.5c-3 2.5-3 10.5 0 13"
        stroke={C.black}
        strokeWidth="0.9"
        fill="none"
      />
    </svg>
  );
}

function VolleyballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9.5" fill={C.white} stroke={C.line} strokeWidth="0.8" />
      <path
        d="M12 2.5c3 4 3 11 0 19M3 12c4-3 11-3 19 0M5 6c5 1 11 5 14 12"
        stroke={C.volleyBlue}
        strokeWidth="1.1"
        fill="none"
      />
    </svg>
  );
}

function TrophyIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p} xmlns="http://www.w3.org/2000/svg">
      <path
        d="M7 4h10v4a5 5 0 0 1-10 0V4z"
        fill={C.trophyGold}
        stroke={C.line}
        strokeWidth="0.6"
      />
      <path
        d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3"
        stroke={C.trophyShadow}
        strokeWidth="1.2"
        fill="none"
      />
      <rect x="10" y="13" width="4" height="3" fill={C.trophyShadow} />
      <rect x="8" y="16" width="8" height="2.5" rx="0.4" fill={C.trophyGold} stroke={C.line} strokeWidth="0.4" />
    </svg>
  );
}
