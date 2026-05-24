import { motion } from 'motion/react';
import type { ArenaType } from '@/types/sport';
import { ballDuration, ballPath } from '@/lib/arenaLayout';

type Props = { arena: ArenaType };

export function Ball({ arena }: Props) {
  const path = ballPath(arena);
  const duration = ballDuration(arena);

  // Board games (chess) get no animated ball.
  if (arena === 'board') return null;

  const xs = path.map((p) => `${p.x}%`);
  const ys = path.map((p) => `${p.y}%`);

  return (
    <motion.div
      className="absolute z-10"
      style={{
        width: 12,
        height: 12,
        marginLeft: -6,
        marginTop: -6,
        background: 'var(--ink)',
        borderRadius: 999,
        boxShadow: '0 0 8px color-mix(in oklab, var(--ink) 70%, transparent)',
      }}
      animate={{ left: xs, top: ys }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    />
  );
}
