import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import { useAuth } from './auth';
import type { TeamId } from '@/types/team';

export type Role = 'guest' | 'player' | 'sport-cap' | 'group-cap' | 'admin' | 'super-admin';

export type RoleState = {
  /** Strongest role the user holds, used for UI gating. */
  primary: Role;
  /** Every role the user holds. */
  all: Set<Role>;
  /** Teams where this user is Group Captain. */
  groupCaptainOf: TeamId[];
  /** (sportId, teamId) pairs where this user is Sport Captain. */
  sportCaptainOf: { sportId: string; teamId: TeamId }[];
  /** Match IDs where this user is currently assigned as referee. */
  perMatchReferee: string[];
  /** Convenience predicate. */
  is: (role: Role) => boolean;
  loading: boolean;
};

const GUEST_STATE: RoleState = {
  primary: 'guest',
  all: new Set(['guest']),
  groupCaptainOf: [],
  sportCaptainOf: [],
  perMatchReferee: [],
  is: (role) => role === 'guest',
  loading: false,
};

const ROLE_PRIORITY: Role[] = [
  'super-admin',
  'admin',
  'group-cap',
  'sport-cap',
  'player',
  'guest',
];

type UserDoc = {
  globalRoles?: ('super-admin' | 'admin')[];
  groupCaptainOf?: TeamId[];
  sportCaptainOf?: { sportId: string; teamId: TeamId }[];
  perMatchReferee?: string[];
};

export function useRole(): RoleState {
  const authState = useAuth();
  const uid = authState.status === 'signedIn' ? authState.user.uid : null;
  const user = authState.status === 'signedIn' ? authState.user : null;

  const [doc_, setDoc] = useState<UserDoc | null>(null);
  const [claims, setClaims] = useState<{ admin?: boolean; superAdmin?: boolean }>({});
  const [docLoading, setDocLoading] = useState(true);

  // Subscribe to the user's own doc — it stores their team + role hints.
  useEffect(() => {
    if (!uid) {
      setDoc(null);
      setDocLoading(false);
      return;
    }
    setDocLoading(true);
    return onSnapshot(doc(db, 'users', uid), (snap) => {
      setDoc((snap.data() as UserDoc | undefined) ?? null);
      setDocLoading(false);
    });
  }, [uid]);

  // Pull custom claims for admin/super-admin status.
  useEffect(() => {
    if (!user) {
      setClaims({});
      return;
    }
    let cancelled = false;
    void readClaims(user).then((c) => {
      if (!cancelled) setClaims(c);
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (authState.status === 'loading') {
    return { ...GUEST_STATE, loading: true };
  }
  if (authState.status === 'signedOut') {
    return GUEST_STATE;
  }

  const all = new Set<Role>();
  all.add('player');
  if (claims.superAdmin) all.add('super-admin');
  if (claims.admin) all.add('admin');
  const groupCaptainOf = doc_?.groupCaptainOf ?? [];
  const sportCaptainOf = doc_?.sportCaptainOf ?? [];
  const perMatchReferee = doc_?.perMatchReferee ?? [];
  if (groupCaptainOf.length > 0) all.add('group-cap');
  if (sportCaptainOf.length > 0) all.add('sport-cap');

  const primary = ROLE_PRIORITY.find((r) => all.has(r)) ?? 'player';

  return {
    primary,
    all,
    groupCaptainOf,
    sportCaptainOf,
    perMatchReferee,
    is: (role) => all.has(role),
    loading: docLoading,
  };
}

async function readClaims(
  user: User,
): Promise<{ admin?: boolean; superAdmin?: boolean }> {
  try {
    const result = await user.getIdTokenResult();
    return {
      admin: result.claims['admin'] === true,
      superAdmin: result.claims['superAdmin'] === true,
    };
  } catch {
    return {};
  }
}
