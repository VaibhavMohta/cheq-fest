import type { ReactElement, SVGProps } from 'react';
import type { ArenaType } from '@/types/sport';

/**
 * Compact sport-type glyph used wherever a sport name is rendered
 * (home cards, match list, bracket, rosters, rulebook tile).
 *
 * Resolution priority:
 *   1. Match the sport NAME (case-insensitive substring) — covers
 *      both the standard 16 ('Cricket', 'Football', 'Badminton —
 *      Mixed Doubles', 'Pool — 8-ball', 'Pickleball', 'Tug of War',
 *      'Relay Race', 'Chess', 'Table Tennis', …) and admin-added
 *      sports whose names contain a recognised keyword.
 *   2. Fall back to arenaType (court → racquet, table → table,
 *      pitch → football, board → board, rope → tug, track → relay,
 *      field → trophy).
 *   3. Generic trophy.
 *
 * All glyphs share the 24×24 viewBox + currentColor stroke so they
 * tint with the surrounding text. */
const base = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function SportIcon({
  sportName,
  arenaType,
  size = 16,
  ...rest
}: {
  sportName: string | null | undefined;
  arenaType?: ArenaType | null;
  size?: number;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  const Glyph = resolve(sportName, arenaType);
  return <Glyph {...base} width={size} height={size} {...rest} />;
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

  // Arena-type fallback for admin-added sports without a recognised keyword.
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

// ── Individual glyphs ─────────────────────────────────────────────
// Stroke-only line-art; minimal detail so they read at 12-16px.

function CricketIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      {/* bat */}
      <path d="M5 19l9-9" />
      <path d="M13.5 9.5l2 2" />
      <path d="M15 8l3-3" />
      {/* ball */}
      <circle cx="6.5" cy="17.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

function FootballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      {/* simple pentagon hint */}
      <polygon points="12,7 15,9.2 14,12.7 10,12.7 9,9.2" />
      <path d="M12 3v4M21 12h-4M12 21v-4M3 12h4" />
    </svg>
  );
}

function ShuttlecockIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      {/* cork base */}
      <ellipse cx="12" cy="17" rx="3" ry="1.8" />
      {/* feathers */}
      <path d="M9 17l-3 4M12 17l-1 5M15 17l3 4M10 16l-1.5 4M14 16l1.5 4" />
    </svg>
  );
}

function PickleballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="9" cy="9" r="0.9" fill="currentColor" />
      <circle cx="14" cy="10" r="0.9" fill="currentColor" />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" />
      <circle cx="15" cy="15" r="0.9" fill="currentColor" />
    </svg>
  );
}

function TableTennisIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      {/* paddle */}
      <circle cx="10" cy="10" r="5" />
      <path d="M13.5 13.5l5 5" />
      {/* ball */}
      <circle cx="18" cy="8" r="1.4" fill="currentColor" />
    </svg>
  );
}

function EightBallIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" />
      <text
        x="12"
        y="14"
        textAnchor="middle"
        fontSize="4.5"
        fontWeight="700"
        fill="var(--bg)"
        stroke="none"
      >
        8
      </text>
    </svg>
  );
}

function TugOfWarIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      {/* rope */}
      <path d="M3 12c3-2 6 2 9 0s6-2 9 0" />
      {/* center flag/knot */}
      <path d="M12 9v6" />
      <rect x="11" y="8" width="2" height="2.5" />
    </svg>
  );
}

function BatonIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <rect x="5" y="10" width="14" height="4" rx="1.5" transform="rotate(-20 12 12)" />
      <path d="M7 14l-2 3M19 10l2-3" />
    </svg>
  );
}

function ChessIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      {/* knight silhouette */}
      <path d="M8 20h10v-2H8z" />
      <path d="M9 18c0-5 3-6 3-9-1-1-2-1-2-3 2 0 4 1 5 3 1 2 2 4 2 6 0 2-1 3-3 3z" />
      <circle cx="15" cy="9" r="0.6" fill="currentColor" />
    </svg>
  );
}

function TennisIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M5 8c3 1 5 4 5 8M19 16c-3-1-5-4-5-8" />
    </svg>
  );
}

function BasketballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3v18" />
      <path d="M5 6c4 2 4 10 0 14M19 6c-4 2-4 10 0 14" />
    </svg>
  );
}

function VolleyballIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3c3 4 3 11 0 18M3 12c4-3 11-3 18 0M5 6c5 1 11 5 14 12" />
    </svg>
  );
}

function TrophyIcon(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...p}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
      <path d="M7 6H4a3 3 0 0 0 3 3M17 6h3a3 3 0 0 1-3 3" />
      <path d="M10 14h4M9 20h6M12 14v6" />
    </svg>
  );
}
