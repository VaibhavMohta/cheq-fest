import type { ReactNode } from 'react';
import type { ArenaType } from '@/types/sport';

type Props = {
  arena: ArenaType;
  /** Optional sport id — lets us render variants of the same arena (pool vs
   *  TT both share `table`; badminton vs pickleball both share `court`). */
  sportId?: string;
  children: ReactNode;
};

/**
 * The arena surface. 4:5 portrait card with sport-appropriate markings
 * rendered as scalable SVG (no rasters, no per-pixel layout).
 *
 * Stroke width and colours read against the dark theme; every marking uses
 * an `--ink`-mixed token so it sits behind the player avatars without
 * competing for attention.
 */
export function Field({ arena, sportId, children }: Props) {
  return (
    <div
      className="relative mx-5 overflow-hidden rounded-3xl border border-line"
      style={{ aspectRatio: '4 / 5', background: surfaceFor(arena, sportId) }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {arena === 'field' && <CricketFieldMarkings />}
        {arena === 'pitch' && <FootballPitchMarkings />}
        {arena === 'court' &&
          (sportId?.startsWith('pickleball') ? <PickleballCourtMarkings /> : <BadmintonCourtMarkings />)}
        {arena === 'table' &&
          (sportId?.startsWith('pool') ? <PoolTableMarkings /> : <TableTennisMarkings />)}
        {arena === 'rope' && <TugMarkings />}
        {arena === 'track' && <TrackMarkings />}
        {arena === 'board' && <BoardMarkings />}
      </svg>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

// Surface gradients — each tries to evoke the real playing surface.
function surfaceFor(arena: ArenaType, sportId?: string): string {
  switch (arena) {
    case 'field':
      // Cricket — green grass with darker patches mowed in.
      return 'repeating-linear-gradient(180deg, #1c2b13 0 8%, #233515 8% 16%), radial-gradient(ellipse at 50% 50%, #233515, #0c1407 90%)';
    case 'pitch':
      // Football — bright green with subtle mown stripes.
      return 'repeating-linear-gradient(90deg, #14241a 0 12.5%, #1a2e22 12.5% 25%), radial-gradient(ellipse at 50% 50%, #1a2e22, #0a160e 90%)';
    case 'court':
      return sportId?.startsWith('pickleball')
        ? 'linear-gradient(180deg, #1d2a38, #0a131c)' // pickleball — blue
        : 'linear-gradient(180deg, #2a1e10, #100a06)'; // badminton — warm wood
    case 'table':
      return sportId?.startsWith('pool')
        ? 'radial-gradient(ellipse at 50% 50%, #15412a, #061a10 90%)' // pool — billiard green
        : 'radial-gradient(ellipse at 50% 50%, #102a3a, #051018 90%)'; // TT — table blue
    case 'rope':
      return 'repeating-linear-gradient(0deg, #2a1e10 0 12%, #2f2114 12% 24%), linear-gradient(180deg, #211912, #110b07)';
    case 'track':
      return 'repeating-linear-gradient(90deg, #3a1d10 0 14%, #461f10 14% 28%), radial-gradient(ellipse at 50% 50%, #3a1d10, #100805 90%)';
    case 'board':
      return 'linear-gradient(135deg, #1c1a17, #0d0b09)';
  }
}

// ─── Cricket ──────────────────────────────────────────────────────────
function CricketFieldMarkings() {
  const rope = 'color-mix(in oklab, var(--ink) 55%, transparent)';
  const inner = 'color-mix(in oklab, var(--ink) 30%, transparent)';
  const pitch = 'color-mix(in oklab, #b78f4a 80%, transparent)';
  const crease = 'color-mix(in oklab, var(--ink) 85%, transparent)';
  return (
    <g fill="none">
      {/* Boundary rope */}
      <ellipse cx={50} cy={50} rx={47} ry={45} stroke={rope} strokeWidth={0.7} />
      {/* 30-yard inner fielding circle */}
      <ellipse cx={50} cy={50} rx={28} ry={26} stroke={inner} strokeWidth={0.3} strokeDasharray="1 1.2" />
      {/* Central pitch — 22-yard strip */}
      <rect x={46} y={30} width={8} height={40} fill={pitch} opacity={0.55} />
      <rect x={46} y={30} width={8} height={40} stroke={crease} strokeWidth={0.18} opacity={0.6} />
      {/* Popping creases at each end */}
      <line x1={42} y1={36} x2={58} y2={36} stroke={crease} strokeWidth={0.3} />
      <line x1={42} y1={64} x2={58} y2={64} stroke={crease} strokeWidth={0.3} />
      {/* Stumps (3 short vertical lines each end) */}
      {[48.4, 50, 51.6].map((x) => (
        <line key={`top-${x}`} x1={x} y1={32} x2={x} y2={34} stroke={crease} strokeWidth={0.45} />
      ))}
      {[48.4, 50, 51.6].map((x) => (
        <line key={`bot-${x}`} x1={x} y1={66} x2={x} y2={68} stroke={crease} strokeWidth={0.45} />
      ))}
      {/* Centre spot */}
      <circle cx={50} cy={50} r={0.5} fill={crease} />
    </g>
  );
}

// ─── Football ─────────────────────────────────────────────────────────
function FootballPitchMarkings() {
  const line = 'color-mix(in oklab, var(--ink) 65%, transparent)';
  return (
    <g fill="none" stroke={line} strokeWidth={0.35}>
      {/* Pitch boundary */}
      <rect x={4} y={4} width={92} height={92} />
      {/* Halfway line + centre circle + centre spot */}
      <line x1={4} y1={50} x2={96} y2={50} />
      <circle cx={50} cy={50} r={9.5} />
      <circle cx={50} cy={50} r={0.7} fill={line} stroke="none" />
      {/* Top half — penalty area + goal area + penalty spot + arc */}
      <rect x={24} y={4} width={52} height={16} /> {/* penalty area */}
      <rect x={36} y={4} width={28} height={6} /> {/* goal area */}
      <circle cx={50} cy={14} r={0.7} fill={line} stroke="none" /> {/* penalty spot */}
      <path d="M 42 20 A 9 9 0 0 0 58 20" /> {/* D arc */}
      <line x1={42} y1={4} x2={58} y2={4} strokeWidth={0.9} /> {/* goal line emphasis */}
      {/* Bottom half — mirror */}
      <rect x={24} y={80} width={52} height={16} />
      <rect x={36} y={90} width={28} height={6} />
      <circle cx={50} cy={86} r={0.7} fill={line} stroke="none" />
      <path d="M 42 80 A 9 9 0 0 1 58 80" />
      <line x1={42} y1={96} x2={58} y2={96} strokeWidth={0.9} />
      {/* Corner arcs */}
      <path d="M 4 6 A 2 2 0 0 1 6 4" />
      <path d="M 96 6 A 2 2 0 0 0 94 4" />
      <path d="M 4 94 A 2 2 0 0 0 6 96" />
      <path d="M 96 94 A 2 2 0 0 1 94 96" />
    </g>
  );
}

// ─── Badminton court ──────────────────────────────────────────────────
function BadmintonCourtMarkings() {
  const line = 'color-mix(in oklab, var(--ink) 65%, transparent)';
  const net = 'color-mix(in oklab, var(--ink) 75%, transparent)';
  return (
    <g fill="none" stroke={line} strokeWidth={0.35}>
      {/* Doubles court outline */}
      <rect x={14} y={10} width={72} height={80} />
      {/* Inner singles sidelines */}
      <line x1={20} y1={10} x2={20} y2={90} />
      <line x1={80} y1={10} x2={80} y2={90} />
      {/* Long service line for doubles (4 ft from baseline) */}
      <line x1={14} y1={16} x2={86} y2={16} strokeDasharray="0.8 0.6" />
      <line x1={14} y1={84} x2={86} y2={84} strokeDasharray="0.8 0.6" />
      {/* Short service line */}
      <line x1={14} y1={40} x2={86} y2={40} />
      <line x1={14} y1={60} x2={86} y2={60} />
      {/* Centre service line */}
      <line x1={50} y1={10} x2={50} y2={40} />
      <line x1={50} y1={60} x2={50} y2={90} />
      {/* Net */}
      <rect x={14} y={49.2} width={72} height={1.6} fill={net} stroke="none" />
      <line x1={14} y1={49.2} x2={86} y2={49.2} strokeWidth={0.5} />
      <line x1={14} y1={50.8} x2={86} y2={50.8} strokeWidth={0.5} />
      {/* Net mesh hint */}
      {Array.from({ length: 18 }).map((_, i) => (
        <line
          key={i}
          x1={14 + i * 4}
          y1={49.2}
          x2={14 + i * 4}
          y2={50.8}
          stroke={net}
          strokeWidth={0.15}
        />
      ))}
    </g>
  );
}

// ─── Pickleball court ─────────────────────────────────────────────────
function PickleballCourtMarkings() {
  const line = 'color-mix(in oklab, var(--ink) 70%, transparent)';
  const kitchen = 'color-mix(in oklab, var(--accent-2) 18%, transparent)';
  const net = 'color-mix(in oklab, var(--ink) 75%, transparent)';
  return (
    <g fill="none" stroke={line} strokeWidth={0.4}>
      {/* Court boundary */}
      <rect x={12} y={10} width={76} height={80} />
      {/* Non-volley zone (the Kitchen) — 7 ft on each side */}
      <rect x={12} y={36} width={76} height={14} fill={kitchen} stroke={line} />
      <rect x={12} y={50} width={76} height={14} fill={kitchen} stroke={line} />
      {/* Service area centre line */}
      <line x1={50} y1={10} x2={50} y2={36} />
      <line x1={50} y1={64} x2={50} y2={90} />
      {/* Net */}
      <rect x={12} y={49.2} width={76} height={1.6} fill={net} stroke="none" />
      <line x1={12} y1={49.2} x2={88} y2={49.2} strokeWidth={0.5} />
      <line x1={12} y1={50.8} x2={88} y2={50.8} strokeWidth={0.5} />
    </g>
  );
}

// ─── Table tennis ─────────────────────────────────────────────────────
function TableTennisMarkings() {
  const line = 'color-mix(in oklab, #fdfaf0 75%, transparent)';
  const net = 'color-mix(in oklab, #fdfaf0 50%, transparent)';
  return (
    <g fill="none" stroke={line} strokeWidth={0.45}>
      {/* Table top */}
      <rect x={12} y={18} width={76} height={64} />
      {/* Centre line (lengthwise — for doubles) */}
      <line x1={50} y1={18} x2={50} y2={82} strokeDasharray="0.7 0.7" />
      {/* The net — perpendicular to the long axis */}
      <line x1={6} y1={50} x2={94} y2={50} stroke={net} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={6} y1={50} x2={94} y2={50} strokeWidth={0.35} />
      {/* Net posts */}
      <circle cx={6} cy={50} r={1.4} fill={line} stroke="none" />
      <circle cx={94} cy={50} r={1.4} fill={line} stroke="none" />
    </g>
  );
}

// ─── Pool table ───────────────────────────────────────────────────────
function PoolTableMarkings() {
  const rail = 'color-mix(in oklab, #4a2d18 90%, transparent)';
  const cloth = 'color-mix(in oklab, #1a4a30 85%, transparent)';
  const diamond = 'color-mix(in oklab, #f5c542 70%, transparent)';
  const pocket = '#000';
  return (
    <g>
      {/* Wooden rail */}
      <rect x={6} y={14} width={88} height={72} rx={3} fill={rail} stroke="none" />
      {/* Cloth */}
      <rect x={12} y={20} width={76} height={60} rx={1.5} fill={cloth} stroke="color-mix(in oklab, var(--ink) 30%, transparent)" strokeWidth={0.3} />
      {/* Foot spot + head string */}
      <circle cx={50} cy={32} r={0.5} fill="color-mix(in oklab, #fff 50%, transparent)" />
      <line x1={12} y1={68} x2={88} y2={68} stroke="color-mix(in oklab, #fff 18%, transparent)" strokeWidth={0.25} strokeDasharray="0.5 0.6" />
      {/* Pockets — 4 corners + 2 sides */}
      {[[12, 20], [88, 20], [12, 80], [88, 80], [12, 50], [88, 50]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r={3.2} fill={pocket} />
          <circle cx={x} cy={y} r={3.2} fill="none" stroke="color-mix(in oklab, var(--ink) 60%, transparent)" strokeWidth={0.3} />
        </g>
      ))}
      {/* Rail diamonds (6 per long rail, 3 per short rail) */}
      {[20, 32, 44, 56, 68, 80].map((x) => (
        <g key={`top-${x}`}>
          <circle cx={x} cy={17} r={0.7} fill={diamond} />
          <circle cx={x} cy={83} r={0.7} fill={diamond} />
        </g>
      ))}
      {[30, 50, 70].map((y) => (
        <g key={`side-${y}`}>
          <circle cx={9} cy={y} r={0.7} fill={diamond} />
          <circle cx={91} cy={y} r={0.7} fill={diamond} />
        </g>
      ))}
    </g>
  );
}

// ─── Tug of war ───────────────────────────────────────────────────────
function TugMarkings() {
  const line = 'color-mix(in oklab, var(--ink) 50%, transparent)';
  const ropeBody = 'color-mix(in oklab, #d8a85c 85%, transparent)';
  return (
    <g fill="none">
      {/* Pull lines (4m markers on each side of centre) */}
      <line x1={10} y1={50} x2={90} y2={50} stroke={line} strokeWidth={0.5} strokeDasharray="0.4 0.5" />
      <line x1={10} y1={36} x2={90} y2={36} stroke={line} strokeWidth={0.35} strokeDasharray="1 1.5" />
      <line x1={10} y1={64} x2={90} y2={64} stroke={line} strokeWidth={0.35} strokeDasharray="1 1.5" />
      {/* The rope — segmented texture for realism */}
      {Array.from({ length: 32 }).map((_, i) => {
        const x = 14 + i * 2.25;
        return (
          <ellipse
            key={i}
            cx={x}
            cy={50}
            rx={1.15}
            ry={1.4}
            fill={i % 2 === 0 ? ropeBody : 'color-mix(in oklab, #b88440 80%, transparent)'}
            stroke="color-mix(in oklab, #6a4820 60%, transparent)"
            strokeWidth={0.15}
          />
        );
      })}
      {/* Centre marker — small red flag knot */}
      <rect x={49.2} y={47} width={1.6} height={6} fill="var(--accent)" />
    </g>
  );
}

// ─── Track ────────────────────────────────────────────────────────────
function TrackMarkings() {
  const line = 'color-mix(in oklab, var(--ink) 60%, transparent)';
  const lane = 'color-mix(in oklab, var(--ink) 22%, transparent)';
  const infield = 'color-mix(in oklab, #143517 80%, transparent)';
  const startLine = 'color-mix(in oklab, var(--accent-2) 90%, transparent)';
  return (
    <g fill="none">
      {/* Outer track */}
      <ellipse cx={50} cy={50} rx={45} ry={38} stroke={line} strokeWidth={0.5} />
      {/* Inner grass infield */}
      <ellipse cx={50} cy={50} rx={22} ry={16} fill={infield} stroke={line} strokeWidth={0.4} />
      {/* 6 concentric lanes */}
      {[26, 30, 34, 38, 42].map((rx) => (
        <ellipse key={rx} cx={50} cy={50} rx={rx} ry={rx - 8} stroke={lane} strokeWidth={0.22} />
      ))}
      {/* Start/finish line — top straight (and a hatch pattern) */}
      <line x1={50} y1={12} x2={50} y2={18} stroke={startLine} strokeWidth={0.9} />
      {Array.from({ length: 5 }).map((_, i) => (
        <line
          key={i}
          x1={50}
          y1={12 + i * 1.4}
          x2={52}
          y2={12 + i * 1.4}
          stroke={startLine}
          strokeWidth={0.35}
        />
      ))}
      {/* Baton exchange zones — short hatches on bottom straight */}
      <line x1={42} y1={84} x2={42} y2={88} stroke={line} strokeWidth={0.4} strokeDasharray="0.6 0.6" />
      <line x1={58} y1={84} x2={58} y2={88} stroke={line} strokeWidth={0.4} strokeDasharray="0.6 0.6" />
    </g>
  );
}

// ─── Chess board ──────────────────────────────────────────────────────
function BoardMarkings() {
  const light = 'color-mix(in oklab, #e6dec9 92%, transparent)';
  const dark = 'color-mix(in oklab, #6a4a26 95%, transparent)';
  const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const cells = [];
  const size = 9;
  const startX = 14;
  const startY = 14;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDark = (row + col) % 2 === 1;
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={startX + col * size}
          y={startY + row * size}
          width={size}
          height={size}
          fill={isDark ? dark : light}
        />,
      );
    }
  }
  return (
    <g>
      <rect
        x={14}
        y={14}
        width={72}
        height={72}
        fill="none"
        stroke="color-mix(in oklab, var(--ink) 60%, transparent)"
        strokeWidth={0.4}
      />
      {cells}
      {/* Rank labels (left edge) */}
      {ranks.map((r, i) => (
        <text
          key={r}
          x={11.5}
          y={startY + i * size + size / 2 + 1}
          fontSize={2.4}
          textAnchor="middle"
          fill="color-mix(in oklab, var(--ink) 50%, transparent)"
          fontFamily="JetBrains Mono, monospace"
        >
          {r}
        </text>
      ))}
      {/* File labels (bottom edge) */}
      {files.map((f, i) => (
        <text
          key={f}
          x={startX + i * size + size / 2}
          y={89.5}
          fontSize={2.4}
          textAnchor="middle"
          fill="color-mix(in oklab, var(--ink) 50%, transparent)"
          fontFamily="JetBrains Mono, monospace"
        >
          {f}
        </text>
      ))}
    </g>
  );
}
