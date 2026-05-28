import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { onSnapshot, setDoc } from 'firebase/firestore';
import clsx from 'clsx';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { PlayerPicker } from '@/components/shared/PlayerPicker';
import { LineupBoard } from '@/components/lineup/LineupBoard';
import { useRole } from '@/lib/roles';
import { useAuth } from '@/lib/auth';
import { useActiveEvent, isEventLocked } from '@/lib/activeEvent';
import { useAllEventPlayers, type PersonRow } from '@/lib/playerDirectory';
import {
  ensureTeamMember,
  rosterRef,
  sportRef,
  sportsCol,
  teamRef,
  teamsCol,
  type RosterDoc,
} from '@/lib/db';
import type { LineupPlayer, LineupSport, LineupState } from '@/lib/lineup';
import type { SportDoc } from '@/types/sport';
import type { TeamDoc } from '@/types/player';
import type { TeamId } from '@/types/team';

/**
 * Sport Captain lineup editor. Visible only to users who hold the
 * `sport-cap` role for at least one (sportId, teamId) pair in the active
 * event. If they captain multiple sports, a switcher pill at the top
 * lets them flip between boards.
 */
export default function LineupScreen() {
  const role = useRole();
  const { activeEventId, event } = useActiveEvent();
  // Lineup edits freeze for captains once the event start date arrives.
  // Admins / super-admins bypass the lock so they can fix late-breaking
  // changes (injuries, walkovers, etc.) once the fest is live.
  const isAdminRole = role.is('admin');
  const locked = !isAdminRole && isEventLocked(event);
  const captaincies = role.sportCaptainOf;
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Admin / GC override — when the active mode is admin, super-admin, or
  // group-cap and the user has no natural sport-captaincy, surface a
  // sport + team picker.
  //   - Admin / Super Admin: every (sport, team) combination in the event.
  //   - Group Captain: every sport × their captain team(s) only.
  // Server-side rules already authorise both admin writes and GC writes
  // to rosters of teams they captain.
  const isAdmin = role.is('admin');
  const isGroupCap = !isAdmin && role.is('group-cap');
  const showAdminPicker =
    (isAdmin || isGroupCap) && captaincies.length === 0 && !!activeEventId;
  const gcTeamIds = role.groupCaptainOf;
  const [allTeams, setAllTeams] = useState<{ id: TeamId; name: string }[]>([]);
  const [allSports, setAllSports] = useState<{ id: string; name: string }[]>([]);
  const [adminSportId, setAdminSportId] = useState<string | null>(null);
  const [adminTeamId, setAdminTeamId] = useState<TeamId | null>(null);

  useEffect(() => {
    if (!showAdminPicker || !activeEventId) return;
    const unsubT = onSnapshot(teamsCol(activeEventId), (snap) => {
      setAllTeams(
        snap.docs.map((d) => ({ id: d.id as TeamId, name: d.data().name ?? d.id })),
      );
    });
    const unsubS = onSnapshot(sportsCol(activeEventId), (snap) => {
      setAllSports(snap.docs.map((d) => ({ id: d.id, name: d.data().name ?? d.id })));
    });
    return () => {
      unsubT();
      unsubS();
    };
  }, [showAdminPicker, activeEventId]);

  // Team list visible in the picker: admins see every team, GCs see only
  // teams they captain.
  const pickerTeams = useMemo(() => {
    if (isAdmin) return allTeams;
    if (isGroupCap) {
      const allowed = new Set<TeamId>(gcTeamIds);
      return allTeams.filter((t) => allowed.has(t.id));
    }
    return [];
  }, [isAdmin, isGroupCap, allTeams, gcTeamIds]);

  // Default the pickers to the first option as soon as data lands.
  useEffect(() => {
    if (!adminSportId && allSports.length > 0) setAdminSportId(allSports[0]!.id);
  }, [adminSportId, allSports]);
  useEffect(() => {
    if (adminTeamId && pickerTeams.some((t) => t.id === adminTeamId)) return;
    if (pickerTeams.length > 0) setAdminTeamId(pickerTeams[0]!.id);
  }, [adminTeamId, pickerTeams]);

  if (role.loading) {
    return (
      <>
        <TopBar title="Edit Lineup" />
        <main className="mx-auto max-w-[420px] pb-28">
          <p className="px-5 text-ink-dim">Checking your captaincy…</p>
        </main>
      </>
    );
  }

  if (!activeEventId) {
    return (
      <>
        <TopBar title="Edit Lineup" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="No active event"
            hint="Pick an event from the top bar to see your sport."
          />
        </main>
      </>
    );
  }

  if (captaincies.length === 0 && !showAdminPicker) {
    return (
      <>
        <TopBar title="Edit Lineup" />
        <main className="mx-auto max-w-[420px] pb-28">
          <EmptyState
            title="Not a Sport Captain"
            hint="Once your Group Captain picks you as the Sport Captain for a sport, the four-bucket drag-and-drop will appear here."
          />
        </main>
      </>
    );
  }

  if (showAdminPicker) {
    if (allSports.length === 0 || pickerTeams.length === 0) {
      return (
        <>
          <TopBar title="Edit Lineup" />
          <main className="mx-auto max-w-[420px] pb-28">
            <EmptyState
              title={isAdmin ? 'Event setup incomplete' : 'No team to manage'}
              hint={
                isAdmin
                  ? 'Create at least one team and one sport on the admin tabs first.'
                  : "You don't appear to be the Group Captain of any team in this event yet."
              }
            />
          </main>
        </>
      );
    }

    return (
      <>
        <TopBar title="Edit Lineup" />
        <main className="mx-auto max-w-[420px] pb-28">
          <div className="mx-5 mb-3 grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                Sport
              </span>
              <select
                value={adminSportId ?? ''}
                onChange={(e) => setAdminSportId(e.target.value)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase text-ink focus:border-accent focus:outline-none"
              >
                {allSports.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                Team
              </span>
              <select
                value={adminTeamId ?? ''}
                onChange={(e) => setAdminTeamId(e.target.value as TeamId)}
                className="w-full rounded-xl border border-line bg-bg px-3 py-2.5 text-sm uppercase text-ink focus:border-accent focus:outline-none"
                disabled={pickerTeams.length === 1}
              >
                {pickerTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {adminSportId && adminTeamId && (
            <LineupEditor
              key={`${activeEventId}-${adminTeamId}-${adminSportId}`}
              eventId={activeEventId}
              sportId={adminSportId}
              teamId={adminTeamId}
              locked={locked}
            />
          )}
        </main>
      </>
    );
  }

  const active = captaincies[Math.min(selectedIdx, captaincies.length - 1)]!;

  return (
    <>
      <TopBar title="Edit Lineup" />
      <main className="mx-auto max-w-[420px] pb-28">
        {captaincies.length > 1 && (
          <div className="mx-5 mb-3 flex gap-1.5 overflow-x-auto">
            {captaincies.map((c, i) => {
              const isActive = i === selectedIdx;
              return (
                <button
                  key={`${c.sportId}-${c.teamId}`}
                  type="button"
                  onClick={() => setSelectedIdx(i)}
                  className={clsx(
                    'shrink-0 rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.06em] transition',
                    isActive
                      ? 'border-accent bg-accent text-bg'
                      : 'border-line bg-bg-card text-ink-dim',
                  )}
                >
                  {c.sportId}
                </button>
              );
            })}
          </div>
        )}
        <LineupEditor
          key={`${activeEventId}-${active.teamId}-${active.sportId}`}
          eventId={activeEventId}
          sportId={active.sportId}
          teamId={active.teamId}
          locked={locked}
        />
      </main>
    </>
  );
}

function LineupEditor({
  eventId,
  sportId,
  teamId,
  locked = false,
}: {
  eventId: string;
  sportId: string;
  teamId: string;
  /** When true, the editor renders read-only with a locked banner.
   *  Captains hit this once the event start date has arrived;
   *  admins / super-admins always get locked=false. */
  locked?: boolean;
}) {
  const qc = useQueryClient();
  const role = useRole();
  const userEmail = useUserEmail();
  const [sport, setSport] = useState<SportDoc | null>(null);
  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [roster, setRoster] = useState<RosterDoc | null>(null);
  const [docsLoaded, setDocsLoaded] = useState<{
    sport: boolean;
    team: boolean;
    roster: boolean;
  }>({ sport: false, team: false, roster: false });
  const { people } = useAllEventPlayers();

  // UI state for the captain assignment pickers — only one is open at a time.
  const [picker, setPicker] = useState<null | 'group' | 'sport'>(null);

  useEffect(() => {
    return onSnapshot(sportRef(eventId, sportId), (snap) => {
      setSport(snap.exists() ? snap.data() : null);
      setDocsLoaded((s) => ({ ...s, sport: true }));
    });
  }, [eventId, sportId]);

  useEffect(() => {
    return onSnapshot(teamRef(eventId, teamId), (snap) => {
      setTeam(snap.exists() ? snap.data() : null);
      setDocsLoaded((s) => ({ ...s, team: true }));
    });
  }, [eventId, teamId]);

  useEffect(() => {
    return onSnapshot(rosterRef(eventId, teamId, sportId), (snap) => {
      setRoster(snap.exists() ? snap.data() : null);
      setDocsLoaded((s) => ({ ...s, roster: true }));
    });
  }, [eventId, teamId, sportId]);

  const save = useMutation({
    mutationFn: async (next: LineupState) => {
      await setDoc(
        rosterRef(eventId, teamId, sportId),
        {
          pitch: next.pitch,
          tentative: next.tentative,
          substitutes: next.substitutes,
          notPlaying: next.notPlaying,
        },
        { merge: true },
      );
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['rosters', eventId, teamId] });
    },
  });

  // Assign / clear the Group Captain on the team doc. Admin-only on the
  // server (Firestore rule); the UI also gates by `canEditGc` below.
  // Auto-adds the captain to team.members[] so the captain invariant
  // holds even if the email isn't already a team member.
  const assignGc = useMutation({
    mutationFn: async (email: string | null) => {
      const normalized = email?.toLowerCase() ?? null;
      if (normalized) {
        await ensureTeamMember(eventId, teamId, normalized);
      }
      await setDoc(
        teamRef(eventId, teamId),
        { groupCaptainEmail: normalized },
        { merge: true },
      );
    },
    onSuccess: () => {
      setPicker(null);
      void qc.invalidateQueries({ queryKey: ['teams', eventId] });
    },
  });

  // Assign / clear the Sport Captain on the per-sport roster doc.
  // Allowed for admins and for the team's Group Captain. Auto-adds the
  // SC to team.members[] for the same invariant.
  const assignSc = useMutation({
    mutationFn: async (email: string | null) => {
      const normalized = email?.toLowerCase() ?? null;
      if (normalized) {
        await ensureTeamMember(eventId, teamId, normalized);
      }
      await setDoc(
        rosterRef(eventId, teamId, sportId),
        { sportCaptainEmail: normalized },
        { merge: true },
      );
    },
    onSuccess: () => {
      setPicker(null);
      void qc.invalidateQueries({ queryKey: ['rosters', eventId, teamId] });
    },
  });

  const allLoaded = docsLoaded.sport && docsLoaded.team && docsLoaded.roster;

  // Compose LineupPlayer[] from team members, joined with the global
  // player directory for name/photo data. Players on the team but absent
  // from the directory (claimed user not yet visible to this client)
  // still render with their email as the display fallback.
  const players: LineupPlayer[] = useMemo(() => {
    if (!team) return [];
    const byEmail = new Map<string, PersonRow>();
    for (const p of people) byEmail.set(p.email.toLowerCase(), p);
    const sportCaptainEmail = roster?.sportCaptainEmail?.toLowerCase() ?? null;
    const groupCaptainEmail = team.groupCaptainEmail?.toLowerCase() ?? null;
    return team.members.map((rawEmail) => {
      const email = rawEmail.toLowerCase();
      const directory = byEmail.get(email);
      return {
        // The lineup helpers key buckets by `uid`; we use email here so
        // RosterDoc.pitch/etc. arrays (string[] of emails) drop in
        // directly without translation.
        uid: email,
        name: directory?.name ?? email.split('@')[0]!,
        teamId: team.color,
        isCaptain: !!sportCaptainEmail && sportCaptainEmail === email,
        isGroupCaptain: !!groupCaptainEmail && groupCaptainEmail === email,
        googlePhotoUrl: null,
        adminPhotoUrl: null,
      };
    });
  }, [team, people, roster?.sportCaptainEmail, team?.groupCaptainEmail]);

  // Initial state — any team member not already in pitch/tentative/subs
  // defaults to notPlaying so they appear somewhere. Order matters:
  //   1. Read whatever buckets are persisted (lowercased).
  //   2. Mark those emails as "known".
  //   3. Auto-park the Sport Captain on the pitch if they're not yet
  //      placed — *and* add them to `known` so the remainder pass below
  //      doesn't ALSO drop them into notPlaying (the bug that put the
  //      captain into both pitch and notPlaying).
  //   4. Compute remainder = team.members - known and merge into
  //      notPlaying so every team member appears somewhere exactly once.
  const initial: LineupState = useMemo(() => {
    const empty: LineupState = {
      pitch: [],
      tentative: [],
      substitutes: [],
      notPlaying: [],
    };
    if (!team) return empty;

    // Cross-bucket dedup + ghost filter.
    //
    // Drop any email that is no longer in team.members. Roster docs can
    // accumulate "ghost" emails — players who were once on the team but
    // since got moved to another team or removed entirely. Those ghosts
    // never render (byId doesn't know about them) but they still count
    // toward the bucket header, e.g. "ON THE PITCH 2/2" with zero
    // visible tiles. Excluding them here keeps the count honest and
    // makes the next drop persist the cleanup.
    const memberEmails = new Set(team.members.map((m) => m.toLowerCase()));
    const placed = new Set<string>();
    const take = (raw: string[]): string[] => {
      const out: string[] = [];
      for (const r of raw) {
        const e = r.toLowerCase();
        if (placed.has(e)) continue;
        if (!memberEmails.has(e)) continue; // ghost — skip
        placed.add(e);
        out.push(e);
      }
      return out;
    };
    const pitch = take(roster?.pitch ?? []);
    const tentative = take(roster?.tentative ?? []);
    const substitutes = take(roster?.substitutes ?? []);
    const notPlaying = take(roster?.notPlaying ?? []);

    // Auto-park the Sport Captain on pitch before computing the
    // remainder, so they aren't also added to notPlaying — but ONLY if
    // the pitch isn't already at the configured cap. For singles
    // (playersOnField=1), if another player is already on pitch we
    // shunt the captain to tentative instead of pushing pitch to 2/1.
    const capEmail = roster?.sportCaptainEmail?.toLowerCase() ?? null;
    const pitchCap = sport?.playersOnField ?? Infinity;
    if (
      capEmail &&
      !placed.has(capEmail) &&
      team.members.some((m) => m.toLowerCase() === capEmail)
    ) {
      if (pitch.length < pitchCap) {
        pitch.unshift(capEmail);
      } else {
        // Pitch is at cap — drop the captain into tentative so they
        // stay visible to the sport captain but don't overflow the
        // playing eleven.
        tentative.unshift(capEmail);
      }
      placed.add(capEmail);
    }

    // Also enforce the cap on the pitch itself in case the stored
    // roster was persisted before a sport's playersOnField was
    // tightened (e.g. doubles → singles). Excess players slide into
    // tentative.
    let overflow: string[] = [];
    if (pitch.length > pitchCap) {
      overflow = pitch.slice(pitchCap);
      pitch.length = pitchCap;
    }

    // Anyone on the team but not yet in a bucket defaults to notPlaying.
    const remainder = team.members
      .map((e) => e.toLowerCase())
      .filter((e) => !placed.has(e));
    for (const e of remainder) placed.add(e);

    return {
      pitch,
      tentative: [...overflow, ...tentative],
      substitutes,
      notPlaying: [...notPlaying, ...remainder],
    };
  }, [team, roster]);

  // ALL hooks must run on every render, in the same order. Compute the
  // picker-related memos here — before any early returns — using safe
  // fallbacks when `team` hasn't loaded yet.
  const gcEmail = team?.groupCaptainEmail?.toLowerCase() ?? null;
  const scEmail = roster?.sportCaptainEmail?.toLowerCase() ?? null;
  const currentSelectionEmail = picker === 'group' ? gcEmail : scEmail;

  const memberSet = useMemo(
    () => new Set((team?.members ?? []).map((e) => e.toLowerCase())),
    [team?.members],
  );
  const memberRows: PersonRow[] = useMemo(
    () => people.filter((p) => memberSet.has(p.email.toLowerCase())),
    [people, memberSet],
  );
  const selectedRows: PersonRow[] = useMemo(() => {
    if (!currentSelectionEmail) return [];
    const hit = memberRows.find(
      (r) => r.email.toLowerCase() === currentSelectionEmail,
    );
    return hit ? [hit] : [];
  }, [currentSelectionEmail, memberRows]);
  const availableRows: PersonRow[] = useMemo(
    () =>
      memberRows.filter(
        (r) => r.email.toLowerCase() !== currentSelectionEmail,
      ),
    [memberRows, currentSelectionEmail],
  );

  if (!allLoaded) {
    return <p className="px-5 text-ink-dim">Loading lineup…</p>;
  }
  if (!sport) {
    return (
      <EmptyState
        title="Sport not found"
        hint={`Your captaincy points at the sport "${sportId}" but it isn't in this event.`}
      />
    );
  }
  if (!team) {
    return (
      <EmptyState
        title="Team not found"
        hint={`Your captaincy points at team "${teamId}" but it's been deleted.`}
      />
    );
  }

  const lineupSport: LineupSport = {
    id: sportId,
    name: sport.name,
    playersOnField: sport.playersOnField,
    substitutes: sport.substitutes,
    format: sport.format || sport.duration || '',
  };

  // Resolve display names for the captains so we can render them in the
  // header. Falls back to the email local-part for staged users not yet
  // in the directory.
  const directoryByEmail = new Map<string, PersonRow>();
  for (const p of people) directoryByEmail.set(p.email.toLowerCase(), p);
  const gcName = gcEmail
    ? directoryByEmail.get(gcEmail)?.name ?? gcEmail.split('@')[0]!
    : null;
  const scName = scEmail
    ? directoryByEmail.get(scEmail)?.name ?? scEmail.split('@')[0]!
    : null;

  // Permissions — must match the server-side Firestore rules:
  //  - GC assignment lives on the team doc; admins only.
  //  - SC assignment lives on the per-sport roster; admins OR the team's
  //    Group Captain.
  const isAdmin = role.is('admin');
  const callerIsGc =
    !!userEmail && !!gcEmail && userEmail.toLowerCase() === gcEmail;
  // Admins always bypass the start-date lock; captains lose write
  // privileges once `locked` is true.
  const canEditGc = isAdmin && !locked;
  const canEditSc = (isAdmin || callerIsGc) && !locked;

  return (
    <>
      {/* Captain summary — gold pill for Group Captain, cyan pill for
          Sport Captain. Tap to assign (when permitted). */}
      <div className="mx-5 mb-3 grid grid-cols-2 gap-2">
        <CaptainPill
          label="Group Captain"
          name={gcName}
          color="var(--gold)"
          editable={canEditGc}
          onClick={() => canEditGc && setPicker((p) => (p === 'group' ? null : 'group'))}
          expanded={picker === 'group'}
        />
        <CaptainPill
          label="Sport Captain"
          name={scName}
          color="var(--accent-3)"
          editable={canEditSc}
          onClick={() => canEditSc && setPicker((p) => (p === 'sport' ? null : 'sport'))}
          expanded={picker === 'sport'}
        />
      </div>

      {picker && (
        <CaptainAssignmentPanel
          title={
            picker === 'group' ? 'Assign Group Captain' : 'Assign Sport Captain'
          }
          color={picker === 'group' ? 'var(--gold)' : 'var(--accent-3)'}
          teamColor={team.color}
          available={availableRows}
          selected={selectedRows}
          onChange={(next) => {
            const pickEmail = next[0]?.email.toLowerCase() ?? null;
            if (picker === 'group') assignGc.mutate(pickEmail);
            else assignSc.mutate(pickEmail);
          }}
          onClose={() => setPicker(null)}
          pending={picker === 'group' ? assignGc.isPending : assignSc.isPending}
          error={picker === 'group' ? assignGc.error : assignSc.error}
          emptyHint={
            memberRows.length === 0
              ? 'Add members to this team first (Admin → Teams tab).'
              : null
          }
        />
      )}

      {locked && (
        <div
          className="mx-5 mb-3 rounded-xl border px-3 py-2 font-mono text-[11px] uppercase tracking-[0.06em]"
          style={{
            color: 'var(--accent)',
            borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)',
            background: 'color-mix(in oklab, var(--accent) 10%, transparent)',
          }}
        >
          Lineups are locked — the event has started. Ask an admin to make changes.
        </div>
      )}

      <LineupBoard
        sport={lineupSport}
        players={players}
        initial={initial}
        onChange={
          locked
            ? async () => {
                throw new Error('Lineups are locked — ask an admin to make changes.');
              }
            : async (next) => {
                await save.mutateAsync(next);
              }
        }
      />
    </>
  );
}

function useUserEmail(): string | null {
  const auth = useAuth();
  return auth.status === 'signedIn' ? auth.user.email?.toLowerCase() ?? null : null;
}

function CaptainPill({
  label,
  name,
  color,
  editable,
  expanded,
  onClick,
}: {
  label: string;
  name: string | null;
  color: string;
  editable: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!editable}
      aria-expanded={expanded}
      className={clsx(
        'flex items-center gap-2 rounded-xl border bg-bg-card px-3 py-2 text-left transition',
        editable && 'hover:border-accent active:scale-[0.99] cursor-pointer',
        !editable && 'cursor-default',
      )}
      style={{
        borderColor: expanded ? color : name ? color : 'var(--line)',
      }}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full font-display font-bold leading-none text-black"
        style={{ background: color }}
        aria-hidden="true"
      >
        C
      </span>
      <div className="min-w-0 flex-1">
        <p
          className="truncate font-mono text-[9px] uppercase tracking-[0.12em]"
          style={{ color: name ? color : 'var(--ink-mute)' }}
        >
          {label}
          {editable && (
            <span className="ml-1 text-ink-mute">· {expanded ? 'tap to close' : 'tap to edit'}</span>
          )}
        </p>
        <p className="truncate font-display text-sm uppercase leading-tight">
          {name ?? '—'}
        </p>
      </div>
    </button>
  );
}

/**
 * Captain assignment panel — thin wrapper around the shared
 * `PlayerPicker` so captain selection has the same drag-and-drop +
 * fuzzy-search UX as roster, referee, and admin-grant selection. Border
 * + heading are color-keyed to the role (gold = GC, cyan = SC). Drag a
 * row from Available into Selected (or tap), tap × on the chip to
 * clear.
 */
function CaptainAssignmentPanel({
  title,
  color,
  teamColor,
  available,
  selected,
  onChange,
  onClose,
  pending,
  error,
  emptyHint,
}: {
  title: string;
  color: string;
  teamColor?: string;
  available: PersonRow[];
  selected: PersonRow[];
  onChange: (next: PersonRow[]) => void;
  onClose: () => void;
  pending: boolean;
  error: unknown;
  emptyHint: string | null;
}) {
  return (
    <div
      className="mx-5 mb-3 rounded-xl border bg-bg-card p-3"
      style={{ borderColor: color }}
    >
      <header className="mb-2 flex items-center justify-between">
        <p
          className="font-mono text-[10px] uppercase tracking-[0.18em]"
          style={{ color }}
        >
          {title}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-dim hover:text-accent"
        >
          Close
        </button>
      </header>

      {emptyHint ? (
        <p className="font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          {emptyHint}
        </p>
      ) : (
        <div className={clsx(pending && 'pointer-events-none opacity-60')}>
          <PlayerPicker
            mode="single"
            available={available}
            selected={selected}
            onChange={onChange}
            teamColor={teamColor}
            searchPlaceholder="Search team members…"
            emptyAvailableLabel="Everyone on the team is already selected."
            emptySelectedLabel="Tap a member to assign"
          />
        </div>
      )}

      {error != null && (
        <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-accent">
          {error instanceof Error ? error.message : String(error)}
        </p>
      )}
    </div>
  );
}
