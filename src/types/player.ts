import type { Timestamp } from 'firebase/firestore';
import type { ColorSlot, TeamId } from './team';

export type StagedPlayerDoc = {
  email: string;
  displayName: string;
  phone: string | null;
  teamId: TeamId | null;
  importedAt: Timestamp;
  importedBy: string;
};

export type UserDoc = {
  email: string;
  displayName: string | null;
  phone: string | null;
  googlePhotoUrl: string | null;
  adminPhotoUrl: string | null;
  teamId: TeamId | null;
  globalRoles: ('super-admin' | 'admin')[];
  /** Denormalized hints set by Cloud Functions on role changes. */
  groupCaptainOf?: TeamId[];
  sportCaptainOf?: { sportId: string; teamId: TeamId }[];
  perMatchReferee?: string[];
  createdAt?: Timestamp;
};

export type TeamDoc = {
  name: string;
  /** Color slot — one of `accent | accent-2 | accent-3 | accent-4`. */
  color: ColorSlot;
  logoUrl: string | null;
  jerseyUrl: string | null;
  /** Lowercased emails of the team's roster. Survives the staged→claimed
   *  transition without rewriting (email doesn't change on first sign-in). */
  members: string[];
  /** Email of the Group Captain. Null when unassigned. Can refer to a
   *  staged player who hasn't signed in yet — they become "active" GC the
   *  moment their user doc is created via onUserCreate. */
  groupCaptainEmail: string | null;
  viceCaptainEmail: string | null;
  totalPoints: number;
  createdAt?: Timestamp | null;
};
