import clsx from 'clsx';

type Props = {
  size?: 'sm' | 'md';
  /** Color of the ring around the badge. Should match the surface the avatar sits on. */
  ringColor?: string;
  className?: string;
};

/** Gold "C" captain marker. Position via the parent (absolute, top-right). */
export function CaptainBadge({ size = 'md', ringColor = 'var(--bg)', className }: Props) {
  const dims =
    size === 'sm'
      ? { box: 14, font: 9, ring: 1.5 }
      : { box: 18, font: 11, ring: 2 };

  return (
    <span
      className={clsx(
        'pointer-events-none absolute -top-1 -right-1 z-[3] grid place-items-center rounded-full font-display font-bold leading-none',
        className,
      )}
      style={{
        width: dims.box,
        height: dims.box,
        fontSize: dims.font,
        background: 'var(--gold)',
        color: '#000',
        border: `${dims.ring}px solid ${ringColor}`,
      }}
      aria-label="Captain"
    >
      C
    </span>
  );
}
