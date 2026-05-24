export const ARENA_TYPES = ['field', 'court', 'pitch', 'board'] as const;
export type ArenaType = (typeof ARENA_TYPES)[number];

export const TRACKABLE_EVENT_VOCAB = [
  'goal',
  'run',
  'wicket',
  'boundary',
  'six',
  'wide',
  'no-ball',
  'bye',
  'yellow',
  'red',
  'foul',
  'sub',
  'let',
  'fault',
  'service-change',
  'move',
  'draw-offer',
  'resign',
  'timeout',
] as const;
export type TrackableEvent = (typeof TRACKABLE_EVENT_VOCAB)[number];

export type Confidence = 'high' | 'low' | 'missing';

export type SportDoc = {
  name: string;
  arenaType: ArenaType;
  playersOnField: number;
  substitutes: number;
  duration: string;
  format: string;
  points: { win: number; draw: number; loss: number };
  trackableEvents: TrackableEvent[];
  aiConfidence?: Record<string, Confidence>;
};

export function defaultSport(name: string): SportDoc {
  return {
    name,
    arenaType: 'field',
    playersOnField: 5,
    substitutes: 3,
    duration: '',
    format: '',
    points: { win: 3, draw: 1, loss: 0 },
    trackableEvents: [],
  };
}
