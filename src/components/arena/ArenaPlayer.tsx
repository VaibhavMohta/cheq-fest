import { motion } from 'motion/react';
import { Avatar } from '@/components/shared/Avatar';
import type { TeamId } from '@/types/team';
import type { Position } from '@/lib/arenaLayout';

type Props = {
  position: Position;
  name: string;
  teamId: TeamId;
  isCaptain?: boolean;
  /** Avatar size in CSS px. */
  size?: number;
  googlePhotoUrl?: string | null;
  adminPhotoUrl?: string | null;
  /**
   * Stagger the bobbing so the field doesn't pulse in lockstep.
   * Pass a small per-player number (e.g. the index).
   */
  delaySeed?: number;
};

export function ArenaPlayer({
  position,
  name,
  teamId,
  isCaptain,
  size = 38,
  googlePhotoUrl,
  adminPhotoUrl,
  delaySeed = 0,
}: Props) {
  // Centered on (x, y) in % space.
  return (
    <motion.div
      className="absolute"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
      }}
      animate={{ y: [0, -3, 0] }}
      transition={{
        duration: 2.4,
        repeat: Infinity,
        ease: 'easeInOut',
        delay: (delaySeed * 0.13) % 1.2,
      }}
    >
      <Avatar
        name={name}
        teamId={teamId}
        isCaptain={isCaptain}
        size={size}
        googlePhotoUrl={googlePhotoUrl}
        adminPhotoUrl={adminPhotoUrl}
        surfaceColor="transparent"
      />
      <span
        className="mt-1 block max-w-[60px] truncate text-center font-display text-[9px] uppercase leading-none tracking-[0.04em]"
        style={{ color: 'var(--ink)' }}
      >
        {name.split(' ')[0]}
      </span>
    </motion.div>
  );
}

/** Empty-slot placeholder — used when sport-cap left a pitch position blank. */
export function ArenaEmptySlot({ position, size = 38 }: { position: Position; size?: number }) {
  return (
    <div
      className="absolute rounded-full border-2 border-dashed"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: 'translate(-50%, -50%)',
        width: size,
        height: size,
        borderColor: 'color-mix(in oklab, var(--ink) 30%, transparent)',
      }}
    />
  );
}
