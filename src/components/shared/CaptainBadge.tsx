import clsx from 'clsx';

type Props = {
  size?: 'sm' | 'md';
  /** Color of the ring around the badge. Should match the surface the avatar sits on. */
  ringColor?: string;
  /** Badge fill color. Defaults to gold (Group Captain). Use accent-3 (cyan)
   *  for Sport Captain so the two are visually distinct. */
  color?: string;
  /** Accessibility label override — defaults to "Captain". */
  label?: string;
  className?: string;
};

/** "C" captain marker. Position via the parent (absolute, top-right). */
export function CaptainBadge({
  size = 'md',
  ringColor = 'var(--bg)',
  color = 'var(--gold)',
  label = 'Captain',
  className,
}: Props) {
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
        background: color,
        color: '#000',
        border: `${dims.ring}px solid ${ringColor}`,
      }}
      aria-label={label}
    >
      C
    </span>
  );
}
