/**
 * Reusable two-list player picker used by the referee assignment, group
 * captain selection, and (later) other admin flows.
 *
 * Interactions:
 *  - Tap a row in "Available"   → moves to Selected
 *  - Tap × on a Selected chip   → moves back to Available
 *  - Long-press a row           → drag into the opposite list
 *
 * In `mode="single"`, picking a new row replaces the previous selection
 * rather than appending. The picker is fully controlled — the parent
 * owns persistence and gets the new selected list via `onChange`.
 */
import { useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useState } from 'react';
import clsx from 'clsx';
import { Avatar } from './Avatar';
import { usePlayerSearch, type PersonRow } from '@/lib/playerDirectory';

type Mode = 'multi' | 'single';

type Props = {
  available: PersonRow[];
  selected: PersonRow[];
  onChange: (next: PersonRow[]) => void;
  mode?: Mode;
  /** Optional row-level warning shown as a chip, e.g. for staged players
   *  who can't be a referee until they sign in. Return null to suppress. */
  rowWarning?: (p: PersonRow) => string | null;
  emptyAvailableLabel?: string;
  emptySelectedLabel?: string;
  /** Override the search input placeholder. */
  searchPlaceholder?: string;
};

const AVAILABLE_ZONE = 'available';
const SELECTED_ZONE = 'selected';

export function PlayerPicker({
  available,
  selected,
  onChange,
  mode = 'multi',
  rowWarning,
  emptyAvailableLabel = 'No matching players.',
  emptySelectedLabel = 'Nothing selected yet.',
  searchPlaceholder = 'Search by name or email…',
}: Props) {
  const { search, setSearch, filtered, matchCount } = usePlayerSearch(available);

  // dnd-kit sensors mirror the lineup editor exactly so the long-press feel
  // is consistent across the app.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Quick lookup so drag handlers can resolve a key to the row regardless
  // of which side it came from.
  const byKey = useMemo(() => {
    const m = new Map<string, PersonRow>();
    for (const p of available) m.set(p.key, p);
    for (const p of selected) m.set(p.key, p);
    return m;
  }, [available, selected]);

  function moveToSelected(p: PersonRow) {
    if (selected.some((s) => s.key === p.key)) return;
    if (mode === 'single') {
      onChange([p]);
      return;
    }
    onChange([...selected, p]);
  }

  function moveToAvailable(p: PersonRow) {
    onChange(selected.filter((s) => s.key !== p.key));
  }

  function handleDragStart(e: DragStartEvent) {
    setActiveKey(String(e.active.id));
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveKey(null);
    const { active, over } = e;
    if (!over) return;
    const key = String(active.id);
    const row = byKey.get(key);
    if (!row) return;
    const target = String(over.id);
    if (target === SELECTED_ZONE) moveToSelected(row);
    else if (target === AVAILABLE_ZONE) moveToAvailable(row);
  }

  const activeRow = activeKey ? byKey.get(activeKey) ?? null : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col gap-2">
        {/* Search bar */}
        <div className="relative">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 pr-16 text-sm placeholder:text-ink-mute focus:border-accent focus:outline-none"
          />
          {search && (
            <span
              aria-live="polite"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute"
            >
              {matchCount} match{matchCount === 1 ? '' : 'es'}
            </span>
          )}
        </div>

        {/* Selected list */}
        <SelectedZone
          rows={selected}
          onRemove={moveToAvailable}
          rowWarning={rowWarning}
          emptyLabel={emptySelectedLabel}
          mode={mode}
        />

        {/* Available list */}
        <AvailableZone
          rows={filtered.filter((p) => !selected.some((s) => s.key === p.key))}
          onAdd={moveToSelected}
          rowWarning={rowWarning}
          emptyLabel={emptyAvailableLabel}
        />
      </div>

      <DragOverlay>
        {activeRow && (
          <div className="flex items-center gap-2 rounded-xl border border-accent bg-bg-card px-3 py-2 shadow-xl">
            <Avatar name={activeRow.name} size={28} surfaceColor="var(--bg-card)" />
            <span className="font-display text-sm uppercase tracking-[0.04em]">
              {activeRow.name}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

function SelectedZone({
  rows,
  onRemove,
  rowWarning,
  emptyLabel,
  mode,
}: {
  rows: PersonRow[];
  onRemove: (p: PersonRow) => void;
  rowWarning?: (p: PersonRow) => string | null;
  emptyLabel: string;
  mode: Mode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: SELECTED_ZONE });
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-mute">
        {mode === 'single' ? 'Picked' : `Selected · ${rows.length}`}
      </p>
      <div
        ref={setNodeRef}
        className={clsx(
          'flex min-h-[3rem] flex-col gap-1.5 rounded-2xl border bg-bg-card/40 p-2 transition',
          isOver ? 'border-accent bg-accent/5' : 'border-line',
        )}
      >
        {rows.length === 0 ? (
          <p className="px-1 py-2 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            {emptyLabel}
          </p>
        ) : (
          rows.map((p) => (
            <DraggableRow
              key={p.key}
              row={p}
              role="selected"
              warning={rowWarning?.(p) ?? null}
              onTap={() => onRemove(p)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function AvailableZone({
  rows,
  onAdd,
  rowWarning,
  emptyLabel,
}: {
  rows: PersonRow[];
  onAdd: (p: PersonRow) => void;
  rowWarning?: (p: PersonRow) => string | null;
  emptyLabel: string;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: AVAILABLE_ZONE });
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-ink-mute">
        Available · {rows.length}
      </p>
      <div
        ref={setNodeRef}
        className={clsx(
          'flex max-h-[20rem] flex-col gap-1.5 overflow-y-auto rounded-2xl border bg-bg-card/40 p-2 transition',
          isOver ? 'border-accent bg-accent/5' : 'border-line',
        )}
      >
        {rows.length === 0 ? (
          <p className="px-1 py-3 text-center font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            {emptyLabel}
          </p>
        ) : (
          rows.map((p) => (
            <DraggableRow
              key={p.key}
              row={p}
              role="available"
              warning={rowWarning?.(p) ?? null}
              onTap={() => onAdd(p)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableRow({
  row,
  role,
  warning,
  onTap,
}: {
  row: PersonRow;
  role: 'available' | 'selected';
  warning: string | null;
  onTap: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: row.key,
  });
  // Hide the source row while dragging so the DragOverlay is the only
  // visual; matches the lineup editor's behavior.
  const style = {
    opacity: isDragging ? 0 : 1,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      role="button"
      tabIndex={0}
      onClick={onTap}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onTap();
        }
      }}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line bg-bg px-2.5 py-2 text-left transition active:scale-[0.99] hover:border-ink-dim"
    >
      <Avatar name={row.name} size={32} surfaceColor="var(--bg)" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold">{row.name}</p>
        <p className="truncate font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">
          {row.email}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {!row.isClaimed && (
          <span className="rounded-md border border-line bg-bg-card px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-ink-dim">
            Staged
          </span>
        )}
        {warning && (
          <span
            className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em]"
            style={{
              color: 'var(--accent)',
              borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)',
            }}
            title={warning}
          >
            ⚠ {warning}
          </span>
        )}
      </div>
      <span
        aria-hidden
        className="ml-1 font-mono text-[11px] text-ink-mute"
      >
        {role === 'selected' ? '×' : '＋'}
      </span>
    </div>
  );
}
