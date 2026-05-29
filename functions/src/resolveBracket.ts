import { firestore } from 'firebase-functions/v1';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';

/**
 * Match-tree resolver. When a match transitions to `status: 'final'`,
 * walk the sport's bracket to fill any downstream placeholder matches
 * whose `teamASlot`/`teamBSlot` reference this match's (stage, group,
 * rank).
 *
 * Resolution rules:
 *  - Knockout source group: the just-finalised match's winner satisfies
 *    rank-1; the loser satisfies rank-2. Slots referencing rank > 2 are
 *    skipped (knockout groups don't produce a stable third place).
 *  - Round-robin source group: only resolve once EVERY match in the
 *    group is final. Compute standings (points → wins → score diff →
 *    head-to-head later) and patch downstream slots from the ranking.
 *    If a tie sits across the cutoff rank, leave downstream slots
 *    unresolved (admin handles via the Resolve Ties UI in phase 3).
 *
 * Sticky overrides: if a downstream match has `manuallyResolved: true`
 * it's left alone — admin edits beat the engine.
 *
 * Idempotent: re-running on the same final match is a no-op when the
 * downstream slot is already resolved to the correct team.
 */
export const resolveBracket = firestore
  .document('events/{eventId}/matches/{matchId}')
  .onUpdate(async (change, ctx) => {
    const before = change.before.data() as MatchData;
    const after = change.after.data() as MatchData;

    // Only react when the match just finalised (or its winner changed
    // post-final — admins can flip the winner from the referee panel).
    const justFinalized = before.status !== 'final' && after.status === 'final';
    const winnerChanged =
      before.status === 'final' &&
      after.status === 'final' &&
      (before.winnerTeamId ?? null) !== (after.winnerTeamId ?? null);
    if (!justFinalized && !winnerChanged) return;

    if (!after.sportId || !after.stageId || !after.groupId) {
      // Match isn't part of a bracket (legacy flat tournament or
      // standalone). Nothing to resolve.
      return;
    }

    const db = getFirestore();
    const eventId = ctx.params.eventId as string;
    const sportSnap = await db.doc(`events/${eventId}/sports/${after.sportId}`).get();
    const sport = sportSnap.data() as SportData | undefined;
    const bracket = sport?.tournament?.bracket;
    if (!bracket || bracket.length === 0) return;

    // Find the source group definition so we know its format.
    const sourceStage = bracket.find((s) => s.id === after.stageId);
    const sourceGroup = sourceStage?.groups.find((g) => g.id === after.groupId);
    if (!sourceStage || !sourceGroup) {
      logger.warn('resolveBracket: source stage/group not found', {
        stageId: after.stageId,
        groupId: after.groupId,
      });
      return;
    }

    // Compute the ranked teams the source group produces. For
    // knockout, this needs only the just-finalised match. For
    // round-robin, we need every match in the group.
    let ranked: (string | null)[] | null;
    if (sourceGroup.format === 'knockout') {
      // Knockout group emits: rank 1 = winner, rank 2 = loser.
      if (!after.winnerTeamId) return; // draw — admin must pick
      const loser =
        after.winnerTeamId === after.teamAId ? after.teamBId ?? null : after.teamAId ?? null;
      ranked = [after.winnerTeamId, loser];
    } else {
      // Round-robin: only resolve when the whole group is done.
      const groupMatchesSnap = await db
        .collection(`events/${eventId}/matches`)
        .where('sportId', '==', after.sportId)
        .where('stageId', '==', after.stageId)
        .where('groupId', '==', after.groupId)
        .get();
      const allFinal = groupMatchesSnap.docs.every(
        (d) => (d.data() as MatchData).status === 'final',
      );
      if (!allFinal) return;
      ranked = computeRoundRobinRanking(
        sourceGroup.source.kind === 'seeded' ? sourceGroup.source.teamIds : [],
        groupMatchesSnap.docs.map((d) => d.data() as MatchData),
      );
      if (ranked == null) return; // tie at cutoff — leave for admin
    }
    if (ranked == null) return;
    const rankedTeams = ranked;

    // Walk downstream stages looking for placeholder slots that
    // reference this (stage, group) and patch them with the resolved
    // team. Each downstream group either:
    //   - hasn't generated matches yet (skipped here; the matches
    //     route bootstraps them with the slot reference), or
    //   - has placeholder matches whose teamA/BSlot points here.
    const matchesSnap = await db
      .collection(`events/${eventId}/matches`)
      .where('sportId', '==', after.sportId)
      .get();

    const batch = db.batch();
    let patched = 0;
    for (const docSnap of matchesSnap.docs) {
      const m = docSnap.data() as MatchData;
      if (m.manuallyResolved) continue;
      const patch: Record<string, unknown> = {};
      if (
        m.teamASlot &&
        m.teamASlot.fromStageId === after.stageId &&
        m.teamASlot.fromGroupId === after.groupId
      ) {
        const teamId = rankedTeams[m.teamASlot.rank - 1] ?? null;
        if (teamId && m.teamAId !== teamId) {
          patch.teamAId = teamId;
          patch.teamASlot = null;
        }
      }
      if (
        m.teamBSlot &&
        m.teamBSlot.fromStageId === after.stageId &&
        m.teamBSlot.fromGroupId === after.groupId
      ) {
        const teamId = rankedTeams[m.teamBSlot.rank - 1] ?? null;
        if (teamId && m.teamBId !== teamId) {
          patch.teamBId = teamId;
          patch.teamBSlot = null;
        }
      }
      if (Object.keys(patch).length > 0) {
        batch.update(docSnap.ref, patch);
        patched += 1;
      }
    }
    if (patched > 0) {
      await batch.commit();
      logger.info('resolveBracket: patched downstream matches', {
        sportId: after.sportId,
        sourceStage: after.stageId,
        sourceGroup: after.groupId,
        patched,
      });
    }
  });

// ── Helpers ────────────────────────────────────────────────────────

type MatchData = {
  sportId?: string;
  status?: string;
  teamAId?: string;
  teamBId?: string;
  winnerTeamId?: string | null;
  stageId?: string | null;
  groupId?: string | null;
  teamASlot?: { fromStageId: string; fromGroupId: string; rank: number } | null;
  teamBSlot?: { fromStageId: string; fromGroupId: string; rank: number } | null;
  manuallyResolved?: boolean | null;
  state?: { scoreA?: number; scoreB?: number };
  points?: { win: number; draw: number; loss: number } | null;
  round?: string | null;
};

type SportData = {
  tournament?: {
    bracket?: BracketStage[] | null;
    roundPoints?: Record<string, { win: number; draw: number; loss: number }>;
  } | null;
  points?: { win: number; draw: number; loss: number };
};

type BracketStage = {
  id: string;
  order: number;
  groups: BracketGroup[];
};

type BracketGroup = {
  id: string;
  format: 'round-robin' | 'knockout';
  advances: number;
  source:
    | { kind: 'seeded'; teamIds: string[] }
    | { kind: 'advanced'; from: unknown[] };
};

/**
 * Rank teams in a finished round-robin group by points → wins →
 * score difference. Returns `null` when a tie sits across the
 * cutoff rank — in that case the engine leaves downstream slots
 * unresolved and admins break the tie manually.
 *
 * Points use the *raw match outcome* (3/1/0) rather than the
 * configured scheme because head-to-head ranking shouldn't depend
 * on per-match point overrides — those exist for leaderboard math,
 * not for tie-breaking within a group.
 */
function computeRoundRobinRanking(
  seededTeams: string[],
  matches: MatchData[],
): (string | null)[] | null {
  const teamSet = new Set<string>(seededTeams);
  for (const m of matches) {
    if (m.teamAId) teamSet.add(m.teamAId);
    if (m.teamBId) teamSet.add(m.teamBId);
  }
  type Row = {
    teamId: string;
    points: number;
    wins: number;
    diff: number;
  };
  const rows = new Map<string, Row>();
  for (const t of teamSet) rows.set(t, { teamId: t, points: 0, wins: 0, diff: 0 });

  for (const m of matches) {
    if (m.status !== 'final') continue;
    const a = m.teamAId;
    const b = m.teamBId;
    if (!a || !b) continue;
    const rowA = rows.get(a)!;
    const rowB = rows.get(b)!;
    const sa = m.state?.scoreA ?? 0;
    const sb = m.state?.scoreB ?? 0;
    rowA.diff += sa - sb;
    rowB.diff += sb - sa;
    if (m.winnerTeamId === a) {
      rowA.points += 3;
      rowA.wins += 1;
    } else if (m.winnerTeamId === b) {
      rowB.points += 3;
      rowB.wins += 1;
    } else {
      rowA.points += 1;
      rowB.points += 1;
    }
  }

  const sorted = [...rows.values()].sort(
    (x, y) => y.points - x.points || y.wins - x.wins || y.diff - x.diff,
  );

  // Detect a true tie across ranks — two teams with identical
  // (points, wins, diff) breaks the deterministic ordering and we
  // bail so admins resolve it.
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    if (a.points === b.points && a.wins === b.wins && a.diff === b.diff) {
      logger.info('resolveBracket: tie at rank, deferring to admin', {
        rank: i + 1,
        teamA: a.teamId,
        teamB: b.teamId,
      });
      return null;
    }
  }
  return sorted.map((r) => r.teamId);
}
