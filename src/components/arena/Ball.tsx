import { motion } from 'motion/react';
import type { ArenaType } from '@/types/sport';
import { equipmentDuration, equipmentPath } from '@/lib/arenaLayout';
import { equipmentFor, equipmentWrapperStyle } from './Equipment';

type Props = {
  arena: ArenaType;
  /** Optional sport id — picks the right equipment + motion path. Falls back
   *  to a generic dot + the arena-default path when unset. */
  sportId?: string;
};

export function Ball({ arena, sportId }: Props) {
  // Board games (chess) don't have continuously-moving equipment.
  if (arena === 'board') return null;

  const path = equipmentPath(sportId, arena);
  const duration = equipmentDuration(sportId, arena);
  const spec = equipmentFor(sportId);

  const xs = path.map((p) => `${p.x}%`);
  const ys = path.map((p) => `${p.y}%`);

  return (
    <motion.div
      className="pointer-events-none absolute z-10"
      style={equipmentWrapperStyle(spec)}
      animate={{
        left: xs,
        top: ys,
        ...(spec.spin ? { rotate: [0, 360] } : {}),
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {spec.svg}
    </motion.div>
  );
}
