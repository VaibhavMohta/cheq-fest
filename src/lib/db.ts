import {
  collection,
  doc,
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
