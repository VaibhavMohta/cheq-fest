# CHEQ Fest — Sports Tracker PWA

A mobile-first PWA for tracking CHEQ company sports fest in real time. Built for employees to follow scores, lineups, and live matches.

## Stack

- **Frontend:** React 19 + Vite 7 + TypeScript (strict, `noUncheckedIndexedAccess`), Tailwind v4 (`@tailwindcss/vite`, tokens via `@theme`), installable as PWA (`vite-plugin-pwa`)
- **Routing:** TanStack Router (file-based, code-split via `lazyRouteComponent`); `routeTree.gen.ts` regenerated via `tsr generate`
- **Data:** TanStack Query for server state + mutations (optimistic with revert)
- **Auth:** Firebase Auth with Google OAuth, restricted to `@cheq.one` hosted domain (`hd: 'cheq.one'`)
- **Database:** Firestore (realtime listeners for live scores/leaderboard, multi-event collection)
- **Storage:** Firebase Storage (jerseys, team logos, rulebook PDFs, admin-uploaded player photos)
- **Functions:** Firebase Cloud Functions (Gen 1 for `onUserCreate` triggers, Gen 2 for callable AI functions). Node 22.
- **Hosting:** Firebase Hosting (two projects: `cheq-fest-dev`, `cheq-fest-prod`)
- **AI:** `@anthropic-ai/sdk` — Sonnet 4.6 for rulebook parsing, Haiku 4.5 with vision for jersey-color suggestions. Structured outputs via `output_config.format` (JSON schema). Prompt caching with `cache_control: { type: 'ephemeral' }`.
- **Drag-and-drop:** `@dnd-kit/core` (TouchSensor delay 150ms + PointerSensor distance 8)
- **Animations:** `motion` (renamed `framer-motion`) for screen transitions, arena bobbing, and equipment motion paths
- **Calendars:** `react-day-picker` v9
- **Package manager:** pnpm 9, workspaces (`functions/` has its own `package.json`)

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

**Team colors:** custom per-team, chosen during team creation (3-step wizard). Each team is consistently the same color across every screen (avatars, dots on arena, leaderboard flags). The set of standard team palette colors includes the four accents above plus an expanded picker; used colors are greyed out (not hidden) so admins see what's taken.

**Captain marker:** gold "C" badge in top-right of any avatar/face that belongs to a captain. Identical shape on arena faces and roster tiles — this is intentional so users can match field positions to the list.

**Mobile-first:** target viewport ~380px. All tap targets ≥ 36px. Bottom nav is fixed and floating with a 12px gap from edge. Avoid bottom-sheet patterns; the existing screen-transition pattern is fine.

## Account Hierarchy & Roles

```
Super Admin (global, root)
  └── Admin (global)
       └── Event
            └── Team
                 ├── Group Captain  (assigned by Admin/Super Admin, by EMAIL)
                 ├── Vice Captain   (assigned by Group Captain, by EMAIL)
                 └── Sport Captain  (assigned by Group Captain, one per sport)
                      └── On The Pitch / Tentative / Substitute / Not Playing
                          (assigned by Sport Captain via 4-bucket drag-and-drop)

Referee — per-match assignment by Admin. Cross-cuts the hierarchy: any player can be made a referee for any specific match in any sport. Multiple refs per match are allowed.
```

**Super Admin vs Admin:**
- **Super Admin** can do everything Admin can, plus: promote/demote other users to Admin, create new events, and delete events. There is exactly one Super Admin account (bootstrapped via `functions/scripts/grant-super-admin.ts`) and it is the only role that can grant the `admin` claim to others.
- **Admin** runs the day-to-day setup of an event: teams, sports, rulebook, referee pool, points, score entry, player import + team assignment.
- Both Super Admin and Admin can upload a CSV of player records (`email`, `name`, optional `phone`) or enter rows manually on the **Players** admin tab, then assign each imported player to a team via the **Teams** tab.

### Mode Dropdown ("View as")

`<ModeDropdown />` lives in `TopBar`'s right slot on every screen except Login. It lets the signed-in user **render the UI as if they held only a specific role**. After switching, the app navigates to `/` so the new context is unambiguous.

Rules (enforced in `src/lib/roles.ts`):

1. **Strict modes.** Each role only implies itself, with one exception: `super-admin` still implies `admin` (real privilege relationship). There is **no** "signed-in implies player" anymore.
2. **Earned `player` tag.** A user gets the `player` role only once an admin has assigned them to a team in the active event (`users/{uid}.teamId` is set). A signed-in user with no team is effectively a `guest` for the purposes of the UI.
3. **Available modes = roles you actually hold + `guest`.** The dropdown never shows a role you haven't been assigned. If the only mode is `guest`, the dropdown is hidden entirely.
4. **`activeMode` is persisted** in `localStorage` under `cheq-fest:activeMode`. On load, if the stored mode isn't in `availableModes` (e.g. cross-user reuse, lost a role), it falls back to `primary` (the strongest role the user holds).
5. **Server-side enforcement is unchanged.** The dropdown is presentation only — Firestore rules + Cloud Function claim checks still gate writes.

**Hard rule, enforced in Firestore security rules:** a user can only be assigned a role *within a team they're already a member of*. The only exception is Referee, which can come from any team or be a non-player employee.

**Email-based team membership.** Team docs reference members and captains by **email**, not uid:
- `team.members: string[]` — list of emails
- `team.groupCaptainEmail`, `team.viceCaptainEmail`
- `roster.sportCaptainEmail`

This means admins can build full rosters and pick captains **before any player has signed in**. The email is the stable identifier across the staged → claimed sign-in transition. On first sign-in, `onUserCreate` writes the uid back to `users/{uid}` and links it to the existing email-based team membership without rewriting team docs.

**Guest mode:** unauthenticated users get read-only access to events, teams, leaderboard, arena, rulebook. Public reads, authenticated writes only.

## Data Model (Firestore)

Multi-event: `events` is a collection (not a single doc). The active event is chosen via the `<EventBar />` dropdown and persisted in `localStorage` (`cheq-fest:activeEventId`); `useActiveEvent()` is the hook every screen uses.

```
events/{eventId}                              // top-level collection
  ├── name, year, startDate, endDate, venue, logoUrl
  ├── rulebookPdfUrl, rulebookText, rulebookParsedAt
  ├── refereePool: [email]                    // admin-curated list of eligible refs (by email)
  ├── createdAt, createdBy
  └── status: 'draft' | 'live' | 'ended'

events/{eventId}/sports/{sportId}             // rich, parser-driven schema
  ├── name, category, parentCategory          // e.g. parentCategory: 'racquet'
  ├── arenaType: 'field'|'court'|'pitch'|'board'|'table'|'rope'|'track'
  ├── playersOnField, substitutes, playersToRegister
  ├── duration, format                        // e.g. "2 × 15 min", "5-a-side", "Best of 3 games to 21"
  ├── genderRequirement                       // 'open' | 'mens' | 'womens' | 'mixed' | ...
  ├── points: { win, draw, loss }
  ├── scoringRules: [string]                  // free-form bullets parsed from rulebook
  ├── bowlingRules, fieldingRules, gameplayRules: [string]
  ├── faultsList: [string]
  ├── tieBreakerRules: [string]
  ├── houseRules, overSchedule, officials, substitutionRules
  ├── trackableEvents: [string]               // free-form punch-in schema for referee
  ├── stateFields: [string]                   // which fields appear on the live state strip
  └── aiConfidence: { [fieldName]: 'high'|'low'|'missing' }

events/{eventId}/teams/{teamId}
  ├── name, color, logoUrl, jerseyUrl
  ├── members: [email]                        // emails, not uids
  ├── groupCaptainEmail, viceCaptainEmail
  └── totalPoints (denormalized for leaderboard speed)

events/{eventId}/teams/{teamId}/rosters/{sportId}
  ├── sportCaptainEmail
  ├── pitch: [email]                          // max = playersOnField
  ├── tentative: [email]
  ├── substitutes: [email]
  └── notPlaying: [email]

events/{eventId}/matches/{matchId}
  ├── sportId, teamAId, teamBId
  ├── scheduledStart, venue
  ├── refereeUids: [uid]                      // uid here — refs sign in to punch events
  ├── state: { scoreA, scoreB, clockSeconds, half, isRunning, ...sport-specific }
  ├── status: 'scheduled' | 'live' | 'final'
  └── winnerTeamId, pointsAwarded

events/{eventId}/matches/{matchId}/refereeEvents/{eventId}
  ├── type, value, side ('A'|'B'), at: timestamp
  ├── by: refUid
  └── undone: boolean                         // soft-delete for audit trail

users/{uid}
  ├── email (must end in @cheq.one)
  ├── displayName, phone (optional, from CSV import)
  ├── photoUrl, googlePhotoUrl, adminPhotoUrl
  ├── teamId                                  // gates the "player" role
  ├── globalRoles: ['super-admin'? , 'admin'?]
  ├── groupCaptainOf, sportCaptainOf, perMatchReferee   // derived role hints
  └── pending: boolean                        // true for staged CSV imports awaiting first login

stagedPlayers/{autoId}                        // optional alt to users with pending:true
  ├── email, displayName, phone, teamId
  └── importedAt, importedBy

aiUsage/{autoId}                              // admin-read-only cost tracking
  ├── function: 'parseRulebook' | 'suggestTeamColor'
  ├── model, inputTokens, outputTokens
  ├── cacheReadTokens, cacheCreationTokens
  ├── costUsd                                  // computed from PRICING_USD_PER_MTOK
  ├── eventId, calledBy
  └── at: timestamp
```

**Avatar source priority** (first non-null wins):
1. `user.adminPhotoUrl`
2. `user.googlePhotoUrl`
3. Initials fallback (e.g. "SH" for Shah Mehta) on the team-colored background

## Core Features

### 1. Animated Sport Arena

Every arena is hand-drawn SVG with sport-realistic markings:

- **pitch** — football: D-shaped goal areas, center circle, halfway line
- **field** — cricket: oval boundary, pitch strip, inner ring
- **court** — badminton / pickleball (variant by `sportId`)
- **board** — chess: 8×8 alternating squares
- **table** — pool (felt + pockets + 8-ball rack) / table tennis (variant by `sportId`)
- **rope** — tug-of-war: center flag, anchor markers, pull zones
- **track** — relay: curved lanes with start/finish markings

Surfaces use per-arena gradients so they read at a glance.

**Equipment is sport-specific** (`src/components/arena/Equipment.tsx`):
- Cricket: red ball with seam stitches
- Football: white panelled ball with pentagon/hex hints
- Badminton: shuttlecock with feather fan + cork
- Table tennis: white ball with subtle shading
- Pool: 8-ball with stripe
- Pickleball: yellow perforated ball
- Tug-of-war: red center flag
- Relay: baton (orange, with grip texture)
- Fallback: generic ball

**Motion paths** are sport-realistic (`src/lib/arenaLayout.ts`):
- Football: ping-pong around the pitch
- Cricket: bowler-to-batsman strip plus boundary trajectory
- Badminton: high arc back-and-forth across net
- Pool/TT: straight-line shots with corner reflections
- Tug-of-war: small oscillations at the rope center
- Relay: lane sweep
- Chess: gentle hover near the board

Bobbing idle animation on player avatars is staggered via `delaySeed` so the field doesn't pulse in lockstep. Compact mode (2-letter initials, smaller font) kicks in for tight arenas (tables, doubles courts, rope, track) to prevent label overlap.

Captain has gold "C" badge (matches the badge on roster tiles below for visual continuity). Empty positions on the pitch are allowed (sport-cap discretion) — render as dashed-outline placeholder.

### 2. Leaderboard

- Overall standings (sum of points across all sports)
- Per-sport leaderboard
- Realtime — Firestore `onSnapshot` listener on `events/{id}/teams` ordered by `totalPoints desc`
- Rank changes show trend arrows (↑ ↓) based on diff from a snapshot taken at start of each day

### 3. Sport Captain Lineup Editor (4-bucket drag-and-drop)

- Four buckets: On The Pitch / Tentative / Substitutes / Not Playing
- Captain is locked in "On The Pitch", cannot be moved (`disabled: true` in dnd-kit's `useDraggable`)
- Pitch is capped at `sport.playersOnField`; overflow drops are rejected
- All other players freely draggable between buckets
- Mobile touch: `@dnd-kit/core` with `TouchSensor` (delay 150ms) and `PointerSensor` (distance 8)
- Persist on every drop with optimistic update + revert on error

### 4. Admin Event Setup (tabbed)

Tabs: **Event** / **Players** / **Teams** / **Sports** / **Referees** / **Rulebook** / **Points** / **Matches**

Every admin tab is wrapped in `<RequireEvent />` — if no active event is selected (or none exists), tabs prompt the admin to create one first.

- **Event:** name, dates (via `react-day-picker` calendar), venue, logo upload. Super Admin only: create/delete events.
- **Players:** CSV import (`email,name,phone?` columns) or manual entry. Lists imported players with `pending` / `claimed` status.
- **Teams:** **3-step wizard** for create — (1) name → (2) jersey photo upload (auto-triggers `suggestTeamColor` Cloud Function) → (3) pick from AI suggestions OR static color palette (used colors greyed out, never hidden). Then per-team detail view: edit name/color, upload team logo, assign Group Captain by email, search-and-check players to add to roster. **A player can belong to only one team within an event** (enforced in the picker and in security rules).
- **Sports:** "Import 16 standard sports" button populates from `src/data/standardSports.ts`. Expanded editor with collapsible "Edit rules, faults, tiebreakers" section exposes every rich field.
- **Referees:** Referee Pool (any @cheq.one user) + Per-Match Assignments (multiple refs per match, admin picks from pool).
- **Rulebook:** AI parser (see below) + AI cost panel showing total tokens, total USD, recent calls.
- **Points:** auto-populated from rulebook, admin can override.
- **Matches:** schedule and edit matches, set referees.

Super-Admin-only modal (accessed from Profile) handles "grant Admin" / "revoke Admin".

### 5. AI Rulebook Parser

- Admin pastes rulebook text **or** uploads a PDF
- PDFs: extract text in a Cloud Function using `pdf-parse`
- Send text to Anthropic API (**Claude Sonnet 4.6**, `effort: 'low'`, `thinking: disabled`, `max_tokens: 8000`) with structured output (`output_config.format` with JSON schema). Callable timeout set to 120s.
- Structured-output gotchas (Anthropic limits): no `minimum`/`maximum` on `integer` types, no enums on integers. Confidence values are string enums (`'high'|'low'|'missing'`).
- The schema covers the full rich `SportDoc`: `playersOnField`, `substitutes`, `duration`, `points`, `scoringRules[]`, `faultsList[]`, `tieBreakerRules[]`, etc., each with a confidence pill.
- Render parsed cards on the Rulebook tab; missing/low-confidence fields highlighted in orange (`needs review`)
- Admin edits/confirms → writes to `events/{id}/sports/{sportId}`
- Keep the original PDF available for reading via `rulebookPdfUrl`
- Every call writes one `aiUsage/{autoId}` doc with token counts + USD cost.

### 6. AI Team-Color Suggestion (`suggestTeamColor`)

- Triggered automatically when admin uploads a jersey photo in the team-creation wizard
- Uses **Claude Haiku 4.5** with vision input (image fetched from Storage)
- Returns ranked color suggestions excluding the colors already used by other teams in this event
- Same `aiUsage` logging path

### 7. Referee Console (`/referee`)

Live punch-in tool for match officials.

- Available from Profile when user is in any match's `refereeUids`
- Match switcher pills at top
- Big scoreboard with +/- buttons per side
- Match clock with play/pause/reset (real `setInterval` time, persisted to Firestore as `state.clockSeconds`)
- Sport-specific punch panes (driven by `sport.trackableEvents`, never hardcoded `if sport === 'football'`):
  - Football: Goal/Yellow/Red/Foul/Sub buttons, Half cycler, Extra Time counter
  - Cricket: Ball-by-ball buttons (0/1/2/4/6/W/WD/NB/B-LB), Over/Balls/Innings/Wickets counters
  - Badminton: Game number, Service cycler, Let/Fault
  - Chess: Board/Move counters, Result buttons
- Live event log with UNDO (soft-delete, sets `undone: true`)
- Every tap writes one doc to `matches/{matchId}/refereeEvents` with `by: currentUserUid`
- Firestore security rule: `request.auth.uid in get(/matches/{matchId}).refereeUids`

### 8. Profile Screen

Role-aware quick actions panel (driven by `useRole()` and the **active mode**, not just held roles):
- Always shown: My Team, Live Now
- Sport Captain mode → "Edit Lineup" cyan tile
- Group Captain mode → "Manage Team" gold tile
- Admin mode → "Event Setup" + "Post Score" orange tiles
- Super Admin mode → all Admin tiles plus "Manage Admins"
- Referee mode (per-match) → "Referee Console" primary tile when user has any assigned matches today

Stats: Matches played / Wins / Points contributed (computed from matches where user was in the `pitch` roster).

## Auth Rules

1. **Google OAuth only**, with `hd: 'cheq.one'` parameter — blocks non-domain accounts at provider level
2. Cloud Function on user creation: verify `email.endsWith('@cheq.one')`; reject otherwise
3. Guest can read public collections; cannot write
4. Role grants are stored as custom claims (`admin: true`, `superAdmin: true`) for admin/super-admin only; other roles are derived from team membership documents. Only Super Admin can grant or revoke the `admin` claim; the `superAdmin` claim is bootstrapped manually via `functions/scripts/grant-super-admin.ts` (uses `service-account.json`, gitignored) and is otherwise immutable from the app.
5. Account creation is auto: first time a `@cheq.one` user signs in, `onUserCreate` writes their `users/{uid}` doc and merges any staged record matching the email.
6. `aiUsage` collection: admin-read-only, server-write-only.

## Realtime Strategy

- Leaderboard, live scores, arena state, referee events — all use Firestore `onSnapshot`
- Aggregate points: a Cloud Function listens to `matches/{matchId}` writes where `status === 'final'`. On final, it updates `teams.totalPoints` in a transaction. Never compute leaderboard client-side from match history.
- Offline cache: `vite-plugin-pwa` with Workbox precaches the app shell + the most recent leaderboard

## File Structure

```
/src
  /components
    /arena         — Field, ArenaPlayer (with compact mode), Ball, Equipment, ArenaScoreStrip
    /leaderboard   — LeaderboardRow, TeamHero
    /lineup        — DragGrid, DragTile, BucketSection
    /referee       — Scoreboard, PunchGrid, EventLog, MatchSwitcher
    /admin         — EventTab, PlayersTab, TeamsTab (3-step wizard), TeamDetail,
                     SportsTab (with rich rules editor), RefereesTab, RulebookTab,
                     PointsTab, MatchesTab, RequireEvent
    /shared        — Avatar, CaptainBadge, TopBar, TabBar, Chip,
                     EventBar, ModeDropdown, DatePicker
  /routes          — TanStack Router file-based, code-split via lazyRouteComponent
  /data
    standardSports.ts   — 16 standard sports with variant factories
  /lib
    firebase.ts         — Firebase init (per-env config)
    auth.ts             — useAuth hook, domain check
    db.ts               — factory functions: eventRef, teamsCol, sportsCol, matchesCol, refereeEventsCol
    roles.ts            — useRole hook (activeMode, availableModes, is(), earned-only player tag)
    activeEvent.ts      — useEvents() + useActiveEvent() with localStorage persistence
    arenaLayout.ts      — per-sport position formations + equipment paths/durations
    suggestTeamColor.ts — client wrapper for the Haiku callable
    points.ts           — points calculation utilities (shared with functions/)
    csv.ts              — small CSV parser for player import
  /types               — event, team (with helpers colorVarFor/teamLabelFor), sport, player, match
  /styles              — tokens.css (@theme), fonts.css, global.css
  routeTree.gen.ts     — generated by @tanstack/router-plugin (regenerated by tsr generate)

/functions
  /src
    index.ts            — function exports
    onUserCreate.ts     — Gen 1 trigger (links staged → claimed)
    parseRulebook.ts    — Gen 2 callable, Sonnet 4.6
    suggestTeamColor.ts — Gen 2 callable, Haiku 4.5 vision
    pricing.ts          — PRICING_USD_PER_MTOK table + cost helper
    aiUsage.ts          — writes aiUsage docs
  /scripts
    grant-super-admin.ts — one-shot bootstrap (uses service-account.json, gitignored)
```

## Build & Dev

```bash
pnpm install
pnpm dev                       # Vite dev server (uses .env.local → cheq-fest-dev)
pnpm build                     # Production build (uses .env.production → cheq-fest-prod)
pnpm build:dev                 # Build using .env.development → cheq-fest-dev
pnpm preview
pnpm typecheck                 # tsr generate && tsc -b --noEmit
pnpm deploy:dev                # build:dev + firebase deploy --project dev
firebase emulators:start       # Local Firebase emulators (auth, firestore, functions)
firebase deploy --project prod # Manual prod deploy
```

**Two Firebase projects:** `cheq-fest-dev` and `cheq-fest-prod`. Each has its own `.env.*` file. **All `.env.*` files are gitignored** — restore from local notes when cloning.

**Predeploy hook** for functions installs and builds via `pnpm --dir functions install --no-frozen-lockfile && pnpm --dir functions build` (cross-platform, works on Windows where `bash` isn't available).

**Anthropic API key** is stored as a Firebase Secret (`ANTHROPIC_API_KEY`), not in `.env`.

## Reference

The full visual prototype is at `prototype/cheq-fest-prototype.html`. **When in doubt about UI, open the prototype and match its look.**

The architecture/feature spec is in `docs/ARCHITECTURE.md`.

## Notes for Claude Code

- **Don't pin to outdated versions** because of training-data memory. Use latest stable.
- **TypeScript strict + `noUncheckedIndexedAccess`** are on from day one. Indexing a `Record<string, T>` returns `T | undefined` — handle it. Use the typed helpers `colorVarFor()` / `teamLabelFor()` from `src/types/team.ts` rather than indexing directly.
- Always check the prototype HTML before designing a screen. Match colors, fonts, spacing, and animations.
- **Use CSS variables for all colors** — do not hardcode hex inside components.
- For drag-and-drop, the captain tile must have `disabled: true` in dnd-kit's `useDraggable` — not just visually disabled.
- The "C" captain badge is a shared component (`<CaptainBadge />`) used in both arena faces and roster avatars — they must look identical.
- Match clock in the referee console: store `clockSeconds` and `isRunning` in Firestore, not in component state.
- **Drive sport-specific UI from `sport.trackableEvents` and `sport.arenaType`** — never `if sport === 'football'` branches. Arena equipment + motion paths are also data-driven via `sportId`.
- **All Firestore writes go through typed helpers in `lib/db.ts`.** Never call `setDoc` directly from a component. Collection refs are factory functions taking `eventId` (e.g. `teamsCol(eventId)`).
- **Team membership is email-keyed**, not uid-keyed. This is intentional — it lets admins build rosters before sign-in.
- **The `player` role is earned**, not free. Only granted when `users/{uid}.teamId` is set.
- **Mode dropdown is strict.** Only `super-admin → admin` is implied; no other cross-role implications.
- **Anthropic structured-output limits:** no `minimum`/`maximum` on integers, no enums on integer types. Use strings + post-validate if you need ranges.
- Test with the Firebase emulator before deploying. Don't push to prod without testing security rules.
- Run `tsr generate` (or `pnpm typecheck`) after adding/removing routes — `routeTree.gen.ts` is checked in but must stay in sync.
- No `service-account.json`, no `.env.*` in commits. Both are gitignored.
