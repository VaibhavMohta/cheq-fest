import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { onSnapshot, setDoc } from 'firebase/firestore';
import clsx from 'clsx';
import { TopBar } from '@/components/shared/TopBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { LineupBoard } from '@/components/lineup/LineupBoard';
import { useRole } from '@/lib/roles';
import { useActiveEvent } from '@/lib/activeEvent';
import { useAllEventPlayers, type PersonRow } from '@/lib/playerDirectory';
import { rosterRef, sportRef, teamRef, type RosterDoc } from '@/lib/db';
import type { LineupPlayer, LineupSport, LineupState } from '@/lib/lineup';
import type { SportDoc } from '@/types/sport';
import type { TeamDoc } from '@/types/player';

/**
 * Sport Captain lineup editor. Visible only to users who hold the
 * `sport-cap` role for at least one (sportId, teamId) pair in the active
 * event. If they captain multiple sports, a switcher pill at the top
 * lets them flip between boards.
 */
export default function LineupScreen() {
  const role = useRole();
  const { activeEventId } = useActiveEvent();
  const captaincies = role.sportCaptainOf;
  const [selectedIdx, setSelectedIdx] = useState(0);

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

  if (captaincies.length === 0) {
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
          eventId={activeEventId}
          sportId={active.sportId}
          teamId={active.teamId}
        />
      </main>
    </>
  );
}

function LineupEditor({
  eventId,
  sportId,
  teamId,
}: {
  eventId: string;
  sportId: string;
  teamId: string;
}) {
  const qc = useQueryClient();
  const [sport, setSport] = useState<SportDoc | null>(null);
  const [team, setTeam] = useState<TeamDoc | null>(null);
  const [roster, setRoster] = useState<RosterDoc | null>(null);
  const [docsLoaded, setDocsLoaded] = useState<{
    sport: boolean;
    team: boolean;
    roster: boolean;
  }>({ sport: false, team: false, roster: false });
  const { people } = useAllEventPlayers();

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

  const allLoaded = docsLoaded.sport && docsLoaded.team && docsLoaded.roster;

  // Compose LineupPlayer[] from team members, joined with the global
  // player directory for name/photo data. Players on the team but absent
  // from the directory (claimed user not yet visible to this client)
  // still render with their email as the display fallback.
  const players: LineupPlayer[] = useMemo(() => {
    if (!team) return [];
    const byEmail = new Map<string, PersonRow>();
    for (const p of people) byEmail.set(p.email.toLowerCase(), p);
    const captainEmail = roster?.sportCaptainEmail?.toLowerCase() ?? null;
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
        isCaptain: !!captainEmail && captainEmail === email,
        googlePhotoUrl: null,
        adminPhotoUrl: null,
      };
    });
  }, [team, people, roster?.sportCaptainEmail]);

  // Initial state — any team member not already in pitch/tentative/subs
  // defaults to notPlaying so they appear somewhere.
  const initial: LineupState = useMemo(() => {
    const empty: LineupState = {
      pitch: [],
      tentative: [],
      substitutes: [],
      notPlaying: [],
    };
    if (!team) return empty;
    const known = new Set<string>();
    const pitch = (roster?.pitch ?? []).map((e) => e.toLowerCase());
    const tentative = (roster?.tentative ?? []).map((e) => e.toLowerCase());
    const substitutes = (roster?.substitutes ?? []).map((e) => e.toLowerCase());
    const notPlaying = (roster?.notPlaying ?? []).map((e) => e.toLowerCase());
    for (const e of [...pitch, ...tentative, ...substitutes, ...notPlaying]) known.add(e);
    const remainder = team.members
      .map((e) => e.toLowerCase())
      .filter((e) => !known.has(e));
    // Also auto-park the Sport Captain on the pitch if they're not yet
    // placed — keeps the "captain locked to pitch" invariant immediately
    // after assignment.
    const capEmail = roster?.sportCaptainEmail?.toLowerCase() ?? null;
    if (capEmail && !known.has(capEmail) && team.members.some((m) => m.toLowerCase() === capEmail)) {
      pitch.unshift(capEmail);
      known.add(capEmail);
    }
    return {
      pitch,
      tentative,
      substitutes,
      notPlaying: [...notPlaying, ...remainder],
    };
  }, [team, roster]);

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

  return (
    <LineupBoard
      sport={lineupSport}
      players={players}
      initial={initial}
      onChange={async (next) => {
        await save.mutateAsync(next);
      }}
    />
  );
}
