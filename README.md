# Five Crowns — real-time multiplayer card game

A production-quality, server-authoritative implementation of **Five Crowns** for 2–7 players,
built on React + TypeScript + Vite + Tailwind with **Firebase as the entire backend**.

There is no mock mode, no bot opponents and no local-only play. Two browsers in the same lobby
see the same table in real time, and a client that tries to cheat is rejected by the server.

---

## Table of contents

1. [What's in the box](#whats-in-the-box)
2. [Architecture](#architecture)
3. [Quick start (local, with emulators)](#quick-start-local-with-emulators)
4. [Setting up a real Firebase project](#setting-up-a-real-firebase-project)
5. [Deploying](#deploying)
6. [Testing](#testing)
7. [Project layout](#project-layout)
8. [Security model](#security-model)
9. [Troubleshooting](#troubleshooting)

---

## What's in the box

**Gameplay**
- All 11 rounds: round *N* deals *N+2* cards and makes rank *N+2* wild; jokers are always wild.
- Two 58-card decks shuffled together (116 cards: 5 suits × ranks 3–K, plus 3 jokers per deck).
- Books and runs with wild substitution, validated by a deterministic engine.
- No laying down melds early, and no adding to another player's melds.
- Go out → every other player gets exactly one final turn → scoring.
- Scoring: 3–10 face value, J/Q/K = 11/12/13, the round's wild rank = 20, joker = 50,
  melded cards = 0, the player who went out = 0. Lowest total after 11 rounds wins.
- Ties share the win by default, or play a 6-card tie-break round if the host chooses.
- Turn timer (120 s default) with server-side auto-discard, full reconnection support.

**Product**
- Landing page, how-to-play guide and an interactive practice sandbox.
- Email/password + Google auth, email verification, password reset, account deletion.
- Lobbies with 5-character unambiguous join codes (no `0 O 1 I L`), invitations, public listings.
- Friends, blocking, lobby + table chat, a notifications centre and browser notifications.
- Game history with per-round scorecards, statistics, and global/friends leaderboards.
- Light/dark themes, reduce-motion, high-contrast and large-card accessibility options.
- Spectator mode that never exposes a hand.

---

## Architecture

```
          Browser (React)                        Firebase
┌──────────────────────────────┐      ┌──────────────────────────────────┐
│  UI components               │      │  Cloud Functions (41 callables)  │
│  hooks/useGame ──────────────┼─────▶│   all authoritative mutations    │
│  src/game  (rules engine) ◀──┼──────┼── functions/src/shared/game      │
│   - instant local feedback   │      │   (identical copy, synced)       │
│                              │      ├──────────────────────────────────┤
│  onSnapshot listeners  ◀─────┼──────│  Cloud Firestore                 │
└──────────────────────────────┘      │   games/{id}          (public)   │
                                      │   games/{id}/secret   (no reads) │
                                      │   games/{id}/hands/{uid} (owner) │
                                      └──────────────────────────────────┘
```

Three rules make the whole thing hang together:

1. **The rules engine lives outside React** (`src/game/`). It is pure TypeScript — no React, no
   Firebase, no I/O — so it can be unit-tested directly and shipped to both sides.
   `scripts/sync-engine.mjs` copies `src/game` and `src/types` into `functions/src/shared/` at
   build time, so the client and the server literally execute the same code.

2. **The server is the only writer.** Clients never write a game document. Every move is a
   callable Cloud Function that opens a Firestore transaction, re-reads the authoritative state,
   re-validates the move with the engine, and writes the result. Security rules set
   `allow write: if false` on every authoritative collection.

3. **Hands are physically separated.** The shuffled deck lives in `games/{id}/secret/state`,
   which *no client can read*. Each player's cards live in `games/{id}/hands/{uid}`, readable
   only by that player (`get` only — `list` is denied, so you cannot enumerate other hands).

Supporting mechanisms:

| Concern | Mechanism |
| --- | --- |
| Double submits | Every mutation carries a `requestId`; replays are a verified no-op |
| Ordering | `actionSeq` counter, events keyed `actionSeq * 100 + i` |
| Turn timeouts | `turnDeadline` server timestamp + `enforceTurnTimeout` callable + a scheduled sweep |
| Presence | RTDB `onDisconnect` when configured, otherwise a Firestore heartbeat |
| Statistics | Written only by the `gameHistory` onCreate trigger, guarded by `statsApplied` |
| Abuse | Per-action rate limits (chat 10/30 s, invites 30/10 min, friend requests 30/h, …) |

---

## Quick start (local, with emulators)

**Requirements:** Node 20+, Java 11+ (for the Firestore/Auth emulators), and ~2 GB of free RAM.

```bash
git clone <your-repo> five-crowns && cd five-crowns

npm install
npm --prefix functions install

cp .env.example .env.local
```

Set these two values in `.env.local` — nothing else is needed for emulator mode:

```ini
VITE_USE_EMULATORS=true
VITE_FIREBASE_PROJECT_ID=demo-five-crowns
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-five-crowns.firebaseapp.com
VITE_FIREBASE_APP_ID=1:1:web:local
VITE_FIREBASE_MESSAGING_SENDER_ID=1
VITE_FIREBASE_STORAGE_BUCKET=demo-five-crowns.appspot.com
```

Then start everything with one command:

```bash
npm run dev:all              # builds functions, starts emulators, waits, starts Vite
npm run dev:all -- --low-memory   # on a ~2 GB machine (single functions runtime, capped heaps)
```

Open <http://localhost:5173>. Register two accounts in two different browsers (or one normal and
one private window), create a lobby in the first, join with the code in the second, and press
**Deal round 1**. Both tables update live.

> **Why the emulator traffic is proxied.** In emulator mode every Firebase endpoint is routed
> through the Vite dev server (`vite.config.ts` → `emulatorProxy`). That keeps everything
> same-origin, so the app also works over HTTPS, inside an iframe, and from another device on your
> network without mixed-content errors.

Running the pieces separately:

```bash
npm --prefix functions run build    # also runs scripts/sync-engine.mjs
npm run emulators                   # Firebase Emulator Suite
npm run dev                         # Vite
```

The emulator UI is **disabled** in `firebase.json` to save ~150 MB. If you have RAM to spare, set
`emulators.ui.enabled` to `true` and browse to <http://localhost:4000>.

---

## Setting up a real Firebase project

### 1. Create the project

1. Go to the [Firebase console](https://console.firebase.google.com/) → **Add project**.
2. Upgrade to the **Blaze (pay-as-you-go)** plan. Cloud Functions require it; the free tier
   allowance is generous enough that a hobby deployment typically costs nothing.

### 2. Register a web app

**Project settings → Your apps → Web (`</>`)**. Copy the config values into `.env`:

```ini
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=1234567890
VITE_FIREBASE_APP_ID=1:1234567890:web:abcdef
VITE_USE_EMULATORS=false
```

These are **not secrets** — they ship in the browser bundle, and access is controlled by Security
Rules and App Check. Never put a service-account key in a `VITE_*` variable. Only
`.env.example` is committed; `.env` and `.env.local` are git-ignored.

### 3. Authentication

**Build → Authentication → Get started**, then enable:

- **Email/Password** (leave "Email link" off).
- **Google** — pick a support email.

Under **Settings → Authorized domains**, add the domain you will serve from
(`your-project.web.app` is added automatically; add a custom domain if you use one).

Optionally customise the verification and password-reset emails under **Templates**.

### 4. Cloud Firestore

**Build → Firestore Database → Create database → Production mode**, and pick a region close to
your players. Do not hand-edit rules in the console — they are deployed from `firestore.rules`.

### 5. Realtime Database (optional, for presence)

Presence works without it (a Firestore heartbeat is used instead), but RTDB gives you instant
`onDisconnect` detection.

**Build → Realtime Database → Create database**, then add the URL to `.env`:

```ini
VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
```

### 6. Storage (optional, for avatars)

**Build → Storage → Get started**. Rules are deployed from `storage.rules`. If you skip this,
avatar upload is the only feature that degrades — everything else is unaffected.

### 7. App Check (recommended)

**Build → App Check → Apps → Register**, choose **reCAPTCHA v3**, then:

```ini
VITE_RECAPTCHA_SITE_KEY=6Lc...
```

Callables read `ENFORCE_APP_CHECK` (`functions/src/lib/guards.ts`). Start with enforcement off,
confirm legitimate traffic is being attested in the console, then turn it on. For local work set
`VITE_APPCHECK_DEBUG=true` and register the printed debug token.

### 8. Analytics (optional)

If you enabled Google Analytics, add `VITE_FIREBASE_MEASUREMENT_ID`. It is loaded lazily and
never in emulator mode.

### 9. Point the CLI at your project

```bash
npx firebase login
npx firebase use --add        # pick your project, alias it "default"
```

This rewrites `.firebaserc`.

---

## Deploying

```bash
npm run deploy
```

That runs `tsc -b && vite build` and then `firebase deploy`. Finer-grained targets:

```bash
npm run deploy:rules        # firestore rules + indexes, database, storage
npm run deploy:functions    # cloud functions only
npm run deploy:hosting      # the built SPA only
```

**Deploy the rules and indexes before the first real game.** Without the composite indexes in
`firestore.indexes.json` several listeners (active games, history, leaderboards, invitations) will
fail with a `failed-precondition` error. The console error message always contains a one-click
link to create a missing index if you add a query later.

**Scheduled functions** (`cleanupExpiredLobbies`, `cleanupExpiredInvitations`,
`enforceTurnDeadlines`, `sweepPresence`) are deployed with the rest and run on Cloud Scheduler;
the first deploy enables the API automatically. Locally they need the pubsub emulator, which is
why the interactive path also exposes the `enforceTurnTimeout` callable — the game never stalls
just because a schedule did not fire.

### Post-deploy checklist

- [ ] `firebase deploy --only firestore:rules,firestore:indexes` succeeded
- [ ] Sign up with email/password, receive and click the verification link
- [ ] Sign in with Google
- [ ] Create a lobby in one browser, join by code in another, start the game
- [ ] Confirm the second browser sees the first player's draw/discard instantly
- [ ] Confirm `games/{id}/secret/state` is unreadable from the client console
- [ ] Play a full round and confirm the scorecard and history entry appear

---

## Testing

```bash
npm run typecheck     # tsc --noEmit over the whole app
npm test              # rules engine: 102 tests, no React, no network
npm run test:ui       # jsdom smoke tests for the table rendering + app boot
node scripts/e2e-backend.mjs   # 57 integration tests against live emulators
```

**The engine suite** (`src/game/__tests__/`) covers deck integrity, book/run validation with
wilds, the `findValidCombinations` solver (including 200 randomised 14-card hands), scoring and
complete simulated 11-round games for 2–7 players.

**The UI suite** (`src/__tests__/`) boots the real `<App />` and asserts the table never leaks an
opponent's cards, that wild cards are marked with text rather than colour alone, and that every
card is a labelled button.

**The backend suite** (`scripts/e2e-backend.mjs`) talks raw HTTP to the emulators with real user
ID tokens, so Security Rules are genuinely enforced. It asserts, among other things, that:

- a client cannot read another player's hand, the secret deck state, or a private game (403);
- a client cannot write a game document or inflate its own statistics (403);
- out-of-turn actions, double draws and discarding a card you do not hold are rejected;
- replaying a `requestId` is a true no-op;
- only the host can start a game or advance a round;
- round 1 deals 3 cards with 3s wild and 106 cards left in the stock; round 2 deals 4 with 4s wild
  and the dealer rotated;
- a stranger cannot chat but an approved spectator can, and chat is rate-limited;
- an unauthenticated call fails as `unauthenticated` with a readable message, never `INTERNAL`.

Start the emulators first (`npm run dev:all` or `npm run emulators`), then run it.

---

## Project layout

```
five-crowns/
├── src/
│   ├── game/              ← the rules engine (pure TS, no React, no Firebase)
│   │   ├── cards.ts deck.ts rules.ts books.ts runs.ts
│   │   ├── combinations.ts   ← findValidCombinations(hand, wildRank) solver
│   │   ├── scoring.ts turns.ts rng.ts
│   │   └── __tests__/
│   ├── types/             ← shared with the functions bundle
│   ├── firebase/          ← config, typed callable client, typed listeners, presence
│   ├── hooks/             ← useAuth, useGame, useLobby, useFriends, useNotifications…
│   ├── components/        ← cards, game, lobby, chat, common, layout
│   ├── pages/             ← landing, auth, home, play, lobby, game, social, profile…
│   ├── utils/             ← errors, formatting, validation, sound, notifications
│   └── styles/index.css
├── functions/src/         ← users, lobbies, invitations, game, stats, friends, chat, maintenance
├── scripts/
│   ├── sync-engine.mjs    ← copies src/game + src/types into functions/src/shared
│   ├── dev-all.mjs        ← build + emulators + vite, one command
│   └── e2e-backend.mjs    ← the integration suite
├── firestore.rules  firestore.indexes.json  database.rules.json  storage.rules
└── firebase.json  .firebaserc  .env.example
```

### Firestore data model

| Path | Who can read | Who can write |
| --- | --- | --- |
| `users/{uid}` | any signed-in user | functions; owner may write only `isOnline`, `presence`, `lastSeenAt` |
| `users/{uid}/private/profile` | owner | owner (settings/privacy) + functions |
| `lobbies/{id}` | members (and anyone, if public) | functions only |
| `games/{id}` | players, spectators, anyone if public + spectators allowed | functions only |
| `games/{id}/secret/state` | **nobody** | functions only |
| `games/{id}/hands/{uid}` | that player (`get` only, `list` denied) | functions; owner may write only `order` |
| `games/{id}/players/{uid}` | anyone who can see the game | functions only |
| `games/{id}/events`, `/rounds`, `/chat` | anyone who can see the game | functions only |
| `gameHistory/{gameId}` | participants | functions only |
| `notifications/{id}` | owner | owner may set `read` or delete; functions create |

---

## Security model

- **Deny by default.** `firestore.rules` ends with a catch-all deny; every collection is opted in
  explicitly, and every authoritative collection is `allow write: if false`.
- **Three client writes exist in the entire app**: presence fields on your own profile, the
  cosmetic `order` array on your own hand, and the `read` flag on your own notifications.
- **Private games** are readable only by their players and explicitly approved spectators. A
  public game is watchable only when `settings.allowSpectators == true` *and*
  `settings.privacy == 'public'`.
- **Melds are trusted by card id only.** When you go out, the server re-resolves every id against
  its own copy of your hand; an unknown id voids the whole arrangement.
- **Statistics are derived, never submitted.** They are written by a Firestore trigger on
  `gameHistory` creation, guarded by a `statsApplied` flag so a replay cannot double-count.
- **Settings are sanitised server-side** (turn timeout clamped to 30–600 s, max players 2–7, …).
  Rules, wild ranks and scoring are not configurable by anyone, host included.
- **Raw Firebase errors never reach the UI** — `src/utils/errors.ts` maps every known code to a
  plain-English sentence.

---

## Troubleshooting

**`Missing or insufficient permissions` in the console.**
Deploy the rules (`npm run deploy:rules`). If it happens on a specific list query, you are
probably missing a composite index — the error text contains a link that creates it.

**The functions emulator is killed / the machine runs out of memory.**
The emulator starts one Node worker per invoked function by default. On a ~2 GB machine use
`npm run dev:all -- --low-memory`, which passes `--inspect-functions` (a single shared runtime)
and caps the JVM and Node heaps.

**`auth/operation-not-allowed` when signing up.**
Email/Password is not enabled in the Authentication console.

**Google sign-in popup closes immediately.**
Your domain is not in Authentication → Settings → Authorized domains.

**Blank page after deploying to Hosting.**
`firebase.json` rewrites everything to `/index.html`, which is required for client-side routing.
If you host elsewhere, replicate that SPA fallback.

**Scheduled cleanup functions do not run locally.**
They need the pubsub emulator. Turn timeouts are also enforced interactively through the
`enforceTurnTimeout` callable, which any player at the table may invoke once the deadline passes,
so gameplay is never blocked.

**Avatar upload fails.**
Cloud Storage is not enabled, or `storage.rules` has not been deployed. Every other feature keeps
working.

---

## Licence and attribution

Five Crowns is a trademark of Set Enterprises, Inc. This is an independent, non-commercial
implementation of the public rules of the game for playing with friends. There is no gambling, no
monetary ranking and no payments of any kind.
