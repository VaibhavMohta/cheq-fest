import type { Timestamp } from 'firebase/firestore';

export const EVENT_STATUSES = ['draft', 'live', 'ended'] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

export type EventDoc = {
  name: string;
  year: number;
  startDate: Timestamp | null;
  endDate: Timestamp | null;
  venue: string;
  logoUrl: string | null;
  status: EventStatus;
  rulebookPdfUrl: string | null;
  rulebookText: string | null;
  rulebookParsedAt: Timestamp | null;
  refereePool: string[];
  /** Server-stamped on initial create. Used for newest-first ordering. */
  createdAt: Timestamp | null;
};

export function defaultEvent(year: number): EventDoc {
  return {
    name: `CHEQ Fest ${year}`,
    year,
    startDate: null,
    endDate: null,
    venue: '',
    logoUrl: null,
    status: 'draft',
    rulebookPdfUrl: null,
    rulebookText: null,
    rulebookParsedAt: null,
    refereePool: [],
    createdAt: null,
  };
}
