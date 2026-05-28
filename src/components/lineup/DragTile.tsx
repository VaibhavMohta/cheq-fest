import { useDraggable } from '@dnd-kit/core';
import clsx from 'clsx';
import { Avatar } from '@/components/shared/Avatar';
import type { LineupPlayer } from '@/lib/lineup';

type Props = {
  player: LineupPlayer;
  /** Surface color behind the tile — passed to the captain badge ring. */
  surfaceColor?: string;
  /** Dim the tile when a search filter is active and this player doesn't
   *  match. The tile stays in place (no bucket reflow) so spatial memory
   *  is preserved. */
  dimmed?: boolean;
  /** Tap handler — opens the parent's move sheet. Distinct from drag,
   *  which still triggers via long-press / pointer-distance. Sport
   *  captains are tap-locked because they can't move (same rule as drag). */
  onTap?: () => void;
  /** Quick-remove button handler. When provided AND the player isn't
   *  locked (captain), a small × badge appears on the tile that fires
   *  this directly. Bucket-agnostic: the parent decides where "remove"
   *  sends them (default: notPlaying). */
  onRemove?: () => void;
};

export function DragTile({
  player,
  surfaceColor = 'var(--bg-card)',
  dimmed,
  onTap,
  onRemove,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: player.uid,
    disabled: player.isCaptain,
    data: { uid: player.uid },
  });

  const style: React.CSSProperties = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : {};

  // Sport Captain (locked on the pitch) → cyan "C" badge + "SPORT CAP" label.
  // Group Captain (independent of sport) → gold "C" badge + "GROUP CAP" label.
  // A player can be both — the sport-cap status takes the lock + cyan badge;
  // the gold "GROUP CAP" text label is appended below in that case.
  const isSportCap = player.isCaptain;
  const isGroupCap = !!player.isGroupCaptain;
  const badgeColor = isSportCap ? 'var(--accent-3)' : 'var(--gold)';
  const badgeLabel = isSportCap ? 'Sport Captain' : 'Group Captain';
  const roleLabel = isSportCap
    ? { text: isGroupCap ? 'SPORT + GROUP CAP' : 'SPORT CAP', color: 'var(--accent-3)' }
    : isGroupCap
      ? { text: 'GROUP CAP', color: 'var(--gold)' }
      : player.sportCapOf
        ? { text: `★ ${player.sportCapOf.toUpperCase()}`, color: 'var(--accent-3)' }
        : null;

  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      onClick={(e) => {
        // dnd-kit's pointer sensor has an 8px activation distance, so a
        // genuine click without drag-movement reaches us here. Suppress
        // for captains (they can't move) and during an active drag (so
        // mouse-up after drag doesn't trigger the tap menu).
        if (player.isCaptain) return;
        if (isDragging) return;
        e.preventDefault();
        e.stopPropagation();
        onTap?.();
      }}
      style={style}
      aria-roledescription={player.isCaptain ? 'Locked tile' : 'Draggable tile'}
      className={clsx(
        'flex select-none flex-col items-center gap-1.5 rounded-xl px-1 py-2 touch-none transition-opacity',
        isDragging && 'opacity-40',
        dimmed && !isDragging && 'opacity-25',
        player.isCaptain ? 'cursor-not-allowed' : 'cursor-pointer active:cursor-grabbing hover:bg-bg-elev',
      )}
    >
      <span className="relative inline-block">
        <Avatar
          name={player.name}
          teamId={player.teamId}
          size={56}
          isCaptain={isSportCap || isGroupCap}
          captainColor={badgeColor}
          captainLabel={badgeLabel}
          googlePhotoUrl={player.googlePhotoUrl}
          adminPhotoUrl={player.adminPhotoUrl}
          surfaceColor={surfaceColor}
        />
        {/* Quick-remove × badge. Captains are locked out — same rule as
            drag/tap. Rendered as a real <button> sitting above the
            avatar; pointer events are stopped so dnd-kit doesn't think
            the user is starting a drag on the badge. */}
        {onRemove && !player.isCaptain && (
          <button
            type="button"
            aria-label={`Remove ${player.name} from lineup`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="absolute -top-1 -left-1 z-[4] grid h-5 w-5 cursor-pointer place-items-center rounded-full border font-mono text-[12px] leading-none transition hover:scale-110 active:scale-95"
            style={{
              background: 'var(--bg)',
              borderColor: 'color-mix(in oklab, var(--accent) 60%, transparent)',
              color: 'var(--accent)',
            }}
          >
            ×
          </button>
        )}
      </span>
      <span className="font-display text-[11px] uppercase leading-none tracking-[0.06em]">
        {player.name.split(' ')[0]}
      </span>
      {roleLabel ? (
        <span
          className="font-mono text-[9px] uppercase tracking-[0.06em]"
          style={{ color: roleLabel.color }}
        >
          {roleLabel.text}
        </span>
      ) : (
        <span className="h-[12px]" />
      )}
    </button>
  );
}
