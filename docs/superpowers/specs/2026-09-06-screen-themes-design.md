---
date: 2026-09-06
topic: Screen themes - a full set of board art per artist, one resolver, a sandboxed artist role
tags: [screens, themes, ansi, petscii, seq, resolver, artist, roles, admin, volume, deploy, architecture, umbrella]
status: draft
---

# Screen themes - design

An ANSI artist should be able to redraw the whole board and have a caller wear
it. This is the UMBRELLA spec for that: where a theme's files live, the ONE
resolver that picks a file for a caller, how a caller chooses, what an artist
may and may not touch, and what happens to their work on the next deploy. It
is not itself an implementation plan; six sub-projects follow (section
"Decomposition").

## Problem

The board's art is a set of files in fixed directories. `express.e:6544-6640`
picks ONE directory per screen type and gives up if the file is not there, and
this port is a 1:1 port of that rule
(`web/backend/src/screens/screen-resolution.ts:186-213`). There is exactly one
copy of `MENU.TXT` a conference can read and exactly one `LOGON.txt` a node
can read. An artist who wants to redraw the board has to overwrite the board.

Two consequences, both live today:

1. **Redrawing is destructive.** The only way to try a new logon screen is to
   replace the one every caller sees. `Screens/.Revisions/` keeps ten copies
   (`web/backend/src/screens/screen-revisions.ts:6-7`), which is an undo, not a
   second set.
2. **There is no second set to switch to.** The board has one appearance. A
   caller who prefers something else has no lever, and an artist who wants to
   show a whole look has nowhere to put it.

The board already has a per-caller appearance switch - the DOOR theme, picked
by THEMEC and stored as `themepreference`
(`web/backend/src/doors/BBSApi.ts:734-744`) - but it governs blessed widget
colours inside TypeScript doors and touches no screen file. A caller can have
a neon door theme and 1993 board art, and does.

## Settled decisions

These came from the sysop and are binding. Nothing below re-opens them.

1. **A theme is SCREEN FILES ONLY.** A set of `.ans`/`.txt`/`.seq`/`.rip`
   screens plus a manifest naming the theme, its author and the widths it
   supports. Prompts, colour palettes and the door theme system
   (`sdk/engines/ui/theme/`) are out of scope. See "Out of scope" for how the
   two theme systems coexist.
2. **Each caller picks their own theme**, the way the door theme picker
   already works. The sysop sets the board default.
3. **A new `artist` capability, sandboxed.** An artist owns exactly one theme
   directory, edits it in the existing admin screen editor, may READ the
   default theme to copy from, and may not touch `Screens/`, another artist's
   theme, or activate anything.
4. **Missing screens fall back to the default theme.** A partial theme is
   usable from day one and an artist ships incrementally.

## What is being built

- A new top-level `Themes/` tree on the data volume, one directory per theme.
- `Themes.info` at the board root: the registry of which themes exist, who
  owns each, and which are selectable. An Amiga tooltype icon, read by
  `readTooltypeMap` and written by `applyTooltypes`, exactly as
  `ScreenTypes.info` is (`web/backend/src/screens/screen-metadata.ts:24-49`).
- ONE new argument on ONE existing function - `screenSearchLocations()`
  (`screen-resolution.ts:186-213`) - which is how the theme dimension composes
  with the four the loader already has.
- A path-rewrite rule for the arms of `loadScreenFile` that bypass
  `screenSearchLocations` entirely: absolute paths and Amiga assigns
  (`screen.handler.ts:1046-1075`, `:1277-1349`), which is how `~SS_` and
  `~SR_` includes reach the loader.
- A per-caller `screentheme` preference, a board default, and a picker.
- A per-request path-authorisation layer inside `screens-routes.ts` that turns
  its existing blanket level-100 write access into an ownership rule.
- A preview route that drives the real resolver and the real render path.
- Validation, deploy survival, and a byte-identity pin on today's appearance.

## Out of scope, and how the two theme systems coexist

**Out of scope entirely:** the door theme system (`sdk/engines/ui/theme/`,
`THEMES`, `themeById`, `bbs.setTheme`), prompt strings, MCI colour codes, the
`Prompts/FILEVIEW.40` layout language of the C64 file-view spec, and any
change to how a screen is RENDERED once it has been chosen. This spec chooses
a file; everything downstream of the choice is untouched.

**The coexistence question is real and gets one answer, not a merge.** A
caller has two independent preferences - screen theme and door theme - and
nothing stops them mismatching today. Unifying them is a bigger project than
this one and is not attempted. What this spec does instead is let a screen
theme DECLARE its companion:

- `Themes.info` may carry `DOORTHEME.n=<id>` for theme `n`, naming one of the
  ids `listThemes()` returns (`BBSApi.ts:747-750`).
- When a caller selects a screen theme whose entry names one, the board sets
  their door theme to it in the same action, through the existing
  `setTheme` path (`BBSApi.ts:734-744`) so the id is resolved through
  `themeById` and an unknown id becomes `classic` rather than a broken door.
- A theme entry that names no `DOORTHEME.n` leaves the caller's door theme
  exactly as it was. That is the default and it is what the shipped default
  theme does.
- The reverse never happens. Picking a door theme in THEMEC never changes
  screen art, because a door theme is offered by the board and a screen theme
  may be the work of one artist; making a colour pick swap somebody's art is a
  surprise in the wrong direction.

So an artist who wants a coherent board ships their screens and names a door
theme; an artist who only wants to redraw the logon screen names none.

## Architecture

Six components. Each is a sub-project (see "Decomposition").

### Component 1 - the theme tree and the registry

`Themes/<slug>/` on the data volume, plus `Themes.info` at the board root.
Layout in "The theme tree"; registry format in "The registry".

### Component 2 - the resolver

`screenSearchLocations(baseDir, screenName, { nodeId, confId, themeSlug })`
returns the theme's mirror of each scope directory immediately before that
directory. One function, one order, consumed by the BBS loader and by the
admin's `/api/screens/resolve` alike - which is the whole reason that module
exists (`screen-resolution.ts:9-13`).

Plus `themedPath(baseDir, themeSlug, absPath)` for the absolute/assign arms.

### Component 3 - the index, theme-aware

`listScreenDirectories()` (`screen-index.service.ts:222-254`) learns the theme
tree; `ScopeResolution` (`:115-126`) gains the theme that answered;
`getScreenIndex`'s cache key (`:813-824`) covers the new directories.

### Component 4 - the preference

A `screentheme` column beside `themepreference`, a board default in
`Themes.info`, a resolver entry point, and the caller-facing picker.

### Component 5 - the artist sandbox

`Themes.info`'s `OWNER.n` is the ownership record. A per-request path
authoriser inside `screens-routes.ts` turns it into concrete allow/deny.

### Component 6 - preview and validation

`GET /api/screens/preview` drives `loadScreenFile` + `parseMciCodes` with a
synthetic session; the config-app renders the bytes through the xterm
component that already exists and is currently dead
(`web/config-app/src/components/ScreenPreview.tsx:30-39`). Validation is a
pure function over the index.

---

## The theme tree

### Where it lives, and why not under `Screens/`

**A new top-level `Themes/` directory on the data volume.** Not
`Screens/themes/`. This is measured, not preferred.

`docker-entrypoint.sh:605-632` runs, on every start:

```sh
for sync_dir in Doors Screens Libs C; do
    ...
    (cd "$DEFAULT_DATA_DIR/$sync_dir" && tar cf - ... .) \
      | (cd "$BBS_DATA_DIR/$sync_dir" && tar xf -)
done
```

Extraction only writes paths the archive contains, which the entrypoint's own
comment states (`:617-620`). So for a path under `Screens/`:

| Volume state | Image state | Result on every deploy |
|---|---|---|
| present | absent | untouched, forever |
| present | present | **overwritten from the image** |
| absent | present | created from the image |

An artist's theme under `Screens/themes/<slug>/` therefore survives *only for
as long as the image ships nothing at that path*. The day a default theme is
added to the repo under the same tree, every artist file whose relative path
collides is silently replaced. That is the same trap the C64 file-view spec
measured and designed around by putting its templates in a new tracked
`Prompts/` tree
(`docs/superpowers/specs/2026-09-03-c64-file-view-design.md:878-925`).

There is a second, sharper reason. `FORCE_REINIT_SCREENS=1` does
`rm -rf "$BBS_DATA_DIR/Screens"` (`docker-entrypoint.sh:530-537`) and the same
to every conference's `Screens/` (`:538-554`). It is a switch a sysop reaches
for when the board's art looks wrong - which is precisely the moment a theme
experiment has gone sideways. A themes tree inside `Screens/` would be
destroyed by the recovery action for the problem it caused. `Themes/` is named
in neither of those `rm -rf` paths and is not in the tar loop's list.

**How `Themes/` reaches a board.** Two classes, deliberately different:

- **The default theme ships nothing.** It is a registry entry with no
  directory (see "The default theme is not a directory"), so the image copies
  no files for it and there is nothing to overwrite.
- **A shipped theme** (one the project releases with the board) is added to
  `TRACKED_INFO`-style handling: `Themes/` joins the tracked sync loop the way
  `Commands/` does (`docker-entrypoint.sh:636-645`, `sync_tracked` at
  `:181-275`). Tracked semantics are exactly what a shipped-but-editable file
  needs: the image leads until the sysop or artist edits a file, and a
  deletion outlasts deploys. `TRACKED_INFO` at `:129` already lists
  `ScreenTypes.info`; `Themes.info` joins it as one word.
- **An artist's own theme** is image-absent by construction, so nothing in the
  entrypoint touches it. See "The deploy story" for what still has to be built
  before that is safe to rely on.

### Layout

```
Themes/
  <slug>/
    THEME.txt            optional: the artist's own notes. Not read by code.
    Node/                screens whose dirType is NODE
    Conf/<n>/            screens whose dirType is CONF, by conference NUMBER
    Board/               screens whose dirType is GLOBAL
    Files/               a mirror of the board root, for path-shaped
                         references only (see "The arms that bypass the
                         directory list")
```

`<slug>` is `[a-z0-9][a-z0-9-]{0,30}` - lowercase, no dots, no separators. It
becomes a directory name on a case-insensitive Amiga volume and a query
parameter, so it is restricted at the point it is created and never
normalised afterwards.

**Why the tree mirrors SCOPE and not the board's directory names.** The board's
screens live in `Node<n>/`, `<conference dir>/`, `<conference dir>/Screens/`
and the board root plus `Screens/` (`screen-resolution.ts:194-211`). Two of
those four are not stable names:

- A node's screen directory is whatever its `SCREENS` tooltype says
  (`screen-resolution.ts:112-146`), and the shipped image collapses 41 node
  copies into one shared `Screens/Node/` and points every node's icon at it
  (`web/backend/src/services/seed-node-screens.ts:1-31`, `:101-105`).
- A conference's directory is what `LOCATION.n` names, not `Conf<n>`
  (`screen-resolution.ts:201-207`).

A theme that mirrored those names would break the first time a board was
renumbered or a node's tooltype was changed. It would also make a theme
per-node, which is meaningless - 24 nodes on this board read the same art, and
an artist redraws the board once.

So the theme tree is keyed on the SCOPE the loader computed, not on the
directory it landed in. `Node/` serves every node. `Conf/<n>/` is keyed on the
conference NUMBER, which is what `screenSearchLocations` is given
(`screen-resolution.ts:189`) and what `confIds()` enumerates from
`ConfConfig.info` rather than from directories
(`screen-index.service.ts:206-215`).

**Files inside a scope directory are named exactly as they are on the board.**
`Node/LOGON.txt`, `Node/Logon100.txt`, `Node/BBSTITLE.SEQ`,
`Conf/1/MENU.TXT`, `Board/BULL.TXT`. No renaming, no theme suffix. The
filename IS the routing: the security level and the type extension decide
which caller is served (`screens-routes.ts:222-239`,
`screen-security.util.ts:80-184`), and a theme that expressed itself as
`LOGON.neon.txt` would unroute the screen. The theme is a directory, which is
the only redirection primitive this board has.

**A theme may carry every variant the board can, for a screen resolved by
NAME.** Security levels (`Logon100.txt`), screen types (`flt.txt.gr`), PETSCII
(`BBSTITLE.SEQ`), the C64 40-column variant (`MENU_C64.seq`,
`screen.handler.ts:1191`) and RIP (`bbstitle.rip`). Nothing new is invented;
the theme directory is a second place the same names may live.

**For a screen resolved by PATH, a theme may only replace files the board
already has.** Bulletins and `~SR_` pools are both in this class, and the
limit is worth stating precisely because it is not obvious. `_displayBulletin`
runs `findSecurityScreen` against the CONFERENCE's own directory and then
hands `displayScreen` the absolute path it found
(`web/backend/src/handlers/commands/display-file-commands.handler.ts:656-668`);
`~SR_` picks a random member of the board's pool and hands over an absolute
path too (`screen.handler.ts:582-589`). By the time the loader sees either,
the variant choice is already made. `themedPath` then offers the theme's
mirror of exactly that path - `Files/<conf dir>/Screens/Bulletins/Bull3.txt`,
`Files/Screens/reference-board/001.reference-board.txt` - so a theme CAN redraw any
bulletin or any pool member the board has, and CANNOT introduce a security
variant or a pool member the board does not have. Making it symmetrical means
moving the variant walk out of those two callers and into the loader, which is
a change to shipped behaviour outside this spec's scope.

### The default theme is not a directory

The default theme has slug `default`, no directory, and its entry in the
registry carries `DIR.n=` (empty). Given `themeSlug = 'default'`, the resolver
prepends nothing and returns exactly the list it returns today.

This is the single most important decision in the spec. It means:

- Migration moves no files. The board's existing art stays where it is.
- Byte-identity for today's callers is structural, not a test result: the code
  path for the default theme is the code path that exists.
- An artist copying from the default reads the board's real files, so what
  they copy is what callers actually see.
- A board that has never heard of themes behaves identically, because a caller
  with no preference resolves to `default`.

---

## The registry

`Themes.info` at the board root, an Amiga tooltype icon in the shape
`ScreenTypes.info` already uses (`TYPE.n` / `TITLE.n`, read by
`screen-metadata.ts:24-49`, and the file on this board reads
`TYPE.1=TXT.GR` / `TITLE.1=Amiga Ansi`).

```
TYPE.0=default
TITLE.0=reference-board
AUTHOR.0=
DIR.0=
WIDTHS.0=80,40
STATUS.0=live

TYPE.1=neon
TITLE.1=Neon
AUTHOR.1=Skope
OWNER.1=skope
DIR.1=Themes/neon
WIDTHS.1=80
DOORTHEME.1=vapor
STATUS.1=draft
```

| Key | Meaning |
|---|---|
| `TYPE.n` | the slug. Unique, `[a-z0-9][a-z0-9-]{0,30}`. |
| `TITLE.n` | what a caller sees in the picker. |
| `AUTHOR.n` | the artist's handle, as they want it shown. Display only. |
| `OWNER.n` | the BBS username whose admin account may write this theme's directory. Empty means nobody but a sysop. |
| `DIR.n` | board-relative directory. Empty means "the board's own directories", and the registry writer REFUSES an empty `DIR.n` for any slug but `default`. |
| `WIDTHS.n` | `80`, `40`, or `80,40`. Declared by the artist, checked by the validator, used by the picker. |
| `DOORTHEME.n` | optional companion door theme id. |
| `STATUS.n` | `draft` (only its owner and sysops may select it), `review` (the same, and it appears in the sysop's queue), or `live` (any caller may). |

`DEFAULT=<slug>` at the top level names the board default - the theme a caller
with no preference gets, and the theme every fallback lands on.

**Why an icon and not JSON.** `.screen-flags.json` chose JSON with a stated
reason: "nothing in AmiExpress reads it, so there is no format to match"
(`web/backend/src/screens/screen-flags.ts:11-15`). That reason does not hold
here. `Themes.info` is the exact analogue of `ScreenTypes.info` - a
board-level list of presentation variants with a per-user index into it
(`express.e:6264-6267`, `:3884-3898`) - the board already has a reader
(`readTooltypeMap`) and a writer (`applyTooltypes`, already imported by
`screens-routes.ts:29`), and joining `TRACKED_INFO` (`docker-entrypoint.sh:129`)
is one word. Reusing the shape the board already has beats a second format.

**It is on disk, and that is deliberate.** The registry is board
configuration: which themes exist, who owns them, which are selectable. Kept
only in SQL it would be lost the first time the volume was reseeded and
invisible to anyone reading the board with their own eyes - the argument
`screen-flags.ts:11-15` already makes for a smaller fact than this one.

**Cached on its own mtime and size**, the rule `readScreenFlags` uses
(`screen-flags.ts:26-27`, `:36-40`) and `resolveNodeScreenDir` uses
(`screen-resolution.ts:110`, `:116-124`). A sysop editing the registry reaches
the next screen load with no restart.

---

## The resolver

### The dimensions that already exist

The loader resolves a screen across four dimensions today, in this nesting
(`screen.handler.ts:1203-1274`):

1. **Scope directory** - the outer loop, from `screenSearchLocations()`
   (`screen-resolution.ts:186-213`). NODE screens get one directory; CONF gets
   the conference directory then its `Screens/`; GLOBAL gets the board root
   then `Screens/`.
2. **Security level** - `findSecurityScreen()` at the head of each directory
   (`screen.handler.ts:1205-1230`), walking the caller's level rounded down to
   a multiple of five, down to five, then the base name
   (`screen-security.util.ts:157-179`).
3. **Format** - inside `findSecurityScreen`, PETSCII `.SEQ`, then RIP `.RIP`,
   then the caller's screen type from `ScreenTypes.info`, then `.TXT`
   (`screen-security.util.ts:100-146`).
4. **Filename variant** - the second inner loop
   (`screen.handler.ts:1231-1273`) over `filenameVariations`, built by
   `addAnsiVariants` / `addPetsciiVariants` / `addRipVariants`
   (`:1112-1197`), which is where the C64 40-column `_C64` suffix enters
   (`:1191`) and where the lowercase-before-uppercase rule lives (`:1119-1129`).

There is no general width dimension. Width enters only through
`session.petsciiMode` and `session.terminalType === 'c64'`, which select
`.seq` and the `_C64` suffix. `MENU250.TXT` and `logon20.txt` on this board are
SECURITY levels, not widths.

### Where the theme goes

**The theme is a fifth dimension, applied at the DIRECTORY level, outside
everything else.** `screenSearchLocations()` gains one optional field:

```ts
export function screenSearchLocations(
  baseDir: string,
  screenName: string,
  opts: { nodeId: number; confId?: number; themeSlug?: string },
): SearchLocation[]
```

For every location it returns today, it now returns the theme's mirror of that
location immediately before it. Concretely, for `themeSlug = 'neon'`:

| dirType | Locations today | Locations with a theme |
|---|---|---|
| NODE | `<nodeScreenDir>` | `Themes/neon/Node`, `<nodeScreenDir>` |
| CONF | `<confDir>`, `<confDir>/Screens` | `Themes/neon/Conf/<n>`, `<confDir>`, `<confDir>/Screens` |
| GLOBAL | `<baseDir>`, `<baseDir>/Screens` | `Themes/neon/Board`, `<baseDir>`, `<baseDir>/Screens` |

A theme entry whose directory does not exist is dropped from the list, the way
`listScreenDirectories` drops a directory that is not there
(`screen-index.service.ts:253`). **Only the theme entries are filtered.** The
board's own entries are returned unconditionally, exactly as today - the
function does not check them now (`screen-resolution.ts:191-213`) and adding a
check would change what the no-theme case returns, which the pin forbids.

**Why one function and not a second system.** Both inner ladders already
iterate `searchLocations` - the security walk at `screen.handler.ts:1203-1207`
and the variant walk at `:1231-1233`. Adding directories to the list gives the
theme dimension to BOTH, in one order, from one change in one place. The admin's
`/api/screens/resolve` calls the same function (`screens-routes.ts:156`), so
the manager's answer and the caller's experience cannot drift - which is the
stated reason `screen-resolution.ts` exists at all (`:9-13`).

**When `themeSlug` is absent or `'default'`, the returned list is identical to
today's** - same entries, same `dir` and `desc`, same order. That is asserted
by a test, not assumed.

### The full precedence order

For a screen `S`, a caller with security level `L`, theme `T`, and a session
whose format flags are `petsciiMode` / `ripMode` / `terminalType`:

```
for each directory D in screenSearchLocations(S, {node, conf, theme: T}):
      # theme's mirror of a scope, then the scope itself, in express.e's order
  1. findSecurityScreen(D/<stem>, L, ...):
       for level V in [floor(L/5)*5, ..., 5]:
         .SEQ (petscii) -> .RIP (rip) -> <caller screen type> -> .TXT
       then the base name, same format order
  2. for each name N in filenameVariations(S, session):
       findCaseInsensitive(D, N)
       # N covers _C64.seq, .seq, .SEQ, .rip, .txt, .TXT, .logoff, ...

if nothing resolved and T is not the board default:
   nothing further happens - the board-scope directories were ALREADY in the
   list above, so the fallback to the default theme has already occurred.
```

**The fallback to the default theme is not a second pass.** It is the tail of
the same list. That is what makes decision 4 free: a theme with one file in it
resolves that one screen and every other screen resolves exactly as it does
today, in one walk, with no second resolver to keep in step.

**A non-default theme never removes a screen.** A theme cannot delete; it can
only shadow. If `Themes/neon/Node/` is empty, a `neon` caller sees the board.

### The arms that bypass the directory list

`loadScreenFile` has arms that never reach `screenSearchLocations`: an
absolute filesystem path (`screen.handler.ts:1046-1052`), an Amiga assign
(`:1053-1064`), and a slash-bearing relative path (`:1066-1075`). All three
push onto `paths[]` and are tried at `:1277-1349`.

This matters because that is how includes arrive. `~SS_` passes its target
straight to `displayIncludedScreen` -> `displayScreen` -> `loadScreenFile`
(`screen.handler.ts:546-553`, `:389-418`), and `~SR_` resolves `WORK:`/`BBS:`/
`SCREENS:` to an ABSOLUTE path before it does the same (`:565-589`). A themed
`MENU.TXT` that includes `~SS_BBS:Screens/subhead.txt` would reach outside its
theme.

**Rule: `themedPath()`, a board-relative mirror.** Before the `paths[]` loop
runs, each candidate path that lies inside the board root is offered a themed
twin, tried first:

```
themedPath(baseDir, slug, abs):
  rel = relative(baseDir, abs)          # 'Screens/subhead.txt'
  if rel escapes baseDir: return null   # outside the board: no theme mirror
  return join(baseDir, 'Themes', slug, 'Files', rel)
```

`Themes/<slug>/Files/` mirrors the board root verbatim, so
`~SS_BBS:Screens/subhead.txt` finds `Themes/neon/Files/Screens/subhead.txt`
when the theme carries one and the board's own file when it does not. The
existing extension-swap ladder at `:1315-1320` runs against the themed
candidate first and then the original, unchanged.

`Files/` is a fourth directory in the theme tree beside `Node/`, `Conf/` and
`Board/`. It is for path-shaped references only; a screen resolved by NAME
never looks there.

**A `~SR_` pool is themed file by file, and that is correct here.** The draw
is a random NUMBER, not a directory read: `~SR_` picks `1..maxCount` and
builds `NNN.<basename>` from it (`screen.handler.ts:582-584`), and a number
with no file behind it simply resolves to nothing, exactly as it does today.
So `themedPath` applies to the chosen path like any other: a theme that
carries `Files/Screens/reference-board/003.reference-board.txt` replaces that one member
and leaves the rest of the pool as the board's. A half-themed pool is what an
artist gets and what they asked for, because they replaced three of the
twelve. (`numberedPool` at `screen-index.service.ts:479-493` is the INDEX's
analysis of the same pool, not the loader's picker, and it learns the theme's
directory so the manager can list both halves.)

### Worked example 1 - a C64 caller, partial theme

Caller: `terminalType='c64'`, `petsciiMode=true`, secLevel 30, node 1,
conference 1, theme `neon`. Theme has `Node/BBSTITLE.SEQ` and nothing else.
Screen requested: `LOGON` (dirType NODE, `screen-resolution.ts:58`).

Directories, in order: `Themes/neon/Node`, then `<nodeScreenDir>` (which on
this board is `Screens/Node/` via the `SCREENS` tooltype,
`seed-node-screens.ts:11-17`).

1. `Themes/neon/Node`: `findSecurityScreen` walks levels 30, 25, 20, 15, 10, 5
   then base, trying `.SEQ` first at each. Nothing. Then `filenameVariations`,
   which for a C64 PETSCII session is `addPetsciiVariants('LOGON_C64')`
   (`screen.handler.ts:1191`): `LOGON_C64.seq`, `LOGON_C64.SEQ`, `LOGON_C64`,
   `LOGON_C64.txt`, ... Nothing.
2. `Screens/Node`: `findSecurityScreen` tries `LOGON30.SEQ`, `LOGON30.RIP`,
   `LOGON30.TXT`... down to `LOGON20.SEQ`, and lands on `logon20.txt`
   (the board has `Node1/logon20.txt`). **Result: the board's level-20 logon,
   exactly as today.**

Same caller, screen `BBSTITLE`:

1. `Themes/neon/Node`: `findSecurityScreen` finds nothing (no numbered
   variants). `filenameVariations` for BBSTITLE takes the special case at
   `screen.handler.ts:1172-1179` - `petsciiMode` is true, so
   `addPetsciiVariants('BBSTITLE')` -> `BBSTITLE.seq` -> **found**, case-
   insensitively, as `Themes/neon/Node/BBSTITLE.SEQ`.

So the caller gets neon's title screen and the board's everything-else. That
is decision 4, working, with no second resolver.

### Worked example 2 - an 80-column caller, conference screen

Caller: web ANSI, secLevel 255, node 3, conference 2, theme `neon`. Theme has
`Conf/2/MENU.TXT`. Screen requested: `MENU` (dirType CONF,
`screen-resolution.ts:73`).

Directories: `Themes/neon/Conf/2`, then `conferenceDir(baseDir, 2)`, then
`conferenceDir(baseDir, 2)/Screens` (`screen-resolution.ts:201-207` - the
directory `LOCATION.2` names, never `Conf2` derived from the number).

1. `Themes/neon/Conf/2`: `findSecurityScreen(.../MENU, 255)` walks 255, 250,
   ... At each level: no `.SEQ` (not PETSCII), no `.RIP` (not RIP), the
   caller's screen type from `ScreenTypes.info`, then `.TXT`. Levels 255 down
   to 5 miss; the base name hits `MENU.TXT`. **Result: neon's menu.**

Note what this example demonstrates and the validator must guard: if the board
had a `MENU250.TXT` and neon has only `MENU.TXT`, neon's base file wins,
because the whole security walk for the theme directory completes before the
board directory is tried. See Risk 1.

### Worked example 3 - no theme, and the pin

Caller: any, theme absent or `default`. `screenSearchLocations` returns the
same array it returns today, element for element, `dir` and `desc` identical.
Both inner loops see the list they see today. Every byte on the wire is the
byte on the wire today. This is asserted by the fixture pin described in
"Testing".

---

## The index and its caches

`buildScreenIndex` (`screen-index.service.ts:606`) answers "where does each
screen resolve, per scope, and what reads each file". A theme adds directories
and a dimension to that answer.

**Directory enumeration.** `listScreenDirectories` (`:222-254`) adds the board
root, `Screens/` and its immediate subdirectories, each node and conference and
their `Screens/`, plus tooltype targets. Note `addTree` (`:225-234`) descends
exactly ONE level: it adds `dir` and its immediate subdirectories, nothing
deeper. A theme tree is three levels deep (`Themes/neon/Conf/2`), so it needs
its own enumeration, not `addTree(Themes)`. The new enumeration walks the
registry - the themes the board DECLARES, not the directories on disk - for
the same reason `confIds` reads `ConfConfig.info` rather than the disk
(`:206-215`): a deleted theme leaves its directory behind on purpose.

**`ScopeResolution` gains a theme.** Today it is
`{ scope, id, dir, dirIsShared, file, variants }` (`:115-126`). It gains
`theme: string` - the slug whose directory answered, or `'default'`. The
manager can then say "conference 2's MENU comes from neon" rather than showing
a path the sysop has to decode.

**`ScreenIndexEntry.resolutions` is now per scope AND per theme.** A board with
four themes and five conferences has twenty conference resolutions for MENU.
That is a real cost and it is bounded by the registry, not by the disk: only
themes with `STATUS=live` or `draft` are indexed, and a board with one theme
indexes exactly what it indexes today.

**`factsCache` needs no new key and must not get one.** It is keyed on a
file's own absolute path, mtime and size (`:508`, `:513-518`), and a theme file
is a different absolute path from a board file. Two themes' `MENU.TXT` are two
entries. The invalidation bug this cache already carries is documented at
`:827-838`: a fact like `resolves` on an MCI reference is a fact about a
DIFFERENT file, so `invalidateScreenIndex()` clears the whole facts cache. That
rule extends unchanged - and it now has a second reason to hold, because
whether a theme's `~SS_` target resolves depends on which theme is being
resolved for.

**`getScreenIndex`'s cache key** is the mtime of every screen directory joined
(`:813-824`). It gains the theme directories and `Themes.info`'s own mtime and
size. Without the registry in the key, adding a theme would not rebuild the
index, because adding a registry line touches no screen directory.

**Cost.** `screenFileFacts` sha256s and MCI-parses every file (`:521-553`).
The board has ~891 files under its screen directories
(`mci-references.ts:5-6`). A theme adds its own files, and the same mtime-and-
size cache covers them. A board with four full themes roughly quadruples the
first build and changes nothing about subsequent ones.

---

## The per-caller preference

### Where the truth lives

**SQL, as `screentheme`, beside `themepreference`.** Not `user.data`.

This looks like it contradicts the project's standing rule that the board reads
user state from disk with SQL as a mirror. It does not, and the reason is
already written down in this repo. `database.ts:389-395`, adding
`themepreference`, states:

> Web-only, and deliberately NOT in user.data: that file's layout has to stay
> byte-compatible with real AmiExpress, and a door theme is not something
> express.e has ever heard of.

A screen theme is in the same class. `user.data` is a fixed-layout Amiga struct
(`web/backend/src/services/UserFileManager.ts:19-75`) whose fields are
express.e's fields; its unused INTs are unused *as far as this port knows*, and
claiming one would make the board's user file incompatible with the real thing
for a cosmetic setting. The `unused[86]` tail of `user.misc`
(`UserFileManager.ts:114`) is the same bet with a bigger blast radius.

So: an inline `ALTER TABLE users ADD COLUMN screentheme TEXT DEFAULT NULL`
guarded by a column-name check, exactly the shape at `database.ts:384-396`,
carried to camelCase on read the way `themePreference` is
(`web/backend/src/database/user-repository.ts:237`), and typed beside it
(`web/backend/src/database/types.ts:83`).

`NULL` means "the board default", not `'default'` - so a sysop who changes
`DEFAULT=` in the registry moves every caller who never chose, which is what a
board default is for.

**What this costs, stated plainly:** a database rebuild loses every caller's
screen-theme choice and they fall back to the board default. That is exactly
what a database rebuild does to their door theme today. It is an accepted cost
of the same decision, not a new one - see "Open decisions" if the sysop wants
it otherwise.

**Board default:** `DEFAULT=<slug>` in `Themes.info`. On disk, because it is
board configuration; the sysop sets it in the admin, and a reseeded volume
keeps it.

### Resolving a caller's theme

One function, `resolveCallerTheme(session)`, and every caller of the loader
goes through it:

1. No user on the session (the await screen, the login prompt, `BBSTITLE`
   before anyone has typed a name): the board default. Pre-login art is board
   art. The loader is already written for a session with no user
   (`screen.handler.ts:1033`).
2. `user.screentheme` is NULL: the board default.
3. The slug is not in the registry, or its directory is gone: the board
   default, and one line in the log keyed on the slug so a busy board does not
   repeat it. A cosmetic setting is never the reason a caller sees no screen -
   the rule `getTheme()` already states for door themes
   (`BBSApi.ts:706-711`).
4. `STATUS` is `draft` or `review` and the caller is neither its `OWNER.n`
   nor a sysop: the board default. An unpublished theme is visible only to the
   person making it and to a sysop reviewing it.
5. Otherwise the slug.

### Picking one

The picker mirrors THEMEC's shape, which is the settled decision. Two
surfaces, both thin over one backend list:

- **A `SCREENTHEME` command**, a TypeScript door in `Doors/screen-theme-picker/`
  built from `Doors/theme-picker/app.ts`, which already draws a themed list,
  handles the 40-column case, and persists through one call
  (`Doors/theme-picker/app.ts:228-245`). It lists themes whose `STATUS` is
  `live` (plus the caller's own drafts), filtered to those whose `WIDTHS.n`
  includes the caller's width, and writes through a new
  `bbs.setScreenTheme(slug)` on `BBSApi` modelled on `setTheme`
  (`BBSApi.ts:734-744`) - resolved before it is stored, so an unknown slug is
  refused rather than written.
- **The admin's own account page**, for a sysop or artist previewing as
  themselves.

**A screen theme takes effect on the next screen the board draws**, not
mid-screen. `setTheme`'s reasoning applies unchanged (`BBSApi.ts:730-733`):
a screen already on the wire was composed against the old theme.

---

## The artist role

### What exists, and what does not

**There is no role concept in this codebase.** Gating is a numeric `secLevel`
carried in the JWT (`web/backend/src/database.ts:2795-2803`, claims
`{ userId, username, secLevel }`) and checked by two middlewares:
`requireSysop()` at 255 (`web/backend/src/middleware/auth.middleware.ts:49-63`)
and `requireLevel(n)` (`:72-85`). Admin login needs level 10
(`web/backend/src/handlers/user/auth.handler.ts:65`). The screens API is
mounted at level 100:

```ts
app.use('/api/screens', authenticateToken(db), requireLevel(100), screensRouter);
```

(`web/backend/src/server/routes-setup.ts:153`.) The router itself carries no
gating - every route is registered bare (`screens-routes.ts:36`, and the
fourteen registrations at `:89, 117, 150, 262, 306, 356, 392, 447, 478, 576,
618, 680, 691, 705`).

The frontend mirrors it: `screens` has `minLevel: 100`
(`web/config-app/src/components/AppShell/nav-config.ts:80`) and is one of only
two routes not wrapped in `SysopRoute` (`web/config-app/src/App.tsx:105`).
`ADMIN_SECTIONS` gives `screens` `defaultMinLevel: 100`
(`web/backend/src/handlers/admin/admin-permissions.handler.ts:22`), overridable
on disk through `AdminPermissions.json` (`:34-69`).

**So today, any account at level 100 or above can read, overwrite, rename,
delete, upload over and share-directory every screen file on the board.** That
is the starting point this feature has to improve, not preserve.

### The design: capability from ownership, not a new role

**An artist is a level-100 account named as `OWNER.n` of at least one theme.**
No new column, no new JWT claim, no parallel auth system. The sysop grants by
writing one line in `Themes.info` and revokes by removing it - the same file,
the same editor, the same tracked sync as every other board configuration
icon.

**The gate that constrains them is a new per-request path authoriser inside
`screens-routes.ts`**, not a new mount. It has to be per-request because the
mount-level middlewares this codebase has (`requireLevel`, `requireSysop`)
answer a question about the CALLER; the question here is about the caller AND
the path, and no mount can express it.

```ts
/** The board-relative prefixes this caller may WRITE. Empty means none. */
export function writableRoots(user: { username: string; secLevel: number }): string[]
```

- `secLevel >= screens-full` (a new key in `ADMIN_SECTIONS`
  (`admin-permissions.handler.ts:13-31`), `defaultMinLevel: 255`, overridable
  in `AdminPermissions.json` like every other section):
  `['']` - the board root, today's behaviour, unchanged for sysops.
- otherwise: one entry per theme whose `OWNER.n` matches the username, being
  that theme's `DIR.n`. An account owning nothing gets `[]`.

Every mutating route calls one guard before it touches disk. Concretely, and
this is the whole permission model:

| Route | Artist | Sysop |
|---|---|---|
| `GET /` (`:89`) | allowed, unfiltered | allowed |
| `GET /file` (`:117`) | allowed, any path in the board root | allowed |
| `GET /resolve` (`:150`) | allowed | allowed |
| `GET /revisions`, `GET /revision` (`:680`, `:691`) | allowed, any path | allowed |
| `GET /export` (`:576`) | allowed | allowed |
| `PUT /file` (`:262`) | every entry in `targets` must be under a writable root, else 403 naming the first offender | allowed |
| `DELETE /file` (`:356`) | writable root only | allowed |
| `POST /upload` (`:392`) | writable root only | allowed |
| `POST /repair` (`:306`) | writable root only | allowed |
| `POST /restore` (`:705`) | writable root only | allowed |
| `POST /import` (`:618`) | **refused, always** - it writes an archive's worth of paths | allowed |
| `POST /share` (`:478`) | **refused, always** - it rewrites a node's `SCREENS` tooltype | allowed |
| `Themes.info` writes (activation, ownership, `DEFAULT=`) | **refused, always** | allowed |

**Reads are deliberately unrestricted.** Decision 3 says an artist may read the
default theme to copy from; the simplest rule that satisfies it is the rule
that already holds - level 100 reads the board. Restricting reads would mean
filtering the index, the gallery, the revisions panel and the export, for a
board whose screens are shown to callers anyway. Named as an open decision in
case the sysop disagrees.

**`PUT /file`'s fan-out is where this bites hardest and it is handled.** The
body carries `targets: string[]` and writes every one (`screens-routes.ts:274`,
`:192-220`), and `writeToTargets` is all-or-nothing with a restore on failure
(`:210-216`). The guard runs over the WHOLE target list before the first write,
so an artist cannot smuggle `Screens/MENU.TXT` in beside their own file and
have it half-applied.

**Backups and revisions still work for an artist.** `saveRevision(rel)` is
called inside `writeToTargets` (`:203`) and writes to
`Screens/.Revisions/<flattened path>/` (`screen-revisions.ts:14-18`). A theme
file's revisions land there too, flattened, and `POST /restore` writes back to
the original path - which the guard checks. Nothing about the revision store
needs to move; note only that it lives under `Screens/`, so
`FORCE_REINIT_SCREENS=1` destroys every theme's history along with everything
else (Risk 5).

### What this changes for accounts that exist today

An account at level 100..254 that owns no theme goes from full write access to
none. On the dev database the only levels present are 10, 30 and 255, and the
ACS levels on disk are 10, 20, 50, 60 and 255
(`web/backend/src/services/config-services/acs-level-file.service.ts:21`,
`:30`). **Pre-flight for the implementation: count accounts in [100, 254] on
the live board before this lands.** If any exist, they are given a theme or a
level, deliberately, by the sysop - never silently.

---

## The artist's workflow

**Create.** The sysop, in the admin, adds a theme: title, author, owner
username, widths, optional companion door theme. The backend writes the
registry entry with `STATUS=draft` and creates `Themes/<slug>/` with its four
scope directories. The artist cannot create a theme; creating one grants
write access, and granting access is a sysop act.

**Edit.** The artist logs into the admin at level 100 and lands on
`/admin/screens` (`App.tsx:105`; a non-sysop is redirected there by
`SysopRoute`). A new theme selector at the top of the page scopes the whole
view to one theme: the resolutions table shows, for each screen, whether this
theme provides it or falls through to the board, and the gallery shows the
theme's own files. Editing is the editor that exists - `ScreenEditor` over
`AnsiCanvas`, loading through `screenToCanvas` and saving through
`canvasToScreen` (`web/config-app/src/pages/screen-bytes.ts:65-73`) - with no
change except the path it writes to.

**Copy from the default.** A "Start from the board's version" action on any
screen the theme does not yet provide: `GET /api/screens/file` on the resolved
default path, then `PUT /api/screens/file` at the theme path. Both routes exist;
the action is a two-call composition in the page, and it is the concrete form
of decision 3's read access.

**Preview.** See below. The artist previews as a caller of a chosen width,
security level, node and conference, at any time, without publishing.

**Submit.** The artist flips their theme to "ready for review" - a third
`STATUS` value, `review`, which they MAY set (it is a fact about their own
theme) and which changes nothing for callers. The sysop sees a queue.

**Activate.** The sysop reviews the validation report, previews, and sets
`STATUS=live`. Only then does the theme appear in the caller-facing picker.
Optionally the sysop sets `DEFAULT=<slug>`, which moves every caller who never
chose. Both are `Themes.info` writes and both are sysop-only.

**Retire.** `STATUS=draft` takes it out of the picker; callers who had it
resolve to the board default at their next screen. The files stay on disk. A
theme directory is never deleted by the board.

---

## Preview

**Preview means: run the real resolver and the real render path against a
synthetic session, and put the resulting bytes on a terminal.** Anything less
re-implements the resolver in the browser, and a writer and a reader each
holding their own copy of one rule is the fault `screen-resolution.ts:9-13`
was written to end.

**Backend:** `GET /api/screens/preview?screen=<S>&theme=<slug>&node=<n>&conf=<n>&sec=<L>&term=ansi|c64|rip`

It builds a `BBSSession`-shaped object with `terminalType`, `petsciiMode`,
`ripMode`, `screenWidth`, `screenHeight` and a `user` carrying `secLevel` and
`screentheme`, calls `loadScreenFile` (`screen.handler.ts:985`) and then
`parseMciCodes` (`:615`) against it, and returns the bytes base64 with the
resolved path, the theme that answered, and the search list. It is the same two
functions the board calls; nothing is reimplemented.

Two constraints that make it safe to expose:

- The synthetic session's socket is a sink. `parseMciCodes` has side effects -
  `~CC_` runs a command (`:530-543`) and `~SS_`/`~SR_` recurse
  (`:546-592`). The preview session sets a flag that makes `~CC_` render its
  own token rather than execute, and caps include depth at 1. A preview must
  not run a door.
- `sec` is clamped to the requesting account's own `secLevel`. An artist may
  not preview screens their level would never be served; the security variant
  is content, and content the board withholds stays withheld.

**Frontend:** `web/config-app/src/components/ScreenPreview.tsx` already exists,
already builds an 80x25 xterm with `convertEol` and writes raw content
(`:30-39`), and is dead - nothing imports it, and nine tests mock the import
that is no longer there. Its own header explains it deliberately does not strip
cursor movement, which is precisely what "as a caller meets it" requires. It is
revived rather than rewritten.

For a 40-column PETSCII preview, `packages/terminal` already exports
`PetsciiCanvas`, a real 40x25 C64 surface with the Colodore palette; it is a
declared dependency of the config-app (`web/config-app/package.json:16`) and
imported by nothing. It is imported here.

This closes the gap the screen-file-manager spec left open: it designed a
preview through a terminal and RIPtermJS
(`docs/superpowers/specs/2026-09-01-screen-file-manager-design.md`), the build
substituted a canvas cell re-render, and RIP and PETSCII show a text apology
(`web/config-app/src/pages/ScreenFilesPage.tsx:1033-1039`). RIP preview stays
out of scope; ANSI and PETSCII do not.

---

## Validation

Partial themes are allowed, so validation cannot be "is every screen present".
It is: **can this theme be selected without breaking a caller.** A pure
function over the index and the registry, run on every save and shown in the
admin, and required to pass before a sysop may set `STATUS=live`.

**Blocking - a theme with any of these cannot go live:**

1. **A file that is not a screen file.** `isScreenFile()`
   (`screen-resolution.ts:34-41`) is the test. A `.png` in a theme directory is
   a mistake, not art the board can serve.
2. **A file with a `problem`.** `fileProblems` reports `empty` and
   `colour-codes-without-escape` (`screen-index.service.ts:113`, `:380-402`).
   An empty screen is a blank screen for a caller; a screen with the ESC bytes
   eaten prints its own colour codes. `POST /repair` fixes the second
   (`screens-routes.ts:306`).
3. **An unresolved MCI reference.** `parseMciReferences` finds `~CC_`, `~SS_`,
   `~SR_` and `~CL.` (`mci-references.ts:68-71`) and the index resolves each
   (`screen-index.service.ts:527-539`). A `~CC_` naming a door this board does
   not have is a menu item that fails only when a caller presses the key -
   which is exactly the case for an artist who drew their menu on a board that
   had DOORMAN installed. Reported per file, per code, with the target named.
4. **A scope-specific reference.** `SCOPE_SPECIFIC` matches `Node<n>` or
   `Conf<n>` inside a target (`mci-references.ts:39`). A theme is board-wide;
   a theme file that includes `~SS_BBS:Node1/x.txt` gives every node node 1's
   content. This is the same precondition `share-preconditions.ts:1-17` already
   enforces for directory sharing, applied for the same reason.
5. **A base file that shadows a security variant.** If the theme provides
   `<screen>.<ext>` for a screen whose default resolution has security
   variants (`ScopeResolution.variants`, `screen-index.service.ts:124-125`)
   that the theme does not also provide, the theme's base file wins for every
   caller at those levels and the differentiated content is lost. Reported as
   "neon's `LOGON.txt` will be shown to level-100 callers instead of the
   board's `Logon100.txt`", with the fix being: provide `Logon100.txt` in the
   theme, or delete the theme's `LOGON.txt`. This is Risk 1 turned into a
   blocked activation.

**Advisory - reported, never blocking:**

6. **A declared width with no evidence.** `WIDTHS.n` includes `40` but the
   theme carries no `.seq` and no `_C64` file: a C64 caller will see the
   board's art everywhere. Advisory because falling through to the default IS
   the designed behaviour.
7. **A SAUCE record declaring a width above 80.** Read already
   (`screen-index.service.ts:271-307`). 80-column art served to a C64 wraps;
   see Risk 3.
8. **Coverage.** "37 of the board's 44 screens; 7 fall through to reference-board."
   A number, not a gate.

---

## The deploy story

The volume behaviour is measured, not assumed. What follows is what happens on
the next `git push` after this lands.

### What is already true

- One named volume, one mount: `bbs-data:/app/data` (`docker-compose.yml:37-39`, `:136-138`), with
  `BBS_DATA_DIR=/app/data/bbs`.
- `/app/default-data` is image-only and built by `COPY` in the `Dockerfile`,
  with `Screens` copied at `Dockerfile:314` and collapsed into
  `Screens/Node/` by a build step (`Dockerfile:421`,
  `seed-node-screens.ts:101-105`).
- The always-run sync is `docker-entrypoint.sh:605-632`: `tar cf - | tar xf -`
  from image to volume for `Doors Screens Libs C`. Writes only; deletes never.
- The tracked class is `sync_tracked` (`:181-275`), driven by a manifest, and
  is what `Commands/` uses (`:636-645`) and what `TRACKED_INFO` (`:129`) uses
  for the root config icons including `ScreenTypes.info`.
- `FORCE_REINIT_SCREENS=1` does `rm -rf` on the volume's `Screens` and on every
  conference's `Screens` (`:530-554`). It defaults to `0`.
- **The deploy backs up nothing under `Screens/`.** The two backup steps in
  `.github/workflows/deploy-hetzner.yml` cover `*.info`/`*.info.txt` and door
  data (`.db`, `.sqlite`, `*scores*.json`, `.dat`, `*/data/*`). A `.txt` or
  `.ans` matches neither filter.

### What this feature does about it

1. **`Themes/` is created on first run** and added to the entrypoint's
   first-run seeding list (`docker-entrypoint.sh:502`) and to a repair check
   beside the existing `Screens` repair (`:522-527`).
2. **`Themes/` is NOT added to the `tar cf -` loop at `:605`.** A theme the
   image ships goes through `sync_tracked` instead, file by file, the way
   `Commands/` does. That is the only sync class whose semantics fit
   shipped-but-editable art: the image leads until somebody edits a file, then
   the edit survives every subsequent deploy, and a deletion outlasts deploys
   too.
3. **`Themes.info` joins `TRACKED_INFO`** (`:129`).
4. **`FORCE_REINIT_SCREENS` is not extended to `Themes/`.** Deliberately: it is
   an emergency reset for the board's own art, and it must not be able to
   delete an artist's work as a side effect. A separate, explicitly named
   `FORCE_REINIT_THEMES` is NOT added either, because nothing needs it.
5. **A backup step for artist work is part of this feature.** A third snapshot
   in `deploy-hetzner.yml`, beside the two that exist, tarring `bbs/Themes` and
   `bbs/Screens` from the volume, twenty generations kept, the same shape as
   the existing config snapshot. **Screen art has never had a deploy backup;
   this feature is the first thing that makes that a data-loss risk worth
   paying for, and it pays for it.**
6. **The `Dockerfile:473-476` name trap is documented in the artist README.**
   That `RUN find` deletes, from the image, every file whose name matches
   `-iname '*log'` with no dot - so a shipped theme file named `catalog` or
   `dialog` (no extension) never reaches a board. It affects image-shipped
   themes only; an artist's own files never pass through the image.

### What happens to an artist's uploaded work on the next deploy

Traced through the entrypoint, for `Themes/neon/Node/BBSTITLE.SEQ` created at
runtime:

- First-run seeding (`:502-505`) is skipped: `.initialized` exists.
- The `Screens` repair (`:522-527`) does not name `Themes`.
- `FORCE_REINIT_SCREENS` (`:530`) does not name `Themes`.
- The tar loop (`:605`) does not name `Themes`.
- `sync_tracked` over a shipped theme's file list never names it, because the
  image ships no `Themes/neon/`.
- No prune covers it: the only pruners are `prune_image_door_dists`, guarded on
  `Doors`, and a hardcoded `ORPHANS` list.

**It survives, untouched, and is now backed up.** That is the answer, and it
holds because `Themes/` is image-absent for artist themes and tracked for
shipped ones - the two cases that would otherwise collide are separated by
construction rather than by care.

---

## Migration

**Nothing moves. No file is copied, renamed, or rewritten.**

1. `Themes.info` is created with one entry: `TYPE.0=default`, `DIR.0=` (empty),
   `STATUS.0=live`, `WIDTHS.0=80,40`, and `DEFAULT=default`. `TITLE.0` is the
   board's own name, seeded from `bbsConfig` and editable.
2. `users.screentheme` is added as `NULL` for everyone, which resolves to the
   board default, which is `default`, whose `DIR` is empty, for which
   `screenSearchLocations` prepends nothing.
3. `Themes/` is created empty.

Today's callers see today's bytes because they run today's code path. The pin
in "Testing" proves that mechanically rather than by reading the diff.

**The board's existing art is never "the default theme's directory".** It is
the board's directories, which the default theme names by naming none. An
artist copying from the default reads `Screens/Node/LOGON.txt`, not a copy of
it, so there is no second generation to drift.

---

## Testing

### The byte-identity pin - the gate this feature passes or does not ship

The board's current appearance must be provably unchanged. The repo already has
the mechanism: `web/backend/tests/handlers/mci-dispatch-ansi-pin.test.ts`
snapshots rendered bytes to a JSON fixture generated on the PRE-change tree,
pins the clock, the database, `Math.random`, the stats service, the conference
list and the flagged-file queue, and asserts byte-for-byte afterwards.

`tests/screens/theme-default-identity-pin.test.ts` follows it exactly:

- The fixture is generated on the pre-change tree and committed BEFORE the
  resolver change lands.
- For every screen in `SCREEN_DIR_MAP` (`screen-resolution.ts:53-92`) crossed
  with: security levels 0, 20, 100, 255; sessions ANSI / PETSCII / C64-PETSCII
  / RIP; nodes 1 and 3; conferences 1 and 2 - the fixture records
  `loadScreenFile`'s resolved `filePath` and the sha256 of its `content`.
- After the change, with no theme, every entry must match.
- With `themeSlug='default'`, every entry must match.
- `screenSearchLocations()` with no `themeSlug` must deep-equal
  `screenSearchLocations()` on the pre-change tree, `dir` and `desc`, in order.

**Regenerating is only ever for a deliberate, reviewed appearance change**,
under an env guard, the way the MCI pin documents it.

### Resolver tests

Driven through `loadScreenFile` against a fixture board on disk, the way
`tests/handlers/screen-express-e-directories.test.ts` already does - so a
regression fails in the resolver, not in a caller's screen.

- A theme with one file serves that file and falls through for every other.
- A theme file is preferred over the board's file of the same name, in each of
  NODE / CONF / GLOBAL.
- A C64 session on a theme with `_C64.seq` gets it; the same theme with only
  `.seq` still serves the `.seq`; with neither, the board's file.
- A theme's `Logon100.txt` is served to a level-100 caller and its `LOGON.txt`
  to a level-20 caller.
- **The shadowing case, asserted as it actually behaves:** a theme with only
  `LOGON.txt` IS served to a level-100 caller in preference to the board's
  `Logon100.txt`. The test pins the documented behaviour so the validator's
  rule 5 has something true to guard.
- `~SS_BBS:Screens/x.txt` from a themed screen finds
  `Themes/<slug>/Files/Screens/x.txt` when present, the board's when not.
- `~SR_` on a number the theme carries serves the theme's file; on a number
  it does not, the board's; on a number neither has, nothing - unchanged.
- A theme whose directory is missing resolves entirely to the board.
- A slug not in the registry resolves entirely to the board and logs once.

### Index tests

- Adding a registry line rebuilds the index (the cache key covers
  `Themes.info`).
- A theme file's facts are cached and invalidated on its own mtime/size.
- `invalidateScreenIndex()` clears `factsCache` (the existing assertion at
  `screen-index.service.ts:827-838` extended to a theme file whose `~CC_`
  target is installed after indexing).
- Two themes' identically-named files are two entries, not a duplicate group
  collision.

### Permission tests

Driven through the mounted router with a real JWT, not by calling the guard.

- An artist PUTs inside their theme: 200.
- An artist PUTs to `Screens/MENU.TXT`: 403.
- An artist PUTs with `targets: ['Themes/neon/Node/LOGON.txt', 'Screens/Node/LOGON.txt']`:
  403, and `Screens/Node/LOGON.txt` is byte-unchanged on disk.
- An artist DELETEs, uploads to, repairs and restores outside their theme: 403.
- An artist POSTs `/share` and `/import`: 403.
- An artist writes `Themes.info` through any route: 403.
- An artist GETs any screen file: 200.
- A sysop does all of the above: 200.
- An account at level 100 owning no theme: reads 200, every write 403.

### Preview tests

- The preview route returns the same `filePath` `loadScreenFile` returns for an
  equivalent real session.
- `~CC_` in a previewed screen does not run a command.
- `sec` above the requester's own level is clamped.

### Validation tests

One test per blocking rule, each named after the symptom: "refuses a theme
whose menu calls a door this board does not have", "refuses a theme whose base
logon would hide the board's level-100 logon", and so on.

---

## Risks

1. **A theme's base file shadows the board's security variant.** The security
   walk completes inside the theme directory before the board directory is
   tried, so a theme with `LOGON.txt` and no `Logon100.txt` serves its base
   file to level-100 callers and the board's sysop-only logon is never shown.
   Content lost to gain style, which is the wrong trade. Chosen anyway because
   the alternative - interleaving the two ladders, level by level, across
   directories - changes the order of every stat call inside
   `findSecurityScreen` and puts the byte-identity pin at risk for a case a
   validator can catch. Mitigated by validation rule 5, which BLOCKS
   activation and names both files. Residual: a sysop who adds a security
   variant to the board AFTER a theme goes live re-opens it silently, because
   nothing revalidates a live theme. The index rebuild is the hook to add if
   this bites.
2. **An artist locks themselves out with a broken screen.** They cannot: the
   admin app is HTTP and does not read screens, and the login path
   (`auth.handler.ts`) touches none. What they CAN break is a caller's
   experience of the BBS - a `MENU.TXT` with no visible commands leaves a
   caller staring at art with no way forward. Mitigations, in order of when
   they act: `STATUS=draft` means only the artist sees it; the empty-file and
   escape-byte checks block the two mechanical breakages; the preview shows
   the real bytes before anyone else sees them; a caller's own picker changes
   their theme back; and a sysop's `STATUS=draft` moves every caller off it in
   one write. NOT mitigated: a theme that is well-formed and unusable renders
   exactly as drawn. That is the deal, and it is the same deal
   `docs/superpowers/specs/2026-09-03-c64-file-view-design.md:1697-1706` makes
   for a sysop's own layout.
3. **80-column art served to a C64.** A theme declaring `WIDTHS=80` with no
   `.seq` files falls through to the board for a PETSCII caller, which is
   correct. The failure is subtler: a theme that ships a `.txt` the C64 path
   accepts as an ANSI fallback (`addPetsciiVariants` ends with `.txt`/`.TXT`,
   `screen.handler.ts:1144-1149`) and that `.txt` is 80-column art. The C64
   sees it wrapped. Mitigated by advisory validation rule 7 (SAUCE width) and
   by the preview's 40-column surface, which shows the wrap before a caller
   does. NOT mitigated automatically: art is never squeezed, which is the
   standing rule (`thoughts/shared/plans/2026-09-02-c64-40col-adaptation.md`,
   class B).
4. **A theme's MCI references a door that is not installed.** Blocking
   validation rule 3 catches it at activation. The re-opening case is real and
   named: `factsCache` holds `resolves` as a fact about a DIFFERENT file
   (`screen-index.service.ts:830-837`), so uninstalling a door after a theme
   goes live leaves the theme live with a dead menu key. The existing
   `invalidateScreenIndex()` on every write is the hook; door
   installation/removal must call it, and a test asserts that.
5. **`FORCE_REINIT_SCREENS=1` destroys the revision history of every theme.**
   Revisions live at `Screens/.Revisions/` (`screen-revisions.ts:7`) and that
   switch does `rm -rf "$BBS_DATA_DIR/Screens"` (`docker-entrypoint.sh:534`).
   The theme FILES survive (they are under `Themes/`); their history does not.
   Accepted rather than fixed, because moving the revision store is a change to
   a shipped feature outside this spec's scope - but it is documented in the
   artist README in the same paragraph that explains revisions, and the new
   deploy backup covers the files themselves.
6. **The volume, and the one way work is still lost.** `Themes/` is
   image-absent for artist themes, so the tar overlay never touches it, and a
   shipped theme goes through `sync_tracked` which keeps an edit. The residual
   hole is the window BEFORE the new backup step lands: today the deploy backs
   up nothing under `Screens/`, and until the third snapshot in
   `deploy-hetzner.yml` exists, a `docker volume rm` or a disk failure takes
   every artist's work with no copy anywhere. **The backup step must land in
   the same sub-project as the directory, not after it.** This is the risk most
   likely to actually lose an artist's work, because it is the one that does
   not announce itself.
7. **Index cost scales with themes.** `screenFileFacts` sha256s and MCI-parses
   every file (`screen-index.service.ts:521-553`), and the board is already at
   ~891 files. Four full themes roughly quadruple a cold build. Mitigated by
   the existing mtime-and-size cache, which makes every build after the first
   cheap, and by indexing only themes the registry declares. A board that adds
   themes faster than it adds callers will feel a slow first admin page load
   and nothing else.
8. **Two theme systems, one caller, still.** `DOORTHEME.n` makes a coherent
   board possible but not compulsory, and a caller who changes their door theme
   in THEMEC afterwards is mismatched again by their own hand. Accepted:
   unifying the two is a bigger project and the sysop has ruled it out for now.

---

## Open decisions - for the sysop, before implementation

These are places the design had to choose and the sysop has not. Each names
what was chosen and what changing it would cost.

**1. The preference lives in SQL, not on disk.** Chosen to match the argument
already written for door themes at `database.ts:389-395` - `user.data` has to
stay byte-compatible with real AmiExpress and a theme is not something
express.e has heard of. The cost: a database rebuild resets everyone's screen
theme to the board default, exactly as it would reset their door theme today.
The alternative is claiming bytes in `user.misc`'s `unused[86]` tail
(`UserFileManager.ts:114`) with a narrow byte-patch modelled on
`writeConferenceAccessAt` (`:1123-1137`), which survives a DB rebuild and
matches express.e's own `screenType` shape - at the price of a user file a real
Amiga would read differently.

**2. Reads are not sandboxed.** An artist can read every screen on the board,
which is the minimum decision 3 asks for ("may READ the default theme") and
also more than it asks for. Restricting reads means filtering the index, the
gallery, revisions and export. Say if an artist should see only their own
theme plus the default.

**3. Selecting a screen theme also sets the caller's door theme, when the
theme names one.** Chosen because a mismatched board is the visible failure and
this is the one-line fix that does not merge the two systems. The alternative
is to leave door themes strictly alone and accept the mismatch. There is no
prompt in either version - a prompt in the middle of a theme pick is worse than
either outcome.

**4. A theme is board-wide, never per-node.** An artist cannot theme node 3
differently from node 1. This follows from the board's own shape - the image
collapses every node's screens into one shared directory
(`seed-node-screens.ts:11-17`) - but it means a board that deliberately runs
differentiated nodes cannot express that through themes. Per-conference
differentiation IS supported (`Conf/<n>/`).

---

## Decomposition

Six sub-projects. Each gets its own implementation plan. Every one of them
ships working, testable software on its own.

**SP1 - the tree, the registry, and the volume.** `Themes/`, `Themes.info` and
its reader/writer built on `readTooltypeMap`/`applyTooltypes`, the slug rule,
the mtime-and-size cache, the entrypoint's first-run seeding and repair, the
`sync_tracked` path for shipped themes, `Themes.info` into `TRACKED_INFO`, the
third backup snapshot in `deploy-hetzner.yml`, and the artist README carrying
the `FORCE_REINIT_SCREENS` and `Dockerfile:473-476` warnings. Changes no
behaviour for any caller: nothing reads the registry yet. **The backup step
ships here, with the directory, not later** (Risk 6). Depends on nothing.

**SP2 - the resolver.** The `themeSlug` option on `screenSearchLocations`, the
`themedPath` rewrite for the absolute and assign arms, the `Files/` mirror, the
`~SR_` pool rule, and the byte-identity pin - whose fixture is generated and
committed BEFORE the resolver change in the same sub-project. All the resolver
tests. Needs SP1 for the registry only; can start against a hand-written
`Themes.info`. **This is the sub-project the whole spec turns on and it is
where the pin lives.**

**SP3 - the index.** Theme-aware `listScreenDirectories`, `theme` on
`ScopeResolution`, the registry in `getScreenIndex`'s cache key, the
per-theme resolutions, and the index tests. Needs SP2 (it calls
`screenSearchLocations` with a theme).

**SP4 - the preference and the picker.** The `screentheme` column and its
inline migration, `resolveCallerTheme`, `DEFAULT=` in the registry,
`bbs.setScreenTheme` on `BBSApi`, the `SCREENTHEME` door built from
`Doors/theme-picker/app.ts`, its `.info` registration, and the `DOORTHEME.n`
companion rule. Needs SP2. After this, a caller can wear a theme; nobody can
make one through the admin yet.

**SP5 - the artist sandbox.** `writableRoots`, the per-request guard on the
seven mutating routes, the `screens-full` key in `ADMIN_SECTIONS`, the
ownership
lookup, the account-level pre-flight count, and the permission tests. Needs
SP1 (the registry holds `OWNER.n`). Independent of SP2-SP4 and can run beside
them: it changes who may write, not what resolves.

**SP6 - the admin surface, preview and validation.** The theme selector on
`/admin/screens`, the theme-scoped index view, "start from the board's
version", the sysop's create/activate/retire actions, the review queue,
`GET /api/screens/preview`, reviving `ScreenPreview.tsx` and importing
`PetsciiCanvas`, and the validator with its five blocking and three advisory
rules. Needs SP3 (the theme-aware index is what it renders) and SP5 (it must
show an artist only what they can act on). **Before this lands, check the
three broken links this page already has** - `/api/screens/mci/catalog` and
`/api/screens/mci/targets` are called by `MciPicker` and have no backend
route, and `src/test/screen-repair-all-and-flag.test.tsx` is red on this
branch - because a new page built on that surface inherits them.

**Suggested order.** SP1 first, alone. Then SP2. Then SP3 and SP5 in parallel
(different files, no shared surface), with SP4 alongside them. SP6 last, and
it is the largest.

**Sequencing note.** Nothing before SP4 changes a single byte for any caller:
SP1 adds an empty directory and an unread file, SP2 adds an unused parameter
whose absent value is pinned identical, SP3 changes an admin-only index, and
SP5 changes who may write. SP4 is the first caller-visible change and it is
opt-in per caller. SP6 is the first thing an artist can actually use, and until
it lands a theme is made by putting files in a directory and editing an icon -
which is a real, if unglamorous, working state, and the honest thing to say
about it.
