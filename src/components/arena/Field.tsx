import type { ReactNode } from 'react';
import type { ArenaType } from '@/types/sport';

type Props = {
  arena: ArenaType;
  children: ReactNode;
};

/**
 * Arena background. Uses SVG so markings scale crisply across screen sizes.
 * The aspect ratio is 4:5 (taller-than-wide) to match the prototype's
 * portrait-oriented arena card.
 */
export function Field({ arena, children }: Props) {
  return (
    <div
      className="relative mx-5 overflow-hidden rounded-3xl border border-line"
      style={{ aspectRatio: '4 / 5', background: surfaceFor(arena) }}
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {arena === 'field' && <FieldMarkings />}
        {arena === 'court' && <CourtMarkings />}
        {arena === 'pitch' && <PitchMarkings />}
        {arena === 'board' && <BoardMarkings />}
      </svg>
      <div className="absolute inset-0">{children}</div>
    </div>
  );
}

function surfaceFor(arena: ArenaType): string {
  switch (arena) {
    case 'field':
      return 'radial-gradient(ellipse at 50% 50%, #1e2a16, #0b1208 80%)';
    case 'court':
      return 'linear-gradient(180deg, #1a2129, #0c1116)';
    case 'pitch':
      return 'radial-gradient(ellipse at 50% 50%, #233015, #0c1207 75%)';
    case 'board':
      return 'linear-gradient(135deg, #1c1a17, #0d0b09)';
  }
}

function FieldMarkings() {
  // Outline + half line + center circle + two goal areas.
  const line = 'color-mix(in oklab, var(--ink) 40%, transparent)';
  return (
    <g stroke={line} strokeWidth={0.3} fill="none">
      <rect x={4} y={4} width={92} height={92} />
      <line x1={4} y1={50} x2={96} y2={50} />
      <circle cx={50} cy={50} r={8} />
      <circle cx={50} cy={50} r={0.6} fill={line} />
      <rect x={28} y={4} width={44} height={10} />
      <rect x={28} y={86} width={44} height={10} />
    </g>
  );
}

function CourtMarkings() {
  const line = 'color-mix(in oklab, var(--ink) 45%, transparent)';
  return (
    <g stroke={line} strokeWidth={0.3} fill="none">
      <rect x={6} y={10} width={88} height={80} />
      <line x1={6} y1={50} x2={94} y2={50} strokeWidth={0.5} />
      <line x1={20} y1={20} x2={80} y2={20} />
      <line x1={20} y1={80} x2={80} y2={80} />
      <line x1={50} y1={10} x2={50} y2={90} strokeDasharray="1 1" />
    </g>
  );
}

function PitchMarkings() {
  // An oval boundary with a central pitch strip.
  const line = 'color-mix(in oklab, var(--ink) 40%, transparent)';
  return (
    <g stroke={line} fill="none" strokeWidth={0.3}>
      <ellipse cx={50} cy={50} rx={46} ry={44} />
      <rect x={47} y={28} width={6} height={44} fill="color-mix(in oklab, var(--ink-dim) 25%, transparent)" />
      <circle cx={50} cy={50} r={0.6} fill={line} stroke="none" />
    </g>
  );
}

function BoardMarkings() {
  // 8x8 chequered board centered, scaled to fit.
  const dark = 'color-mix(in oklab, var(--ink-mute) 60%, transparent)';
  const cells = [];
  const size = 10;
  const startX = 10;
  const startY = 10;
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        cells.push(
          <rect
            key={`${row}-${col}`}
            x={startX + col * size}
            y={startY + row * size}
            width={size}
            height={size}
            fill={dark}
          />,
        );
      }
    }
  }
  return (
    <g>
      <rect x={10} y={10} width={80} height={80} fill="none" stroke="color-mix(in oklab, var(--ink) 40%, transparent)" strokeWidth={0.3} />
      {cells}
    </g>
  );
}
