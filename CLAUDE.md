# CHEQ Fest — Sports Tracker PWA

A mobile-first PWA for tracking CHEQ company sports fest in real time. Built for employees to follow scores, lineups, and live matches.

## Stack

- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS, installable as PWA (vite-plugin-pwa)
- **Auth:** Firebase Auth with Google OAuth, restricted to `@cheq.one` hosted domain (`hd: 'cheq.one'`)
- **Database:** Firestore (realtime listeners for live scores/leaderboard)
- **Storage:** Firebase Storage (logos, rulebook PDFs, admin-uploaded player photos)
- **Functions:** Firebase Cloud Functions for rulebook parsing (Anthropic API call) and points engine
- **Hosting:** Firebase Hosting
- **Drag-and-drop:** `@dnd-kit/core` (works well on touch)
- **Animations:** Framer Motion for screen transitions and arena animations

## Design System

**Aesthetic:** sporty-editorial. Stadium-board energy. Dark theme. The prototype establishes the visual language — match it.

**Fonts** (Google Fonts):
- Display: `Anton` (uppercase, condensed, for titles and big numbers)
- Body: `Bricolage Grotesque` (400, 600, 800)
- Mono/technical: `JetBrains Mono` (for timestamps, codes, sub-labels)

**Colors** (CSS variables, do not deviate):
```
--bg: #0a0a0a
--bg-card: #141414
--bg-elev: #1c1c1c
--ink: #f5f1e8
--ink-dim: #8a8780
--ink-mute: #4a4742
--accent: #ff4a1c        (lava orange — primary CTA, captains, alerts)
--accent-2: #e8ff4a      (electric lime — values, success)
--accent-3: #4ad4ff      (signal cyan — secondary team, sport-caps)
--accent-4: #ff4ad0      (hot pink — quaternary team)
--line: #2a2724
--gold: #f5c542          (group captain badge, "C" flag, rank 1)
```

**Team colors:** each team is consistently the same color across every screen (avatars, dots on arena, leaderboard flags). Tridents = `--accent`, Phantoms = `--accent-3`, Blazers = `--accent-2`, Voltron = `--accent-4`.

**Captain marker:** gold "C" badge in top-right of any avatar/face that belongs to a captain. Identical shape on arena faces and roster tiles — this is intentional so users can match field positions to the list.

**Mobile-first:** target viewport ~380px. All tap targets ≥ 36px. Bottom nav is fixed and floating with a 12px gap from edge. Avoid bottom-sheet patterns; the existing screen-transition pattern is fine.

## Account Hierarchy & Roles

```
Super Admin (global, root)
  └── Admin (global)
       └── Event
            └── Team
                 ├── Group Captain  (assigned by Admin/Super Admin)
                 ├── Vice Captain   (assigned by Group Captain)
                 └── Sport Captain  (assigned by Group Captain, one per sport)
                      └── Final / Tentative / Substitute / Not Playing (assigned by Sport Captain)

Referee — per-match assignment by Admin. Cross-cuts the hierarchy: any player can be made a referee for any specific match in any sport. Multiple refs per match are allowed.
```

**Super Admin vs Admin:**
- **Super Admin** can do everything Admin can, plus: promote/demote other users to Admin, create new events, and delete events. There is exactly one Super Admin account (mine, on initial setup) and it is the only role that can grant the `admin` claim to others.
- **Admin** runs the day-to-day setup of an event: teams, sports, rulebook, referee pool, points, score entry, player import + team assignment.
- Both Super Admin and Admin can upload a CSV of player records (`email`, `name`, optional `phone`) or enter rows manually on the **Players** admin tab, then assign each imported player to a team via the **Teams** tab.

**Hard rule, enforced in Firestore security rules:** a user can only be assigned a role *within a team they're already a member of*. The only exception is Referee, which can come from any team or be a non-player employee.

**Pre-seeded users (CSV import flow):** When Admin imports a player by email before that person has signed in, a `users/{stagedId}` doc is created with `email` set and `pending: true`. The first time that email signs in with Google, a Cloud Function on user-create looks up any staged record with a matching email, merges its fields (incl. team assignment) into the real `users/{uid}`, and deletes the staged doc. This means roster setup can happen before any player has logged in.

**Guest mode:** unauthenticated users get read-only access to events, teams, leaderboard, arena, rulebook. Public reads, authenticated writes only.

## Data Model (Firestore)

```
events/{eventId}
  ├── name, year, dates, venue, logoUrl
  ├── rulebookPdfUrl, rulebookText, rulebookParsedAt
  ├── refereePool: [uid]                    // admin-curated list of eligible refs
  └── status: 'draft' | 'live' | 'ended'

events/{eventId}/sports/{sportId}
  ├── name, arenaType ('field'|'court'|'pitch'|'board')
  ├── playersOnField: number
  ├── substitutes: number
  ├── duration, format                       // e.g. "2 × 15 min", "5-a-side"
  ├── points: { win, draw, loss }
  ├── trackableEvents: [...]                 // sport-specific punch-in schema for referee
  └── aiConfidence: { fieldName: 'high'|'low'|'missing' }

events/{eventId}/teams/{teamId}
  ├── name, color, logoUrl
  ├── members: [uid]
  ├── groupCaptainUid, viceCaptainUid
  └── totalPoints (denormalized for leaderboard speed)

events/{eventId}/teams/{teamId}/rosters/{sportId}
  ├── sportCaptainUid
  ├── pitch: [uid]        // sport-cap's "On The Pitch" selection (max = playersOnField)
  ├── tentative: [uid]
  ├── substitutes: [uid]
  └── notPlaying: [uid]   // rest of the team (computed from team.members - others)

events/{eventId}/matches/{matchId}
  ├── sportId, teamAId, teamBId
  ├── scheduledStart, venue
  ├── refereeUids: [uid]                    // admin assigns; multi-ref allowed
  ├── state: {                              // computed from /events log
  │     scoreA, scoreB, clockSeconds, half, isRunning,
  │     overs, balls, wickets, innings, ...sport-specific
  │   }
  ├── status: 'scheduled' | 'live' | 'final'
  └── winnerTeamId, pointsAwarded            // set on final, triggers leaderboard update

events/{eventId}/matches/{matchId}/refereeEvents/{eventId}
  ├── type ('goal'|'wicket'|'card'|'sub'|'clock'|'wide'|'nb'|...)
  ├── value, side ('A'|'B'), at: timestamp
  ├── by: refUid                            // who recorded it
  └── undone: boolean                       // soft-delete for audit trail

users/{uid}
  ├── email (must end in @cheq.one)
  ├── displayName
  ├── phone (optional, from CSV import)
  ├── photoUrl                              // priority: adminUploaded → googlePhoto → null
  ├── googlePhotoUrl                        // from Google profile
  ├── adminPhotoUrl                         // from admin upload (overrides googlePhotoUrl)
  ├── teamId
  ├── globalRoles: ['super-admin'? , 'admin'?]   // super-admin > admin; others inferred
  └── pending: boolean                      // true for staged CSV imports awaiting first login

stagedPlayers/{autoId}                      // optional alt to users with pending:true
  ├── email, displayName, phone
  ├── teamId                                // can be pre-assigned before user exists
  └── importedAt, importedBy
```

> Implementation can pick *either* `users/{uid}` with `pending: true` *or* a separate `stagedPlayers/` collection — choose one in step 8. Both achieve the same goal: roster setup before login.

**Avatar source priority** (render in this order, first non-null wins):
1. `user.adminPhotoUrl` — admin-uploaded
2. `user.googlePhotoUrl` — pulled at OAuth login
3. Initials fallback (e.g. "SH" for Shah Mehta) on a team-colored background

## Core Features

### 1. Animated Sport Arena
- Visual field/court appropriate to the sport (defined by `sport.arenaType`)
- Player count matches `sport.playersOnField`
- Player avatars are face circles (admin photo → Google photo → initials) with team color background
- Bobbing idle animation; ball/shuttle moves around the field on a loop
- Captain has gold "C" badge (matches the badge on roster tiles below for visual continuity)
- Empty positions on the pitch are allowed (sport-cap discretion) — render as dashed-outline placeholder

### 2. Leaderboard
- Overall standings (sum of points across all sports)
- Per-sport leaderboard
- Realtime — Firestore `onSnapshot` listener on `events/{id}/teams` ordered by `totalPoints desc`
- Rank changes show trend arrows (↑ ↓) based on diff from a snapshot taken at start of each day

### 3. Sport Captain Lineup Editor (4-bucket drag-and-drop)
- Four buckets: On The Pitch / Tentative / Substitutes / Not Playing
- Captain is locked in "On The Pitch", cannot be moved (`disabled: true` in dnd-kit)
- Pitch is capped at `sport.playersOnField`; overflow drops are rejected
- All other players freely draggable between buckets
- Mobile touch: use `@dnd-kit/core` with `TouchSensor` and `PointerSensor`
- Persist on every drop with optimistic update + revert on error

### 4. Admin Event Setup (tabbed)
Seven tabs in this order: **Event** / **Players** / **Teams** / **Sports** / **Referees** / **Rulebook** / **Points**

- **Event:** name, dates, venue, logo upload
- **Players:** CSV import (`email,name,phone?` columns) or manual entry. Lists all imported players with `pending` / `claimed` status. Admins can edit or remove rows before they're assigned to a team. (Super Admin only: bulk delete and re-import.)
- **Teams:** team tags + per-team Group Captain assignment + assign imported players to teams (search and pick from the Players list). The "Players" tab is the source of truth; "Teams" is where assignment happens.
- **Sports:** sports tag list; reads its config from the Rulebook tab's parsed output
- **Referees:** two sections — a *Referee Pool* (any @cheq.one user can be added) and *Per-Match Assignments* (multiple refs per match allowed; admin picks from the pool)
- **Rulebook:** AI parser (see below)
- **Points:** auto-populated from rulebook, admin can override

Note: a thin Super-Admin-only tab (or modal accessed from Profile) handles "grant Admin" / "revoke Admin" — kept separate so day-to-day admins don't see it.

### 5. AI Rulebook Parser
- Admin pastes rulebook text **or** uploads a PDF
- PDFs: extract text in a Cloud Function using `pdf-parse`
- Send text to Anthropic API (Claude Opus 4.7) with structured output (`output_config.format` with JSON schema) — guarantees a valid response shape:
  ```json
  {
    "sports": [
      {
        "name": "Football",
        "playersOnField": 5,
        "substitutes": 3,
        "duration": "2 × 15 min",
        "points": { "win": 8, "draw": 3, "loss": 0 },
        "trackableEvents": ["goal", "yellow", "red", "foul", "sub"],
        "confidence": { "playersOnField": "high", "substitutes": "high" }
      }
    ]
  }
  ```
- Render parsed cards on the Rulebook tab; missing fields highlighted in orange (`needs review`)
- Admin edits/confirms → writes to `events/{id}/sports/{sportId}`
- Keep the original PDF available for reading via `rulebookPdfUrl`

### 6. Referee Console (`/referee`)
Live punch-in tool for match officials.

- Pulled-up from Profile when user is in any match's `refereeUids`
- Match switcher pills at top — one ref can be assigned to multiple matches; tap to switch active match
- Big scoreboard with +/- buttons per side
- Match clock with play/pause/reset (real `setInterval` time, persisted to Firestore as `state.clockSeconds`)
- Sport-specific punch panes (only the relevant one renders, driven by `sport.trackableEvents`):
  - Football: Goal/Yellow/Red/Foul/Sub buttons, Half cycler, Extra Time counter
  - Cricket: Ball-by-ball buttons (0/1/2/4/6/W/WD/NB/B-LB), Over/Balls/Innings/Wickets counters
  - Badminton: Game number, Service cycler, Let/Fault
  - Chess: Board/Move counters, Result buttons
- Live event log with UNDO (soft-delete, sets `undone: true`)
- Bottom action bar: End Half / Final · End Match
- Every tap writes one doc to `matches/{matchId}/refereeEvents` with `by: currentUserUid`
- Firestore security rule: `request.auth.uid in get(/matches/{matchId}).refereeUids`

### 7. Profile Screen
Role-aware quick actions panel:
- Always shown: My Team, Live Now
- Sport Captain → adds "Edit Lineup" cyan tile
- Group Captain → adds "Manage Team" gold tile
- Admin → adds "Event Setup" + "Post Score" orange tiles
- Super Admin → all Admin tiles plus a "Manage Admins" tile
- Referee (per-match) → adds "Referee Console" primary tile when user has any assigned matches today

Stats: Matches played / Wins / Points contributed (computed from matches where user was in the `pitch` roster).

## Auth Rules

1. **Google OAuth only**, with `hd: 'cheq.one'` parameter — blocks non-domain accounts at provider level
2. Cloud Function on user creation: verify `email.endsWith('@cheq.one')`; reject otherwise
3. Guest can read public collections; cannot write
4. Role grants are stored as custom claims (`admin: true`, `superAdmin: true`) for admin/super-admin only; other roles are derived from team membership documents (cheaper to manage). Only Super Admin can grant or revoke the `admin` claim; the `superAdmin` claim is bootstrapped manually on first deploy (your account) and is otherwise immutable from the app.
5. Account creation is auto: first time a `@cheq.one` user signs in, create their `users/{uid}` doc. The on-create function also checks for any staged record matching the email (from CSV import) and merges in `displayName`, `phone`, `teamId`. Team assignment can be done by admin via the Teams tab either before or after the player has logged in.

## Realtime Strategy

- Leaderboard, live scores, arena state, referee events — all use Firestore `onSnapshot`
- Aggregate points: a Cloud Function listens to `matches/{matchId}` writes where `status === 'final'`. On final, it updates `teams.totalPoints` in a transaction. Never compute leaderboard client-side from match history.
- Offline cache: vite-plugin-pwa with Workbox precaches the app shell + the most recent leaderboard

## File Structure

```
/src
  /components
    /arena         — Field, Player, Ball, ArenaScoreStrip
    /leaderboard   — LeaderboardRow, TeamHero
    /lineup        — DragGrid, DragTile, BucketSection
    /referee       — Scoreboard, PunchGrid, EventLog, MatchSwitcher
    /admin         — EventTab, PlayersTab, TeamsTab, SportsTab, RefereesTab, RulebookTab, PointsTab, PlayerImport
    /shared        — Avatar (handles photo priority), CaptainBadge, TopBar, TabBar, Chip
  /screens         — Home, Arena, Leaderboard, TeamDetail, Rulebook, Profile, Login, Lineup, TeamMgmt, Admin, ScoreEntry, Referee
  /lib
    firebase.ts    — Firebase init
    auth.ts        — useAuth hook, domain check
    db.ts          — Firestore helpers + typed converters
    roles.ts       — useRole hook (returns 'guest' | 'player' | 'sport-cap' | 'group-cap' | 'admin' | 'super-admin' + perMatchReferee[])
    points.ts      — Points calculation utilities
  /functions       — Cloud Functions (parseRulebook, awardPoints, onUserCreate)
  App.tsx
  main.tsx
```

## Build & Dev

```bash
pnpm install
pnpm dev               # Vite dev server
pnpm build             # Production build
pnpm preview           # Preview production build
firebase emulators:start    # Local Firebase emulators (auth, firestore, functions)
firebase deploy        # Deploy everything to Firebase
```

## Reference

The full visual prototype is at `prototype/cheq-fest-prototype.html` (single HTML file). It shows every screen, the color system, animations, and interaction patterns. **When in doubt about UI, open the prototype and match its look.**

The architecture/feature spec for each capability is in `docs/ARCHITECTURE.md`.

## Build Order

1. Scaffold: Vite + React + TS + Tailwind + PWA plugin + design tokens as CSS variables
2. Firebase setup: auth (domain-restricted), Firestore rules, emulators wired locally
3. Shared components: Avatar (with photo priority), CaptainBadge, TopBar, TabBar
4. Public screens: Home, Leaderboard, Team Detail, Rulebook (read-only) — with seed data
5. Auth flow: Google login, profile screen, role detection
6. Sport Captain Lineup with drag-and-drop
7. Group Captain Team Management
8. Admin tabbed Event Setup (start with Event/Teams/Sports/Points; Rulebook parser comes later)
9. Arena (animated faces, ball, captain markers)
10. Admin Score Entry + Cloud Function for points engine
11. Referee Console + per-match referee assignment in Admin
12. AI Rulebook Parser (Cloud Function + Claude API integration)
13. PWA polish: manifest, icons, offline cache, install prompt

Ship each step end-to-end (UI + data + rules) before moving to the next.

## Notes for Claude Code

- Always check the prototype HTML before designing a screen. Match colors, fonts, spacing, and animations.
- Use CSS variables for all colors — do not hardcode hex values inside components.
- For drag-and-drop, the captain tile must have `disabled: true` in dnd-kit's `useDraggable` — not just visually disabled.
- The "C" captain badge is a shared component (`<CaptainBadge />`) used in both arena faces and roster avatars — they must look identical.
- Match clock in the referee console: store `clockSeconds` and `isRunning` in Firestore, not in component state. Other viewers should see the same time.
- When generating sport-specific UI (referee punch buttons, arena layouts), drive it from `sport.trackableEvents` and `sport.arenaType` — do NOT hardcode `if sport === 'football'` branches in components.
- All writes go through typed helpers in `lib/db.ts`. Never call `setDoc` directly from a component.
- Test with the Firebase emulator before deploying. Don't push to prod without testing security rules.
