---
date: 2026-09-03
topic: A global BBS achievement system shared by every AmiExpress board, web and 68K
tags: [achievements, doorserver, doors, 68k, c-sdk, webhooks, leaderboard, architecture, umbrella]
status: draft
---

# Global achievements - design

This is the UMBRELLA spec. It fixes the contract, the trust model, the rule
language and the decomposition; it is not itself an implementation plan. Four
sub-projects follow, each with its own spec and plan (section "Decomposition").

## Problem

This board already recognises what a user does - in fragments, and none of them
travel. `door_score` webhooks post a score to Discord. `bbs-event-emitter`
broadcasts a door event to LiveChat. `sdk/engines/network/modules/leaderboard.ts`
keeps per-lobby achievements for a multiplayer game session. `user.data` counts
uploads, downloads, messages posted, calls and minutes and shows them on a
statistics screen.

Every one of those is scoped to one board, and most to one door. A caller who
has used AmiExpress boards for thirty years has nothing that says so, and a
sysop who brings a board online has nothing to offer a caller that another
board cannot offer identically. There is no shared idea of "the same person"
across boards, no shared catalog of things worth doing, and no way for a door
author to define an achievement that means anything outside their own door.

The board that would benefit most from this is also the one least able to run
it: a real Amiga running original AmiExpress has no database service, no TLS,
and 500 KB for a door.

## What is being built

A global achievement service that every AmiExpress board - amiexpress-web and
original 68K AmiExpress alike - reads from and writes to.

- ONE global catalog of achievements covering BBS actions and doors, plus
  door-defined achievements contributed by door authors.
- ONE global identity per player, keyed by EMAIL, verified once by an emailed
  code, linked per board by a code the player types into a door on that board.
- Boards report RAW EVENTS. The server owns the rules, evaluates them, and
  answers with the unlocks and the progress. No board evaluates a rule.
- Two scoreboards from the same unlocks: per board and global; all-time and a
  quarterly season.
- A live unlock notice to the caller on the web board; the same unlocks shown
  when the door runs on 68K.
- A `achievement_unlocked` webhook trigger with tier filtering.

It is served by the EXISTING door server (`amiexpress-doorserver`,
`doors.uprough.net`) as a second API surface, with one board key per board.

## Settled decisions

These were settled with the sysop in conversation and are not reopened by any
sub-project. A sub-project that believes one is wrong escalates; it does not
quietly diverge.

| # | Decision |
|---|---|
| 1 | **Identity is email.** A player registers ONCE on the global server and verifies by an emailed code. The global database is the truth about who a player is; a board's local account is not. |
| 2 | **Trust is verified player + per-board link.** A board may report for an email only after that email's player has linked that board, using a code from their global profile typed into the door on that board. An unlinked board reporting gets `403`, and the door explains linking. |
| 3 | **The 68K side is a full client.** Browse, register, verify, link, and sync stat-derived counters (uploads, downloads, messages, calls, minutes) from the drop file / `user.data` when the door runs. Idempotent by ref. Unlocks are shown when the door runs, not live. |
| 4 | **ONE global catalog** shared by all boards, PLUS door-defined achievements declared in a door manifest section, ids namespaced `door.<name>.<slug>`, registered on first report, and an existing id's definition is IMMUTABLE. There are no sysop-only local achievements. |
| 5 | **The global server IS the door server.** A second API surface on `amiexpress-doorserver`; one board key per board. |
| 6 | **Architecture A: rules live on the server.** Boards report raw events; the response carries unlocks and progress. Boards never evaluate rules. |
| 7 | **Rules are DATA** over counter types: `count`, `streak`, `first`, `sum`, `distinct`, `within(window)`, `all(ids)` - each with a tier (bronze/silver/gold/platinum), points, a hidden flag, and a rarity computed from unlock share. |
| 8 | **Wire: HTTP JSON under `/achievements/v1`**, `Authorization: Board <key>`; plain-HTTP port for 68K callers (no TLS on real Amiga hardware), HTTPS for the web BBS; rate limits answered with `429`. |
| 9 | **Web BBS: one reporter service**, a SQLite outbox with retry/backoff, unlocks to the live session or at next login, ONE SDK toast widget for all three screens and inside a blessed door, the new webhook trigger, and a sysop config whose off-switch is stored as the NEGATIVE. |
| 10 | **Doors define achievements** through a manifest section and `ctx.achievement(id, {value?, key?})`, routed through the same reporter. |
| 11 | **Seasons:** all-time plus a quarterly season. A season resets RANKS, never unlocks. A hidden achievement exists for season winners. |
| 12 | **Sequencing:** achievements ship first on the web board (SP1-SP3). The C SDK phases 1-4 then land with the 68K ACHIEVE door as the C SDK plan's PHASE 5 PROOF DOOR, replacing `theme-picker`. |

## Architecture

```
   amiexpress-doorserver (doors.uprough.net) - ONE process, TWO surfaces
   +---------------------------------------------------------------+
   |  /api/door-repo/*        the catalog API (unchanged, existing) |
   |                                                                |
   |  /achievements/v1/*      NEW. Authorization: Board <key>       |
   |    POST /players  /players/verify  /links  /events             |
   |    GET  /catalog  /catalog.txt  /leaderboard  /leaderboard.txt |
   |    GET  /players/<email>       PUT /catalog/doors/<door>       |
   |                                                                |
   |  rule engine (data-driven)   achievements.db                   |
   |    players, boards, links, events, achievements, unlocks,      |
   |    counters, seasons                                           |
   +---------------------------------------------------------------+
        ^  HTTPS                              ^  plain HTTP
        |                                     |
   +----+---------------------+     +---------+----------------------+
   | amiexpress-web           |     | original AmiExpress on 68K     |
   |  achievements.service.ts |     |  ACHIEVE door (C, sdk/c)       |
   |  outbox (sqlite)         |     |   browse / register / verify   |
   |  toast widget (SDK)      |     |   link / stat snapshot sync    |
   |  webhook achievement_*   |     |   unlocks shown when it runs   |
   |  ACHIEVE door (TS)       |     |                                |
   |  ctx.achievement() doors |     | ALSO runs on amiexpress-web    |
   +--------------------------+     +--------------------------------+
```

One rule engine, one catalog, one set of unlocks. The two clients differ only
in transport (TLS or not), in when unlocks are shown (live or on next run), and
in whether events arrive continuously or as a snapshot at door time.

### Component 1: the achievement surface on the door server

- **Runtime.** The existing Express + better-sqlite3 process. Mounted in
  `src/app.ts` as `app.use('/achievements/v1', createAchievementsRouter(cfg))`,
  a sibling of the door-repo routers, before the web UI static mount.
- **Storage.** Its OWN SQLite file, `ACHIEVEMENTS_DB`, on the same volume as
  `doors.db`. Not `doors.db` itself: the catalog database is rebuilt and
  re-indexed by the corpus tooling, and player data must never be inside
  something a re-index may touch. Schema created by a `schema.sql` and evolved
  by the existing forward-only `MIGRATIONS` array in `src/migrations.ts`.
- **Config**, all read through `loadConfig()` and all fail-loud in the style of
  `src/config.ts` (configured, or refuse to start the surface):
  `ACHIEVEMENTS_DB`, `ACHIEVEMENTS_SMTP_URL`, `ACHIEVEMENTS_MAIL_FROM`,
  `ACHIEVEMENTS_PLAIN_PORT`. Board keys live in the database (see below), not
  in an environment variable: they are issued per board and revoked per board.
- **Board keys.** A `boards` row per board: `id`, `name`, `contact`,
  `key_hash` (scrypt, reusing `hashPassword`/`verifyPassword` from
  `src/auth.ts` - not a second KDF), `created_at`, `suspended_at`. Compare in
  constant time. A request whose key matches no board gets `401`; a request
  whose board is suspended gets `403`. Every accepted write logs
  `<board-id> <action> <count>`.
- **Rate limits.** Per board key and per player: `429` with `Retry-After`.
  This is a deliberate exception to the project-wide "no rate limiting" rule,
  and the exception is narrow: it applies ONLY to this multi-board WRITE API,
  which is reachable by any board on the internet holding a key. No BBS
  user-facing path gains a rate limiter.

### Component 2: what amiexpress-web adds

`web/backend/src/services/achievements.service.ts` - ONE reporter, called
beside the existing webhook trigger sites, never inside them:

| Existing trigger site | Event the reporter posts |
|---|---|
| `server/auth-socket-handlers.ts:1014`, `services/login-post.service.ts:477` | `presence.call`, plus a `stat.snapshot` per counter |
| `server/file-socket-handlers.ts:713`, `utils/upload-notify.util.ts:135` | `file.upload` (value = bytes) |
| `server/file-socket-handlers.ts:1189` | `file.download` (value = bytes, key = file age bucket) |
| `handlers/message/message-entry.handler.ts:1056` | `msg.post` (key = conference id) |
| `handlers/message/message-entry.handler.ts:1084` | `msg.comment` |
| `handlers/chat/chat.handler.ts:487` | `social.sysop_paged` |
| `handlers/user/new-user.handler.ts:1451` | `social.greet` (for the greeter, when a greeting follows) |
| `services/bbs-event-emitter.ts:238` (`emitCustomDoorEvent`) | `door.score`, and door-defined ids via `ctx.achievement()` |

Several families have no existing webhook site at all - wall tags, bulletins
read, OLM, votes, node chat, the hour-of-the-clock presence key. For those the
reporter is called at the handler that PERFORMS the action, in the same
one-line, non-throwing shape. SP2 enumerates every such site; the table above is
the subset where a webhook trigger already marks the spot.

Nothing about the existing webhook path changes. The reporter is a second,
independent call at the same site, and a reporter failure can never propagate
into BBS flow: it writes to the outbox and returns.

- **The outbox.** `achievement_outbox` in the BBS database, created from a
  committed `achievements.schema.sql` and applied the way
  `door-installs.schema.sql` already is:

  ```sql
  CREATE TABLE IF NOT EXISTS achievement_outbox (
    ref             TEXT PRIMARY KEY,      -- board-scoped idempotency key
    email           TEXT NOT NULL,
    payload         TEXT NOT NULL,         -- the JSON event
    created_at      INTEGER NOT NULL,
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL,
    last_error      TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_outbox_due ON achievement_outbox(next_attempt_at);
  ```

  A flusher drains it in batches of at most 100 per `POST /events`. Backoff is
  5 s, 15 s, 60 s, 5 min, 30 min, then hourly. A row that is still unsent after
  14 days is deleted and logged - the alternative is a table that grows for
  ever behind a dead server. A `403` (board not linked for that email) deletes
  the row immediately and arms the door's linking explanation instead of
  retrying for ever. A server outage therefore delays unlocks; it never loses
  events.

- **Unlock notices.** The `POST /events` response carries unlocks. If the
  player has a live session, the notice goes to it through the toast widget.
  Otherwise it is stored in `achievement_pending_notices` and shown at the next
  login. Placement is a `WEB_:` divergence with no express.e counterpart: the
  notice is drawn at a command-prompt boundary, after the existing display flow
  (BBSTITLE -> LOGON -> BULL -> NODE_BULL -> confScan -> CONF_BULL -> MENU) has
  completed and before the menu prompt is drawn. It never appears mid-door,
  mid-prompt, or between a prompt and its answer.

- **The toast widget.** ONE widget, `sdk/components/achievement-toast.ts`,
  used by the BBS and by doors. There is no second implementation:
  - Fixed Amiga ANSI 80x25: a three-row box, cursor saved and restored, drawn
    with `+ - |` and the 8 ANSI colours.
  - Responsive ANSI: geometry from `screen.width` through
    `getCompactProfile()` / `calculateDialogWidth()`, never a constant.
  - C64 PETSCII 40x25: at most 40 columns per row, `effectsAllowed(width)`
    false, glyphs restricted to the transducer's table, prose through
    `bbs.write()` so the PETSCII choke sees it.
  - Inside a blessed door: a non-focusable, non-interactive overlay that does
    NOT touch `DoorInputManager` and does not consume a key. It expires on a
    timer, not on input. A door's input handling is unchanged by its presence.

- **The webhook.** `WebhookTrigger.ACHIEVEMENT_UNLOCKED = 'achievement_unlocked'`
  in `services/webhook.service.ts`, plus a `tier_filter` column on `webhooks`,
  shaped exactly like the existing `door_filter`: a JSON array, empty meaning
  every tier, added by the same `PRAGMA table_info` migration pattern
  (`database.ts:1485-1487`). `getWebhooksByTrigger()` gains the tier argument
  next to the door argument. The PII policy applies unchanged - a player's
  handle is not their board username, and the email never enters a payload.

- **Sysop config.** `achievements_server_url` and `achievements_board_key` in
  the system config table, the key encrypted with the same helper that already
  protects `vapid_private_key`. The off switch is stored as the NEGATIVE,
  `ACHIEVEMENTS_DISABLED`: a boolean tooltype or environment flag cannot
  default to true, because every existing board would read an absent flag as
  "off" and the feature would ship dark.

- **Privacy.** A player may mark their global profile private from the ACHIEVE
  door. A private player still appears on the scoreboard of every board they
  are linked to - that board's caller list is the sysop's own data - and is
  omitted from every GLOBAL listing (`scope=global`, and the rarity and season
  rosters). `GET /players/<email>` is gated by the link, not by the privacy
  flag: a board that is not linked to that email gets `403` whether the player
  is private or not.

### Component 3: the ACHIEVE doors

Two doors, one behaviour, two languages:

- `Doors/achieve/` - TypeScript, on the web board (SP3).
- `sdk/c/examples/achieve/` - C89, on 68K and on the web board's 68K path (SP4).

Both offer: browse the catalog by family, see your own unlocks and progress,
see the board and global scoreboards, register, verify, link this board, view
and rotate your link code, and set your profile private. The C door
additionally syncs the stat-derived counters when it runs.

### Component 4: the 68K client

- **HTTP.** `examples/doorrepo-c/http.c` is already a working, tested plain-HTTP
  client written against the 8 KB stack rule (a `static` 32 KB body buffer, no
  `malloc`). It is PROMOTED into `sdk/c/` as its own module, one `.c` per
  module so `vlink` pulls it in only when referenced - the linking rule Phase 0
  of the C SDK plan measured and locked. It is not rewritten and there is no
  second HTTP client.
- **JSON.** The `json_lite` parser the C SDK plan already schedules for phase 4
  parses `POST /events` responses, which are small. It does NOT parse the
  catalog or the leaderboard: those have plain-text variants (below).
- **Stat snapshot.** On each run the door reads uploads, downloads,
  `messagesPosted`, `timesCalled` and `timeTotal` from the drop file /
  `user.data` (the fields at `web/backend/src/services/UserFileManager.ts:29-58`)
  and posts one `stat.snapshot` event per counter with the ABSOLUTE value and
  `ref = <board>:<email>:stat:<name>:<value>`. Re-running the door with an
  unchanged counter is a duplicate and is dropped by the server; a changed
  counter is a new ref. This is what makes a client with no outbox and no
  history safe to run any number of times.
- **Host awareness.** The door reads `AE_HOST` / `AE_CAPS` through
  `sdk/c/include/ae_host.h` (already shipped in C SDK phase 0) and adapts: on
  amiexpress-web it may be shown a wider terminal or a PETSCII caller; on a
  classic host it assumes 80x25 ANSI and nothing else.

## Identity, trust and linking

The flow, once, per player:

1. In the ACHIEVE door on any board: `[R]egister`. The door asks for an email
   and a handle. `POST /players` creates an UNVERIFIED player and the server
   emails a six-character code. The handle is the only identifier any other
   board or any listing ever sees.
2. `[V]erify` with the code. `POST /players/verify` marks the player verified
   and returns their profile, including their current LINK CODE.
3. On each board the player wants to count: `[L]ink`, and type the link code.
   `POST /links` records `(board_id, email)`. A board with no link for an email
   is told `403 not_linked` on every event for it.

Properties:

- The link code is short-lived (15 minutes), single-use, and rotatable from the
  profile. It authorises a board to report for that email; it is not a
  password and grants no read of the account.
- A player unlinks a board by running the ACHIEVE door ON that board and
  choosing unlink, which is what `DELETE /links` does: a board key can only ever
  unlink itself. The profile LISTS the linked boards so a player can see what is
  reporting for them. Unlinking stops future reporting; it does not delete past
  unlocks, which record the board they were earned on.
- The email address is never returned to a board that is not linked to it, and
  never appears in any listing, leaderboard, webhook payload, or toast.
- An email that is already verified and registers again is not re-created: the
  server sends a fresh verification code to the same address and nothing else
  changes. Registration is idempotent by email.

## The rule engine

Rules are DATA, stored in the `achievements` table and evaluated by the server.
A rule has an operator over one or more counters.

| Operator | Shape | Example |
|---|---|---|
| `count` | `{op:"count", type, key?, n}` | 100 messages posted |
| `first` | `{op:"first", type, key?}` | first upload ever |
| `sum` | `{op:"sum", type, field:"value", n}` | 100 MB uploaded |
| `distinct` | `{op:"distinct", type, dim:"key"\|"board", n, group?}` | messages in 10 different conferences (`dim:"key"`); the same achievement on 3 boards (`dim:"board"`, `group:"key"`) |
| `streak` | `{op:"streak", type, unit:"day", n}` | called 7 days running |
| `within` | `{op:"within", type, n, window_s}` | 3 messages within 5 minutes |
| `all` | `{op:"all", ids:[...]}` | every file achievement, for a meta award |

`count` and `first` both take an optional `key`, which is how a threshold the
SERVER cannot compute is expressed (see "Facts only the board knows"). `distinct`
counts distinct values of one dimension - the event `key`, or the board the event
came from - and with `group` set it counts them per group value and unlocks when
ANY group reaches `n`.

The server appends two INTERNAL event types of its own, so that rules about the
system itself need no new operator: `meta.link` when a board links a player
(dimension: board), and `meta.unlock` when an achievement unlocks (`key` = the
achievement id, dimension: board). Boards cannot post either one; a batch
containing a `meta.*` type is rejected `400`.

Two kinds of counter feed them:

- **Incremental counters**, built by appending events: `count`, `sum`,
  `distinct`, `streak` and `within` read these.
- **Snapshot counters**, written with `stat.snapshot` and stored as
  `max(existing, value)`: monotonic, idempotent, and the way a board that has
  years of history before this system existed gets day-one credit. A `count`
  rule over a snapshot-backed type compares against the snapshot value, not
  against the number of events received. Both the web BBS and the 68K door send
  snapshots; the web BBS sends them at login.

Every achievement carries:

| Field | Meaning |
|---|---|
| `id` | stable, immutable, `family.slug` or `door.<name>.<slug>` |
| `name`, `description` | shown to the player |
| `family` | one of the families in the catalog section |
| `tier` | `bronze` \| `silver` \| `gold` \| `platinum` |
| `points` | 5 / 10 / 25 / 50 by tier, overridable per achievement |
| `hidden` | true = not listed until unlocked |
| `rule` | the operator above |

### Facts only the board knows

Some facts are knowable only where they happen: a board has the list of ITS
conferences, ITS bulletins, ITS caller ordinal, and the timestamp of the message
a reply answers. The board computes the FACT and reports it as an event; the
server still owns the rule and still decides what it unlocks. This is not a
board evaluating a rule - the board never learns which achievement, if any, its
event satisfied.

The pattern is always the same: the fact becomes an event type, or a `key` on
one. `wall.everyconf` and `bull.read.all` are event types a board emits when the
caller finishes its own set. A reply the board timed at under 60 seconds is
`msg.reply` with `key = "fast"`. A message the board measured at over 100 lines
is `msg.post` with `key = "lines:100+"` (in addition to its conference key,
which rides on a second event). An upload:download ratio crossing a threshold is
`file.ratio` with `key = "silver"` or `"gold"`. A new caller's ordinal on that
board is `presence.call` with `key = "caller:1000"`.

**Rarity** is computed, never authored: `unlocked_verified_players /
verified_players`, recomputed nightly, exposed on the catalog and the profile as
a percentage plus a bucket (common > 25%, uncommon 10-25%, rare 2-10%, epic
0.5-2%, legendary < 0.5%).

**Time.** The server stamps `received_at` itself. A board-supplied `at` more
than 15 minutes in the future, or more than 30 days in the past, is CLAMPED to
`received_at` and the clamp is recorded on the event row. Streaks and windows
are computed from the clamped timestamp in UTC calendar days. Boards do not
agree about the time and never will; the server's clock is the only one in the
system that is single-valued.

## The wire contract

Base: `https://doors.uprough.net/achievements/v1` and, for 68K callers with no
TLS, the same paths on the plain-HTTP port. `Authorization: Board <key>` on
every request. JSON in, JSON out, `Content-Type: application/json; charset=utf-8`.
`X-Achievements-Contract` carries the contract version on every response, in the
same spirit as `X-Door-Repo-Revision`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/players` | register `{email, handle}`; emails a code; `202` |
| POST | `/players/verify` | `{email, code}` -> verified profile + link code |
| POST | `/links` | `{email, code}` -> links THIS board (the key's board) |
| DELETE | `/links` | `{email}` -> unlinks THIS board (the key's board), at the player's request |
| POST | `/events` | batch of at most 100, idempotent by `ref` |
| GET | `/catalog?since=<revision>` | full or incremental catalog |
| GET | `/catalog.txt?since=` | the same, as CRLF / Latin-1 text for 68K |
| PUT | `/catalog/doors/<door>` | register a door's achievement definitions |
| GET | `/leaderboard?scope=global\|board:<id>&period=all\|season` | ranks |
| GET | `/leaderboard.txt?...` | the same, as text |
| GET | `/players/<email>` | one player's profile, unlocks and progress; the email is URL-encoded and matched case-insensitively; the calling board MUST be linked to it, or `403` |

`POST /events` request:

```json
{ "events": [
  { "ref": "uprough:01J8Z...", "email": "a@b.c", "type": "msg.post",
    "at": "2026-09-03T21:14:02Z", "value": 1, "key": "conf:2",
    "door": null, "client": "amiga" }
] }
```

An event carries AT MOST ONE `key`. A fact with two dimensions is two events
with two refs - a login is reported as `presence.call` keyed by the hour of the
clock, and again as `presence.call` keyed by the caller ordinal when the board
has one to report. That keeps `distinct` unambiguous about which dimension it is
counting, and keeps idempotency per dimension rather than per fact.

`ref` is opaque to the server and unique per board: `<board-id>:<ulid>` for a
one-off event, `<board-id>:<email>:stat:<name>:<value>` for a snapshot. `email`
identifies the player; the board is identified by the key, never by a field in
the body.

`POST /events` response:

```json
{ "accepted": 1, "duplicates": 0,
  "unlocks": [ { "id": "msg.post.100", "name": "Century", "tier": "silver",
                 "points": 10, "hidden": false, "rarity": 0.081,
                 "at": "2026-09-03T21:14:02Z" } ],
  "progress": [ { "id": "msg.post.1000", "have": 100, "need": 1000 } ] }
```

Status codes:

| Code | When |
|---|---|
| `200` | events accepted (including all-duplicates) |
| `202` | registration accepted, verification mailed |
| `400` | malformed batch, unknown event type, batch over 100 |
| `401` | unknown or missing board key |
| `403` | `not_linked` (this board may not report for this email), or board suspended |
| `409` | a door achievement id exists with a different definition |
| `429` | rate limited; `Retry-After` in seconds |

The text variants (`/catalog.txt`, `/leaderboard.txt`) follow the house format
the door repo already established: a `ACHIEVE|1|<revision>` header line, CRLF
line endings, ISO-8859-1 bytes, `|`-separated fields, append-only field
evolution, and a conforming parser MUST ignore trailing fields it does not know.
They exist because a 68K door cannot hold a full JSON catalog in a static
buffer, and they carry the same stability promise as `list.txt`.

**Contract mirror.** The wire types live in
`amiexpress-doorserver/contract/achievement-types.ts` next to the existing
`manifest-types.ts`, carry their own `CONTRACT_VERSION`, and amiexpress-web
vendors a generated mirror with a staleness test - the arrangement
`contract-mirror.test.ts` and `repo-types-generated-staleness.test.ts` already
enforce for the manifest. Freezing this contract file is what unblocks SP1 and
SP2 to run in parallel.

## The catalog

One global catalog, seeded by SP1 and extended over time. Ids are stable and
immutable once published; the counts below are the shipped seed, not a ceiling.
Every family also has meta achievements (`all(ids)`) at gold or platinum.

**Messages** (`msg.*`)

| id | Unlock |
|---|---|
| `msg.post.1` / `.10` / `.100` / `.1000` | messages posted (bronze/bronze/silver/gold) |
| `msg.reply.50` | 50 replies to other people's messages |
| `msg.thread.10` | 10 threads that drew a reply |
| `msg.private.25` | 25 private mails sent |
| `msg.conf.distinct.10` | posted in 10 different conferences (`distinct`) |
| `msg.long.1` | a single message over 100 lines (board-computed key) |
| `msg.fastreply` | a reply within 60 seconds of the message it answers (board-computed key) |
| `msg.burst.3` | three messages inside five minutes (`within`) |
| `msg.comment.10` | 10 comments left for the sysop |

**Files** (`file.*`)

| id | Unlock |
|---|---|
| `file.up.1` / `.10` / `.100` | uploads (snapshot-backed) |
| `file.dl.1` / `.100` / `.1000` | downloads (snapshot-backed) |
| `file.up.bytes.100mb` / `.1gb` | bytes uploaded (`sum`) |
| `file.desc.1` | wrote a real description for an upload |
| `file.ratio.silver` / `.gold` | upload:download ratio milestones |
| `file.old.1` | downloaded a file older than 25 years |

**Walls and bulletins** (`wall.*`, `bull.*`)

| id | Unlock |
|---|---|
| `wall.tag.1` / `.10` / `.100` | wall tags left |
| `wall.everyconf` | tagged the wall in every conference on a board (`distinct`) |
| `bull.read.all` | read every bulletin on a board |

**Presence** (`presence.*`)

| id | Unlock |
|---|---|
| `presence.call.1` / `.10` / `.100` / `.1000` | calls (snapshot-backed threshold) |
| `presence.streak.7` / `.30` | called on 7 / 30 consecutive days (`streak`) |
| `presence.minutes.600` / `.6000` | minutes online (snapshot-backed threshold) |
| `presence.everyhour` | logged in during all 24 hours of the clock (`distinct`, `dim:"key"`, the hour) |
| `presence.return30` | called again after 30 days away |

**Social** (`social.*`)

| id | Unlock |
|---|---|
| `social.chat.1` | first chat |
| `social.nodechat.1` | first node-to-node chat |
| `social.sysop_paged.1` | paged the sysop |
| `social.olm.10` | 10 online messages sent |
| `social.vote.1` | voted in a poll |
| `social.greet.1` | greeted a new user on their first call |

**Doors** (`doors.*` for the cross-door ones, `door.<name>.*` for per-door)

| id | Unlock |
|---|---|
| `doors.distinct.5` / `.10` / `.25` | played 5 / 10 / 25 different doors |
| `doors.minutes.600` | 600 minutes inside doors |
| `door.<name>.<slug>` | whatever the door author defined (see below) |

**Boards** (`boards.*`)

| id | Unlock |
|---|---|
| `boards.linked.2` / `.5` / `.10` | linked 2 / 5 / 10 boards (`distinct` over `meta.link`, `dim:"board"`) |
| `boards.same.3` | earned the SAME achievement on 3 different boards (`distinct` over `meta.unlock`, `dim:"board"`, `group:"key"`) |

**Rare and hidden** (`rare.*`, all `hidden: true` unless noted)

| id | Unlock |
|---|---|
| `rare.caller.1000` | were a board's 1000th caller account (the board reports its own caller ordinal on that caller's first call) |
| `rare.midnight` | posted a message between 00:00 and 00:05 |
| `rare.realc64` | called from a real C64 (the transport knows: PETSCII autodetect / dedicated port) |
| `rare.realamiga` | called from a real Amiga (`AE_CLIENT` / `AE_CONNECTION`) |
| `rare.petscii` | completed a session in PETSCII mode |
| `rare.newboard.first` | the first unlock ever recorded on a board |
| `rare.season.winner` | won a season (granted by the server at season roll) |

The "real hardware" achievements are honest because the BOARD reports what the
transport told it, not what the user claimed: the PETSCII session flag and the
host variables (`AE_CLIENT`, `AE_CONNECTION`) are set by the connection path,
and the reporter attaches them to presence events as `client`.

### Door-defined achievements

A door declares its achievements in the manifest section it already has - the
`amiexpress` key of the door's `package.json`, which
`web/backend/src/doors/door-manifest-path.ts` already resolves for every door:

```json
{
  "amiexpress": {
    "doorName": "Grandmaster Chess",
    "command": "grandmaster",
    "achievements": [
      { "id": "door.grandmaster.first_win", "name": "First Blood",
        "description": "Win a game of chess", "tier": "bronze",
        "rule": { "op": "count", "type": "door.grandmaster.win", "n": 1 } },
      { "id": "door.grandmaster.checkmate_under_20", "name": "Short Game",
        "description": "Checkmate in under 20 moves", "tier": "gold",
        "hidden": true,
        "rule": { "op": "count", "type": "door.grandmaster.fast_mate", "n": 1 } }
    ]
  }
}
```

Rules:

- Ids MUST be `door.<command>.<slug>`; anything else is rejected `400`.
- Definitions are pushed with `PUT /catalog/doors/<door>` the first time the
  door reports, and thereafter whenever the manifest's digest changes.
- An id that already exists with a DIFFERENT definition is rejected `409` and
  the original stands. A door author who wants different behaviour publishes a
  new id. This is the same immutability the door repo gives archive names, and
  for the same reason: someone has already unlocked it.
- A door emits `ctx.achievement(id, {value?, key?})`, which routes through the
  SAME reporter and the SAME outbox as every BBS event. There is no direct HTTP
  call from a door.
- First door definitions ship in SP3: `grandmaster`, `phreakwars`,
  `card-lobby`, and the arcade doors.

The existing per-lobby achievement calls in
`sdk/engines/network/modules/leaderboard.ts` (`achievements:get`,
`achievements:unlock`, `achievements:progress`) are NOT this system: they are
in-lobby game state over socket.io, scoped to a match. They stay exactly as they
are. A door that wants a lobby award to also count globally calls
`ctx.achievement()` in addition; nothing is rewired underneath it.

## Scoreboards and seasons

- `GET /leaderboard?scope=global` ranks verified, non-private players by points.
- `GET /leaderboard?scope=board:<id>` ranks the players linked to that board,
  by points earned ON that board - unlocks carry the board they happened on, so
  both boards are computed from the same rows.
- `period=all` is every unlock. `period=season` counts only unlocks whose
  season matches the current one.
- A season is a UTC calendar quarter, id `YYYYQn`. At the roll, ranks reset -
  unlocks never do. Nothing is deleted, recomputed or downgraded.
- At each roll the server grants the hidden `rare.season.winner` to the top
  global player, and to the top player of each board that has at least five
  verified linked players. The floor exists so a one-caller board cannot mint a
  legendary achievement every quarter.

## Decomposition

Four sub-projects. Each gets its own spec and plan, in this order.

**SP1 - the door server: API, rule engine, storage.** `achievements.db`, the
schema and migrations, board keys, registration and verification (including
mail), linking, `POST /events` with idempotency, the rule engine and its seven
operators, the seed catalog, door catalog registration, the two leaderboards,
seasons, rarity, rate limiting, the text variants, and the contract module.

**SP2 - the web BBS: reporter, outbox, toast, webhook, config.** The reporter
service and its call sites, the outbox and flusher, live and next-login unlock
notices, the SDK toast widget on all three screens and inside a blessed door,
the `achievement_unlocked` trigger with `tier_filter`, and the sysop config with
its negative off-switch.

**SP3 - the TypeScript ACHIEVE door and door-defined achievements.**
`Doors/achieve/`, `ctx.achievement()` on the door API, manifest parsing and
registration, and the first door definitions (grandmaster, phreakwars,
card-lobby, arcade).

**SP4 - the 68K side.** The C HTTP client promoted into `sdk/c/`, C SDK phases
1-5 from `thoughts/shared/plans/2026-09-02-amiga-c-door-sdk.md`, and the 68K
ACHIEVE door.

**Sequencing.** SP1 and SP2 may run in PARALLEL once the contract section of
this spec is frozen as `contract/achievement-types.ts` - which is the first
task of SP1 and the only thing SP2 blocks on. SP3 follows SP1. SP4 is last.

**SP4 and the C SDK plan.** The 68K ACHIEVE door IS the C SDK plan's PHASE 5
PROOF DOOR. It replaces `Doors/theme-picker` in that role. `theme-picker` was
chosen when the plan needed any small door to port; ACHIEVE is a better proof
because it exercises the whole stack the plan is trying to justify - list
widget, input, dialogs, settings, theme, host detection AND the HTTP client -
and because it is a door somebody actually wants on a real Amiga. Phase 5's
scope is unchanged otherwise: one real door ported end to end and registered,
plus a second at `doors-menu` scale, with binary size and repaint latency
measured and written down. The C SDK plan's phase table is updated to name
ACHIEVE, and phase 5's proof gains one requirement:

> A BYTE-PARITY TEST between the C ACHIEVE door and its TypeScript twin at 80
> columns. Both doors are driven through the same scripted input against the
> same stubbed server, and their emitted bytes must match. This is the test
> that makes "a caller sees one board" (the parity decision of 2026-09-02) a
> fact rather than an intention, and it is the reason the theme and layout
> tables are GENERATED from `sdk/engines/ui/theme/tokens.ts` and
> `responsive-constants.ts` rather than hand-written in C.

Everything the C SDK plan already settled stands: phase 0 is committed as
`sdk/c/` (host detection both sides, the measured 5 KB small-door cost, the
one-module-per-file linking rule), the transport is the raw `AEDoorPort`
message protocol and not the AEDoor.library LVOs, and theme parity is paid
through generated tables.

## Testing

Every sub-project's tests drive the product's real entry point. A passing unit
test on a rule struct proves nothing about whether an unlock reached a caller.

**SP1 - the door server.**

- A CONTRACT TEST PER ENDPOINT: success shape, every status code in the table
  above (`401` unknown key, `403` not linked, `403` suspended board, `400`
  batch of 101, `409` changed door definition, `429` with `Retry-After`), and
  the text variants byte-for-byte including the CRLF and the header line.
- A RULE-ENGINE FIXTURE PER RULE TYPE: seven fixtures, one for each of `count`,
  `first`, `sum`, `distinct`, `streak`, `within`, `all` - each with events that
  do unlock, events that nearly do, and a duplicate `ref` that must not.
  Snapshot counters get their own: a lower snapshot after a higher one must not
  reduce anything.
- A RECORDED-WEEK REPLAY: one week of a real board's event stream, committed as
  a fixture, replayed against a fresh database, asserting the EXACT set of
  unlock ids and their order. This is the regression that catches a rule-engine
  change nobody meant to make. Clock-skew handling is pinned inside it: a
  future-stamped event and a month-old event are both in the recording.
- Registration and linking: a second registration of a verified email does not
  create a second player; an expired code fails; a used link code fails twice.

**SP2 - the web BBS.**

- Tests drive the REAL entry points - the login handler, the upload handler,
  the message-entry handler - and assert an outbox row with the right type,
  ref and payload. Not the reporter in isolation.
- Flusher behaviour against a stubbed server: success clears rows; `500`
  retries with backoff; `403` deletes the row and arms the linking notice; a
  duplicate `ref` is accepted quietly.
- The BBS never breaks when the server is down: with the stub refusing every
  connection, a full login / upload / post walk completes unchanged.
- The toast's THREE-SCREEN PROOF exactly as
  `.claude/skills/door-three-screens/SKILL.md` requires: 80x25 byte-identical
  fixed ANSI, a responsive width driven from `screen.width`, and 40x25 PETSCII
  with every row at most 40 columns and effects off.
- Webhook: `achievement_unlocked` fires; an empty `tier_filter` receives every
  tier; a `["platinum"]` filter receives only platinum; the PII policy leaves
  no email in the payload.

**SP3 - doors.** The door's real screens under the three-screen proof; manifest
parsing rejects a wrongly namespaced id; a changed definition for a published
id surfaces the `409` to the door author rather than silently doing nothing.

**SP4 - 68K.** A NEW CI job builds `sdk/c/` and the ACHIEVE door with vbcc
(there is no vbcc in CI today - `backend-tests.yml` and the disabled
`door-ci.yml.disabled` are all that exist) and fails on any size regression
past `make measure`'s thresholds. The door is then driven through the existing
68K harness (`web/backend/src/scripts/run-amiga-door.ts`, run from
`web/backend` with scripted stdin and stdout captured to a file - never through
a pipe, which fakes a clean exit) against a STUB achievement server, proving
register / verify / link / snapshot / browse end to end. Plus the byte-parity
test against the TypeScript twin described above.

## Deployment

- No new container. The achievements surface is mounted in the existing door
  server process, and `achievements.db` sits on the existing `doorserver-data`
  volume next to `doors.db`.
- **Caddy needs a second exemption.** The live Caddyfile is host-only and not
  in version control. Today it exempts `/api/door-repo/*` from the site-wide
  HTTPS redirect so AmigaDOS TCP/IP stacks can reach it; `/achievements/v1/*`
  needs the same exemption, or every 68K client gets a `301` it cannot follow.
  This is a manual host step in SP1's deployment checklist and it is verified by
  measurement (`curl -s -o /dev/null -w '%{http_code}' http://.../achievements/v1/catalog.txt`
  returning `200`, not `301`), not by assumption.
- Mail: the server needs working SMTP. Without `ACHIEVEMENTS_SMTP_URL` the
  achievements router refuses to mount, in the same fail-loud style as the rest
  of `config.ts` - a registration endpoint that cannot send a code is worse
  than one that is absent, because the player has already given their address.
- Health: the existing `/health` gains an `achievements` object (contract
  version, player count, pending-mail count). The deploy verification rule
  stands - a green workflow lies; check the container's image age and the
  reported contract version.

## Risks

1. **Server outage.** The web board is covered by the outbox: events queue and
   drain, and unlocks arrive late rather than never. The 68K door has no
   outbox - it reports live, and on failure it says so and tries again next
   run. The snapshot design is what makes that safe; the incremental door
   events a 68K door might emit are the part that can genuinely be lost, which
   is why the 68K door's own contribution is snapshot-shaped.
2. **Clock skew between boards.** Boards disagree about the time, and streaks
   and windows are time-sensitive. Mitigated by server-side `received_at`,
   clamping, and UTC calendar days - and pinned by the recorded-week replay,
   which contains a future-stamped event. Residual risk: a board whose clock is
   wrong by hours still reports honestly-timed events that clamp, and a caller
   may see a streak break they did not deserve.
3. **Cheating from a linked board.** A sysop holding a board key can report
   arbitrary events for any email linked to their board. This is not solvable
   cryptographically - the board is the only witness to what happened on it.
   Mitigations: the link is player-initiated and revocable; per-board and
   per-player rate caps; every unlock records the board it happened on, so a
   board can be SUSPENDED and its unlocks recomputed out of the global
   leaderboard without touching anyone's local scoreboard; and a rarity
   anomaly report shows a board minting legendary achievements at an impossible
   rate. Accepted residual risk: a determined sysop can inflate their own
   board's scoreboard until someone notices.
4. **Catalog drift.** Two boards evaluating different catalogs would be two
   different games. Prevented by construction: the catalog is server-owned,
   boards never evaluate rules, ids are immutable, and `?since=` gives
   incremental reads. The contract module plus its vendored mirror and staleness
   test is what stops a client compiling against a shape the server no longer
   sends.
5. **68K HTTP with no TLS.** The board key travels in clear on the plain-HTTP
   port, and so does the link code. Mitigations: a board key can only report
   for emails linked to THAT board and can be revoked in one row; link codes
   are single-use and expire in 15 minutes; the web BBS uses HTTPS always and
   plain HTTP is only for hosts that cannot do TLS. Accepted residual risk: a
   passive observer on a 68K board's network can capture that board's key and
   report as it until it is rotated. Email addresses also cross that link in
   clear during registration, and the door says so before asking.
6. **Repaint cost on real hardware** - risk 1 of the C SDK plan, inherited
   whole. At ~45 ms per 198-byte XIM message, a full 80x24 coloured frame is
   0.9-1.4 s. The ACHIEVE door's list and toast MUST be differential-redraw from
   the first line of C, not gain it later. The measurement the C SDK plan
   schedules (a probe door painting a full frame in a loop) happens before SP4's
   widget work, not after.
7. **Mail deliverability.** Verification codes going to spam is a silent
   registration failure. Mitigated by a resend action in the door, a visible
   pending-mail count on `/health`, and by keeping the code short and
   typeable on an Amiga keyboard.

## Explicitly out of scope

- **Sysop-only local achievements.** Rejected: an achievement that exists on
  one board is not an achievement, and a per-board catalog is the fastest way
  to catalog drift.
- **Turning points into board currency** - credits, time, file ratios, access
  levels. Achievements are recognition; wiring them to economy is a separate
  decision with different consequences.
- **Historical backfill from board databases.** Nothing walks a board's message
  base or file base to reconstruct the past. The `stat.snapshot` counters are
  the whole of the credit given for pre-existing history, deliberately: they
  are the five numbers `user.data` already holds and can be trusted.
- **Account merging.** Two emails belonging to the same human stay two players.
- **Migrating the lobby achievements** in `sdk/engines/network/modules/leaderboard.ts`
  into this system. They stay per-match and per-lobby.
- **Anti-cheat beyond board suspension.** No statistical scoring of players, no
  automated bans, no proof-of-work.
- **Social features** - friends, following, direct comparison, challenges.
  Two scoreboards is the whole social surface.
- **A second container, a second database service, or Postgres.** SQLite in the
  existing process, on the existing volume.
- **Localisation.** Achievement names and descriptions are English, one string
  each.
