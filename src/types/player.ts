import type { Timestamp } from 'firebase/firestore';
import type { TeamId } from './team';

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
  /** Team color — either a hex string (e.g. "#ff4a1c", the standard for new
   *  teams) or one of the legacy accent slot ids. Pass through
   *  `colorVarFor()` from `@/types/team` to render. */
  color: string;
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
