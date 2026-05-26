import { motion } from 'motion/react';
import { Avatar } from '@/components/shared/Avatar';
import { initialsFromName } from '@/lib/initials';
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
   * When true, show 2-letter initials instead of the first name. Use for
   * doubles formations / tight arenas where full names overlap. The label
   * also shrinks in font size to match.
   */
  compact?: boolean;
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
  compact,
  delaySeed = 0,
}: Props) {
  // Display rules:
  //  - compact mode (e.g. doubles) → 2-letter initials, tiny label
  //  - normal mode               → first name, label up to avatar + 18px wide
  // This keeps labels from bleeding into neighbours regardless of how many
  // players are on the field.
  const label = compact ? initialsFromName(name) : name.split(' ')[0];
  const labelFontPx = compact ? 8 : Math.max(8, Math.round(size * 0.24));
  const labelMaxPx = compact ? size : size + 18;

  return (
    <motion.div
      className="absolute flex flex-col items-center"
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
        className="mt-1 block truncate text-center font-display uppercase leading-none tracking-[0.04em]"
        style={{
          color: 'var(--ink)',
          fontSize: labelFontPx,
          maxWidth: labelMaxPx,
          // Subtle backdrop so the label stays legible over busy arena lines.
          textShadow: '0 1px 2px rgba(0,0,0,0.6)',
        }}
        aria-label={name}
      >
        {label}
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
