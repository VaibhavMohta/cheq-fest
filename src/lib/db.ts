import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  writeBatch,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type FirestoreDataConverter,
} from 'firebase/firestore';
import { db } from './firebase';
import type { EventDoc } from '@/types/event';
import type { SportDoc } from '@/types/sport';
import type { MatchDoc, RefereeEventDoc } from '@/types/match';
import type { AiUsageDoc } from '@/types/ai';
import type { BonusAwardDoc } from '@/types/bonus';
import type { StagedPlayerDoc, TeamDoc, UserDoc } from '@/types/player';
import type { TeamId } from '@/types/team';

/** Per-(team, sport) roster doc. Owned by the Group Captain (who assigns
 *  the Sport Captain) and then by the Sport Captain (who fills the four
 *  buckets). Stored at `events/{e}/teams/{t}/rosters/{sportId}`. */
export type RosterDoc = {
  sportCaptainEmail: string | null;
  pitch: string[];
  tentative: string[];
  substitutes: string[];
  notPlaying: string[];
};

// Generic identity converter that preserves the type of the document body.
// Firestore reads/writes hit this; it's a runtime no-op, but it gives every
// helper below a typed view of the docs.
function converter<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data,
    fromFirestore: (snap) => snap.data() as T,
  };
}

// ─── Top-level (event-independent) collections ───────────────────────────

export const eventsCol: CollectionReference<EventDoc> = collection(db, 'events').withConverter(
  converter<EventDoc>(),
);

export const eventRef = (eventId: string): DocumentReference<EventDoc> => doc(eventsCol, eventId);

export const stagedPlayersCol: CollectionReference<StagedPlayerDoc> = collection(
  db,
  'stagedPlayers',
).withConverter(converter<StagedPlayerDoc>());

export const usersCol: CollectionReference<UserDoc> = collection(db, 'users').withConverter(
  converter<UserDoc>(),
);

export const userRef = (uid: string): DocumentReference<UserDoc> => doc(usersCol, uid);

export const aiUsageCol: CollectionReference<AiUsageDoc> = collection(db, 'aiUsage').withConverter(
  converter<AiUsageDoc>(),
);

// ─── Event-scoped subcollections ─────────────────────────────────────────
// All factories take the active eventId. Callers get the activeEventId from
// `useActiveEvent()` in lib/activeEvent.ts and pass it in. This is a
// deliberate choice over a global "current event" — every read/write is
// explicit about which event it belongs to.

export const teamsCol = (eventId: string): CollectionReference<TeamDoc> =>
  collection(db, 'events', eventId, 'teams').withConverter(converter<TeamDoc>());

export const teamRef = (eventId: string, teamId: TeamId): DocumentReference<TeamDoc> =>
  doc(teamsCol(eventId), teamId);

export const sportsCol = (eventId: string): CollectionReference<SportDoc> =>
  collection(db, 'events', eventId, 'sports').withConverter(converter<SportDoc>());

export const sportRef = (eventId: string, sportId: string): DocumentReference<SportDoc> =>
  doc(sportsCol(eventId), sportId);

export const rostersCol = (
  eventId: string,
  teamId: TeamId,
): CollectionReference<RosterDoc> =>
  collection(db, 'events', eventId, 'teams', teamId, 'rosters').withConverter(
    converter<RosterDoc>(),
  );

export const rosterRef = (
  eventId: string,
  teamId: TeamId,
  sportId: string,
): DocumentReference<RosterDoc> => doc(rostersCol(eventId, teamId), sportId);

export const matchesCol = (eventId: string): CollectionReference<MatchDoc> =>
  collection(db, 'events', eventId, 'matches').withConverter(converter<MatchDoc>());

export const bonusAwardsCol = (eventId: string): CollectionReference<BonusAwardDoc> =>
  collection(db, 'events', eventId, 'bonusAwards').withConverter(
    converter<BonusAwardDoc>(),
  );

export const bonusAwardRef = (
  eventId: string,
  awardId: string,
): DocumentReference<BonusAwardDoc> => doc(bonusAwardsCol(eventId), awardId);

export const matchRef = (eventId: string, matchId: string): DocumentReference<MatchDoc> =>
  doc(matchesCol(eventId), matchId);

export const refereeEventsCol = (
  eventId: string,
  matchId: string,
): CollectionReference<RefereeEventDoc> =>
  collection(
    db,
    'events',
    eventId,
    'matches',
    matchId,
    'refereeEvents',
  ).withConverter(converter<RefereeEventDoc>());

// ─── Helpers ─────────────────────────────────────────────────────────────

/** Lowercase + trim — used for de-duping CSV imports and lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Build a Firestore-safe document ID from an email. */
export function emailDocId(email: string): string {
  // Replace characters Firestore IDs can't safely contain: '/' and '..'
  return normalizeEmail(email).replaceAll('/', '_');
}

/**
 * Idempotent "add email to team.members[]" — used by every captain
 * assignment path (Group, Vice, Sport) to enforce the invariant that a
 * captain is always a member of the team they captain. No-op if the
 * email is already present.
 *
 * Also (optionally) mirrors `users/{uid}.teamId` so the `player` role
 * lights up on the next session for users who happen to be claimed
 * already. Best-effort — failures here don't abort the captain write
 * because the membership update above is what the rules check.
 */
export async function ensureTeamMember(
  eventId: string,
  teamIdValue: string,
  rawEmail: string,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) return;
  const tRef = teamRef(eventId, teamIdValue as TeamId);
  const snap = await getDoc(tRef);
  if (!snap.exists()) return;
  const members = (snap.data().members ?? []).map((m: string) => m.toLowerCase());
  if (members.includes(email)) return;
  await setDoc(
    tRef,
    { members: Array.from(new Set([...members, email])) },
    { merge: true },
  );
}

/**
 * When a player is moved off a team (or removed entirely), strip their
 * email from every dependent reference on that team. Idempotent:
 *  - removes from team.members[]
 *  - clears groupCaptainEmail / viceCaptainEmail if they match
 *  - for each roster: clears sportCaptainEmail if it matches and
 *    strips the email from pitch / tentative / substitutes / notPlaying
 *
 * Without this, rosters quietly accumulate "ghost" emails after every
 * membership shuffle.
 */
export async function purgePlayerFromTeam(
  eventId: string,
  teamIdValue: string,
  rawEmail: string,
): Promise<void> {
  const email = normalizeEmail(rawEmail);
  if (!email) return;
  const tRef = teamRef(eventId, teamIdValue as TeamId);
  const tSnap = await getDoc(tRef);
  if (!tSnap.exists()) return;
  const tData = tSnap.data();

  // 1) Team doc patch.
  const teamPatch: Record<string, unknown> = {};
  const nextMembers = (tData.members ?? []).filter(
    (m: string) => m.toLowerCase() !== email,
  );
  if (nextMembers.length !== (tData.members ?? []).length) {
    teamPatch['members'] = nextMembers;
  }
  if (tData.groupCaptainEmail?.toLowerCase() === email) {
    teamPatch['groupCaptainEmail'] = null;
  }
  if (tData.viceCaptainEmail?.toLowerCase() === email) {
    teamPatch['viceCaptainEmail'] = null;
  }
  if (Object.keys(teamPatch).length > 0) {
    await setDoc(tRef, teamPatch, { merge: true });
  }

  // 2) Every roster (one doc per sport) — strip email from buckets and
  //    clear the sportCaptainEmail if it matches. Batched for atomicity.
  const rostersSnap = await getDocs(rostersCol(eventId, teamIdValue as TeamId));
  if (rostersSnap.empty) return;
  const batch = writeBatch(db);
  for (const r of rostersSnap.docs) {
    const data = r.data();
    const patch: Record<string, unknown> = {};
    for (const key of ['pitch', 'tentative', 'substitutes', 'notPlaying'] as const) {
      const cleaned = (data[key] ?? []).filter(
        (m: string) => m.toLowerCase() !== email,
      );
      if (cleaned.length !== (data[key] ?? []).length) {
        patch[key] = cleaned;
      }
    }
    if (data.sportCaptainEmail?.toLowerCase() === email) {
      patch['sportCaptainEmail'] = null;
    }
    if (Object.keys(patch).length > 0) {
      batch.set(r.ref, patch, { merge: true });
    }
  }
  await batch.commit();
}

// Re-export deleteDoc so callers that already import from this module
// don't need a second import line.
export { deleteDoc };
