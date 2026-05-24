# CHEQ Fest — Architecture & Feature Spec

Companion to `CLAUDE.md`. This doc goes deeper on the *why* and *how* for each major decision.

---

## 1. Authentication & Authorization

### Google OAuth with hosted domain
Firebase Auth's `GoogleAuthProvider` accepts a `hd` parameter that tells Google's OAuth server to only authenticate users from that domain. This is enforced at the *provider* level — non-cheq.one users can't even complete the OAuth flow.

```ts
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ hd: 'cheq.one' });
```

**Defense in depth:** also enforce in a Cloud Function on user creation:
```ts
export const enforceCheqDomain = functions.auth.user().onCreate(async (user) => {
  if (!user.email?.endsWith('@cheq.one')) {
    await admin.auth().deleteUser(user.uid);
  }
});
```

### Role model
Two kinds of roles:

1. **Global roles** (custom claims): only `admin`. Set via a Cloud Function callable by existing admins. Stored in the JWT for fast access in security rules.

2. **Derived roles** (from data): `group-cap`, `sport-cap`, `referee`. Derived by reading team/match documents:
   - User is `group-cap` of team T if `teams/{T}.groupCaptainUid === uid`
   - User is `sport-cap` for sport S on team T if `rosters/{S}.sportCaptainUid === uid`
   - User is `referee` for match M if `uid in matches/{M}.refereeUids`

The `useRole(uid)` hook subscribes to all relevant documents and returns the active role set. This is more flexible than custom claims (which require a Cloud Function call to update and a token refresh to take effect) — important because Group Captains can assign Sport Captains, and we want that to take effect immediately.

### Security rules pattern
```
match /events/{eventId}/teams/{teamId}/rosters/{sportId} {
  allow read: if true;
  allow write: if isAdmin() 
            || isGroupCaptainOf(teamId)
            || isSportCaptainOf(teamId, sportId);
}

function isAdmin() {
  return request.auth.token.admin == true;
}
function isGroupCaptainOf(teamId) {
  return request.auth.uid == get(/databases/$(database)/documents/events/$(eventId)/teams/$(teamId)).data.groupCaptainUid;
}
```

---

## 2. Points Engine

**Never compute the leaderboard on the client.** Use a Cloud Function trigger on match finalization:

```ts
export const onMatchFinal = functions.firestore
  .document('events/{eventId}/matches/{matchId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    if (before.status === 'final' || after.status !== 'final') return;

    const sport = await getSport(context.params.eventId, after.sportId);
    const pointsForWinner = sport.points.win;
    const pointsForLoser  = sport.points.loss;
    const pointsForDraw   = sport.points.draw;

    await db.runTransaction(async (tx) => {
      const winnerRef = teamRef(context.params.eventId, after.winnerTeamId);
      const loserRef  = teamRef(context.params.eventId, otherTeam(after));
      // ... update totalPoints in transaction
    });
  });
```

This guarantees:
- The leaderboard is always consistent (transactions can't partial-fail)
- Replays the function (e.g. on a manual admin re-run) won't double-count, because the function checks `before.status === 'final'` and returns early

---

## 3. Referee Architecture

### Why append-only events
The referee taps `+1 goal`. We could just write `state.scoreA: scoreA + 1` to the match doc. But:
- We'd lose the timeline (when did each goal happen?)
- UNDO would need to rewind the score, but we'd have no record of what to undo
- Two refs tapping simultaneously could clobber each other

Instead: every tap creates a doc in `matches/{matchId}/refereeEvents/{eventId}` with `type, value, by, at, undone: false`. The match's `state` is recomputed by a Cloud Function listener:

```ts
export const recomputeMatchState = functions.firestore
  .document('events/{e}/matches/{m}/refereeEvents/{evt}')
  .onWrite(async (change, ctx) => {
    const events = await db.collection(`events/${ctx.params.e}/matches/${ctx.params.m}/refereeEvents`)
      .where('undone', '==', false).orderBy('at').get();
    const state = computeState(events.docs.map(d => d.data()));
    await db.doc(`events/${ctx.params.e}/matches/${ctx.params.m}`).update({ state });
  });
```

`computeState()` is a pure function — sums goals per side, tracks current over from over-increment events, etc. Sport-specific reducers live in `functions/reducers/`.

### UNDO is a soft delete
Setting `undone: true` triggers the same recompute. The original event stays in the DB for audit. Good for resolving disputes ("ref Amit undid a yellow at 17'").

### Multi-referee coordination
Two refs assigned to the same cricket match:
- Both subscribe to `matches/{matchId}/refereeEvents` and see each other's punches
- They tap on different things (one on runs, one on extras) so collision is rare
- If both tap the same event, both writes succeed — the duplicate is visible in the log and one can be undone
- A subtle UI: when ref Amit taps "+1 run", their `refereeEvents` doc has `by: amitUid`. Ref Nia sees a log entry attributed to Amit and knows not to also tap

### Clock sync
The match clock is stored as `state.clockSeconds` and `state.isRunning` in Firestore. The referee's clock control writes a clock-start or clock-pause event with the timestamp. All viewers (referees, arena watchers, profile) subscribe to the state doc and compute display time as `state.clockSeconds + (state.isRunning ? (now - state.clockStartedAt) : 0)`.

This means viewers see the correct time even if their local clock is off, *and* the clock keeps ticking on viewers' screens between Firestore updates (which would otherwise come at most every few seconds).

---

## 4. AI Rulebook Parser

### Input pipeline
1. Admin pastes text → text goes directly to the parser
2. Admin uploads PDF → Cloud Storage upload triggers a Cloud Function:
   - Function downloads the PDF, runs `pdf-parse`, extracts text
   - Writes extracted text to `events/{eventId}.rulebookText`
   - Triggers the parser

### Parser implementation
Server-side Cloud Function calls the Anthropic API:

```ts
const response = await fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-opus-4-7',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Parse this sports rulebook into structured JSON.

For each sport, extract:
- name
- playersOnField (number)
- substitutes (number, if mentioned)
- duration (string, e.g. "2 × 15 min")
- format (string, e.g. "5-a-side", "best of 3")
- points: { win, draw, loss }
- trackableEvents: array from this fixed vocabulary: 
  ["goal", "run", "wicket", "boundary", "six", "wide", "no-ball", "bye",
   "yellow", "red", "foul", "sub", "let", "fault", "service-change", 
   "move", "draw-offer", "resign", "timeout"]
- arenaType: one of "field" | "court" | "pitch" | "board"
- confidence: object mapping field names to "high" | "low" | "missing"

Use "missing" for any field the rulebook does not specify.

Rulebook:
${rulebookText}

Respond with ONLY a JSON object matching this schema:
{ "sports": [...] }`
    }]
  })
});

const data = await response.json();
const parsed = JSON.parse(data.content[0].text);
```

Write each sport to `events/{id}/sports/{sportId}` with `aiConfidence` set. Don't auto-confirm — admin must review on the Rulebook tab.

### Confidence handling
Fields marked `"missing"` get the orange "needs review" treatment in the UI. The Rulebook admin tab counts missing fields and shows a badge ("Rulebook 2") so admin knows there's pending review work.

### Drive the UI from the parsed config
- Arena player count: `sport.playersOnField`
- Sport Captain pitch cap: `sport.playersOnField`
- Referee console punch buttons: rendered from `sport.trackableEvents`
- Sport Captain substitutes cap: `sport.substitutes`

This means adding a new sport (e.g. Volleyball) requires zero code changes — admin parses the rulebook, fills any missing fields, and the app handles it.

---

## 5. PWA & Offline

`vite-plugin-pwa` config:

```ts
VitePWA({
  registerType: 'autoUpdate',
  manifest: {
    name: 'CHEQ Fest',
    short_name: 'CHEQ Fest',
    theme_color: '#0a0a0a',
    background_color: '#0a0a0a',
    display: 'standalone',
    icons: [/* 192, 512, maskable */]
  },
  workbox: {
    runtimeCaching: [
      {
        urlPattern: /^https:\/\/firestore\.googleapis\.com/,
        handler: 'NetworkFirst',
        options: {
          cacheName: 'firestore-cache',
          expiration: { maxEntries: 50, maxAgeSeconds: 60 * 5 }
        }
      },
      {
        urlPattern: /^https:\/\/firebasestorage/,
        handler: 'CacheFirst',
        options: {
          cacheName: 'storage-cache',
          expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }
        }
      }
    ]
  }
})
```

Firestore SDK has its own offline cache, so this is mostly belt-and-suspenders. The big win is caching player photos so the arena renders fast on weak networks during a match.

---

## 6. Drag-and-Drop Implementation Notes

Use `@dnd-kit/core`, not `react-beautiful-dnd` (deprecated) or `react-dnd` (heavier).

```tsx
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';

const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
);

<DndContext sensors={sensors} onDragEnd={handleDrop}>
  ...
</DndContext>
```

**Captain lock:** in `useDraggable`, pass `disabled: player.isCaptain`. The draggable handle does not respond to taps. Show a small lock icon on hover.

**Pitch cap:** in `onDragEnd`, check the target bucket size before allowing the drop. If `target === 'pitch' && pitch.length >= sport.playersOnField`, snap back (don't update state).

**Optimistic update:** update local state immediately on drop, then write to Firestore. If the write fails, revert. The `useMutation` pattern from React Query handles this cleanly.

---

## 7. Things to Get Right

### Privacy & Photos
- Admin-uploaded photos: only the admin can upload. Stored in `storage/players/{uid}/avatar.jpg`. Public read (the arena is public).
- Google profile photos: pulled from `user.photoURL` at OAuth login. Stored in `users/{uid}.googlePhotoUrl`.
- Users can delete their admin photo themselves (right to be forgotten). After deletion, falls back to Google photo, then initials.

### Edit history
Every write to teams/rosters by Group Captains and Sport Captains should write an audit log entry. This is critical for sport fests where disputes happen ("who removed me from the squad?"). Stored at `events/{e}/auditLog/{id}` with `{ by, action, target, before, after, at }`.

### Match-day pressure
The referee console will be used under time pressure during a live match. Every interaction must be:
- Touchable with one thumb
- Instant (optimistic UI; never block on a network round-trip)
- Undoable (every tap can be reversed via the log)
- Visible at a glance (the score and clock are the largest elements on screen)

---

## 8. Out of Scope (for V1)

These are intentionally not in the V1 build:

- Push notifications (match starting, your team scored)
- Match commentary thread (chat per match)
- Player profiles beyond stats (no bios, achievements, badges)
- Multi-event archive view (only the current year's fest is shown)
- Mid-match player photo upload by referees
- Advanced analytics (player heatmaps, advanced stats)

If any of these become must-haves, raise them in conversation before implementing — they each have non-trivial data model impact.
