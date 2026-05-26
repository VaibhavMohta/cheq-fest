/**
 * Player directory — unified view over claimed (`users`) and staged
 * (`stagedPlayers`) records, plus a Fuse-backed fuzzy search helper.
 *
 * The picker, GC dropdown, and lineup search bar all read from the same
 * cache so a single roster fetch services every assignment surface.
 *
 * Email is the stable key across the staged → claimed transition. When a
 * staged record and a claimed user share an email, the claimed one wins.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { doc, getDocs, type DocumentData, type DocumentReference } from 'firebase/firestore';
import Fuse from 'fuse.js';
import { stagedPlayersCol, usersCol } from './db';
import type { TeamId } from '@/types/team';

export type PersonRow = {
  /** Stable row id — `c-<uid>` for claimed, `s-<docId>` for staged. */
  key: string;
  email: string;
  name: string;
  /** Auth uid (claimed only). Null for staged players. */
  uid: string | null;
  /** Which team-in-this-event the player currently belongs to, if any.
   *  Carried through so callers can show "already on Team X" hints. */
  currentTeamId: TeamId | null;
  /** false = staged CSV import that hasn't signed in yet. */
  isClaimed: boolean;
  /** The Firestore doc the team membership lives on. Used by TeamDetail
   *  when it persists a team change; other call sites can ignore. */
  membershipRef: DocumentReference<DocumentData>;
};

const STAGED_QK = ['eventPlayers', 'staged'] as const;
const CLAIMED_QK = ['eventPlayers', 'claimed'] as const;

/** Fetch every player record (claimed + staged), deduped by lowercased
 *  email. Claimed wins on conflict — once a staged record has been
 *  promoted to a user doc, the staged row is effectively a stale shadow.
 */
export function useAllEventPlayers(): {
  people: PersonRow[];
  isLoading: boolean;
} {
  const staged = useQuery({
    queryKey: STAGED_QK,
    queryFn: async () => {
      const snap = await getDocs(stagedPlayersCol);
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
  });
  const claimed = useQuery({
    queryKey: CLAIMED_QK,
    queryFn: async () => {
      const snap = await getDocs(usersCol);
      return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
    },
  });

  const people = useMemo<PersonRow[]>(() => {
    const byEmail = new Map<string, PersonRow>();
    // Staged first so claimed overwrites on conflict.
    for (const s of staged.data ?? []) {
      const lower = s.email.toLowerCase();
      byEmail.set(lower, {
        key: `s-${s.id}`,
        email: s.email,
        name: s.displayName,
        uid: null,
        currentTeamId: (s.teamId as TeamId | null) ?? null,
        isClaimed: false,
        membershipRef: doc(stagedPlayersCol, s.id),
      });
    }
    for (const u of claimed.data ?? []) {
      const lower = u.email.toLowerCase();
      byEmail.set(lower, {
        key: `c-${u.uid}`,
        email: u.email,
        name: u.displayName ?? u.email.split('@')[0]!,
        uid: u.uid,
        currentTeamId: (u.teamId as TeamId | null) ?? null,
        isClaimed: true,
        membershipRef: doc(usersCol, u.uid),
      });
    }
    return Array.from(byEmail.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
  }, [staged.data, claimed.data]);

  return { people, isLoading: staged.isLoading || claimed.isLoading };
}

const FUSE_OPTIONS: ConstructorParameters<typeof Fuse<PersonRow>>[1] = {
  keys: ['name', 'email'],
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
};

/** Fuzzy search over a given list of people. Returns the filtered list
 *  scored by Fuse, plus an `isMatch(email)` predicate for callers that
 *  want to dim non-matching rows in place rather than reflow. */
export function usePlayerSearch(people: PersonRow[]): {
  search: string;
  setSearch: (next: string) => void;
  filtered: PersonRow[];
  isMatch: (email: string) => boolean;
  matchCount: number;
} {
  const [search, setSearch] = useState('');
  const fuse = useMemo(() => new Fuse(people, FUSE_OPTIONS), [people]);

  const filtered = useMemo<PersonRow[]>(() => {
    const q = search.trim();
    if (!q) return people;
    return fuse.search(q).map((r) => r.item);
  }, [fuse, search, people]);

  const matchEmails = useMemo<Set<string>>(() => {
    const q = search.trim();
    if (!q) return new Set<string>();
    return new Set(filtered.map((p) => p.email.toLowerCase()));
  }, [filtered, search]);

  const isMatch = (email: string): boolean => {
    if (search.trim().length === 0) return true;
    return matchEmails.has(email.toLowerCase());
  };

  return {
    search,
    setSearch,
    filtered,
    isMatch,
    matchCount: search.trim() ? filtered.length : people.length,
  };
}
