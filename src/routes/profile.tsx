import { useEffect, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { TopBar } from '@/components/shared/TopBar';
import { SectionTitle } from '@/components/shared/SectionTitle';
import { Avatar } from '@/components/shared/Avatar';
import { Button } from '@/components/shared/Button';
import { QuickActionTile } from '@/components/shared/QuickActionTile';
import { signOut, useAuth } from '@/lib/auth';
import { useRole } from '@/lib/roles';
import { useActiveEvent } from '@/lib/activeEvent';
import { matchesCol, rostersCol, sportsCol, teamsCol } from '@/lib/db';
import { pointsForMatch } from '@/lib/tournament';
import type { MatchDoc } from '@/types/match';
import type { SportDoc } from '@/types/sport';
import type { RosterDoc } from '@/lib/db';

export const Route = createFileRoute('/profile')({
  component: ProfileScreen,
});

function ProfileScreen() {
  const authState = useAuth();
  const role = useRole();
  // Hooks must run in the same order on every render — compute the
  // email used by usePlayerStats up front so it's safe to call before
  // the loading / signedOut early returns below. usePlayerStats short-
  // circuits when email is null.
  const userEmail =
    authState.status === 'signedIn'
      ? authState.user.email?.toLowerCase() ?? null
      : null;
  const stats = usePlayerStats(userEmail);

  if (authState.status === 'loading') {
    return (
      <>
        <TopBar title="My Profile" />
        <main className="mx-auto max-w-[420px] px-5 pb-28">
          <p className="text-ink-dim">Loading…</p>
        </main>
      </>
    );
  }

  if (authState.status === 'signedOut') {
    return (
      <>
        <TopBar title="My Profile" />
        <main className="mx-auto flex max-w-[420px] flex-col gap-6 px-5 pb-28">
          <p className="text-ink-dim">
            You're browsing as a guest. Sign in with your CHEQ account to see your team,
            stats, and any captain or referee duties.
          </p>
          <Link
            to="/login"
            className="rounded-2xl bg-accent px-4 py-3 text-center font-display text-base uppercase tracking-wide text-bg"
          >
            Sign in
          </Link>
          {/* Public tiles — same in the signed-in branch below. Rules
              moved here from the bottom TabBar so signed-out spectators
              can still browse the rulebook. */}
          <div className="-mx-5">
            <SectionTitle>Read</SectionTitle>
            <div className="mx-5 flex flex-col gap-2">
              <QuickActionTile
                to="/rulebook"
                label="Rules & Points"
                sub="Sport configs + scoring · always up to date"
              />
            </div>
          </div>
        </main>
      </>
    );
  }

  const { user } = authState;
  const isRef = role.perMatchReferee.length > 0;

  return (
    <>
      <TopBar title="My Profile" />
      <main className="mx-auto max-w-[420px] pb-28">
        <header className="mx-5 flex items-center gap-4">
          <Avatar
            name={user.displayName}
            googlePhotoUrl={user.photoURL}
            size={80}
            isCaptain={role.is('group-cap')}
            surfaceColor="var(--bg)"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-2xl uppercase">
              {user.displayName ?? 'CHEQ User'}
            </p>
            <p className="truncate font-mono text-xs text-ink-dim">{user.email}</p>
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {Array.from(role.all).map((r) => (
                <RoleTag key={r} role={r} />
              ))}
            </p>
          </div>
        </header>

        <SectionTitle>Stats</SectionTitle>
        <div className="mx-5 grid grid-cols-3 gap-2">
          <StatCard label="Matches" value={String(stats.matches)} />
          <StatCard label="Wins" value={String(stats.wins)} />
          <StatCard label="Points" value={String(stats.points)} />
        </div>
        <p className="mx-5 mt-2 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-mute">
          {stats.loading
            ? 'Crunching match history…'
            : stats.matches === 0
              ? 'Stats appear after your first finalized match.'
              : 'Counts finalised matches where you were on the pitch roster.'}
        </p>

        <SectionTitle>Quick Actions</SectionTitle>
        <div className="mx-5 flex flex-col gap-2">
          <QuickActionTile to="/leaderboard" label="My Team" sub="Standings + roster" />
          <QuickActionTile to="/arena" label="Live Now" sub="Animated arena" />
          <QuickActionTile
            to="/rulebook"
            label="Rules & Points"
            sub="Sport configs + scoring"
          />

          {(isRef || role.is('admin') || role.is('super-admin')) && (
            <QuickActionTile
              to="/referee"
              label="Referee Console"
              sub={
                isRef
                  ? `${role.perMatchReferee.length} match${role.perMatchReferee.length === 1 ? '' : 'es'} assigned`
                  : 'Admin · all matches'
              }
              accent="primary"
            />
          )}
          {role.is('sport-cap') && (
            <QuickActionTile
              to="/lineup"
              label="Edit Lineup"
              sub="Sport Captain"
              accent="cyan"
            />
          )}
          {role.is('group-cap') && (
            <QuickActionTile
              to="/team-mgmt"
              label="Manage Team"
              sub="Group Captain"
              accent="gold"
            />
          )}
          {(role.is('admin') || role.is('super-admin')) && (
            <QuickActionTile
              to="/admin"
              label="Event Setup"
              sub="Players · Teams · Sports · Rulebook"
              accent="primary"
            />
          )}
          {role.is('super-admin') && (
            <QuickActionTile
              to="/manage-admins"
              label="Manage Admins"
              sub="Grant / revoke admin"
              accent="gold"
            />
          )}
        </div>

        <div className="mx-5 mt-8">
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </main>
    </>
  );
}

type PlayerStats = { matches: number; wins: number; points: number; loading: boolean };

/**
 * Counts matches the user played in (was on the pitch roster of their
 * team for that sport), wins, and points contributed for the active
 * event. Points use the same lookup chain as the leaderboard — match
 * override → per-round override → sport default — via `pointsForMatch`.
 *
 * The user's team is identified by membership (`teams.members` array-
 * contains their email). Rosters drive participation per-sport; only
 * finalised matches count, so live and scheduled matches don't inflate
 * the numbers.
 */
function usePlayerStats(userEmail: string | null): PlayerStats {
  const { activeEventId } = useActiveEvent();
  const [stats, setStats] = useState<PlayerStats>({
    matches: 0,
    wins: 0,
    points: 0,
    loading: true,
  });

  useEffect(() => {
    if (!activeEventId || !userEmail) {
      setStats({ matches: 0, wins: 0, points: 0, loading: false });
      return;
    }
    let cancelled = false;

    // Resolve the user's team(s) in this event — almost always one,
    // but we tolerate ghosts gracefully.
    const teamsQ = query(
      teamsCol(activeEventId),
      where('members', 'array-contains', userEmail),
    );

    const compute = async () => {
      const teamsSnap = await getDocs(teamsQ);
      if (cancelled) return;
      const teamIds = teamsSnap.docs.map((d) => d.id);
      if (teamIds.length === 0) {
        setStats({ matches: 0, wins: 0, points: 0, loading: false });
        return;
      }
      // Pull every finalised match in the event in one read; in-memory
      // filter beats round-tripping per match.
      const [matchesSnap, sportsSnap] = await Promise.all([
        getDocs(query(matchesCol(activeEventId), where('status', '==', 'final'))),
        getDocs(sportsCol(activeEventId)),
      ]);
      if (cancelled) return;
      const sportsById = new Map<string, SportDoc>();
      for (const d of sportsSnap.docs) sportsById.set(d.id, d.data());

      // Cache rosters lazily so each (team, sport) pair is read at most
      // once even if it appears in multiple matches.
      const rosterCache = new Map<string, RosterDoc | null>();
      const getRoster = async (teamId: string, sportId: string) => {
        const key = `${teamId}/${sportId}`;
        if (rosterCache.has(key)) return rosterCache.get(key)!;
        // rostersCol is a small collection (≤ #sports); fetching the
        // whole team's rosters once and indexing is cheaper than N
        // doc-gets when a player is on the pitch across many sports.
        const snap = await getDocs(rostersCol(activeEventId, teamId));
        for (const d of snap.docs) {
          rosterCache.set(`${teamId}/${d.id}`, d.data());
        }
        // Anything not in the snapshot is genuinely missing.
        if (!rosterCache.has(key)) rosterCache.set(key, null);
        return rosterCache.get(key)!;
      };

      let matches = 0;
      let wins = 0;
      let points = 0;

      for (const d of matchesSnap.docs) {
        const m: MatchDoc = d.data();
        // Only matches involving one of the user's teams.
        const userTeamId = teamIds.find(
          (id) => id === m.teamAId || id === m.teamBId,
        );
        if (!userTeamId) continue;

        const roster = await getRoster(userTeamId, m.sportId);
        if (cancelled) return;
        const onPitch = roster?.pitch?.some(
          (e) => e.toLowerCase() === userEmail,
        );
        if (!onPitch) continue;

        matches += 1;
        const sport = sportsById.get(m.sportId);
        const p = pointsForMatch(sport, m.round, m.points ?? null);
        if (m.winnerTeamId === null) {
          // Draw.
          points += p.draw;
        } else if (m.winnerTeamId === userTeamId) {
          wins += 1;
          points += p.win;
        } else {
          points += p.loss;
        }
      }

      if (!cancelled) setStats({ matches, wins, points, loading: false });
    };

    // Recompute on any change to the user's team membership or to the
    // match list. Roster changes don't trigger a recompute on purpose
    // — once a match is final, the roster snapshot at that time is
    // what counts; admins can still edit rosters for the next match.
    const unsubTeams = onSnapshot(teamsQ, () => {
      void compute();
    });
    const unsubMatches = onSnapshot(
      query(matchesCol(activeEventId), where('status', '==', 'final')),
      () => {
        void compute();
      },
    );

    return () => {
      cancelled = true;
      unsubTeams();
      unsubMatches();
    };
  }, [activeEventId, userEmail]);

  return stats;
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-bg-card px-3 py-4 text-center">
      <p className="font-display text-3xl leading-none">{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink-dim">{label}</p>
    </div>
  );
}

const ROLE_LABELS: Record<string, { text: string; color: string }> = {
  'super-admin': { text: 'SUPER ADMIN', color: 'var(--gold)' },
  admin: { text: 'ADMIN', color: 'var(--accent)' },
  'group-cap': { text: 'GROUP CAP', color: 'var(--gold)' },
  'sport-cap': { text: 'SPORT CAP', color: 'var(--accent-3)' },
  player: { text: 'PLAYER', color: 'var(--ink-dim)' },
};

function RoleTag({ role }: { role: string }) {
  const entry = ROLE_LABELS[role];
  if (!entry) return null;
  return (
    <span
      className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em]"
      style={{ color: entry.color, borderColor: 'color-mix(in oklab, currentColor 40%, transparent)' }}
    >
      {entry.text}
    </span>
  );
}
