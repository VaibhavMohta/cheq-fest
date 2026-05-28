/**
 * Pure tournament helpers — no Firestore, no React, no DOM. The
 * functions here own two responsibilities:
 *
 *   1. `pairsForRoundRobin(teamIds)` — generate every unordered pair of
 *      teams for a round-robin within a group. The admin clicks
 *      "Generate round-robin" on a group in the SportsTab; the caller
 *      wraps each pair into a `MatchDoc`.
 *
 *   2. `aggregateStandings(matches, sport, scope?)` — derive W/L/D +
 *      points for each team from a list of finalised matches. Used by
 *      the leaderboard's sport / group views. Pure aggregation means
 *      the team doc doesn't need a denormalised record — we live-fold
 *      from match docs.
 */
import type { MatchDoc } from '@/types/match';
import type { SportDoc } from '@/types/sport';
import type { TeamId } from '@/types/team';

/**
 * Every unordered pair of team ids — order within the returned tuples
 * is stable (sort-ascending input order). For N teams that's
 * N*(N-1)/2 pairs.
 */
export function pairsForRoundRobin(teamIds: readonly TeamId[]): Array<[TeamId, TeamId]> {
  const out: Array<[TeamId, TeamId]> = [];
  const ids = [...teamIds];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i]!;
      const b = ids[j]!;
      out.push([a, b]);
    }
  }
  return out;
}

/**
 * Stable key for a team-pair regardless of A/B order. Used to detect
 * existing matches when re-running the generator so we don't create
 * duplicates.
 */
export function pairKey(a: TeamId, b: TeamId): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export type TeamStanding = {
  teamId: TeamId;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
};

/**
 * Walk a list of finalised matches and produce one TeamStanding per
 * team that appeared in any of them. Caller can pre-filter the match
 * list (e.g. only sportId=cricket, only group="A") — this function
 * doesn't care; it just folds whatever it's given.
 *
 * Points table comes from the sport doc; falls back to a sensible
 * default if the sport has no `points` field configured yet (matches
 * the awardPoints Cloud Function's behaviour).
 */
export function aggregateStandings(
  matches: readonly MatchDoc[],
  sport: Pick<SportDoc, 'points'> | null | undefined,
): TeamStanding[] {
  const win = sport?.points?.win ?? 3;
  const draw = sport?.points?.draw ?? 1;
  const loss = sport?.points?.loss ?? 0;

  const byTeam = new Map<TeamId, TeamStanding>();
  const ensure = (id: TeamId): TeamStanding => {
    let s = byTeam.get(id);
    if (!s) {
      s = { teamId: id, played: 0, wins: 0, draws: 0, losses: 0, points: 0 };
      byTeam.set(id, s);
    }
    return s;
  };

  for (const m of matches) {
    if (m.status !== 'final') continue;
    const a = ensure(m.teamAId);
    const b = ensure(m.teamBId);
    a.played += 1;
    b.played += 1;
    if (m.winnerTeamId === null) {
      a.draws += 1;
      a.points += draw;
      b.draws += 1;
      b.points += draw;
    } else if (m.winnerTeamId === m.teamAId) {
      a.wins += 1;
      a.points += win;
      b.losses += 1;
      b.points += loss;
    } else if (m.winnerTeamId === m.teamBId) {
      b.wins += 1;
      b.points += win;
      a.losses += 1;
      a.points += loss;
    }
  }

  return Array.from(byTeam.values()).sort((x, y) => {
    if (y.points !== x.points) return y.points - x.points;
    // Mild secondary sort by wins so the table is at least stable; the
    // user explicitly chose manual tiebreakers, so anything beyond
    // points + wins is admin discretion.
    return y.wins - x.wins;
  });
}

/**
 * Detect adjacent rows in a sorted standings list that share points
 * (and thus need an admin call). Returns a Set of teamIds involved in
 * any tie so the UI can mark them.
 */
export function tiedTeamIds(standings: readonly TeamStanding[]): Set<TeamId> {
  const out = new Set<TeamId>();
  for (let i = 0; i < standings.length; i++) {
    const cur = standings[i]!;
    const prev = standings[i - 1];
    const next = standings[i + 1];
    if ((prev && prev.points === cur.points) || (next && next.points === cur.points)) {
      out.add(cur.teamId);
    }
  }
  return out;
}
