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
  color: TeamId;
  logoUrl: string | null;
  members: string[];
  groupCaptainUid: string | null;
  viceCaptainUid: string | null;
  totalPoints: number;
};
