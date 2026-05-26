import { useEffect, useState } from 'react';
import { collectionGroup, doc, onSnapshot, query, where } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import { teamsCol } from './db';
import { useActiveEvent } from './activeEvent';
import { useAuth } from './auth';
import type { TeamId } from '@/types/team';

export type Role =
  | 'guest'
  | 'player'
  | 'referee'
  | 'sport-cap'
  | 'group-cap'
  | 'admin'
  | 'super-admin';

export type RoleState = {
  /** Strongest role the user actually holds. */
  primary: Role;
  /** Every role the user actually holds (independent of activeMode). */
  all: Set<Role>;
  /** Teams where this user is Group Captain. */
  groupCaptainOf: TeamId[];
  /** (sportId, teamId) pairs where this user is Sport Captain. */
  sportCaptainOf: { sportId: string; teamId: TeamId }[];
  /** Match IDs where this user is currently assigned as referee. */
  perMatchReferee: string[];
  /** Which role's UI is currently being rendered ("view as"). */
  activeMode: Role;
  setActiveMode: (next: Role) => void;
  /** Roles the user is allowed to switch to (actual roles + guest). */
  availableModes: Role[];
  /**
   * True if the active mode implies this role. Used by UI gating.
   * - same role → true
   * - super-admin → admin (super-admin includes admin powers)
   * - any signed-in mode → player (everyone signed in is a player)
   */
  is: (role: Role) => boolean;
  loading: boolean;
};

const ROLE_PRIORITY: Role[] = [
  'super-admin',
  'admin',
  'group-cap',
  'sport-cap',
  'referee',
  'player',
  'guest',
];

export const ROLE_LABEL: Record<Role, string> = {
  'super-admin': 'Super Admin',
  admin: 'Admin',
  'group-cap': 'Group Captain',
  'sport-cap': 'Sport Captain',
  referee: 'Referee',
  player: 'Player',
  guest: 'Guest',
};

/** Display priority — for sorting the dropdown. */
export function roleSortKey(r: Role): number {
  return ROLE_PRIORITY.indexOf(r);
}

const LS_ACTIVE_MODE = 'cheq-fest:activeMode';

type UserDoc = {
  globalRoles?: ('super-admin' | 'admin')[];
  groupCaptainOf?: TeamId[];
  sportCaptainOf?: { sportId: string; teamId: TeamId }[];
  perMatchReferee?: string[];
  /** Set once admin assigns the user to a team in the active event. */
  teamId?: TeamId | null;
};

function isValidRole(value: string | null): value is Role {
  if (!value) return false;
  return ROLE_PRIORITY.includes(value as Role);
}

function modeImplies(activeMode: Role, query: Role): boolean {
  if (activeMode === query) return true;
  // Super Admin implicitly has admin powers.
  if (query === 'admin' && activeMode === 'super-admin') return true;
  // Otherwise modes are strict — each role only implies itself. "Player" is
  // earned via team assignment, not granted by being signed in.
  return false;
}

export function useRole(): RoleState {
  const authState = useAuth();
  const uid = authState.status === 'signedIn' ? authState.user.uid : null;
  const user = authState.status === 'signedIn' ? authState.user : null;
  const userEmail = user?.email?.toLowerCase() ?? null;
  const { activeEventId } = useActiveEvent();

  const [doc_, setDoc] = useState<UserDoc | null>(null);
  const [claims, setClaims] = useState<{ admin?: boolean; superAdmin?: boolean }>({});
  const [docLoading, setDocLoading] = useState(true);
  /**
   * Derived live from team docs in the active event — `team.groupCaptainEmail
   * === me`. This means the moment an admin assigns this user as Group
   * Captain via the Teams tab, the role surfaces in the dropdown without
   * needing a Cloud Function to mirror the value into `users/{uid}`.
   */
  const [liveGroupCaptainOf, setLiveGroupCaptainOf] = useState<TeamId[]>([]);
  /**
   * Derived live from roster docs (collectionGroup query) where
   * `sportCaptainEmail === me`. Scoped client-side to the active event so
   * we don't leak cross-event captaincy into the dropdown. Each entry
   * resolves the roster's path → { sportId, teamId }.
   */
  const [liveSportCaptainOf, setLiveSportCaptainOf] = useState<
    { sportId: string; teamId: TeamId }[]
  >([]);
  const [storedActiveMode, setStoredActiveMode] = useState<Role | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(LS_ACTIVE_MODE);
    return isValidRole(raw) ? raw : null;
  });

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

  // Live group-captain detection — watch teams in the active event where
  // `groupCaptainEmail` matches the signed-in user. This means assigning a
  // GC via the admin Teams tab surfaces the role in the dropdown
  // immediately, without waiting for a Cloud Function to mirror the value
  // into `users/{uid}.groupCaptainOf`.
  useEffect(() => {
    if (!userEmail || !activeEventId) {
      setLiveGroupCaptainOf([]);
      return;
    }
    const q = query(
      teamsCol(activeEventId),
      where('groupCaptainEmail', '==', userEmail),
    );
    return onSnapshot(
      q,
      (snap) => {
        setLiveGroupCaptainOf(snap.docs.map((d) => d.id as TeamId));
      },
      () => {
        // Permission denied for guest reads etc — fall back to empty.
        setLiveGroupCaptainOf([]);
      },
    );
  }, [userEmail, activeEventId]);

  // Live sport-captain detection — collectionGroup query over every
  // roster doc where `sportCaptainEmail` matches the signed-in user.
  // The roster path is `events/{eventId}/teams/{teamId}/rosters/{sportId}`;
  // we derive both ids from snap.ref so we don't need a separate query
  // per team. Scoped to the active event client-side.
  useEffect(() => {
    if (!userEmail || !activeEventId) {
      setLiveSportCaptainOf([]);
      return;
    }
    const q = query(
      collectionGroup(db, 'rosters'),
      where('sportCaptainEmail', '==', userEmail),
    );
    return onSnapshot(
      q,
      (snap) => {
        const out: { sportId: string; teamId: TeamId }[] = [];
        for (const d of snap.docs) {
          // path: events/{eventId}/teams/{teamId}/rosters/{sportId}
          const parts = d.ref.path.split('/');
          const ev = parts[1];
          const teamId = parts[3];
          const sportId = parts[5];
          if (ev === activeEventId && teamId && sportId) {
            out.push({ sportId, teamId });
          }
        }
        setLiveSportCaptainOf(out);
      },
      () => setLiveSportCaptainOf([]),
    );
  }, [userEmail, activeEventId]);

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

  const setActiveMode = (next: Role) => {
    setStoredActiveMode(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LS_ACTIVE_MODE, next);
    }
  };

  if (authState.status === 'loading') {
    return {
      primary: 'guest',
      all: new Set(['guest']),
      groupCaptainOf: [],
      sportCaptainOf: [],
      perMatchReferee: [],
      activeMode: 'guest',
      setActiveMode,
      availableModes: ['guest'],
      is: (role) => role === 'guest',
      loading: true,
    };
  }
  if (authState.status === 'signedOut') {
    return {
      primary: 'guest',
      all: new Set(['guest']),
      groupCaptainOf: [],
      sportCaptainOf: [],
      perMatchReferee: [],
      activeMode: 'guest',
      setActiveMode,
      availableModes: ['guest'],
      is: (role) => role === 'guest',
      loading: false,
    };
  }

  const all = new Set<Role>();
  // 'player' is earned, not free: only granted once admin assigns the user
  // to a team. Until then, a signed-in user with no other role is just a
  // guest (same view a logged-out visitor sees).
  if (doc_?.teamId) all.add('player');
  if (claims.superAdmin) all.add('super-admin');
  if (claims.admin) all.add('admin');
  // Union the denormalized (`users/{uid}.groupCaptainOf`, written by the
  // sync function — when it exists) with the live team-doc subscription.
  // Either source can light up the role; live wins when both differ.
  const groupCaptainOf = Array.from(
    new Set<TeamId>([...(doc_?.groupCaptainOf ?? []), ...liveGroupCaptainOf]),
  );
  // Union the denormalized sport-captain list with the live roster-doc
  // subscription. Deduped on the `sportId|teamId` composite key.
  const sportCaptainOf = (() => {
    const seen = new Set<string>();
    const out: { sportId: string; teamId: TeamId }[] = [];
    for (const entry of [...(doc_?.sportCaptainOf ?? []), ...liveSportCaptainOf]) {
      const key = `${entry.sportId}|${entry.teamId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    return out;
  })();
  const perMatchReferee = doc_?.perMatchReferee ?? [];
  if (groupCaptainOf.length > 0) all.add('group-cap');
  if (sportCaptainOf.length > 0) all.add('sport-cap');
  if (perMatchReferee.length > 0) all.add('referee');
  if (all.size === 0) all.add('guest');

  const primary = ROLE_PRIORITY.find((r) => all.has(r)) ?? 'guest';

  // Available modes = actual roles + guest (so signed-in users can preview
  // signed-out UI). Sorted by priority for a stable dropdown.
  const availableSet = new Set<Role>(all);
  availableSet.add('guest');
  const availableModes = ROLE_PRIORITY.filter((r) => availableSet.has(r));

  // Active mode = stored choice if it's still valid; else fall back to the
  // user's primary. Handles cross-user / cross-machine localStorage reuse
  // without surprising privilege illusions.
  const activeMode: Role =
    storedActiveMode && availableModes.includes(storedActiveMode)
      ? storedActiveMode
      : primary;

  return {
    primary,
    all,
    groupCaptainOf,
    sportCaptainOf,
    perMatchReferee,
    activeMode,
    setActiveMode,
    availableModes,
    is: (role) => modeImplies(activeMode, role),
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
