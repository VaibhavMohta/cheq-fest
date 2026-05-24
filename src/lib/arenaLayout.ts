import type { ArenaType } from '@/types/sport';

/** Position in 0–100% of the arena box. */
export type Position = { x: number; y: number };

/**
 * Returns `n` positions for one side of the arena, given the arena type.
 * The "home" side is the bottom half; the away side is just a vertical mirror.
 */
export function homePositions(arena: ArenaType, n: number): Position[] {
  switch (arena) {
    case 'field':
      return fieldFormation(n);
    case 'court':
      return courtFormation(n);
    case 'pitch':
      return pitchFormation(n);
    case 'board':
      return boardFormation(n);
  }
}

export function awayPositions(arena: ArenaType, n: number): Position[] {
  return homePositions(arena, n).map(({ x, y }) => ({ x: 100 - x, y: 100 - y }));
}

// Football-style 5/7/11-a-side formations. Goalkeeper deep, defenders mid-deep,
// mids and forwards moving up the half. We squeeze into 0..45% Y so the ball
// can travel through center.
function fieldFormation(n: number): Position[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 50, y: 80 }];
  if (n === 2)
    return [
      { x: 35, y: 70 },
      { x: 65, y: 70 },
    ];
  if (n === 3)
    return [
      { x: 50, y: 80 }, // GK
      { x: 35, y: 55 },
      { x: 65, y: 55 },
    ];
  if (n === 4)
    return [
      { x: 50, y: 80 },
      { x: 25, y: 60 },
      { x: 75, y: 60 },
      { x: 50, y: 38 },
    ];
  // 5-a-side default: GK, 2 def, 1 mid, 1 fwd
  if (n === 5)
    return [
      { x: 50, y: 82 }, // GK
      { x: 25, y: 65 }, // LB
      { x: 75, y: 65 }, // RB
      { x: 50, y: 50 }, // CM
      { x: 50, y: 32 }, // CF
    ];
  if (n === 6)
    return [
      { x: 50, y: 82 },
      { x: 22, y: 65 },
      { x: 78, y: 65 },
      { x: 35, y: 45 },
      { x: 65, y: 45 },
      { x: 50, y: 28 },
    ];
  // 7-a-side
  if (n === 7)
    return [
      { x: 50, y: 84 },
      { x: 22, y: 68 },
      { x: 50, y: 68 },
      { x: 78, y: 68 },
      { x: 30, y: 48 },
      { x: 70, y: 48 },
      { x: 50, y: 30 },
    ];
  // Bigger sides — distribute roughly in rows.
  return distributeRows(n, [
    { y: 84, count: 1 },
    { y: 68, count: Math.min(4, n - 5) },
    { y: 50, count: 3 },
    { y: 32, count: 1 },
  ]);
}

// Court games (badminton/squash/tennis) — singles vs doubles.
function courtFormation(n: number): Position[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 50, y: 70 }];
  if (n === 2)
    return [
      { x: 33, y: 70 },
      { x: 67, y: 70 },
    ];
  // Larger team games on a court — 3, 4, 5 → two rows.
  return distributeRows(n, [
    { y: 72, count: Math.ceil(n / 2) },
    { y: 56, count: Math.floor(n / 2) },
  ]);
}

// Cricket — keep it simple: batter + bowler near the strip, fielders spread.
function pitchFormation(n: number): Position[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 50, y: 60 }];
  if (n === 2)
    return [
      { x: 45, y: 70 }, // striker
      { x: 55, y: 35 }, // bowler
    ];
  // Cricket-y spread for 3+. First two stay on the strip; rest fan out.
  const out: Position[] = [
    { x: 45, y: 68 },
    { x: 55, y: 36 },
  ];
  const ring = n - 2;
  for (let i = 0; i < ring; i++) {
    const angle = Math.PI + (Math.PI * (i + 1)) / (ring + 1); // 180°..360°
    out.push({
      x: 50 + Math.cos(angle) * 38,
      y: 52 + Math.sin(angle) * 22,
    });
  }
  return out;
}

// Board games — chess, etc. One player per side, dead center on the home half.
function boardFormation(n: number): Position[] {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 50, y: 72 }];
  return distributeRows(n, [{ y: 72, count: n }]);
}

function distributeRows(
  total: number,
  rows: { y: number; count: number }[],
): Position[] {
  const out: Position[] = [];
  let left = total;
  for (const row of rows) {
    const k = Math.min(row.count, left);
    for (let i = 0; i < k; i++) {
      const x = ((i + 1) / (k + 1)) * 100;
      out.push({ x, y: row.y });
    }
    left -= k;
    if (left <= 0) break;
  }
  // Anything still leftover (shouldn't be) → drop on midline.
  while (left > 0) {
    out.push({ x: 50, y: 50 });
    left--;
  }
  return out;
}

/** Ball/shuttle/disc travel path — a few keyframes per arena type. */
export function ballPath(arena: ArenaType): Position[] {
  switch (arena) {
    case 'field':
      return [
        { x: 50, y: 50 },
        { x: 30, y: 30 },
        { x: 70, y: 30 },
        { x: 60, y: 60 },
        { x: 30, y: 65 },
        { x: 50, y: 50 },
      ];
    case 'court':
      return [
        { x: 30, y: 35 },
        { x: 70, y: 65 },
        { x: 70, y: 35 },
        { x: 30, y: 65 },
        { x: 30, y: 35 },
      ];
    case 'pitch':
      return [
        { x: 50, y: 35 },
        { x: 50, y: 65 },
        { x: 50, y: 35 },
      ];
    case 'board':
      return [
        { x: 50, y: 50 },
        { x: 50, y: 50 },
      ];
  }
}

/** Per-arena animation length, seconds. */
export function ballDuration(arena: ArenaType): number {
  switch (arena) {
    case 'field':
      return 12;
    case 'court':
      return 4;
    case 'pitch':
      return 3;
    case 'board':
      return 60;
  }
}
