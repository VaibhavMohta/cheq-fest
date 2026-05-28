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
};

export function DragTile({ player, surfaceColor = 'var(--bg-card)', dimmed }: Props) {
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
      style={style}
      aria-roledescription={player.isCaptain ? 'Locked tile' : 'Draggable tile'}
      className={clsx(
        'flex select-none flex-col items-center gap-1.5 rounded-xl px-1 py-2 touch-none transition-opacity',
        isDragging && 'opacity-40',
        dimmed && !isDragging && 'opacity-25',
        player.isCaptain ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing',
      )}
    >
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
