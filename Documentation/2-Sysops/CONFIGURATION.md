# System Configuration Guide (Summary)
**Legacy docs containing deep dives now live in `archive/CONFIG_APP_PLAN.md`, `archive/CONFIG_APP_ANALYSIS.md`, and `archive/PRODUCTION_READINESS.md`.**

## 1. Core Configuration Files
- **`.env`**: Set `PORT`, `SOCKET_PORT`, `DATABASE_URL`, `SESSION_SECRET`, `API_KEY`, and door-specific toggles (e.g., `AQUASCAN_CONF`).
- **`storage/conf/` and `Doors/`**: Mirror the Amiga directory layout (Conf1..ConfN, Dir1..DirN) to keep ECS (external command sequences) data consistent with express.e.
- **Command definitions** now live in `web/backend/src/bbs-data/commands`; customizations reflect `Commands/` screens using the original 1:1 format remembered in `archive/COMMAND_HANDLER_MODULARIZATION.md`.

## 2. Access Levels & Security
- Security levels (0–255) match express.e semantics. Adjust them through the UI or by editing the `securityLevels` table in the database.
- Command and door access checks use the original ACS bits; review `archive/SECURITY_FIXES.md` for how we preserved `PRV_COMMAND`, `PRV_GROUP`, and flag queries.
- `AO_FLAGS`, `ACS` files, and ACS bits are automatically generated from `Commands`/`Access` definitions when the importer runs.

## 3. Runtime Settings
- Terminal size and pause behavior are read from each user’s profile (height/width) to pause FR/FS exactly where express.e would.
- Logging level (`LOG_LEVEL`) and door debugging toggles (e.g., `DEBUG_XIM_OUTPUT`) are toggled via `.env`.
- `AUTO_RESTART` watchers restarts the backend using `dev/scripts/start-servers.sh` when a crash is detected (see `archive/DEPLOYMENT_SCRIPTS.md`).

## 4. File and Door Data
- Ensure `Screens` files (ANSI/petscii) and door configs match express.e names and folder structure; corrupted or misaligned ASCII art gets split into continuation blocks within FR parsing.
- `Dir1`/`DirX` files are auto-created if missing during uploads to keep door file lookups valid (AmiExpress always expects file area definitions).
- Use `archive/CONFIG_APP_PLAN.md` for multi-stage deployment config layering, and `archive/CONFIG_APP_ANALYSIS.md` for field mappings between express.e screens and modern React components.

## 5. PETSCII (Commodore 64 callers)

**Detecting a real C64.** A genuine C64 dialing in over a WiFi modem (WiModem232,
1541 Ultimate, etc.) typically negotiates no telnet options at all, so the usual
TTYPE handshake never fires. The BBS uses a ladder of signals, strongest first:

1. **Dedicated PETSCII port** — set `TELNET_PETSCII_PORT` (suggested value: 6464,
   the Synchronet convention) and every connection accepted on that port is
   treated as C64/PETSCII from the first byte. This is the only signal that
   cannot be wrong: a real C64 negotiating nothing still gets the right mode.
   A later TTYPE reply on that port cannot downgrade the session back to ANSI.
2. **TTYPE** — if the client reports a terminal type containing `C64`,
   `COMMODORE`, or `PETSCII`, the session is set to 40x25 PETSCII.
3. **DEL-probe** — the first keypress a connection sends, both at initial
   connect and again at the graphics prompt, is classified before it is
   treated as a menu answer: PETSCII DEL is byte `$14` and shifted C64 letters
   arrive as `$C1`-`$DA`; ASCII terminals send backspace `$08`, DEL `$7F`, or
   lowercase `$61`-`$7A` for the same keys. A `$14` or `$C1`-`$DA` byte commits
   the session to PETSCII and skips the graphics prompt entirely — this is
   what lets a real C64 auto-detect even though it negotiated nothing.
4. **NAWS 40x25** — a window-size hint only, not proof of a C64 (any modern
   terminal resized to 40 columns would match); demoted below TTYPE and the
   DEL-probe.

**The graphics prompt.** Modern/undetected callers see three lines, each 40
columns or fewer and in uppercase (so it stays readable on a power-on C64,
which boots into the uppercase/graphics charset):

```
COMMODORE 64: PRESS <DEL>
ANSI, RIP, PETSCII OR NO GRAPHICS
(A/R/P/N) [Q=SKIP BULLETINS]?
```

Pressing `P` on a modern terminal prints `PETSCII: SIMULATING C64 DISPLAY
(40X25)` and switches the browser terminal to the PetsciiCanvas renderer;
pressing DEL (or any byte the DEL-probe recognizes) on a real C64 skips this
prompt and the BBS goes straight to PETSCII mode.

**`.seq` screen variants.** Screen files ending in `.seq` are treated as raw
PETSCII byte content (not text) and are preferred over `.TXT`/ANSI variants
once a session is in PETSCII mode. A `_C64.seq` variant, when present, is
preferred over a plain `.seq` for callers whose `terminalType` is exactly
`c64` (i.e. real hardware, not the browser's simulated PETSCII mode). `.seq`
detection is by file extension only — any file uploaded to a file area named
`*.seq` will be read as PETSCII content by this same check if a screen path
ever loads it.

**MCI codes inside a `.seq` — the first byte opts the file in.** A `.seq` is
normally raw PETSCII art and is sent to the caller byte for byte. If its
**first byte is `~`** (`0x7E`), the BBS treats the whole file as an MCI screen
instead and substitutes codes exactly as it does in a `.TXT` — this is
express.e's own gate (`express.e:6800-6806`), evaluated ONCE, on byte 0, per
FILE. Nothing else opts a file in: a `~` on line 3 of an art file changes
nothing, and no shipped art file is affected (every `BBSTITLE.SEQ` on this
board starts `0x20` or `0x1F`). The gated files shipped are the twelve
`Conf*/Screens/Logoff.seq` and the three `Screens/logoff/00N.logoff.seq`.

**Authoring rule.** Once a `.seq` opens with `~`, EVERY `0x7E` in that file is
a token candidate — including ones you meant as art. Write `~~` for a literal
`~`. If your screen needs `~` as a graphic character, do not gate the file.

**Which codes work.** All of them. There is no reduced set for PETSCII: the
same dispatch table and the same pre-pass stages serve `.TXT` and `.seq`, and
a parity test fails the build if a code is ever added to one and not the other.
That includes the structural ones — `~SS_`, `~SR_`, `~CC_`, `~f` and `~SP` run
in document order, so art before an include is painted before it and art after
it is painted after, in the charset bank and cursor position the include left
behind.

**What the codes do on a C64.** A C64 is not an ANSI terminal, and several
codes mean something narrower there:

| Code | On a C64 |
|---|---|
| `~WX` (wipes) | Never animates — screen effects are off for a PETSCII session. The directive is stripped and never printed. |
| `~c0`..`~c7` | One VIC pen byte. Holds until art or another code changes it. |
| `~b0`..`~b7`, `~z0`..`~z7` | CCGMS `$02 <colour>`: sets background **and border** together. They cannot be set independently on a C64. Inert on SyncTERM's C64 mode. |
| `~f` | `$93` CLR — clears, homes the cursor, and repaints in the current pen. |
| `~q` | Reverse off plus the default pen. There is no all-attributes reset on a C64. |
| `~CR`, `~n*` | `$0D`, which on a C64 also cancels reverse. Real KERNAL behaviour. |
| `~x`, `~y` | A relative cursor walk (`$11`/`$1D`) from wherever the cursor is; the C64 has no absolute cursor address. Clamped to 40x25. |
| `~AK` | Thirteen plain rows, no colour — the ANSI frame has no C64 equivalent worth faking. |
| `~SP` | Pauses and resumes on the same screen: bank, cursor, pen and reverse continue across the pause. |

Substituted values inherit the pen and reverse state your art left set — they
never emit a colour byte or a bank switch of their own — they fold to uppercase
in the upper-case/graphics bank rather than flipping the bank, and they **clip
at the end of their row**: a long value stops at the right edge instead of
wrapping onto your next line or scrolling the screen.

**Include lookup prefers `.seq`.** `~SS_NAME` and `~SR_NAME` resolve `.seq`
before `.TXT` for a caller in PETSCII mode (an ANSI caller's order is
unchanged). A name that already carries a known extension has it **swapped**,
not appended: `~SR_.../logoff/logoff.seq` looks for `001.logoff.seq` and then
`001.logoff.txt`, rather than for `001.logoff.seq.seq`. Includes nest at most
eight deep; a screen that includes itself stops there instead of taking the
session down.

**Author 40-column art for PETSCII callers.** An include that resolves to
80-column ANSI is not reflowed — the caller is shown
`[80-COLUMN ANSI SCREEN - SKIPPED]`. If a screen matters on a C64, ship a
40-column `.seq` beside the `.TXT`.

Logoff is the worked example. `Node<N>/Logoff.txt` — LOGOFF is a NODE screen,
so that is the file the board reads, never a conference copy — says
`~3SR_WORK:bbs/Screens/logoff/logoff`. The target is deliberately
**extensionless**, so the SESSION picks the extension: `Screens/logoff/` now
ships `001..003.logoff.seq` (40 columns, PETSCII) beside
`001..003.logoff.txt` (80 columns, ANSI), a PETSCII caller resolves the
`.seq` first and an ANSI caller the `.txt` first, and neither is shown the
other's art. Writing `.../logoff/logoff.seq` in the include would take that
decision away and hand an ANSI caller raw PETSCII bytes.


**Which doors a C64 may enter — `MIN_COLUMNS` and `C64_ADAPT`.** Both are
tooltypes in the door's `Commands/BBSCmd/<CMD>.info` (or its installed 68K
record), and both are **default-closed**: a door that declares neither is
refused to a 40-column caller with `THIS DOOR NEEDS AN 80 COLUMN SCREEN` and
the caller lands back on the menu. Nothing else on the board changes — an
ANSI caller is never affected by either tooltype.

| Tooltype | Claim | Marker in the DOORS list |
|---|---|---|
| `MIN_COLUMNS=40` | "this door already fits 40 columns" — its own layout is width-driven | `[40]` |
| `C64_ADAPT=40` | "this 68K door reaches 40 columns through the adapter" | `[C64]` |

They are deliberately separate. `MIN_COLUMNS` is a statement about the door's
own output and is the right mark for a TypeScript door that lays itself out
from the terminal width. `C64_ADAPT` is a statement about an unmodified
80-column Amiga binary: the BBS replays the door's ANSI onto a virtual 80x25
grid and reduces each finished frame to 40 columns, keeping table columns side
by side and ending any column that lost characters with `>`. A door is never
shown both markers - `[40]` wins when both tooltypes are present.

**`MIN_COLUMNS` is a claim the BBS cannot check.** The gate reads a number, not
a door type. Putting `MIN_COLUMNS=40` on a 68K door (`XIM`, `DD`, `AMI`, `SIM`,
`FIM`) therefore DOES open it to a 40-column caller - and that caller then gets
the door's raw 80-column bytes, unadapted, because nothing in an unmodified
Amiga binary narrows its own output. It is a false claim in the registry, not a
rejected one. The board says so at registration:

```
[initializeDoors] WARN: door WHO is TYPE=XIM and declares MIN_COLUMNS=40 - a
68K door cannot narrow its own output, so it will serve raw 80-column bytes to
a 40-column caller. Use C64_ADAPT=40 instead.
```

Use `C64_ADAPT` for those doors. `MIN_COLUMNS=40` belongs on a door whose own
layout is width-driven.

`C64_ADAPT` only has an effect on the 68K door types whose output crosses the
adapter's seam — `XIM`, `DD`, `AMI`, `SIM`, `FIM`. Setting it on a TypeScript,
AREXX, MCI or WEB door does nothing: those doors paint their own screen and
the adapter never sees it. The value is a column count, read strictly (only
digits), and the caller must have at least that many columns.

Marked today, after the Phase 3 adaptation work:

- `C64_ADAPT=40` — `WHO` (RTW), `S` (ustats), `WHAT`. Note that `RTW` is a
  second command pointing at the same binary as `WHO` and is deliberately NOT
  marked: the claim is per registration, not per executable.
- `MIN_COLUMNS=40` — `THEME`, `DOORS`, `BUGS`, `DOORMAN`, `STRIP`,
  `PHREAKWARS`.

To mark a door, edit its tooltypes with the `info-editor` CLI
(`Documentation/2-Sysops/INFO_EDITOR.md`) rather than a text editor — an
`.info` file is an Amiga icon binary and a text editor destroys it:

```bash
npx tsx web/backend/src/scripts/info-editor.ts Commands/BBSCmd/WHO.info set C64_ADAPT 40
```

The BBS re-reads `Commands/BBSCmd` whenever its mtime moves, so the new
tooltype takes effect on the next command without a restart.

**A conference's `MENU_PROMPT` tooltype is yours to size.** The board's own
command prompt has a 40-column form (no board name, no the word "Menu",
`mins` for `mins. left`, the conference name clamped to the room left). A
`MENU_PROMPT` you write in a conference's `.info` replaces that prompt whole,
and the BBS does not rebuild it: only you know which of your words may be
dropped. It is not left to run off the edge, though — a sysop prompt crosses
the same width choke as every other piece of prose the board sends, so a
40-column caller gets it word-wrapped at forty rather than smeared. If you want
a C64 caller to see a short prompt, write a short one.

**Deployment follow-up — port not yet exposed.** `TELNET_PETSCII_PORT` is
wired on the backend only. Nothing outside the container can reach it yet:
`docker-compose.yml` does not publish a `6464:6464`-style port mapping (see
the `TELNET_PORT`/`SSH_PORT` pattern already there), and
`deploy/hetzner-setup.sh` does not open it in `ufw`. Exposing real C64 access
requires both changes plus a stack restart; until then the dedicated-port
detection path can only be exercised on `localhost`. This is a known sysop
follow-up, not yet done.

## 6. Pooled Object Storage (S3-compatible drives)

A file area normally lives on local disk, the way express.e always kept it.
This board can instead put a file area's files on an S3-compatible bucket -
Oracle Object Storage, Backblaze B2, AWS S3, Cloudflare R2, MinIO, anything
that speaks the S3 API - and serve them through a local cache, so the
board's own disk stops being the ceiling on how many files you keep online.

**This is entirely opt-in.** A board with no `DRIVE.n=s3://...` line in
`Drives.info` builds no S3 client, opens no cache directory, and behaves
exactly as it always has. Nothing below matters until you add one.

### `Drives.info` — the `DRIVE.n` sub-keys

`DRIVE.n` keeps its express.e meaning (`express.e:17400-17424`): drive `n`,
its path. The sub-keys are additive, so a real Amiga binary reading the same
file still works — it simply doesn't understand the new keys and ignores
them, the same way it ignores any tooltype it doesn't know.

| Key | Meaning |
|---|---|
| `DRIVE.n` | `s3://bucket-name` for a pooled volume, or a plain Amiga path (`DH1:Files`) for local disk. |
| `DRIVE.n.ENDPOINT` | The provider's S3-compatible endpoint URL. Required for `s3://`. |
| `DRIVE.n.REGION` | The provider's region string. Some providers (R2, some MinIO setups) accept `auto`. |
| `DRIVE.n.KEYID` | The access key ID. Not secret by itself — the secret half is never written here (see below). |
| `DRIVE.n.QUOTA` | A size with an optional `K`/`M`/`G`/`T` suffix (`10G`, `500G`). Omit for "unbounded" — do not write an empty `DRIVE.n.QUOTA=` line, which is treated as a configuration error, not as unbounded. |
| `DRIVE.n.CLASS` | `FREE` or `PAID`. Informational only today — see "A pooled area is pinned to one drive" below. Defaults to `PAID` if omitted — an unmarked bucket is assumed to cost money. |
| `DRIVE.n.EGRESS` | `FREE`, `METERED`, or `3X` (egress costs roughly triple ingress — some providers price it that way). Informational only today, same as `CLASS`. Defaults to `METERED` — again, guessing "free" is the guess that shows up on an invoice. |
| `DRIVE.n.RETENTION` | Whole days, optional `D`/`DAYS` suffix (`90`, `90D`). `0` means "delete on the sweep"; omit the key entirely to keep files forever — the two are not the same thing. |
| `DRIVE.n.REQUESTS` | A monthly request ceiling, if the provider publishes one. Oracle's free tier, for example, caps at 50,000 requests/month well before its 10 GB fills. Omit if the provider has no such cap. |

`DRIVE.n` entries must be numbered contiguously starting at 1 — the parser
stops at the first gap, exactly like express.e's `freeDiskSpace()`. If your
board's first drive is local and your bucket is drive 2, that's fine; a gap
*before* the bucket (no `DRIVE.1` at all) is not.

**A pooled area is pinned to one drive — there is no spillover.** `CLASS` and
`EGRESS` read like the board picks a destination for a new upload out of
several candidate buckets, free tiers first. It does not: a file area's
`STORAGEDRIVE` (below) names exactly one drive, and every upload to that area
goes there and nowhere else, because that is the only drive the download side
ever looks on for that area's files. Practically, this means: when a pooled
area's own drive runs out of `QUOTA`, or spends its monthly `REQUESTS`
budget, uploads to THAT area fail — they do not quietly land on a healthy
sibling bucket, however generously that sibling is configured. If you want a
free tier to take the load and a paid bucket to be the overflow, put them on
different file areas yourself; the board will not do it for you today.

**Worked example — a free-tier volume:**

```
DRIVE.1=DH1:Files
DRIVE.2=s3://uprough-cold
DRIVE.2.ENDPOINT=https://<namespace>.compat.objectstorage.us-ashburn-1.oraclecloud.com
DRIVE.2.REGION=us-ashburn-1
DRIVE.2.KEYID=<access key id>
DRIVE.2.CLASS=FREE
DRIVE.2.EGRESS=FREE
DRIVE.2.QUOTA=10G
DRIVE.2.REQUESTS=50000
```

**Worked example — a paid volume alongside it:**

```
DRIVE.3=s3://uprough-archive
DRIVE.3.ENDPOINT=https://s3.us-west-002.backblazeb2.com
DRIVE.3.REGION=us-west-002
DRIVE.3.KEYID=<application key id>
DRIVE.3.CLASS=PAID
DRIVE.3.EGRESS=METERED
DRIVE.3.QUOTA=500G
```

### Where the secret goes, and why it is never in `Drives.info`

`DRIVE.n.KEYID` is the access key *ID* — not sensitive by itself. The secret
half never appears in `Drives.info` on principle: that file sits under the
board root where every 68K door can read it and every backup of the board
carries it along, and a secret access key committed to a backup or handed to
a door is a secret that has left your control. Instead, put the secret in
one of two places, checked in this order:

1. The environment variable `BBS_STORAGE_<n>_SECRET` (e.g.
   `BBS_STORAGE_2_SECRET=...`) — the right choice when your deployment
   already manages secrets this way (Docker Compose `.env`, a systemd
   `EnvironmentFile`, a secrets manager).
2. A file at `Storage/<n>.key` under the board root, containing nothing but
   the secret (trailing whitespace is trimmed). Keep this file out of any
   backup that leaves your control, and out of git.

A bucket with a `KEYID` but no secret found in either place is **not** a
reason the board refuses to start: the volume is logged as disabled
(`[storage] DRIVE.n has no secret; volume disabled`) and left out of the
pool, and everything else — local drives, every other configured volume —
boots normally.

### Marking a file area as pooled — `STORAGEDRIVE` on `Conf<N>.info`

A `DRIVE.n=s3://...` line only adds a volume to the pool; it does not move
any file area onto it. To do that, add a `STORAGEDRIVE` tooltype next to the
area's `DLPATH` in that conference's `Conf<N>.info`:

```
NDIRS=2
DLPATH.1=BBS:Conf1/Files/
STORAGEDRIVE.1=2          the files of dir 1 live on DRIVE.2
DLPATH.2=BBS:Conf1/Uploads/
```

or, to pool every directory in the conference at once:

```
STORAGEDRIVE=2            every dir in this conference lives on DRIVE.2
```

Like the `DRIVE.n` sub-keys, this is a tooltype a real AmiExpress binary
simply ignores — it is not an express.e concept, and existing boards are
unaffected. Two different areas must never be pointed at the same leaf
directory name within the same drive (`Conf1/Files/` from two different
`DLPATH`s, say) — the board treats that as a configuration error and falls
the later area back to local disk, logging which two directories collided,
rather than silently letting their objects overwrite each other in the
bucket.

**What takes effect live, and what still needs a restart.** A change made
*through the admin pages* — adding, editing or removing a drive in Drive
Setup, writing a drive's secret, or editing a conference's `STORAGEDRIVE` in
the conference admin page — reaches the running pool immediately: no
restart, no dropped connections. Each of those writes rebuilds the storage
subsystem from disk as its last step, the same rebuild the board runs at
boot, so the board's own view of the pool and the file on disk never
disagree for longer than that one request takes.

What still needs a restart (or an admin no-op save through the relevant
page, which re-triggers the same rebuild) is hand-editing `Drives.info` or a
`Conf<N>.info` directly on disk, outside the admin pages — nothing watches
either file for out-of-band edits, so a change made with a text editor is
invisible to the running board until something asks it to look again. Two
settings are read from the process environment at boot and a running board
never re-reads them, even across an admin-triggered rebuild:
`BBS_STORAGE_NODE_ID` and `BBS_STORAGE_CACHE_MAX_BYTES` (below) — changing
either always needs a restart. This is deliberate, not an oversight: this
process's node identity and the on-disk directory it caches into are fixed
for its whole lifetime once the first rebuild picks them, specifically so a
rebuild can never move the directory a previous rebuild's unfinished
uploads are sitting in — see "Cache directory and sizing" below.

A rebuild that FAILS — a typo introduced by hand-editing `Drives.info`
between admin-page saves, or a disk that has gone read-only — never tears
down a pool that was already running: the board keeps serving the last
configuration that built successfully, and Drive Setup's pool status names
the failed refresh and why, distinctly from a pool that never built at all.
Fix the file (or the disk) and save again — through any admin page that
triggers a rebuild — to pick the correction up; there is nothing to
restart for this specific case, because nothing was torn down.

A rebuild also never resets what the running pool has already learned: a
volume already marked degraded, its request count, its known used bytes,
and the pool's cached file listings all carry forward across an admin save
unless the drive itself changed identity (a different bucket or endpoint
under the same drive number) — see "Requests This Month" below.

### What happens when a volume is unreachable

A pooled volume that stops answering — network trouble, a bad key that
starts failing after having worked, a bucket deleted out from under the
board — is marked *degraded*, not treated as empty. A degraded volume:

- Is skipped as a destination for new uploads (a full or unreachable
  sibling never silently eats a file that a healthy volume in the pool
  could have taken).
- Answers "storage error" for a file the board cannot currently prove is
  missing — never "file not found". A sysop investigating an outage sees
  the difference; a caller does too, on the download screen. This
  distinction exists specifically so an outage never looks like license to
  delete a catalog row for a file that is fine.
- A pooled file area whose `STORAGEDRIVE` names a drive number that
  doesn't exist in `Drives.info` at all (a typo, or a drive you removed) is
  a different, permanent case: the area is treated as local disk for every
  lookup, a warning is logged naming the conference and directory, and the
  admin's Drive Setup page lists it under broken areas so you don't have to
  find it in the log.
- If the pool itself failed to BUILD at boot (a malformed `Drives.info`
  line, a volume that cannot be constructed) the board still starts and
  still serves local files — it just runs with no pool at all, the same as
  a board that was never configured to have one. The one difference: Drive
  Setup's pool status shows *why* the pool is inactive in this case, rather
  than the ordinary "not configured" state, so a broken build never reads
  as a board that was simply never asked to pool anything.
- If a REBUILD fails later — an admin-triggered save that hit a Drives.info
  typo, or a disk gone read-only — the board does NOT drop back to this
  "no pool" state. It keeps running whatever configuration last built
  successfully, exactly as if the failed save had never happened, and
  Drive Setup's pool status names the failed refresh separately from "no
  pool at all". A boot failure and a later refresh failure are different
  outcomes on purpose: nothing was serving callers yet the first time, and
  something already was the second.

### One copy is one copy

**Pooling a file area does not make it redundant.** The board keeps exactly
one copy of each pooled file, in the bucket you configured, cached locally
for speed. If that provider account is closed, suspended for non-payment,
or the bucket is deleted, those files are gone — the board's local cache is
a *cache*, not a backup, and evicts files it can re-fetch under disk
pressure by design. If a file area matters enough to keep, back up the
bucket the way you'd back up anything else you can't afford to lose.

### Cache directory and sizing

Downloaded objects are cached locally under `Storage/cache/<node-id>/` so a
popular file isn't re-fetched from the bucket on every request. Two
settings, both optional:

- `BBS_STORAGE_CACHE_MAX_BYTES` — the cache's soft budget, as a size with an
  optional `K`/`M`/`G`/`T` suffix (same syntax as `DRIVE.n.QUOTA`). Defaults
  to `10G`. The cache evicts its least-recently-used, already-uploaded files
  to stay under this budget; it will never evict a file that is still
  staged for upload, so a sustained ENOSPC-class outage can leave the cache
  over budget rather than lose an unwritten file — this is logged, not
  silent. Drive Setup's pool status also shows a plain count of staged
  uploads still owed to the pool right now, so a stuck batch is visible on
  the page, not only in the log.
- `BBS_STORAGE_NODE_ID` — identifies this process if you ever run more than
  one backend against the same board root (a container orchestrator
  restarting the board on a new host, or a deliberate second instance). Set
  it and the board trusts it outright as this node's cache directory name;
  you are taking responsibility for uniqueness, which is what setting it
  deliberately means. Checked in this order when it is not set:

  1. `HOSTNAME` — trusted outright when the environment sets one, no
     further check performed. This is the ordinary CONTAINER case: Docker
     and every common orchestrator already set a distinct `HOSTNAME` per
     container, so two containers sharing a board root already get
     different cache directories with no configuration at all.
  2. A claimed integer SLOT under `Storage/nodes/`, for the bare-host case
     neither an explicit id nor `HOSTNAME` covers. A restart reclaims the
     SAME slot — its former holder's process is gone, so the slot is free —
     which is what makes the crash-recovery bookkeeping work at all:
     replaying an upload a previous run staged but never finished only
     works if the restarted process looks in the same cache directory the
     crashed one used. A second process starting while the first is still
     alive finds that slot held and claims the next one instead, so two
     instances against the same board root never share a directory even
     with no operator action.

  Whichever of the two applies, this process settles on it ONCE, the first
  time it builds a pool, and reuses that exact answer — including the
  resolved cache directory itself, not just the id it was derived from —
  for the rest of its life, across every later admin-triggered rebuild.
  Never share a `Storage/nodes/` directory (or a bare-host board root at
  all) between two processes running as literally the same container: a
  container's own pid namespace makes another container's pid on that same
  host read as dead the moment it's checked, which would let it walk into
  a live sibling's cache directory. `HOSTNAME` avoids this for containers
  precisely because it never asks the slot mechanism to run at all.

  If a node's identity ever changes anyway — `BBS_STORAGE_NODE_ID` edited
  between restarts, a leftover directory from an older scheme, a reused pid
  — the previous cache directory's `.pending/` uploads do not simply
  vanish unnoticed: every OTHER directory under `Storage/cache/` is
  checked for one on every rebuild, and a sysop sees a loud log line naming
  the directory and how many uploads are stuck there. Recovering those
  bytes is manual; the sweep exists so you find out at all.

### "Requests This Month" is a lower bound, not a meter

The Drive Setup admin page shows a running request count per volume. Read
it as a **floor**, not an exact figure:

- It is an in-process counter, incremented when a download or upload
  actually reaches the volume, when the pool's name index lists the bucket
  to resolve a name against it, and by the page's own "Test" connectivity
  probe — **clicking Test spends one real request against the volume it
  tests**, win or lose; it is not a free, side-effect-less check. It is not
  read from the provider and is not persisted, so it resets to zero on
  every restart and undercounts any month that spans one.
- A single high-level operation can still cost more than one real request
  behind the scenes without the counter knowing: a large listing that the
  provider paginates, or a retried call after a transient failure, each
  count as ONE against this figure while spending more than one against
  your actual bill.

If you're tracking a provider's monthly request ceiling closely (Oracle's
free-tier 50,000, for instance), treat the board's own figure as "at least
this many," and check the provider's own console for the number that
actually gates your bill.

### A 68K door cannot see a pooled file area

**This is a known, deliberate limitation, not a bug to report.** A door's
own files — its data files, its save games, its `DOOR.CFG` — were always
local, by design, and pooling has no effect on them. What pooling *does*
affect is a door that reads the *board's* file areas — a file listing door,
a file-ratio checker, anything that walks `Conf<N>/Files/` looking for
what's actually there.

A 68K door's file access runs inside the emulator's blocking DOS-library
trap loop, dispatched from an async continuation the pooled-storage cache
cannot safely block inside — doing so was measured to stall the *entire
board*, every node, for roughly 30 seconds per file access, not just the
one caller running the door. Wiring it properly needs a different
integration point than the one available today, and until that work is
done, a 68K door simply does not see files that live in a pooled area — not
an error, not a stall, just an area that reads as empty to that door.

If you pool a file area, know that any 68K door your board runs that reads
file listings will not see files placed there after pooling. TypeScript and
AREXX doors that read file areas through the board's own APIs are
unaffected — this limitation is specific to the 68K emulator's I/O path.

**Need more detail?** See the archived files for CLI-based configuration (Webhooks, Deployment). Today's documentation keeps settings explicit while deferring granular automation flows to the archives.
