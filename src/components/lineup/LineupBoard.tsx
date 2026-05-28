import { useCallback, useEffect, useMemo, useState } from 'react';
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
import clsx from 'clsx';
import { Avatar } from '@/components/shared/Avatar';
import {
  BUCKETS,
  BUCKET_ACCENT,
  BUCKET_LABEL,
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

  // Reconcile internal state with the live players list whenever team
  // membership changes (e.g. after `ensureTeamMember` adds a captain,
  // or an admin moves someone in/out of the team). Without this, useState
  // would only honour `initial` at mount and any later membership change
  // would result in "ghost" players who exist in `byId` but live in no
  // bucket, causing clicks/drops to silently no-op.
  useEffect(() => {
    setState((prev) => {
      const validUids = new Set(players.map((p) => p.uid));
      const placed = new Set<string>();
      const filterBucket = (b: string[]): string[] => {
        const out: string[] = [];
        for (const u of b) {
          if (!validUids.has(u)) continue; // member was removed from team
          if (placed.has(u)) continue;
          placed.add(u);
          out.push(u);
        }
        return out;
      };
      const nextPitch = filterBucket(prev.pitch);
      const nextTentative = filterBucket(prev.tentative);
      const nextSubstitutes = filterBucket(prev.substitutes);
      const nextNotPlaying = filterBucket(prev.notPlaying);

      // Anyone in `players` not yet in any bucket → drop them into
      // notPlaying. Preserves all existing placements.
      const missing = players
        .map((p) => p.uid)
        .filter((u) => !placed.has(u));

      // Bail out if nothing changed — avoids triggering a re-render loop.
      const changed =
        nextPitch.length !== prev.pitch.length ||
        nextTentative.length !== prev.tentative.length ||
        nextSubstitutes.length !== prev.substitutes.length ||
        nextNotPlaying.length !== prev.notPlaying.length ||
        missing.length > 0;
      if (!changed) return prev;

      return {
        pitch: nextPitch,
        tentative: nextTentative,
        substitutes: nextSubstitutes,
        notPlaying: [...nextNotPlaying, ...missing],
      };
    });
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

  // Which bucket's "+ Add" search panel is currently expanded. Only one
  // can be open at a time so the screen doesn't blow up.
  const [quickAddBucket, setQuickAddBucket] = useState<BucketId | null>(null);
  const [quickAddQuery, setQuickAddQuery] = useState('');

  // Tap-to-move sheet — when a player tile is tapped (not dragged), we
  // pop up a small chooser so the user can move them to any other
  // bucket without needing to find a drop target on a small screen.
  const [moveTargetUid, setMoveTargetUid] = useState<string | null>(null);

  const performMove = useCallback(
    (uid: string, to: BucketId) => {
      const from = findBucket(state, uid);
      const player = byId.get(uid);
      // Surface every failure case so the click never looks "dead" —
      // previously this returned silently and users couldn't tell why
      // a tap had no effect.
      if (!player) {
        // eslint-disable-next-line no-console
        console.warn('Lineup move: no player record for', uid);
        setRejectMsg(`Player "${uid}" missing from team roster — refresh and retry.`);
        window.setTimeout(() => setRejectMsg(null), 2200);
        return;
      }
      if (!from) {
        // eslint-disable-next-line no-console
        console.warn('Lineup move: player not in any bucket', uid, state);
        setRejectMsg(`${player.name} isn't in any bucket yet — refresh and retry.`);
        window.setTimeout(() => setRejectMsg(null), 2200);
        return;
      }
      if (from === to) {
        // Already there — quietly close any open quick-add and exit.
        return;
      }
      const decision = canDrop({ player, from, to, state, sport });
      if (!decision.ok) {
        setRejectMsg(decision.reason);
        window.setTimeout(() => setRejectMsg(null), 2200);
        return;
      }
      const next = applyMove(state, uid, from, to);
      const prev = state;
      setState(next);
      if (onChange) {
        Promise.resolve(onChange(next, { uid, from, to })).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Lineup save failed:', err);
          setState(prev);
          const detail =
            err instanceof Error ? `: ${err.message}` : '';
          setRejectMsg(`Could not save${detail}. Reverted.`);
          window.setTimeout(() => setRejectMsg(null), 3500);
        });
      }
    },
    [byId, onChange, sport, state],
  );

  // Players eligible to add to a target bucket = everyone NOT already in
  // that bucket, fuzzy-filtered by the per-bucket search box.
  const quickAddCandidates = useMemo(() => {
    if (!quickAddBucket) return [] as LineupPlayer[];
    const inThisBucket = new Set(state[quickAddBucket]);
    const remaining = players.filter((p) => !inThisBucket.has(p.uid));
    const q = quickAddQuery.trim();
    if (!q) return remaining;
    const idx = new Fuse(remaining as LineupPlayer[], {
      keys: ['name'],
      threshold: 0.4,
      ignoreLocation: true,
      minMatchCharLength: 1,
    });
    return idx.search(q).map((r) => r.item);
  }, [players, state, quickAddBucket, quickAddQuery]);

  const renderQuickAdd = (bucket: BucketId) => {
    const isOpen = quickAddBucket === bucket;
    const accent = BUCKET_ACCENT[bucket];
    return (
      <button
        type="button"
        onClick={() => {
          setQuickAddBucket(isOpen ? null : bucket);
          setQuickAddQuery('');
        }}
        className={clsx(
          'ml-1 shrink-0 rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] transition',
          isOpen
            ? 'bg-bg-elev'
            : 'bg-bg-card hover:bg-bg-elev',
        )}
        style={{
          color: isOpen ? accent : 'var(--ink-dim)',
          borderColor: isOpen ? accent : 'var(--line)',
        }}
        aria-expanded={isOpen}
      >
        {isOpen ? '×' : '+ Add'}
      </button>
    );
  };

  const renderQuickAddPanel = (bucket: BucketId) => {
    if (quickAddBucket !== bucket) return null;
    const accent = BUCKET_ACCENT[bucket];
    return (
      <div
        className="flex flex-col gap-2 rounded-xl border bg-bg px-2 py-2"
        style={{ borderColor: 'var(--line)' }}
      >
        <input
          value={quickAddQuery}
          onChange={(e) => setQuickAddQuery(e.target.value)}
          placeholder={`Search to add to ${BUCKET_LABEL[bucket]}…`}
          autoFocus
          className="w-full rounded-lg border border-line bg-bg-card px-3 py-2 text-sm placeholder:text-ink-mute focus:border-accent focus:outline-none"
        />
        {quickAddCandidates.length === 0 ? (
          <p className="px-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
            {quickAddQuery
              ? 'No matches.'
              : `Everyone is already in ${BUCKET_LABEL[bucket]}.`}
          </p>
        ) : (
          <ul className="flex max-h-44 flex-col gap-1 overflow-y-auto">
            {quickAddCandidates.slice(0, 30).map((p) => {
              const from = findBucket(state, p.uid);
              return (
                <li key={p.uid}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      performMove(p.uid, bucket);
                      setQuickAddQuery('');
                    }}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg border border-line bg-bg-card px-2 py-1.5 text-left transition hover:border-accent hover:bg-bg-elev active:scale-[0.99]"
                  >
                    <Avatar
                      name={p.name}
                      teamId={p.teamId}
                      size={28}
                      isCaptain={p.isCaptain || p.isGroupCaptain}
                      captainColor={p.isCaptain ? 'var(--accent-3)' : 'var(--gold)'}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {p.name}
                    </span>
                    {from && (
                      <span
                        className="shrink-0 font-mono text-[9px] uppercase tracking-[0.06em]"
                        style={{ color: BUCKET_ACCENT[from] }}
                      >
                        {BUCKET_LABEL[from]}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em]"
                      style={{ color: accent }}
                    >
                      →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    );
  };

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

      {moveTargetUid && (() => {
        const player = byId.get(moveTargetUid);
        const currentBucket = findBucket(state, moveTargetUid);
        if (!player || !currentBucket) {
          // Defensive — close the sheet rather than render a half-broken one.
          window.setTimeout(() => setMoveTargetUid(null), 0);
          return null;
        }
        return (
          <MoveSheet
            player={player}
            from={currentBucket}
            onPick={(to) => {
              performMove(moveTargetUid, to);
              setMoveTargetUid(null);
            }}
            onClose={() => setMoveTargetUid(null)}
          />
        );
      })()}

      <BucketSection
        bucket="pitch"
        count={state.pitch.length}
        cap={sport.playersOnField}
        headerExtra={renderQuickAdd('pitch')}
        topPanel={renderQuickAddPanel('pitch')}
      >
        {state.pitch.map((uid) => {
          const p = byId.get(uid);
          return p ? (
            <DragTile
              key={uid}
              player={p}
              dimmed={!isMatch(uid)}
              onTap={() => setMoveTargetUid(uid)}
              onRemove={() => performMove(uid, 'notPlaying')}
            />
          ) : null;
        })}
      </BucketSection>

      <BucketSection
        bucket="tentative"
        count={state.tentative.length}
        headerExtra={renderQuickAdd('tentative')}
        topPanel={renderQuickAddPanel('tentative')}
      >
        {state.tentative.map((uid) => {
          const p = byId.get(uid);
          return p ? (
            <DragTile
              key={uid}
              player={p}
              dimmed={!isMatch(uid)}
              onTap={() => setMoveTargetUid(uid)}
              onRemove={() => performMove(uid, 'notPlaying')}
            />
          ) : null;
        })}
      </BucketSection>

      <BucketSection
        bucket="substitutes"
        count={state.substitutes.length}
        cap={sport.substitutes}
        headerExtra={renderQuickAdd('substitutes')}
        topPanel={renderQuickAddPanel('substitutes')}
      >
        {state.substitutes.map((uid) => {
          const p = byId.get(uid);
          return p ? (
            <DragTile
              key={uid}
              player={p}
              dimmed={!isMatch(uid)}
              onTap={() => setMoveTargetUid(uid)}
              onRemove={() => performMove(uid, 'notPlaying')}
            />
          ) : null;
        })}
      </BucketSection>

      <BucketSection
        bucket="notPlaying"
        count={state.notPlaying.length}
        headerExtra={renderQuickAdd('notPlaying')}
        topPanel={renderQuickAddPanel('notPlaying')}
      >
        {state.notPlaying.map((uid) => {
          const p = byId.get(uid);
          // No × on notPlaying tiles — they're already off the playing
          // roster. Tap or drag to put them back in if needed.
          return p ? (
            <DragTile
              key={uid}
              player={p}
              dimmed={!isMatch(uid)}
              onTap={() => setMoveTargetUid(uid)}
            />
          ) : null;
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

/**
 * Tap-to-move chooser. Renders an inline panel listing every bucket
 * other than the player's current one — tap a destination to move
 * them. Used when the user taps a player tile (drag still works
 * via long-press / pointer-distance).
 */
function MoveSheet({
  player,
  from,
  onPick,
  onClose,
}: {
  player: LineupPlayer;
  from: BucketId;
  onPick: (to: BucketId) => void;
  onClose: () => void;
}) {
  const destinations: BucketId[] = BUCKETS.filter((b) => b !== from);
  return (
    <div className="mx-5 mb-3 rounded-2xl border border-line bg-bg-card p-3">
      <header className="mb-2 flex items-center justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            Move {player.name.split(' ')[0]}
          </p>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-ink-mute">
            Currently in {BUCKET_LABEL[from]}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim hover:text-accent"
        >
          Close
        </button>
      </header>
      <div className="grid grid-cols-2 gap-2">
        {destinations.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => onPick(b)}
            className="flex items-center gap-2 rounded-lg border border-line bg-bg px-3 py-2 text-left hover:border-accent hover:bg-bg-elev active:scale-[0.99]"
          >
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: BUCKET_ACCENT[b] }}
            />
            <span className="font-mono text-[10px] uppercase tracking-[0.06em]">
              {BUCKET_LABEL[b]}
            </span>
            <span aria-hidden className="ml-auto text-ink-mute">
              →
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
