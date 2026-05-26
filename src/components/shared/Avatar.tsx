import clsx from 'clsx';
import { colorVarFor, type TeamId } from '@/types/team';
import { initialsFromName } from '@/lib/initials';
import { CaptainBadge } from './CaptainBadge';

type Photos = {
  /** Admin-uploaded override (highest priority). */
  adminPhotoUrl?: string | null;
  /** Pulled from Google profile at OAuth login. */
  googlePhotoUrl?: string | null;
};

type Props = Photos & {
  name: string | null | undefined;
  teamId?: TeamId;
  /** Show the gold "C" badge. */
  isCaptain?: boolean;
  /** Pixel diameter of the circle. */
  size?: number;
  /** Match the surface behind the avatar so the captain badge ring blends in. */
  surfaceColor?: string;
  className?: string;
};

/** Source-of-truth avatar. Resolves photo priority: admin → Google → initials. */
export function Avatar({
  adminPhotoUrl,
  googlePhotoUrl,
  name,
  teamId,
  isCaptain,
  size = 56,
  surfaceColor = 'var(--bg)',
  className,
}: Props) {
  const photoUrl = adminPhotoUrl || googlePhotoUrl || null;
  const teamColor = teamId ? colorVarFor(teamId) : 'var(--bg-elev)';
  const initials = initialsFromName(name);

  // Tweak the captain badge size for tiny avatars (arena faces).
  const badgeSize = size <= 44 ? 'sm' : 'md';
  // Initials font size scales with the circle.
  const fontSize = Math.max(10, Math.round(size * 0.34));
  // Border thickness scales gently.
  const border = size <= 40 ? 1.5 : 2;

  return (
    <span
      className={clsx('relative inline-grid place-items-center overflow-visible', className)}
      style={{ width: size, height: size }}
    >
      <span
        className="block overflow-hidden rounded-full bg-cover bg-center"
        style={{
          width: size,
          height: size,
          background: photoUrl ? `url(${photoUrl}) center/cover` : teamColor,
          border: `${border}px solid ${teamId ? teamColor : 'var(--line)'}`,
        }}
      >
        {!photoUrl && (
          <span
            className="grid h-full w-full place-items-center font-display"
            style={{
              fontSize,
              color: teamId ? '#000' : 'var(--accent-2)',
              letterSpacing: '0.02em',
            }}
          >
            {initials}
          </span>
        )}
      </span>
      {isCaptain && <CaptainBadge size={badgeSize} ringColor={surfaceColor} />}
    </span>
  );
}
