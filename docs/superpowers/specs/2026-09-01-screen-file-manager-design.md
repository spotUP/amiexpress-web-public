---
date: 2026-09-01
topic: A screen file manager for the admin
tags: [admin, screens, express-e, mci, ansi, rip, parity]
status: draft
---

# Screen file manager - design

Requested by the sysop: *"the admin interface needs a screen file manager
where I can view/edit/upload/replace/etc all screenfiles in the BBS."*

Today the admin can edit `.info` files and nothing else. A LOGON screen, a
menu or a bulletin can only be changed by hand on the volume.

Research behind this: `thoughts/shared/research/2026-09-01_screen-file-manager.md`
(the file counts and the express.e resolution table) and
`thoughts/shared/handoffs/2026-09-01_screen-fallback-removed.md` (what changed
under it this week).

## Three phases

Each ships something usable on its own and gets its own implementation plan.

| Phase | What | Depends on |
|---|---|---|
| **1** | The manager: overview, resolution, preview, download/upload/replace/delete, import/export archives, share-a-directory | nothing |
| **2** | ANSI/text editor in the browser, reusing the SDK editor core | phase 1 |
| **3** | RIP: SVG import for the artwork, authoring only the interactivity | phase 1 |

Phase 1 is specified here in full. Phases 2 and 3 are sketched at the end -
enough to keep phase 1 from painting them into a corner, not enough to build
from.

Deliberately NOT in this spec, and written next: **what a release ships as a
default board.** `Dockerfile:262-300` copies this board's `Screens`,
`Conf1`-`Conf14` and `Node0`-`Node40` into `/app/default-data`, so a sysop who
installs the release is seeded with uprough's screens, conferences and
bulletins. That is a packaging problem - Dockerfile, entrypoint, release
process - and the manager does not depend on its answer.

## What the board's screens actually are

Measured on this board, not assumed. **Screens are programs, not pictures:**

```
252  ~SS_    include another screen file
173  ~CC_    run a BBS command or door
108  ~nSR_   screen recursion, n deep
 42  ~CL.    conference list
```

Every reference on this board is board-absolute (`~SS_BBS:screens/uprough.txt`)
or a bare command name (`~CC_gwall`). None names a `Node<N>` or `Conf<N>` path.
That is a fact about today, not a guarantee - so the manager checks rather than
assumes, and one node-specific reference blocks the share action (below).

Scale: 891 files under screen directories, 85 distinct contents, 59
directories, three scopes.

## How resolution works, and where that knowledge must live

`express.e:6544-6640` picks ONE directory per screen type and gives up if the
file is not there. There is no fallback.

| screen | directory |
|---|---|
| LOGON, LOGOFF, BBSTITLE, AWAITSCREEN, JOIN, JOINED, JOINCONF, NODE_BULL, ... | `nodeScreenDir` |
| MENU, CONF_BULL, JoinMsgBase, DownloadMsg, ... | `confScreenDir` |
| BULL, ONENODE, LOGON24, LANGUAGES, INTERNETNAMES, REALNAMES, MAILSCAN | `cmds.bbsLoc` - the board root |

`nodeScreenDir` is the node's `SCREENS` tooltype, defaulting to
`<bbsLoc>/Node<N>/` (ACP.e:2666-2673, express.e:96 and :31995). The node half
is implemented and live; the conference half (express.e:5052-5054) is not, and
is out of scope here.

`findSecurityScreen` then picks the security variant WITHIN that one directory
(`MENU250.TXT` before `MENU.TXT`) and the type extension.

### Task 0: extract the resolution table

`SCREEN_DIR_MAP`, `getScreenDirType` and `getScreenFileName` are private inside
`screen.handler.ts`, 3023 lines and hook-exempt. The manager needs exactly that
knowledge, and if it re-derives it the admin and the board will disagree - the
one bug class that ran through the entire admin audit (writer and reader
disagreeing, both halves working, on data that never meets).

Extract `web/backend/src/screens/screen-resolution.ts`:

- `SCREEN_DIR_MAP`, `getScreenDirType`, `getScreenFileName`
- `resolveNodeScreenDir(baseDir, nodeId)` (moved, not copied)
- `resolveScreen(name, { nodeId, confId, secLevel })` returning the directory
  searched, the file chosen (or none), and the variants considered

`loadScreenFile` consumes it instead of owning it. Its behaviour must not
change; see Testing.

## The index

One service on top of that module builds what the page renders:

- for every screen in the table x every node and conference: the directory it
  resolves from, the file it lands on or nothing, and the security variants
  present
- per file: size, format sniffed from the bytes (ANSI / plain / RIP / PETSCII),
  SHA-256, and the MCI references it contains
- duplicate groups come from the hashes - "41 nodes, 1 distinct content"
- anything under a screen directory that no screen name reaches is listed under
  **Unused**, never hidden
- broken references: `~CC_` naming a command with no `Commands/BBSCmd/<CMD>.info`,
  `~SS_`/`~SR_` naming a file that does not resolve

891 files stat'd and hashed, cached against directory mtimes the way
`getBoardConfig` caches, rebuilt on demand from the page.

## The page

`web/config-app`, sidebar beside Configuration Files, sysop-only.

Screens first, files underneath:

```
SCREENS                      resolves for            missing
  BBSTITLE   node scope       41 nodes  1 shared        -
  LOGON      node scope       41 nodes  (4 variants)    -
  MENU       conf scope       13 confs                  Conf14
  BULL       board root       1                         -
  NODE_BULL  node scope       0                         39 nodes

> BBSTITLE
    Node1/BBSTITLE.txt        2.1K   ANSI    [preview]
    Node2/BBSTITLE.txt        2.1K   identical to Node1
    Screens/Node/BBSTITLE.txt 2.1K   shared by 215 nodes
```

Preview renders as the caller meets it: ANSI and plain text through the
terminal renderer the admin already ships (`SessionLogTerminal`), `.rip`
through the vendored RIPtermJS, `.seq` through the loader's PETSCII converter
and labelled as not rendering correctly on the board yet. MCI codes are shown
UNEXPANDED and annotated - expanding them needs a live session, and a faked
value would be a lie about what a caller sees.

## API

`web/backend/src/api/screens-routes.ts`, mounted at `/api/screens` behind
`authenticateToken` + `requireSysop()`, exactly like `/api/info-editor`.

```
GET    /api/screens                     index
GET    /api/screens/resolve?screen&node&conf&sec
                                        directories tried, file chosen
GET    /api/screens/file?path           bytes (base64), size, format, hash
GET    /api/screens/file?path&download  the same bytes as an attachment
PUT    /api/screens/file?path           replace; body carries targets[]
POST   /api/screens/upload              multipart; same targets[] rules
DELETE /api/screens/file?path           remove one file
POST   /api/screens/share               seed a shared dir, write SCREENS tooltypes
GET    /api/screens/export?scope        archive of a scope, or the whole board
POST   /api/screens/import              archive in, with a dry-run first
```

Four rules, each paid for by a bug already in this repo's history:

1. **Resolve the path once, case-insensitively, and use that resolved path for
   the read, the backup and the write.** `info-editor-routes.ts` tested
   existence case-insensitively then read case-sensitively - invisible on
   macOS, broken on the Linux container.
2. **Bytes, never text.** Content crosses as base64 both ways; uploads are raw
   multipart. No JSON round-trip touches screen content: a UTF-8 round-trip
   turns an Amiga high-bit byte into a replacement character.
3. **Never normalise a filename.** The security level and the type extension
   ARE the routing. A rename that changes either is refused.
4. **Backup before every destructive write** - `path + '.backup'`, the existing
   convention - and restore it if the write throws. Delete backs up too.

Paths are confined under `dataDir`: resolve, then verify the resolved path is
inside the board root. Writes are refused outside a known screen location - a
screen directory, a node or conference root, or the board root. Every action is
written to the admin audit log: who, which file, which action, how many
targets.

## Write path

**Replace / upload.** Targets the file you opened. When the same screen exists
elsewhere, the dialog offers: this file only; all N nodes that have it; or
share-then-write-once when they are already identical. Every target is backed
up first; a failure mid-fan-out restores every file already written. Format is
checked before the write - a `.rip` uploaded over a `.txt` name is refused,
because the extension is the routing.

**Delete** backs up, then says what stops resolving: "node 7 then has no LOGON
screen", or "no effect, node 7 reads the shared directory".

**Share** is directory-level, because the tooltype is. `SCREENS=BBS:...`
redirects EVERY node screen that node reads, not the one file you were looking
at. Preconditions, all checked against bytes:

- the node's entire screen set matches the shared directory's - same filenames
  (compared case-insensitively, an Amiga volume; preserved exactly), same
  SHA-256 and length for every file
- no normalisation: CRLF, trailing whitespace and SAUCE differences all block
  the merge
- no file in the set carries an MCI reference naming a `Node<N>` or `Conf<N>`
  path
- the confirmation lists every file that changes hands in BOTH directions: what
  the node loses, what it gains
- the tooltype is written; the original files are left in place, so undo is
  clearing the tooltype, not restoring a backup

If the sets differ the action is not offered; the diff is shown instead.

**Import / export.** A sysop running a release package has no git. Export
writes an archive of a scope or of every screen on the board. Import accepts an
archive or a directory dumped off a real Amiga and shows, before writing
anything, exactly which files land where and which existing files they would
replace.

## Testing

Every claim below is a test that fails before the code exists.

**The extraction is behaviour-preserving.** The existing screen regression
tests, plus a committed probe (`dev/scripts/probe-screen-resolution.ts`) that
drives `loadScreenFile` over every screen x every node and conference x five
security levels - 4,215 lookups on this board - and diffs before against after.

**The guard against the whole bug class:** for every screen and scope, the file
the INDEX claims resolves is the file `loadScreenFile` actually returns. A call
through the real loader, not a source-string pin: a regex pin proves a call
exists, never that it works.

- **Bytes**: a screen with high-bit characters, CRLF endings and a SAUCE record
  round-trips GET -> PUT unchanged, byte for byte.
- **Paths**: traversal outside the board root is rejected; a file whose name
  differs only in case is read, backed up and written at ONE resolved path.
- **Share**: refused when the file sets differ; refused when any file carries a
  `Node<N>`/`Conf<N>` MCI reference; writes the tooltype with its trailing
  slash; clearing the tooltype restores the node's own directory.
- **Fan-out**: N targets produce N backups; a mid-way failure restores every
  file already written.
- **References**: a screen with `~CC_NOSUCHDOOR` and `~SS_BBS:screens/missing.txt`
  reports exactly two broken references; a valid chain reports none.
- **Import**: the dry run lists exactly the files the real run writes.

All of it under the backend's CI glob, plus `npm run typecheck:tests` - jest
strips types, so a file can be green under jest and fail the typecheck.

## Phase 1b: screens survive an upgrade

`docker-entrypoint.sh` already has the mechanism: image-owned, volume-owned,
and **tracked** - a three-way merge against `.deployed-manifest` that remembers
what the last deploy wrote. Untouched files may be updated; edited files are
left alone; deleted files stay deleted (paid for on 2026-08-31, when deleted
doors kept returning).

Screen files are not in the tracked class, so nothing shipped reaches an
existing board and nothing written by the manager is protected by name. Putting
`Screens/**` and the node and conference screen files into that class fixes
both, and the first deploy after it lands adopts whatever the volume has and
changes nothing - a file with no manifest entry is adopted by design.

Its own phase because it touches the deploy path for every board file, and
wants the four cases (new, untouched, edited, deleted) proved one at a time
against a fixture board.

## Phase 2 sketch: the ANSI editor in the browser

`sdk/engines/ui/ansi-editor/core`, `tools/` and `input/` are pure TypeScript -
canvas (761 lines), editor-state with undo (1075), drawing tools (829), CP437
and SAUCE file-ops. Only `api/` and `ui/` bind to blessed. The browser editor
reuses the core and adds rendering and input, so each tool has ONE
implementation behind two front-ends. The convergence that made this possible
landed this week; forking it again would undo that.

MCI is part of editing, not decoration: codes are parsed into tokens,
highlighted, validated against the real command list and real screen paths, and
insertable - a screen is a program and the editor should treat it as one.

## Phase 3 sketch: RIP without writing a drawing program

`packages/terminal/src/rip/RIPParser.ts` already parses RIP into typed commands
and RIPtermJS renders them; what is missing is the serializer and an authoring
UI.

**Investigate first, before any editor work:** import SVG for the artwork and
author only the interactivity here. The spike converts an Inkscape SVG to RIP
commands, renders it through RIPtermJS, and reports which SVG subset survives
640x350, 16 fixed EGA colours, integer coordinates, no antialiasing, no
gradients, no opacity, and beziers flattened to polylines. The output is that
subset, not a yes/no.

`github.com/cwensley/pablodraw` reads and writes RIPscript and is the reference
for both the serializer and which RIP primitives are worth targeting.

If the spike lands, the editor is: import SVG, place mouse fields, buttons and
hotspots over the picture, bind each to a command, serialize - a small bounded
app instead of a drawing program.

## Open questions

None. The decisions this design rested on were taken with the sysop on
2026-09-01: all four jobs in scope; editing in the browser rather than the
door; ANSI, text and RIP formats; three phases with the manager first; screens
as the primary axis; one-click share that writes tooltypes and deletes nothing;
per-upload choice of fan-out; and the default-board packaging problem split
into its own spec.
