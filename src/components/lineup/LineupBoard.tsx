import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import Fuse from 'fuse.js';
import { Avatar } from '@/components/shared/Avatar';
import {
  BUCKETS,
  applyMove,
  canDrop,
  findBucket,
  type BucketId,
  type LineupPlayer,
  type LineupSport,
  type LineupState,
} from '@/lib/lineup';
import { BucketSection } from './BucketSection';
import { DragTile } from './DragTile';

type Props = {
  sport: LineupSport;
  players: readonly LineupPlayer[];
  initial: LineupState;
  /**
   * Called with the next state after every valid drop. Caller is responsible
   * for persistence (optimistic update is already in the local state).
   * Returning a rejected promise reverts to the previous state.
   */
  onChange?: (next: LineupState, ctx: { uid: string; from: BucketId; to: BucketId }) => Promise<void> | void;
};

export function LineupBoard({ sport, players, initial, onChange }: Props) {
  const [state, setState] = useState<LineupState>(initial);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [rejectMsg, setRejectMsg] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Static fuzzy index over the roster (rebuilt only when the player list
  // identity changes). Returns the set of uids that match the query, used
  // to dim non-matching tiles in place across all buckets.
  const fuse = useMemo(
    () =>
      new Fuse(players as LineupPlayer[], {
        keys: ['name'],
        threshold: 0.4,
        ignoreLocation: true,
        minMatchCharLength: 2,
      }),
    [players],
  );
  const matchedUids = useMemo<Set<string> | null>(() => {
    const q = search.trim();
    if (!q) return null;
    return new Set(fuse.search(q).map((r) => r.item.uid));
  }, [fuse, search]);
  const matchCount = matchedUids ? matchedUids.size : players.length;
  const isMatch = (uid: string): boolean =>
    matchedUids === null || matchedUids.has(uid);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const byId = useMemo(() => {
    const m = new Map<string, LineupPlayer>();
    for (const p of players) m.set(p.uid, p);
    return m;
  }, [players]);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveUid(String(e.active.id));
    setRejectMsg(null);
  }, []);

  const handleDragEnd = useCallback(
    (e: DragEndEvent) => {
      setActiveUid(null);
      const { active, over } = e;
      if (!over) return;
      const uid = String(active.id);
      const to = String(over.id) as BucketId;
      if (!(BUCKETS as readonly string[]).includes(to)) return;
      const from = findBucket(state, uid);
      const player = byId.get(uid);
      if (!from || !player) return;
      const decision = canDrop({ player, from, to, state, sport });
      if (!decision.ok) {
        setRejectMsg(decision.reason);
        window.setTimeout(() => setRejectMsg(null), 1800);
        return;
      }
      const next = applyMove(state, uid, from, to);
      const prev = state;
      setState(next);
      if (onChange) {
        Promise.resolve(onChange(next, { uid, from, to })).catch(() => {
          setState(prev);
          setRejectMsg('Could not save. Reverted.');
          window.setTimeout(() => setRejectMsg(null), 2000);
        });
      }
    },
    [byId, onChange, sport, state],
  );

  const activePlayer = activeUid ? byId.get(activeUid) ?? null : null;

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <header className="mx-5 mb-4 rounded-2xl border border-line bg-bg-card px-4 py-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-dim">
          {sport.format}
        </p>
        <h2 className="mt-1 font-display text-2xl uppercase">{sport.name}</h2>
      </header>

      {/* Fuzzy search across all four buckets — non-matching tiles are
          dimmed in place rather than removed so spatial memory holds. */}
      <div className="relative mx-5 mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search players…"
          className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 pr-20 text-sm placeholder:text-ink-mute focus:border-accent focus:outline-none"
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

      {rejectMsg && (
        <div
          role="alert"
          className="mx-5 mb-3 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em] text-accent"
        >
          {rejectMsg}
        </div>
      )}

      <BucketSection bucket="pitch" count={state.pitch.length} cap={sport.playersOnField}>
        {state.pitch.map((uid) => {
          const p = byId.get(uid);
          return p ? <DragTile key={uid} player={p} dimmed={!isMatch(uid)} /> : null;
        })}
      </BucketSection>

      <BucketSection bucket="tentative" count={state.tentative.length}>
        {state.tentative.map((uid) => {
          const p = byId.get(uid);
          return p ? <DragTile key={uid} player={p} dimmed={!isMatch(uid)} /> : null;
        })}
      </BucketSection>

      <BucketSection bucket="substitutes" count={state.substitutes.length} cap={sport.substitutes}>
        {state.substitutes.map((uid) => {
          const p = byId.get(uid);
          return p ? <DragTile key={uid} player={p} dimmed={!isMatch(uid)} /> : null;
        })}
      </BucketSection>

      <BucketSection bucket="notPlaying" count={state.notPlaying.length}>
        {state.notPlaying.map((uid) => {
          const p = byId.get(uid);
          return p ? <DragTile key={uid} player={p} dimmed={!isMatch(uid)} /> : null;
        })}
      </BucketSection>

      <DragOverlay>
        {activePlayer && (
          <div className="flex flex-col items-center gap-1.5">
            <Avatar
              name={activePlayer.name}
              teamId={activePlayer.teamId}
              isCaptain={activePlayer.isCaptain}
              googlePhotoUrl={activePlayer.googlePhotoUrl}
              adminPhotoUrl={activePlayer.adminPhotoUrl}
              size={64}
              surfaceColor="var(--bg)"
            />
            <span className="font-display text-[11px] uppercase tracking-[0.06em]">
              {activePlayer.name.split(' ')[0]}
            </span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
