---
date: 2026-08-30
topic: Link installed doors to the door repo, and make DOORREPO a 1:1 replacement for DOORMAN
tags: [doorrepo-c, doorman, door-install, door-repo, api, architecture]
status: final
---

# DOORREPO parity and the installed-door link - design

## Problem

Two failures on the live board, four days apart, have the same shape: nothing
records what an installed door actually is.

- **DD**: DOORMAN reported "DD deleted". `Doors/DD` was gone,
  `Commands/BBSCmd/DD.info` was still on disk at 1114 bytes. The door lost its
  files and kept its name, because the `.info` IS the registration every door
  list is built from.
- **BROADCAST**: `Commands/BBSCmd/BROADCAST.info` exists and points at
  `DOORS:ANNOUNCE/ANNOUNCE.REXX`. `Doors/ANNOUNCE/` does not exist at all. The
  command is offered on the menu and fails only when a user runs it.

Underneath both: **the board has no record of what it installed.** The
`door_installed_files` table exists and `db.trackDoorFiles` writes it, but only
from `amigaDoorManager`'s own installer. DOORMAN's install path records into
`door_installs` instead, and everything installed before either existed records
nothing.

Measured on live, 2026-08-30:

| | count |
|---|---|
| registered commands (`Commands/BBSCmd/*.info`) | 370 |
| door directories (`Doors/*`) | 106 |
| rows in `door_installed_files` | **0** |
| rows in `door_installs` | 37 |

So no delete has ever had a tracked file list to work from; every one falls
back to parsing the `.info`'s own `LOCATION`. The same absence is why DOORMAN
shows `[??] .______.` for several doors: with no link to a catalog row, the
panel renders the `.info` `NAME` tooltype, and for those doors that tooltype
is ASCII art.

Separately, and deciding where this work belongs: **DOORMAN (TypeScript) is
being retired.** The DoorRepo C door is to become a 1:1 replacement. Anything
built inside DOORMAN's UI is therefore short-lived; anything built in the
backend serves both doors and outlives the transition.

## What is being built

1. **One install recorder**, server-side, that writes both halves of what an
   install did: the link (`door_installs`: command -> archive) and the files
   (`door_installed_files`: what landed on disk).
2. **A local door management API** (`/api/doors`) exposing everything DOORMAN
   gets in-process, so a C89 door can do the same work. This is what makes 1:1
   parity possible at all.
3. **Naming taken from the archive**, never typed by the sysop, in both doors.
4. **DOORREPO screens** built on that API, then DOORMAN's removal.

Not in scope: the 370 doors already installed. No backfill, no fingerprint
matcher. They keep behaving exactly as they do today, and gain nothing from
this work. (Decided by the sysop, 2026-08-30.)

## Decisions already taken

These were settled during design and are not open:

- **Precedence.** When a linked door's `.info` disagrees with the repo, the
  repo wins *unless the `.info` value looks deliberate*. A `NAME` that is
  empty, ASCII art, mojibake, high-bit junk, or an echo of the command or
  filename loses to the catalog's name; a `NAME` that reads like a name is
  kept. Rejected: "repo always wins" (discards a sysop's own edit) and "fill
  empty fields only" (today's rule, which does not fix the art).
- **File tracking.** The install records every file and directory it wrote.
  Deletes then remove exactly that set, and the `.info`-`LOCATION` guess
  becomes the legacy fallback.
- **Command naming.** The command comes from the archive's own
  `Commands/BBSCmd/<CMD>.info`. When an archive names no command, both doors
  fall back to the archive's base name and show a confirm-or-cancel stating
  why - never a free-text field.
- **DOORREPO's install records reach the BBS through an endpoint**, not
  through the BBS inferring them from a later scan. Inference is what produced
  the zero-row table.

## Architecture

### The recorder

`web/backend/src/doors/door-install-record.ts`:

```ts
recordDoorInstall({
  command,        // the command the ARCHIVE named
  archiveName,    // the catalog key - the link
  installDir,     // Doors/<COMMAND>
  infoPath,       // Commands/BBSCmd/<COMMAND>.info
  metadata,       // name/description/category/version/release group/md5/revision
}): DoorInstallRecord
```

It writes the `door_installs` row and the `door_installed_files` rows in one
transaction, the file list walked from what is actually on disk after
extraction rather than from what the extractor claimed. Every install path
calls it: DOORMAN owner mode, DOORMAN consumer mode, `amigaDoorManager`'s
archive installer, and DOORREPO via the endpoint below.

`archive_name` is the durable join key against the catalog - `catalog_id` is
allowed to go stale, exactly as `door-installs.repository.ts` already
documents.

### The API

`web/backend/src/server/door-admin.routes.ts`, mounted at `/api/doors`.
Deliberately NOT under `/api/door-repo/*`, which proxies out to the door
server: this API manages THIS board's installed doors.

| method | path | purpose |
|---|---|---|
| GET | `/api/doors/installed` | installed doors: command, type, size, enabled, archive link, resolved metadata |
| GET | `/api/doors/:cmd/files` | the door's directory listing |
| GET | `/api/doors/:cmd/file?p=` | one file's contents |
| GET | `/api/doors/:cmd/info` | the command's tooltypes |
| PUT | `/api/doors/:cmd/info` | write tooltypes |
| POST | `/api/doors/:cmd/enabled` | enable / disable |
| DELETE | `/api/doors/:cmd` | delete, streaming the step log |
| POST | `/api/doors/installed` | record an install (DOORREPO) |

**Responses use the pipe-delimited text family the C door already parses**
(`FILES|<count>|<junk>` then `<size>|<isJunk>|<path>`), not JSON. C89 JSON
parsing would be a second bug surface in a door that cannot enumerate a
directory. Each new response gets a header line naming its shape and a count,
so a client knows what it is reading before it reads it.

The delete streams its steps as `STEP|ok|removed Doors/AEHELP/aehelp.data`
lines as they happen, which is the same `onStep` contract DOORMAN already
consumes in-process (`DoorDeleteProgress`, commit 939cdde72).

### Auth

The BBS mints a token each time it launches the door, scoped to that node and
that user, and writes it to `Doors/DoorRepo/DoorRepo.token` - a file the C door
reads at startup exactly as it already reads `DoorRepo.cfg`. Environment
variables are not used: a 68K door runs under the emulator and does not receive
the backend's environment. The token is rewritten on every launch and rejected
by the server once that session ends.

Every mutating route re-checks `secLevel >= 250` server-side rather than
trusting that a token was presented, and `GET /api/doors/:cmd/file` resolves
the requested path and refuses anything that escapes that door's own
directory - the same guard `safe-install-dir.ts` applies to deletes.

This is not ceremony. `RepoHost` on other people's boards is baked to
`bbs.uprough.net`, so an unauthenticated `DELETE /api/doors/:cmd` on this host
would be a remote door-wipe button - and this codebase has already lost its
entire `Doors/` tree once, on 2026-08-30, to an unchecked recursive delete.

### Precedence, in one place

`isPlausibleDoorName(value, { command, archiveName })` lives beside the
overlay in `web/backend/src/doors/door-repo-metadata.ts` and is applied by
`getDoorList`, which both doors render. A door with an install record is
matched by `archive_name` exactly; the heuristic match stays only for doors
without one.

Rejected: implementing the rule in each door. Two front ends must never carry
two rules.

## Phases

Each phase ends reviewable, tested, and verified against the live container -
reading `/app/.git-sha` and the running code, not the workflow's word for it.

**A - the recorder and the link.**
`recordDoorInstall`; every install path calling it; `POST /api/doors/installed`;
`isPlausibleDoorName` and exact-key matching in `getDoorList`; the naming
change in both doors (no free-text command, archive-name fallback with a
confirm). Done when a freshly installed door has rows in both tables, its
delete removes exactly that set, and a door whose `.info` NAME is art shows
the catalog's name.

**B - read APIs.**
`installed`, `files`, `file`, `info`. Done when DOORREPO can draw a metadata
panel and a file explorer from the server alone.

**C - write APIs.**
`enabled`, `info` write, `DELETE` with the streaming step log. Done when
DOORREPO can enable, edit and delete a door, and the delete log appears line
by line rather than after a pause.

**D - DOORREPO screens.**
Metadata/DIZ panel, file explorer, `.info` editor, delete log, built against B
and C. Done when the sysop can do every DOORMAN task in DOORREPO.

**E - retire DOORMAN.**
Remove the TypeScript door once D has run on the live board and the sysop has
used it. Done when `Doors/door-manager` is gone and no command points at it.

## Testing

- **The recorder and the API**: route and unit tests against a temp BBS root
  with real files. The filesystem is not mocked - the two failures this work
  exists to fix were both "the disk disagreed with the record".
- **Precedence**: `isPlausibleDoorName` against the art from the live board,
  mojibake, an empty value, a command echo, and ordinary names.
- **The C door**: its existing harness, plus a parse test per new response
  format, including a malformed body and a path containing the separator.
- **Every fix ships a test that fails before it**, per the repo's rule; the
  delete work already landed 13 such tests, six of which fail against the
  previous implementation.

## Risks

- **Emulator cost.** DOORREPO runs as a 68K door under the emulator. Every
  screen added in phase D costs emulator time on a board that froze during a
  delete four days ago. Phase D measures before it grows.
- **A remote-reachable management API.** Addressed by the auth section above;
  it is the single most dangerous piece of this design and should be reviewed
  as such.
- **Two doors during C and D.** Both will be installed and both will manage
  doors. `getDoorList` being the one source of the display rule is what keeps
  them from disagreeing.
