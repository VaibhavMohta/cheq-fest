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

  const roleLabel = player.isCaptain
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
        isCaptain={player.isCaptain}
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
