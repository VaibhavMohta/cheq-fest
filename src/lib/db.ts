import {
  collection,
  doc,
  type CollectionReference,
  type DocumentData,
  type DocumentReference,
  type FirestoreDataConverter,
} from 'firebase/firestore';
import { db } from './firebase';
import { CURRENT_EVENT_ID, type EventDoc } from '@/types/event';
import type { SportDoc } from '@/types/sport';
import type { MatchDoc, RefereeEventDoc } from '@/types/match';
import type { AiUsageDoc } from '@/types/ai';
import type { StagedPlayerDoc, TeamDoc, UserDoc } from '@/types/player';
import type { TeamId } from '@/types/team';

// Generic identity converter that preserves the type of the document body.
// Firestore reads/writes hit this; it's a runtime no-op, but it gives every
// helper below a typed view of the docs.
function converter<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore: (data) => data,
    fromFirestore: (snap) => snap.data() as T,
  };
}

export const eventRef: DocumentReference<EventDoc> = doc(
  db,
  'events',
  CURRENT_EVENT_ID,
).withConverter(converter<EventDoc>());

export const teamsCol: CollectionReference<TeamDoc> = collection(
  db,
  'events',
  CURRENT_EVENT_ID,
  'teams',
).withConverter(converter<TeamDoc>());

export const teamRef = (teamId: TeamId): DocumentReference<TeamDoc> =>
  doc(teamsCol, teamId);

export const sportsCol: CollectionReference<SportDoc> = collection(
  db,
  'events',
  CURRENT_EVENT_ID,
  'sports',
).withConverter(converter<SportDoc>());

export const sportRef = (sportId: string): DocumentReference<SportDoc> =>
  doc(sportsCol, sportId);

export const stagedPlayersCol: CollectionReference<StagedPlayerDoc> = collection(
  db,
  'stagedPlayers',
).withConverter(converter<StagedPlayerDoc>());

export const matchesCol: CollectionReference<MatchDoc> = collection(
  db,
  'events',
  CURRENT_EVENT_ID,
  'matches',
).withConverter(converter<MatchDoc>());

export const matchRef = (matchId: string): DocumentReference<MatchDoc> =>
  doc(matchesCol, matchId);

export const refereeEventsCol = (matchId: string): CollectionReference<RefereeEventDoc> =>
  collection(
    db,
    'events',
    CURRENT_EVENT_ID,
    'matches',
    matchId,
    'refereeEvents',
  ).withConverter(converter<RefereeEventDoc>());

export const usersCol: CollectionReference<UserDoc> = collection(db, 'users').withConverter(
  converter<UserDoc>(),
);

export const aiUsageCol: CollectionReference<AiUsageDoc> = collection(db, 'aiUsage').withConverter(
  converter<AiUsageDoc>(),
);

export const userRef = (uid: string): DocumentReference<UserDoc> => doc(usersCol, uid);

/** Lowercase + trim — used for de-duping CSV imports and lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Build a Firestore-safe document ID from an email. */
export function emailDocId(email: string): string {
  // Replace characters Firestore IDs can't safely contain: '/' and '..'
  return normalizeEmail(email).replaceAll('/', '_');
}
