---
date: 2026-09-06
topic: The 40-column file record - a C*Base-native list row, a description-first single record, and a sysop-editable layout
tags: [c64, petscii, 40-col, files, file_id.diz, cbase, mci, layout-as-data, doorserver, contract, adapter, architecture, umbrella]
status: draft
---

# The C64 file view - design

This is the UMBRELLA spec for what a file record looks like on a 40-column
screen, on BOTH paths that can print one: the board's own file listing and a
68K file-lister running through the C64 door adapter. It fixes the data model,
the extractor contract, the layout language and the decomposition; it is not
itself an implementation plan. Seven sub-projects follow (section
"Decomposition").

## Revision note - 2026-09-06

Revised from the 2026-09-03 draft after two research passes and two decisions
from the sysop. What changed, and why:

1. **The LIST is now one row per file, C*Base-native** - number, size, marker,
   new-file flag, filename, date at fixed columns, twenty-plus records per
   screen.
   The 2026-09-03 stacked block (group logo, description, then filename /
   version / size / date, roughly six records per screen) was the sysop's
   earlier call. It is NOT deleted: it becomes the SINGLE-RECORD view, where
   description-first costs nothing because there is one record on the screen.
   Evidence: `thoughts/shared/research/2026-09-06_cbase-reference-and-40col-listings.md`
   reconstructed the real C*Base listing from `bbs.bas`, `ml0123.a65`,
   `larry-bbs.bpp`, `ml1.o.asm` and the shipped prompt files. C*Base's own
   author paginates at 22 because a record is one row.
2. **The layout is DATA, not code.** C*Base keeps its listing layout in a
   sysop-editable prompt file built from MCI tab commands (`£t04`, `£t09`,
   `£t14`, `£t31`); a sysop re-columnises the listing with no rebuild. We adopt
   that, expressed in OUR MCI (`~`), with a new `~t<nn>|` column tab and a
   scoped `~F_*` record-field family. New section: "The layout is data".
3. **Carried over from the C\*Base research and absent from the 2026-09-03
   draft:** the pagination decision, the one-column new-file marker, the header
   row and its `▔` rule, and per-field colour.
4. **The logo pack loses its importer.** Petmate ships a native `.seq`
   exporter and `Screens/groups/<KEY>.seq` already wants raw C64 bytes, so the
   pack is a workflow, not code
   (`thoughts/shared/research/2026-09-06_cbase-petscii-viewer.md`, section 2).
   The resolver is unchanged. In the hybrid layout the group LOGO has no place
   in the list at all - only in the single-record view.
5. **Risk 5 of the 2026-09-03 draft was wrong about the volume**, in the
   dangerous direction, and is corrected. `Screens/` is in the entrypoint's
   ALWAYS-OVERWRITE tar sync (`docker-entrypoint.sh:605`), so a deploy DOES
   reach an existing board's `Screens/` - and overwrites any path the image
   also ships. That measurement is why the layout templates live in a new
   tracked `Prompts/` tree and not in `Screens/`.
6. Unchanged and still binding: the shared `describe.ts` extractor moving to
   the door server's `contract/` with a mirror and a drift test; the file index
   and its four-source group trust order; FILE_ID.DIZ being 45x10 and accepted
   as cut on the right; the 80-column view pinned unchanged; and the
   requirement that the INTERNAL listing and the DOOR path emit identical
   bytes. That last one gets harder under layout-as-data and is re-argued in
   "Byte identity under a layout that is data".

## Problem

A C64 caller gets exactly 40 columns. A FILE_ID.DIZ is 45x10 by convention.
Every strategy that tries to fit the second into the first loses.

**Measured on this tree, every real `FILE_ID.DIZ` in it (seven files):**

| DIZ | rows | widest row | smallest left margin |
|---|---|---|---|
| `FILE_ID.DIZ` (board root) | 10 | 44 | 0 |
| `Node0/WorkDir/FILE_ID.DIZ` | 8 | 44 | 0 |
| `Doors/5DPAGER/File_ID.diz` | 11 | 44 | 0 |
| `Doors/ACCV105/File_Id.Diz` | 1 | 27 | 0 |
| `AmiExpress-Sources/deployment/File_Id.Diz` | 8 | 44 | 0 |
| `sdk/templates/FILE_ID.DIZ` | 39 | 45 | 0 |
| `AmiXDoors MultiRelayChat` (in-tree fixture) | 6 | 38 | 0 |

NONE of them has a left margin, so the ladder's `deindent` rung recovers
nothing, and a straight `crop` takes 4-5 columns off every row - on art, that is
the right-hand border of the box. Adapting a 45-column picture into 40 columns
is the wrong abstraction; the picture was never the payload.

**And the ladder does worse than lose art - it destroys identity fields.**
Captured from the real `F` command on this board (AquaScan v1.0 through the C64
adapter; full captures and per-file tables in
`.superpowers/sdd/2026-09-03-c64-door-marks/progress.md` and its `captures/`
directory):

```
  source (80)  : CB4!ST13.LHA N 119214  01-21-26  Strip`n`Add T N G v1.3m
  adapted (40) : CB4!ST13.LHA N> 01-21-26 Strip`n`Add T >
                              ^^ the SIZE 119214 is now a ">"

  source (80)  : AFAKER20.LHA N  41159  01-21-26  AmiFaker v2.0
  adapted (40) : AFAKER20.LH> 41159 01-21-26 AmiFaker v2>
                           ^^ the FILENAME lost a character AND the N flag
```

`narrow` shortens the WIDEST column of a table row, and on a file record the
widest column is the filename, the size, or the description. A file list whose
filenames and sizes cannot be trusted is worse than a refusal, which is why
`F`, `FR` and `N` are unmarked and refused today. All three are the SAME
program under three registrations (`F` is `Doors/AquaScan/AquaScan.020`, `FR`
and `N` are `AquaScan.000`), so one fix serves all three.

Three more measurements shape the design:

- **The board's own narrow listing and the adapter disagree about the same
  record.** For `test.lha`, 5000 bytes, 01-21-26, "Test file for AquaScan":

  ```
    the board's own narrow list today (narrowFileLines)
    |test.lha                              5K|
    | Test file for AquaScan                 |

    the adapter on AquaScan's frame today
    |test.lha N 5000 01-21-26 Test file for >|
    |Sent by: sysop test                     |
  ```

  They differ in field order, in whether a date is shown at all, in the size
  unit (`5K` vs `5000`), and in how a too-long field is cut (silent clip vs a
  `>` mark). One board, one caller, two answers.

- **The group of a release is knowable from the file base itself.** Over the
  1508 rows of this board's `file_entries`, `buildGroupTags()` (the door
  server's own corpus rule: an archive-name prefix that appears on 3+ archives)
  finds 52 group tags, and 1453 of the 1508 filenames - 96.4% - carry one.
  The twelve largest (`BVS` 198, `FLT` 145, `PDX` 124, `CSL` 98, `PSG` 94,
  `BS1` 82, `HF` 80, `CLS` 67, `SR` 65, `PDY` 59, `HLM` 55, `DLM` 47) cover
  1114 records - 74% of the base - so twelve `.seq` files would put a group
  identity on three quarters of this board's file base.

- **A stacked record costs three quarters of the screen.** Four rows per record
  on a 25-row C64 screen is six records between pauses. C*Base shows
  twenty-two, and it is not an accident: its autopause counter increments once
  per RECORD and fires at 22 (`larry-bbs.bpp:2379-2380`) precisely because a
  record occupies one row. A caller scanning for `TRIAD-INTRO` reads by
  identity, not by prose.

## What is being built

At 40 columns a file record is RENDERED FROM STRUCTURED FIELDS, not from DIZ
art, on TWO surfaces with two different shapes. At 80 columns nothing changes
at all.

- **A LIST row.** One row per file, fields at fixed columns: ordinal, size,
  status marker, new-file flag, filename, date. Twenty-plus records per
  screen.
  No description, no group, no art.
- **A SINGLE-RECORD block.** The description-first stacked block: group logo
  art when the group is known, the description, then filename and version, then
  size, marker and date. One record on the screen, so the prose costs nothing.
  Reached from a search hit, an upload or download announcement, and the new
  `FI <n>` command that names an ordinal from the last listing.
- **A layout language.** Both shapes are TEMPLATES in a sysop-editable file,
  `Prompts/FILEVIEW.40`, written in the board's own MCI with a new `~t<nn>|`
  column tab and a scoped `~F_*` record-field family. A sysop re-columnises the
  listing by editing a text file.
- **One extractor, shared.** The door server's `describe.ts` becomes a contract
  file and is mirrored into amiexpress-web through the existing `renderMirror`
  + drift-test machinery, so the same DIZ text yields the same description on
  the board and in the repo.
- **A local file index** over the board's OWN file base (not only the door
  subset the repo knows), built from the DIR files on disk: description,
  version, BBS requirement, and a best-effort handle/group per file. Doors are
  enriched from the door-repo catalog.
- **A release-group logo pack** - `Screens/groups/<GROUP>.seq` and optional
  `<GROUP>.txt` - resolved by ONE resolver that every caller uses. Adding a
  logo is dropping a file in a directory; producing one is a Petmate export.
- **One record interpreter**, pure and shared, that both the board's own
  listing and the adapter's new `stack` rung call with the same compiled
  layout, so the two paths produce the same forty columns by construction and
  not by coincidence.
- **A DIZ fallback ladder** for records that carry no metadata at all.

## Settled decisions

Settled with the sysop on 2026-09-03 and revised with him on 2026-09-06. A
sub-project that believes one is wrong escalates; it does not quietly diverge.

| # | Decision |
|---|---|
| 1 | **At 40 columns a file record renders from FIELDS.** The DIZ art is not folded, squeezed or cropped into the record. |
| 2 | **The LIST is ONE ROW PER FILE, C\*Base-native** - ordinal, size, status marker, new-file flag, filename, date, at fixed columns. No description, no group name, no logo art in a list. Revised 2026-09-06; supersedes the stacked list of the 2026-09-03 draft. |
| 3 | **The SINGLE-RECORD view is description-first** - the sysop's field order, and the 2026-09-03 stacked block verbatim: group logo, description, filename and version, then size, marker and date. It is the only surface that prints a group logo. |
| 4 | **At 80 columns nothing changes.** The DIR raw lines still go out verbatim, the search and new-files formats keep their literal strings, and the adapter is still not installed for an ANSI session. Every existing byte pin stays green. |
| 5 | **The layout is DATA.** Both shapes live in `Prompts/FILEVIEW.40` as MCI templates. A sysop moves a column by editing that file; no rebuild, no restart. The board ships a default, and the default and the file are the same bytes, proved by a drift test. |
| 6 | **ONE extractor, shared, not copied.** `describe.ts` moves to the door server's `contract/` and is mirrored into amiexpress-web by `renderMirror`, with a drift test on both sides. It is pure text processing with no imports, which is what makes this possible. |
| 7 | **The board keeps its own file index** over its whole file base, built by running the shared extractor over each file's recorded DIZ. Doors are ENRICHED from the door-repo catalog (author, releaseGroup, category); nothing else is fetched from anywhere. |
| 8 | **Reliability is stated per field.** Description, version and BBS requirement are reliable. Author and group are best-effort. Category exists only for doors. The UI never presents a best-effort field as a fact. |
| 9 | **Group name is SYSOP-CORRECTABLE**, so a release whose DIZ never names its group still gets a logo. |
| 10 | **A logo pack keyed by a normalised group name**, resolved by ONE resolver used by every caller. Adding a logo is dropping a file in - no code, no restart. Logos are authored in Petmate and exported as `.seq`; there is no importer and no hand-built pack. |
| 11 | **Both paths produce the same 40 columns for the same record AND the same layout.** The board's internal listing is the reference implementation; the adapter gains a `stack` rung that consumes the same compiled layout snapshot, and a side-by-side test pins it. See "Byte identity under a layout that is data". |
| 12 | **Pagination is the board's own.** The listing counts through the existing `flagPause()`, which counts ROWS against `session.screenHeight`, and adds no counter of its own. One row per record is what makes rows and records comparable at all. The prompt, its keys and its bytes stay express.e's; C\*Base's `A`-to-abort is NOT adopted (see "Pagination"). |
| 13 | **A one-column new-file flag** sits between the status marker and the filename, set by the existing `dirLineNewFile()` predicate against the caller's own new-since date. |
| 14 | **The DIZ ladder is the FALLBACK** - no metadata, no logo. Order: SQUEEZE runs of 2+ spaces on rows the classifier calls `prose` (never on art), then REFLOW prose still too wide, then CROP art with the `>` marker. |
| 15 | **Art wider than 40 loses its right edge**, and that is accepted. A sysop switch may skip the block with a one-line note instead. |

## Architecture

```
   amiexpress-doorserver                      amiexpress-web
   +---------------------------+              +--------------------------------+
   | contract/describe.ts      |  renderMirror|  web/backend/src/utils/         |
   |   analyseDoor()           | -----------> |    describe.generated.ts        |
   |   buildGroupTags()        |  + fixtures  |    (GENERATED, drift-tested)    |
   | contract/manifest-types.ts|              |                                 |
   | /api/door-repo/*          | -- catalog ->|  door_catalog (author, group,   |
   +---------------------------+              |                category)        |
                                              |                                 |
                                              |  file-index.service.ts          |
                                              |    DIR files on disk -> index   |
                                              |    file_index (SQLite mirror)   |
                                              |                                 |
                                              |  group-logo.util.ts             |
                                              |    Screens/groups/<KEY>.seq/.txt|
                                              |    Screens/groups/GROUPS.MAP    |
                                              |                                 |
                                              |  file-layout.service.ts         |
                                              |    Prompts/FILEVIEW.40 -> a     |
                                              |    FROZEN CompiledFileLayout    |
                                              |    (mtime guard, sha1, default) |
                                              |                                 |
                                              |  handlers/mci-dispatch.ts       |
                                              |    ~t<nn>  column tab (global)  |
                                              |    ~F_*    record fields        |
                                              |            (scoped, per record) |
                                              |                                 |
                                              |  sdk/petscii/frame/file-record  |
                                              |    parseFileRecordRow()         |
                                              |    renderFileRow()   <- LIST    |
                                              |    renderFileBlock() <- SINGLE  |
                                              |         /                \      |
                                              |  internal listing      adapter  |
                                              |  (file-listing,        'stack'  |
                                              |   search, new files,     rung   |
                                              |   FI <n>)                       |
                                              +--------------------------------+
```

One interpreter with one input shape - `(record, compiled layout)` - and two
callers. Byte identity between the two paths is a property of that arrangement,
not something a test has to police after the fact; the test exists to keep the
arrangement from being undone.

### Component 1: the shared extractor (door server + mirror)

`contract/describe.ts` in `amiexpress-doorserver`, mirrored to
`web/backend/src/utils/describe.generated.ts`. Section "The shared extractor
and its contract move" below.

### Component 2: the file index (amiexpress-web)

`web/backend/src/services/file-index.service.ts` plus the `file_index` table.
Built at import, at upload, and by a backfill script; refreshed by an mtime
guard on the DIR file. Section "The file index".

### Component 3: the logo pack and its resolver (amiexpress-web)

`web/backend/src/utils/group-logo.util.ts` over `Screens/groups/`. Section
"The logo pack and its resolver".

### Component 4: the layout language and its loader (MCI + amiexpress-web)

`~t<nn>|` in `mci-dispatch.ts`'s prefix dispatch, the scoped `~F_*` family, and
`web/backend/src/services/file-layout.service.ts` over `Prompts/FILEVIEW.40`.
Section "The layout is data".

### Component 5: the record interpreter (SDK, pure)

`sdk/petscii/frame/file-record.ts`, exported through the existing
`@amiexpress/bbs-door-sdk/petscii/frame` subpath the backend already imports
(`web/backend/src/server/c64-door-adapter.ts`). It is pure TypeScript with no
Node imports, the same rule the rest of `sdk/petscii/frame` follows, and
`web/backend/src/utils/table-format.util.ts` re-exports it the way
`ascii-art.util.ts` re-exports the frozen detectors - so the board's handlers
reach it without a second copy. **The SDK never reads a file**: the compiled
layout is an argument, which is what keeps it pure and what lets a test drive a
fixture layout through both paths.

### Component 6: the adapter's `stack` rung (SDK ladder + backend hook)

`AdaptOptions.blockRenderer` in `sdk/petscii/frame/adapt.ts`, and the closure
`c64-door-adapter.ts` passes into it. Section "The adapter's stack rung".

## The shared extractor and its contract move

### What moves

`amiexpress-doorserver/src/describe.ts` (1210 lines) becomes
`amiexpress-doorserver/contract/describe.ts`. `src/describe.ts` stays as a
one-line re-export so every existing importer in that repo is untouched.

It qualifies for `contract/` because it is already what a contract file has to
be: it has **no imports at all** (verified: zero `import` and zero `require`
lines), it is pure text processing, and its rules were tuned over fifteen
rounds against the 3301-door corpus and are pinned by `tests/describe.test.ts`.

The API the board uses:

| Export | Answers |
|---|---|
| `analyseDoor(input, groupTags)` | `{ description, version, author, requiresBbs }` - the whole reading |
| `buildGroupTags(archiveNames)` | the corpus-derived group-prefix set the reading needs |
| `describeBlock`, `describeLine`, `bestCell`, `finalise`, `clean`, `stripFrameBoth`, `dropMetaBrackets`, `normaliseVersion`, `splitVersion`, `normaliseRequirement`, `splitBbsRequirement`, `looksLikeHandle` | the individual rules, exported already, used by the tests and by the index's group derivation |

`contract/describe.ts` gains one new export, and nothing else changes:

```ts
/** Bumped whenever a rule change moves any fixture's output. */
export const DESCRIBE_CONTRACT_VERSION = '1';
```

### The mirror

`scripts/gen-contract-types.ts` already renders a client-vendorable mirror and
already takes a `MirrorOrigin` (it was generalised for the achievements
contract at `b223b39f6`: ONE generator, two contract files). A third origin is
added:

```ts
const DESCRIBE_ORIGIN: MirrorOrigin = {
  source: 'contract/describe.ts',
  generator: 'scripts/gen-describe-types.ts',
};
```

Output: `web/backend/src/utils/describe.generated.ts`, carrying the same
`GENERATED FILE -- DO NOT EDIT BY HAND` header the manifest mirror carries.
The manifest mirror's default output must not move a byte - the existing test
that pins that stays as it is.

### The drift test, and what byte-identity actually claims

Two tests, because a sibling checkout cannot be a CI dependency.

1. `web/backend/tests/doors/describe-mirror.test.ts` - when
   `DOORSERVER_CONTRACT` (or the default sibling path) exists, the committed
   mirror must equal `renderMirror(read(contract/describe.ts), DESCRIBE_ORIGIN)`
   byte for byte, and `DESCRIBE_CONTRACT_VERSION` must match. Skipped, not
   faked, when the checkout is absent - the same `describeIfServer` shape
   `contract-mirror-staleness.test.ts` uses today.
2. `contract/describe-fixtures.json` - a committed corpus of `{ dizText,
   archiveName, binaryName, groupTags, expected }` cases, generated from the
   door server's own `tests/describe.test.ts` corpus and mirrored into
   amiexpress-web alongside the module. BOTH repos run their own copy of the
   extractor over it and assert the exact outputs. This is what proves
   identity in CI with no sibling checkout, and it is the test that fails when
   someone edits the mirror by hand.

**The claim, stated precisely.** `analyseDoor` is pure: the same `DoorInput`
and the same `groupTags` produce the same `DoorFacts` in both repos. It is NOT
a claim that a given archive gets the same description in both places, because
`groupTags` is derived from the CORPUS - the door server's 3301 archives, the
board's own file base - and the two corpora differ. Two consequences, both
deliberate:

- The board calls `buildGroupTags()` over its OWN filenames (measured above: 52
  tags over 1508 files), and stores the tag set's fingerprint on the index row
  so a result is reproducible and a corpus change can invalidate it.
- **For a row that exists in the door-repo catalog, the CATALOG's description
  wins.** A door the repo knows reads on the board exactly as it reads in the
  repo, because it is literally the repo's string. The board's own extraction
  is for the 1500 files the repo has never seen.

### Measured outputs (what the board will actually show)

Run through `analyseDoor` in this tree on 2026-09-03, verbatim:

| Source DIZ | description | version | author | requiresBbs |
|---|---|---|---|---|
| `FILE_ID.DIZ` (board root) | `Last24Hrs Uploads Both Ami & System/X` | | | `AmiExpress` |
| `Doors/5DPAGER/File_ID.diz` | `5D_Page by Snow included 2 designs and a config door` | `0.01` | | `FAME` |
| `Doors/ACCV105/File_Id.Diz` | `Account Ed` | `1.05` | | |
| `AmiExpress-Sources/deployment` | `1 Minor update` | | | `AmiExpress` |
| `Node0/WorkDir/FILE_ID.DIZ` | `Workdir` | | | `AmiExpress` |
| `Conf2/DIR1` `OTL-RQ21.LHA` block | `the best requester ever` | `2.1` | | `AmiExpress` |
| `Conf2/DIR1` `AD-KMHH1.LHA` block | `Kmhh Komm mal her, Horst is for all versions` | `1.0` | | `AmiExpress` |
| `Conf2/DIR1` `CB4!ST13.LHA` block | `The Best Multisystem Checker/Stripper/Ad` | `1.3` | | |

Five of those DIZ are loose files rather than uploaded archives, so their
`archiveName` was synthesised from the containing directory - which feeds
`versionFromFilename` and is why `ACCV105` reports `1.05`. The three
`Conf2/DIR1` rows are real DIR entries with real archive names.

This table is the evidence for decision 8. The extractor ANSWERED on 8 of 8,
and two of those answers (`Workdir`, `1 Minor update`) are exactly as good as
the DIZ behind them, which says nothing about the file - the extractor does not
invent, and decision 8's promise is that a field is reliable, not that it is
interesting. Version: 6 of 8. BBS requirement: 6 of 8. **Author: 0 of 8** -
which is why author and group are BEST-EFFORT and why decision 9 exists. Scene
DIZ carry the group as ART, not as text, and no text rule will read a picture.

**Under decision 2, none of these strings appears in a LIST.** They are what
the single-record view prints, and what the `~F_DESC|` field resolves to there.
The list is identity fields only.

## The file index

### Where the truth is

**The DIR files on disk, not the database.** Measured: `file_entries` holds
1508 rows on this board and ZERO of them has a description or a `fileiddiz`,
while `Conf2/DIR1` holds full DIZ blocks as continuation lines. AmiExpress
records a file's DIZ INTO the DIR entry at upload (indent 33, express.e's
continuation convention), so the DIR file is where a description actually
lives. An indexer that read `file_entries` would index nothing.

The index is a CACHE. Every column can be recomputed from disk, and a cache
miss degrades to the DIR row's own text - never to a broken listing.

### Schema

```sql
CREATE TABLE IF NOT EXISTS file_index (
  conf_id        INTEGER NOT NULL,   -- conference the DIR file belongs to
  dir_number     INTEGER NOT NULL,   -- DIR1..DIRn; -1 for HOLD
  filename       TEXT    NOT NULL,   -- as written in the DIR entry
  description    TEXT,               -- analyseDoor().description   RELIABLE
  version        TEXT,               -- analyseDoor().version       RELIABLE
  requires_bbs   TEXT,               -- analyseDoor().requiresBbs   RELIABLE
  author         TEXT,               -- analyseDoor().author        BEST EFFORT
  release_group  TEXT,               -- see "Group, four sources"   BEST EFFORT
  group_source   TEXT,               -- 'map' | 'catalog' | 'handle' | 'prefix'
  category       TEXT,               -- door-repo catalog only; NULL otherwise
  diz_sha1       TEXT,               -- of the DIZ text the fields came from
  tags_sha1      TEXT,               -- fingerprint of the groupTags set used
  extractor_ver  TEXT,               -- DESCRIBE_CONTRACT_VERSION at index time
  indexed_at     INTEGER DEFAULT (strftime('%s','now')),
  PRIMARY KEY (conf_id, dir_number, filename)
);
CREATE INDEX IF NOT EXISTS idx_file_index_lookup ON file_index(conf_id, filename);
```

The key is the DIR-file identity, because that is the identity BOTH paths can
produce: the internal listing walks DIR files, and the adapter knows the
caller's conference from the session. `file_entries` is joined by filename when
a caller needs its counters; the index never duplicates them.

**The new-file flag is NOT a column.** It is per caller, not per file, so it is
computed at render time from the record's date and the caller's own new-since
date. Storing it would make a listing wrong for the second caller.

**Ambiguity rule.** A lookup is `(conf_id, filename)` because the adapter
cannot know which DIR the door is printing. If two DIRs in one conference hold
the same filename and their index rows AGREE on description, version and group,
the lookup answers; if they DISAGREE, the lookup answers null and the record
renders from the parsed row alone. Guessing the wrong description is worse than
showing none.

**And under decision 2 the ambiguity almost never bites a list.** A list row
prints no index-only field at all - ordinal, size, marker, new flag, filename
and date all come from the DIR row or the parsed frame row. The index is what
the SINGLE-record view needs. That is a second, unplanned argument for the
hybrid: the surface that depends on a fallible lookup is the surface with one
record on it, where a miss is visible and correctable rather than smeared over
a screenful of rows.

### Group, four sources, in trust order

1. **`Screens/groups/GROUPS.MAP`** - the sysop's own line (decision 9).
2. **`door_catalog.release_group`** - for a row whose `archive_name` matches
   the filename. This is the door-repo enrichment, and it also supplies
   `author` and `category`.
3. **The author handle's tail** - when `analyseDoor().author` has the
   `handle/GROUP` shape `looksLikeHandle()` recognises, the part after the
   separator is the group.
4. **The archive-name prefix** - the filename's leading tag when it is in the
   board's `buildGroupTags()` set. Measured coverage: 96.4% - over the 1508
   `file_entries` filenames, which is the largest filename sample in this tree.
   The DIR files hold a different and smaller set of names (`OTL-`, `AD-`,
   `-D-`), so the backfill's first run is also the first honest measurement of
   this rule over the base the index actually covers.

`group_source` records which one answered, so a listing can be audited and a
wrong logo traced to its source in one query.

C*Base has no group concept at all; its nearest equivalent is the UDOP
`[ Px] Pattern x  (ex. TRIAD/*)` sysop command and Larry's `$x*` "view DIR with
pattern" - a filename GLOB. That is the same mechanism `GROUPS.MAP` uses, which
is why `GROUPS.MAP` rules are globs and not regular expressions.

### When it is built

| Trigger | Where | What happens |
|---|---|---|
| Upload | `web/backend/src/server/file-socket-handlers.ts` (`extractAndReadDiz` already runs at `:171` and `:367`) | the DIZ that was just extracted is analysed and one row is written, in the same step that writes the DIR entry |
| Import | `web/backend/src/services/import-transaction.service.ts`, the file phase | every imported DIR entry is indexed as it lands |
| Backfill | `web/backend/src/scripts/build-file-index.ts` (new) | walks every conference's DIR files via `getDirFiles()` / `readDirFile()`, analyses each entry's continuation block, writes the table |
| Freshness | `file-index.service.ts` | the DIR file's mtime is compared against the newest `indexed_at` for that `(conf_id, dir_number)` BEFORE a listing reads the index, and a changed DIR file is re-indexed - the mtime-guard pattern of `revalidateBbsCommandsIfChanged()` (RULES.md 10b), not an unconditional rescan |
| Contract bump | same | a row whose `extractor_ver` or `tags_sha1` differs from the current one is stale and is re-analysed on next read |

### Migration and backfill of the existing base

1. The table is created by the same `CREATE TABLE IF NOT EXISTS` migration
   block every other table uses (`web/backend/src/database.ts`). No data
   migration: an empty index is a valid state and every listing works without
   it.
2. `build-file-index.ts` is run once by the sysop (and is safe to re-run: it is
   an upsert keyed by the primary key). On this board that is the DIR files of
   `Conf1`..`Conf14`; the door-repo enrichment join is one query per row against
   `door_catalog`.
3. The archive itself is opened ONLY when a DIR entry has no continuation block
   AND the file exists in the area: `extractAndReadDiz()` is then used to read
   `FILE_ID.DIZ` out of it. This is the expensive path and is off by default in
   the backfill (`--open-archives` opts in), because a full base of LHA/DMS
   archives is minutes of work for a field most rows already carry.
4. **Paths come from `getConferenceDir()` / `getDirFilePath()` / `getDirFiles()`.**
   Nothing in this work builds `Conf${n}` by hand. (`web/backend/src/scripts/import-from-amiga.ts:62`
   does, today; it is pre-existing and out of scope here, but the indexer must
   not copy it.)

## The 40-column record

Two surfaces, two shapes, one interpreter. All widths are exact; a
CRLF-terminated row may use all 40 columns (the PETSCII transducer latches the
wrap), which is why these are 40 and not 39 - a trailing PROMPT is the only
thing built to 39.

### Surface A - the LIST row

**One row per file.** The field set and the column positions are C*Base's
(`bbs.bas:5420-5427` driving prompts 11 and 12 of the shipped `data/text`;
`larry-bbs.bpp:2293-2377`), with two fields changed for this board and the
changes argued below.

| Columns | Width | Field | Source |
|---|---|---|---|
| 0-3 | 4 | ordinal within this listing pass, 1-based, left-aligned | the pass |
| 4 | 1 | gap | - |
| 5-10 | 6 | size, `ceil(bytes/1024)` with a `K` suffix | DIR / parsed row |
| 11 | 1 | status marker `P` / `F` / `N` / `D` | DIR / parsed row |
| 12 | 1 | new-file flag, `*` or a space | computed per caller |
| 13-24 | 12 | filename, as written in the DIR entry | DIR / parsed row |
| 25-30 | 6 | slack | - |
| 31-39 | 9 | date, the string the source carried | DIR / parsed row |

**Where this differs from C\*Base, and why.**

- **Size.** C*Base prints a bare integer of 254-byte disk BLOCKS
  (`bbs.bas:3684` writes `(w5-bk)`, `:5334` reads it back; there is no byte
  count anywhere in its catalogue). Blocks are meaningless off a 1541, so we
  keep `K` - and we keep the `K` SUFFIX rather than saving a column, because a
  bare integer in that column position is exactly what a C64 caller reads as
  blocks by habit. The suffix is what disambiguates it. **The reconciliation is
  explicit rather than silent: `~F_BLOCKS|` exists as a field and emits the
  bare 254-byte block count, so a sysop who wants the C\*Base column edits one
  line of `Prompts/FILEVIEW.40` and has it.** The shipped default uses `K`.
  Six columns rather than C*Base's four, because this board holds files past a
  megabyte (`10240K` is six).
- **Status marker instead of a type column.** C*Base's three-column
  `prg`/`seq` type has no analogue here - our files are archives - and our
  `P`/`F`/`N`/`D` status marker occupies the same structural position between
  the size and the filename. One column rather than three.
- **Filename width.** C*Base hard-caps at 16 AT INPUT (`bbs.bas:5550`,
  `p$=left$(i$,16)`) precisely so the row fits. Ours is capped upstream by
  express.e's DIR grammar at 12, so the layout gets the same guarantee by a
  different mechanism. **Record the dependency: if a DIR filename ever exceeds
  12 columns, the template's `~12F_NAME|` clips it and the identity promise
  breaks at the same moment the layout does.** The six columns of slack at
  25-30 are where a wider name would go without moving the date.
- **Date position.** C*Base tabs the date to a fixed column 31 and lets it run
  left-aligned; the 2026-09-03 draft flushed it RIGHT at column 40. Fixed-left
  wins: a variable-width date (`01-21-26` is 8, `21-Jan-70` is 9 - this board
  writes both) has a ragged LEFT edge when right-flushed, and the left edge is
  the one a scanning eye follows. Nine columns, 31-39, so both forms fit
  without reformatting.

**Rules that make the row honest.**

- **Identity fields are never shortened by the layout engine.** Every field is
  clipped by its own declared width in the template, and the shipped default
  declares each width at or above the field's maximum. Nothing is ever marked
  with `>` in a structured record - `>` belongs to the fallback ladder alone.
- **The size is formatted once**, by `formatNarrowSize(bytes)` =
  `Math.ceil(bytes / 1024) + 'K'` - the unit the board's shipped
  `narrowFileLines()` already uses. Both paths call it, and both feed it
  BYTES: `DirFileEntry.fileSize` is already normalised to bytes by
  `readDirFile()` whether the DIR wrote `119214` or `117K`, and the adapter
  parses the same field out of the row the door printed. A DIR that wrote
  `117K` round-trips to `117K`.
- **The date is the string the source carried** (`DirFileEntry.uploadDateDisplay`
  internally, the parsed date field of the row for the adapter), never
  reformatted. This board's DIR files carry both `01-21-26` and `21-Jan-70`
  forms; reformatting either would be a divergence from what express.e prints
  and the adapter could not reproduce it anyway.
- **The status marker is kept.** Losing it is exactly the regression the
  measurement caught.
- **The ordinal earns its four columns**, because it is the argument to the
  single-record view: a caller reads the list, sees `12`, and types `FI 12`.
  Without it the two surfaces do not connect. This is C*Base's `#` column doing
  the job its `A<n>` / `*` commands ask of it.

### Surface B - the SINGLE-RECORD block

The 2026-09-03 stacked block, unchanged in shape and unchanged in field order,
now scoped to the surfaces where there is one record on the screen: a search
hit, an upload or download announcement, and the new `FI <n>` command.

```
  1  GROUP    the group's 40-column LOGO when a `.seq` exists for it, else the
              group NAME on one row; omitted when the group is unknown
  2  DESC     the description, squeezed and word-wrapped to 40, at most 2 rows;
              omitted when the index has none
  3  IDENT    "<filename> <version>"     - version omitted when unknown
  4  FACTS    "<size> <marker>" left, "<date>" at column 31
```

The field ORDER is the sysop's: description first, then filename, version,
size, date. **This is the only surface that prints group logo ART**, for the
two reasons argued under "The logo pack and its resolver": raw `.seq` bytes
drop the adapter's frame-diff baseline, and six rows of art per record leaves
three records on a 25-row screen.

Two rules from the 2026-09-03 draft change here, both because the hybrid makes
them simpler:

- **The date is at column 31, not flush right at 40**, so both surfaces agree
  and a caller's eye finds the date in the same place on either.
- **The "version moves to the FACTS row when the IDENT row overflows" rule is
  DELETED.** It was unreachable arithmetic: a DIR filename is at most 12
  columns, so the IDENT row overflows only if the version string exceeds 27
  characters, which `normaliseVersion` produces from nothing in the corpus. If
  one ever appears, the row clips at column 40 like every other row, and the
  filename - which precedes it - is untouched. A conditional that cannot fire
  is a conditional the template language would have to grow a branch code for,
  and the language deliberately has none.

**The description is capped at 2 rows.** From the index that cap never binds:
`analyseDoor` caps its own output at 60 characters, which is at most two
40-column rows, so no ellipsis is needed and none is added. On an index-miss
the description is the tail the door printed, which can be longer; anything
past the second row is dropped. A description is not an identity field, and the
two rows that survive are the ones the reader looks at.

### Pagination

C*Base paginates at **22 records**, prompts `[Press A Key / A To Abort]` (Tao:
`[Slam a Key!]`), continues on any key, aborts on `A`, and treats non-stop as a
per-user toggle rather than a per-command flag (`larry-bbs.bpp:2344-2345`,
`2379-2380`, `3292`).

**We adopt the shape and keep our own counter and our own prompt.** The board's
existing `flagPause()` (`web/backend/src/utils/flag-pause.util.ts:30-70`)
counts ROWS - it increments per emitted line and pauses when the count reaches
`session.screenHeight`, which a PETSCII session sets to 25
(`telnet-server.ts:866`, `command.handler.ts:1421`). The file listing calls it
once per emitted row, header rows included, and rolls NO record counter of its
own. One row per record is what makes rows and records comparable at all; under
the 2026-09-03 stacked list they were four-to-one and the comparison was
meaningless.

**The exact numbers, so the test can assert them rather than borrow C\*Base's.**
The two header rows are counted:

```
  first page :  2 header rows + 23 records  = 25 counted rows -> pause
  every page after :        25 records      = 25 counted rows -> pause
```

23 then 25, against C*Base's flat 22. The difference is entirely that C*Base
counts RECORDS (`larry-bbs.bpp:2379`, `v=v+1` once per record) and we count
ROWS, and its own author flags the consequence in a source comment: his counter
is "quirky on Dirlist with Description, because each DIR entry with x lines of
Description + Delimiter is counted as one line only". Counting rows has no such
quirk, so we keep ours.

**`flagPause()` is not changed to reserve the prompt row.** The prompt is
emitted after the 25th counted row, so on a 25-row screen the first row of the
page scrolls off - which is what every other paginated surface on this board
already does, is express.e's own behaviour, and is not this spec's to fix.
Reserving a row would mean changing a shared, pinned pagination path for one
listing.

**The prompt, its keys and its bytes stay express.e's** -
`(Pause)...(f)lags, More(Y/n/ns)?` - and C*Base's `A`-to-abort is NOT adopted.
Three reasons: those bytes are express.e parity and are already pinned; the
board's callers know these keys from every other paginated surface; and `(f)`
flags a file for download from the pause, which is a real AmiExpress feature a
caller wants precisely in a file listing and which C*Base's prompt has no room
for. What C*Base calls `A`, we call `n`; what it calls a per-user non-stop
toggle, we already have as `ns` plus `session.user.linesPerScreen`.

**This is a genuine, deliberate divergence from the convention**, and it is
recorded as one rather than papered over: a caller arriving from a real C*Base
board will press `A` at our pause prompt and get "not a valid answer" rather
than an abort.

### The new-file flag

One column, between the status marker and the filename. `*` when the record is
newer than the caller's own new-since date, a space otherwise. C*Base uses a
reversed `{SHIFT-@}` glyph (`nf$`, `bbs.bas:9285`); we use `*` because it is
ASCII, survives both the 40- and the 80-column encoders unchanged, and is
already the board's token family for a plain flag.

The predicate is the board's existing one, not a second copy:
`dirLineNewFile(dirLine, searchDate)` (`file.handler.ts:1011`), against
`session.user?.newSinceDate || session.user?.lastLogin` - the same date the `N`
command searches on (`file.handler.ts:542`).

**Its stated limit.** `dirLineNewFile` parses only the 8-character `MM-DD-YY`
form and returns false for anything else, so a DIR row carrying `21-Jan-70`
gets a blank flag. That is the existing predicate's behaviour on this board
today, it is inherited rather than introduced, and the flag being blank is the
safe direction - a file is never falsely announced as new. Widening the
predicate is out of scope here and would change what the `N` command finds.

### The header row and its rule

Two rows above a listing, printed once per listing pass (not per page - the
pause prompt is what separates pages, and reprinting a header after every pause
would cost 2 of 22 rows for no information).

```
0         1         2         3         4
0123456789012345678901234567890123456789
#    Size    Filename          Date
▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
```

`▔` is U+2594, already mapped to PETSCII `$A3` at
`sdk/petscii/unicode-to-petscii.ts:41`, so the rule draws today with no new
glyph work. C*Base uses the same character for the same job. The two flag
columns (11 and 12) carry no heading, exactly as C*Base gives `nf$` none -
there is no two-letter abbreviation for "status and new" that is worth a
column, and at 40 columns there is no layout fix that would make room for the
words.

### Colour, per field

C*Base changes colour BETWEEN fields on the same row (Tao prompt 11:
`{wht}<#> £t04 {lgrn}<blks> £t09 {cyn}<type> £t14 {gry2}<filename>`; prompt 12
opens `{gry1}` before the date). Our `~c0..~c7` already emit exactly one VIC
pen byte each (`mci-dispatch.ts:413` ff.), so per-field colour is expressible
with **zero new code** - it is just more tokens in the template.

The shipped default colours the list row: ordinal white, size green, marker and
flag yellow, filename cyan, date blue. A sysop changes any of them by editing
the template.

This is why the layout interpreter must count PRINTABLE columns and not bytes:
a pen byte occupies no column. `printableLength()`
(`web/backend/src/utils/table-format.util.ts`, used at `:298`) is the existing
function for that and is what `~t` consults.

### Worked example 1 - the measured record, in both surfaces

Source, 80 columns, unchanged by any of this:

```
CB4!ST13.LHA N 119214  01-21-26  Strip`n`Add T N G v1.3m
```

What the adapter does today (the bug):

```
0123456789012345678901234567890123456789
CB4!ST13.LHA N> 01-21-26 Strip`n`Add T >
```

As a LIST row, ordinal 12, not new to this caller:

```
0         1         2         3         4
0123456789012345678901234567890123456789
12   117K  N CB4!ST13.LHA      01-21-26
```

39 of 40 columns. `117K` is `ceil(119214/1024)`; the date starts at column 31.

As a SINGLE record (`FI 12`) - description and version are the measured
`analyseDoor` output for this record's DIZ block; the group is unknown, so the
GROUP row is dropped:

```
0123456789012345678901234567890123456789
The Best Multisystem Checker/Stripper/Ad
CB4!ST13.LHA v1.3
117K N                         01-21-26
```

Three rows. The description is exactly 40 columns and needs no second row.

### Worked example 2 - a real record with a known group

`Conf2/DIR1`, `OTL-RQ21.LHA`, 96759 bytes, status `P`, `21-Jan-70`, its DIZ
block a ten-row ASCII box, ordinal 7. As a LIST row:

```
0         1         2         3         4
0123456789012345678901234567890123456789
7    95K   P OTL-RQ21.LHA      21-Jan-70
```

All 40 columns, because the nine-character date form fills the last one. This
is the case the "a CRLF-terminated row may use all 40" rule exists for.

The prefix `OTL` is a group tag, so as a SINGLE record the group appears:

```
0123456789012345678901234567890123456789
OTL
the best requester ever
OTL-RQ21.LHA v2.1
95K P                          21-Jan-70
```

With one line in `Screens/groups/GROUPS.MAP`:

```
OTL-* = Outlaws
```

the same record reads `OUTLAWS`; and with `Screens/groups/OUTLAWS.seq` present,
the name row is replaced by the logo art. That one line is decision 9 doing its
whole job: the DIZ never says "Outlaws" in text (the door's own banner does -
`AquaScan v1.0 by Aquarius/Outlaws` - but that is a picture caption, not a
field), and no rule was going to read it.

### The 80-column view - unchanged, and pinned

- `F` / `FR` (`web/backend/src/handlers/file/file-listing.handler.ts`) emits the
  DIR file's RAW lines through `getDisplayLines()`. Untouched.
- `FM S` (`buildFileSearchLines`) and new files (`buildNewFileLines`) keep their
  literal 80-column format strings, already pinned by
  `web/backend/tests/handlers/narrow-tables.test.ts`.
- The adapter is not installed for a non-PETSCII session, so a 68K lister's
  bytes are what they were.
- **There is no `Prompts/FILEVIEW.80`, and there must never be one.** Decision
  4 freezes the 80-column bytes; a second way to express frozen bytes is a
  second way to break them. The loader refuses to look for one.

The interpreter is reached ONLY through `isNarrow(session)`
(`table-format.util.ts:56`), which can only answer true for
`petsciiMode === true` (`sessionColumns()` floors every other session at 80). A
phone in portrait keeps the express.e bytes.

### What this replaces

`narrowFileLines()` in `web/backend/src/utils/table-format.util.ts` is
superseded and is removed, not left beside it. Its two callers
(`buildFileSearchLines` at `file.handler.ts:407`, `buildNewFileLines` at
`:614`) move to `renderFileBlock` - both are single-record surfaces - and the
F/FR listing, which has NO 40-column layout today, gains `renderFileRow`. One
narrow shape per surface kind, on every surface that prints a file record.

### The one new command

`FI <n>` - "file info" - prints the SINGLE-RECORD block for ordinal `n` of the
caller's most recent listing pass. It is the direct analogue of C*Base's `A<n>`
(Tao) and `I` (Larry), and it is what makes decision 2 safe: the descriptions
leave the list, and this is where they go.

It is the ONLY new BBS command in this spec. `FI` is unregistered today
(checked against `Commands/BBSCmd/`). The ordinal-to-record map is held in
`session.tempData` for the duration of one listing and is discarded on the next
listing or on conference change; `FI` with no prior listing, or with an ordinal
outside it, answers with one line and no record. Registration is a
`Commands/BBSCmd/fi.info` written with `applyTooltypes()` (bytes, never an
editor), carrying `C64_ADAPT=40` from the day it lands.

## The layout is data

C*Base's listing routine prints no format string of its own. It calls numbered
prompts out of a sysop-editable file, and those prompts are built from MCI tab
commands: prompt 11 of the shipped Tao `data/text` is, decoded byte for byte,

```
@:MID$(STR$(nq),2):£t04@:MID$(STR$(bk),2):£t09@:c$:£t14@:d$:
```

- ordinal, tab to 4, blocks, tab to 9, type, tab to 14, filename. A sysop
re-columnises the whole listing by editing that one line. We adopt the idea,
in our own MCI.

### Where the templates live

**A new top-level `Prompts/` directory on the data volume**, holding one file:

```
Prompts/
  FILEVIEW.40     the list header, the list row, the list footer, and the
                  single-record block, in four named sections
```

Reached through `BbsPathsUtil`, resolved case-insensitively through `amigafs`,
exactly like `Screens/`.

**Why a new directory and not `Screens/groups/` or `Screens/`.** Measured, not
assumed: `docker-entrypoint.sh:605` runs

```sh
for sync_dir in Doors Screens Libs C; do ... tar cf - . | tar xf - ; done
```

on **every** startup. `Screens/` is an ALWAYS-OVERWRITE tree: any path the
image also ships is replaced on every deploy. A sysop's edited layout under
`Screens/` would silently revert on the next push - the exact failure mode the
entrypoint's own comments describe for `Commands/` and for the `.db` files.

`Prompts/` instead joins the **tracked** set that `Commands/` already uses
(`sync_tracked` / `sync_tracked_case_aware`, `docker-entrypoint.sh:180-275`),
whose semantics are precisely what a shipped-but-editable default needs:

| Volume state | What the deploy does |
|---|---|
| File absent, no manifest entry | copy it - a genuinely new file |
| File absent, manifest entry present | leave it absent - the sysop deleted it, and the deletion outlasts deploys |
| File matches the manifest baseline | update it from the image - the sysop never touched it |
| File differs from the baseline | KEEP the sysop's copy, and keep the baseline it diverged from |
| File has come back to matching the image | resume tracking |

Adding `Prompts` to that loop is one line beside the existing `Commands` block,
plus the directory in the first-run seeding list. This is reuse of a mechanism
that already exists and is already exercised on this board, not a new one.

**And the 2026-09-03 draft's Risk 5 was wrong in the dangerous direction.** It
said a `Screens/groups/` shipped in an image "never reaches a board that
already has a `Screens/`". The opposite is true, and the correction is carried
into the logo-pack section: the image must ship no `.seq` and no `GROUPS.MAP`
under `Screens/groups/`, because the tar sync would overwrite the sysop's.

### The syntax, and why `~` and not `£`

The template language is **the board's own MCI**, `~<width><code>|`, scanned by
the existing `processMci` tokenizer (`web/backend/src/utils/mci-tokenizer.util.ts`,
a 1:1 port of express.e's `processMci` / `processMciCmd`). Three hard reasons
not to adopt C*Base's `£` introducer:

1. **`£` is a printable glyph a C64 caller must be able to see.** PETSCII `$5C`
   IS the pound sign, and `unicode-to-petscii.ts:49` maps the character `£` to
   `0x5C` deliberately so a `£` a sysop draws with reaches the C64 as a pound
   sign. Making it an introducer would take a glyph away from the art.
2. **A second introducer is a second scanner.** `~` already has one, ported
   from express.e and pinned by `tests/handlers/mci-dispatch-ansi-pin.test.ts`.
3. **The lossy round trip cuts the right way under `~`.** The research names
   both halves of the collision: a literal `£` in one of our screens reaches a
   C64 as a visible pound because we interpret no `£` code, and our `~` reaches
   a C64 as a hyphen (`ascii-to-petscii.ts:60` maps `~` to `$2D`) when it
   survives substitution. Under a `~` syntax, a C*Base template pasted into our
   file prints `£t14` literally - loudly and traceably wrong - and one of our
   mistyped codes prints `-F_NAME` rather than something that looks plausible.
   Both failures are visible on the glass. Under a `£` syntax neither would be.

**The one thing the syntax must not make worse, and does not:** nothing in this
design ever emits a `£`, ever consumes one, or ever changes what a `£` in an
existing screen renders as. Round-tripping a screen between the two systems is
lossy today and is exactly as lossy after this lands.

### The file format

```
; a comment - any line whose FIRST character is a semicolon
[HEADER]
<template lines, printed once per listing pass>
[ROW]
<one template line per output row, per record>
[FOOTER]
<template lines, printed after the last record of the pass>
[RECORD]
<template lines, the single-record block>
```

- A section header is a line whose entire content is `[NAME]`. Four names are
  recognised; any other is a malformed-file condition (below).
- A comment is a line whose first character is `;`. **To start a template line
  with a literal `;`, prefix it with `~t00|`** - a tab to column 0, which emits
  nothing when the cursor is already at column 0. That is the documented escape
  and it needs no new syntax.
- Everything else is a template line: literal text plus MCI codes.
- The file is UTF-8. Non-ASCII characters go through the same
  `unicode-to-petscii` encoder every screen uses, so `▔` in the header is one
  `$A3` on the wire.
- **The template is always rendered with `flavour: 'petscii'`**, because it is
  only ever reached through `isNarrow(session)` and that can only be true for a
  PETSCII session. A `~c4|` in it is always one VIC pen byte and never an SGR
  escape. There is no ambiguity to resolve at render time.
- **The express.e first-byte `~` MCI opt-in gate does NOT apply.** That gate
  (`express.e:6800-6806`, honoured at `petscii-screen.render.ts`) is for
  `displayScreen` files, where a file might be art. A template file is never
  art and is never routed through `displayScreen`; MCI is always on.

### `~t<nn>|` - the column tab

A new entry in `mci-dispatch.ts`'s **global** `prefixDispatch`, beside `~x` and
`~y`. Available in every screen file, not only in templates - the research
names it the single highest-value addition to our MCI set, and scoping it to
one file would waste it.

Semantics, copied from C*Base's implementation (`ml1.o.asm:1464-1490`):

```
  ~t<nn>|   nn = two decimal digits, the 0-based TARGET COLUMN
            if the current printable column is already >= nn : emit nothing
            if nn >= the row width (40)                      : emit nothing
            otherwise                                        : emit (nn - col) SPACES
```

**Forward-only, pad-with-spaces. It never wraps and never truncates**, so a
field that has overrun its column simply butts up against the next one. That is
C*Base's behaviour and it is why C*Base caps its filenames; ours are capped by
the DIR grammar and by the template's own width prefixes.

**It emits SPACES, not a cursor move, in both flavours.** This is the one place
it deliberately differs from `~x`/`~y`, and there are two reasons, either of
which is sufficient:

1. A cursor move leaves the skipped cells holding whatever was there before, so
   tabbing past a shorter previous row would show stale glyphs. Spaces
   overwrite.
2. The INTERNAL listing path has no machine at all - it builds strings for
   `getDisplayLines()`. A `MOVE` sentinel, which is how `~x`/`~y` defer their
   walk (`mci-dispatch.ts`, the `x:` / `y:` prefix rows), would be unresolvable
   there. Spaces are the only form BOTH paths can produce, and decision 11
   requires both paths to produce the same one.

**The column it counts is the PRINTABLE column of the current output row.** Pen
bytes, reverse toggles and SGR runs count zero; `printableLength()`
(`table-format.util.ts`) is the function. **A `~CR|` or `~n1|` in a template
line resets the tab origin**, because it starts a new output row. That is
stated so nobody reads `~t` as file-absolute.

**Landing it is a byte change on the ANSI path** for any existing screen that
happens to contain a `~t` sequence, which today falls through and re-emits
literally. The pre-flight is a grep of every shipped screen and the volume's
`Screens/`, and the gate is `tests/handlers/mci-dispatch-ansi-pin.test.ts`
staying green.

### `~F_*` - the record fields, scoped

The record fields are **not** in the global dispatch. The layout interpreter
builds a small dispatch per record and merges it over the global one, so `~F_NAME|`
means nothing on a `MENU.TXT` where there is no record, and a sysop who types
it there gets express.e's fall-through, not a stale value.

They use the **underscore prefix family** the dispatch already has
(`CC_`, `SS_`, `SR_`), for a reason that is not stylistic: `~FD`, `~FC`, `~FF`,
`~FL` and `~FU` are ALREADY TAKEN in the global dispatch (files downloaded,
flagged count, flagged list, flagged files, files uploaded -
`mci-dispatch.ts:353-365`). A two-letter `~F*` record family would collide with
five existing codes. `F_` collides with none.

Width prefix works as everywhere else, so C*Base's 16-character filename cap is
expressible as data - `~16F_NAME|` - rather than as a constant in code.

| Code | Field | Reliability | Notes |
|---|---|---|---|
| `~F_NUM\|` | ordinal within this listing pass, 1-based | reliable | the argument to `FI <n>` |
| `~F_NAME\|` | filename, as written in the DIR entry | reliable | never wrapped |
| `~F_SIZE\|` | `ceil(bytes/1024)` with a `K` suffix | reliable | `formatNarrowSize()` |
| `~F_BLOCKS\|` | size as `ceil(bytes/254)`, bare integer, no unit | reliable | the C*Base column, offered as an option |
| `~F_FLAG\|` | status marker `P` / `F` / `N` / `D` | reliable | one column |
| `~F_NEW\|` | `*` when new to this caller, else a space | reliable | `dirLineNewFile()`; blank on a `dd-Mon-yy` date |
| `~F_DATE\|` | the date string the source carried | reliable | never reformatted |
| `~F_VERSION\|` | `v<version>`; empty when unknown | reliable | a version already starting `v`/`V` is not given a second |
| `~F_DESC\|` | the description | reliable | the only field that ever wraps, and only in `[RECORD]` |
| `~F_GROUP\|` | group name, uppercased; empty when unknown | BEST EFFORT | never in a list row |
| `~F_AUTHOR\|` | author handle; empty when unknown | BEST EFFORT | |

Two whole-line rules, and they are the only conditionals in the language:

- **An all-empty line is dropped.** A template line is not emitted at all when
  every `~F_*` code on it resolves to empty AND the line contains no other
  printable character. That is what makes "the GROUP row is omitted when the
  group is unknown" and "the DESC row is omitted when there is none" fall out
  of the data instead of out of code.
- **`~F_DESC|` wraps in `[RECORD]`; everything else, everywhere, clips.** In
  `[RECORD]` a description longer than the remaining row is word-wrapped onto
  continuation rows that repeat the column it started at, capped at two rows.
  In `[ROW]` every field clips, `~F_DESC|` included - `[ROW]` is exactly one
  output row by definition, which is what decision 2 promises and what the
  adapter's rung relies on. A sysop who puts `~F_DESC|` in `[ROW]` gets a
  clipped description column, not a second row. Every other field, on either
  surface, is clipped by its declared width prefix, or at column 40 if it has
  none.

There is no branch code, no expression evaluator and no variable. C*Base has
all three (`£b`, `£@:<BASIC expression>:`, `£v0..£v9`); we do not adopt them,
because the only conditional this layout needs is "drop an empty line" and an
expression evaluator in a sysop-editable file on a live board is a much larger
decision than this spec is making.

### The shipped default, verbatim

```
; AmiExpress-Web - the 40-column file view layout.
; Columns are 0-based. ~tNN pads forward with spaces and never truncates.
; Fields: ~F_NUM ~F_NAME ~F_SIZE ~F_BLOCKS ~F_FLAG ~F_NEW ~F_DATE
;         ~F_VERSION ~F_DESC ~F_GROUP ~F_AUTHOR
; A line whose every field is empty and which has no other printable
; character is not printed at all.
[HEADER]
~c7|#~t05|Size~t13|Filename~t31|Date
~c4|▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
[ROW]
~c7|~4F_NUM|~t05|~c2|~6F_SIZE|~t11|~c3|~1F_FLAG|~1F_NEW|~t13|~c6|~12F_NAME|~t31|~c4|~9F_DATE|
[FOOTER]
~c4|▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔▔
[RECORD]
~c6|~F_GROUP|
~c7|~F_DESC|
~c3|~F_NAME| ~F_VERSION|
~c2|~F_SIZE| ~F_FLAG|~t31|~c4|~F_DATE|
```

Every column position in "The 40-column record" above is produced by that text
and by nothing else. Moving the date to column 28 is editing one `~t31|` in
`[ROW]`; swapping to disk blocks is `~5F_BLOCKS|` in place of `~6F_SIZE|`.

### Loading, snapshotting and reloading

`web/backend/src/services/file-layout.service.ts`:

```ts
export interface CompiledFileLayout {
  readonly header: readonly string[];   // raw template lines
  readonly row:    readonly string[];
  readonly footer: readonly string[];
  readonly record: readonly string[];
  /** sha1 of the SOURCE BYTES this was compiled from, or of the built-in
   *  default when the file is absent. The identity a test pins. */
  readonly sha1: string;
  /** Sections that fell back to the built-in default, if any. */
  readonly fellBack: readonly ('header'|'row'|'footer'|'record')[];
}

export function getFileViewLayout(): CompiledFileLayout;
```

- The object is **frozen**, and every field on it is frozen.
- The cache is refreshed by an **mtime guard** on `Prompts/FILEVIEW.40`,
  checked before a listing pass begins - the
  `revalidateBbsCommandsIfChanged()` pattern (RULES.md 10b), not an
  unconditional re-read and not a watcher. A sysop's edit reaches the next
  listing with no restart.
- **A pass takes ONE snapshot and holds it to the end.** A listing pass calls
  `getFileViewLayout()` once, before the header; an adapted frame calls it once
  per frame. A sysop saving the file mid-listing cannot split a screen between
  two layouts, and the two paths cannot be handed different layouts for the
  same record.

### When the file is missing or malformed

The rule is the one the whole spec runs on: **never a broken listing.** Three
states, exhaustively:

1. **The file is absent.** The **built-in default** is used, and it is
   byte-identical to the shipped `Prompts/FILEVIEW.40` - the file on disk is
   GENERATED from the constant by a script, and a drift test asserts the two
   are equal, exactly the `renderMirror` shape SP1 uses for `describe.ts`. So a
   board with no `Prompts/` prints exactly what a board with the shipped file
   prints. Nothing is logged: this is a valid state, not an error.
2. **A section is absent.** That section alone falls back to the built-in
   default for that section; the sections the sysop DID write are honoured, and
   `fellBack` names the ones that did not. One line in `logs/backend.log`,
   keyed by the file's sha1 so an edit re-logs and a busy board does not
   repeat.
3. **A section is malformed.** The section is **refused whole** and falls back
   to the built-in default for that section, logged the same way, naming the
   section and the offending token. It is never rendered with a hole, because a
   hole in a listing is the identity-field loss this whole spec exists to stop.
   There is no partial acceptance and no repair.

**"Malformed" is defined narrowly so the rule cannot be read two ways.** A
section is malformed if and only if it contains:

- an unknown `~F_*` code (a `~F_` prefix whose suffix is not in the field
  table), or
- a `~t<nn>|` whose `nn` is not two decimal digits in `00`..`39`, or
- more than the row budget of template lines: `[ROW]` accepts exactly one line,
  `[HEADER]` and `[FOOTER]` at most 4 each, `[RECORD]` at most 8.

Anything else the tokenizer already handles by express.e fall-through, and that
behaviour is unchanged: an unknown `~AB|` emits `~AB|`, a stray `~` emits `~`.
A file with an unrecognised `[SECTION]` header is malformed AS A WHOLE and the
entire built-in default is used.

The sysop sees the diagnostic without reading a log through `SysopDebugUtil`,
which `mci-dispatch.ts` already imports and which surfaces to a sysop with
debug enabled. There is no admin page and no validator command; the file is
small and the failure is one line.

### Byte identity under a layout that is data

Decision 11 - the INTERNAL listing and the DOOR path emit identical bytes - got
harder, because the bytes now depend on an input that lives on the sysop's
volume. The chain that keeps it true, stated so each link is testable:

1. **One interpreter.** `renderFileRow(record, layout)` and
   `renderFileBlock(record, layout)` in `sdk/petscii/frame/file-record.ts`,
   pure, no Node imports. There is no second formatter to keep in step.
2. **One loader, and the SDK never reads a file.** The compiled layout is an
   ARGUMENT. That is what keeps the SDK pure and what lets a test drive a
   fixture layout through both paths.
3. **One snapshot per pass**, frozen, carrying the source `sha1`.
4. **The side-by-side test asserts three things, not one:**
   a. the two paths' row arrays are equal for the same record;
   b. the two snapshots' `sha1` are equal - proving they consumed the same
      layout and not merely that they agree today;
   c. **re-run with a DIFFERENT fixture layout, the output changes AND the two
      paths still agree.** This is the assertion that proves both paths follow
      the data rather than both happening to hardcode the default. Without (c)
      a pair of hardcoded formatters passes (a) and (b) for ever.
5. **The 40-column byte pin gains an input.** It pins
   `(layout sha1, record) -> rows`, not `record -> rows`. Because the committed
   fixture layout and the shipped default are byte-identical (the drift test in
   state 1 above), the pin still says what the board actually prints.

**What is deliberately NOT claimed.** A sysop who edits `Prompts/FILEVIEW.40`
changes what his board prints, and no test in this repo pins that. That is the
whole point of layout-as-data, and it is the same contract `Screens/*.TXT`
already has: the board pins its own defaults and honours the sysop's edits. The
invariant that survives every edit is the one that matters - **both paths
always print the same bytes as each other**, whatever the layout says.

## The logo pack and its resolver

### Where the logos come from - a workflow, not code

The 2026-09-03 draft assumed the pack would be hand-built or fed by an
importer. It does not have to be either.
`thoughts/shared/research/2026-09-06_cbase-petscii-viewer.md` section 2
establishes that **Petmate ships a native `.seq` exporter**
(`wbochar/petmate9`, `src/utils/exporters/seq.ts`, `saveSEQ`), and
`Screens/groups/<KEY>.seq` is defined right here as "40-column PETSCII art, raw
C64 bytes" that go out on the PETSCII byte path exactly as every other `.seq`
does. The two ends already meet. **There is no importer in this spec and none
is needed.**

The instruction to the sysop's friend, which is the whole of the authoring
side:

> Draw at 40 columns and at most 10 rows. **File -> Export -> SEQ**, with
> *Insert charset* and *Insert CR* ON, *Insert clear screen* **OFF** (the logo
> is composited into a record, not a whole screen), *Strip blanks* off. Name it
> `<GROUP>.seq` and drop it in `Screens/groups/`.

What `saveSEQ` emits, checked against our machine: `$93` only when *Insert
clear* is on (hence off); then `$0E` or `$8E` for the charset bank; then, per
cell, a colour control byte from the standard 16-entry table - identical to our
`PETSCII_COLOR_TO_VIC` (`sdk/petscii/c64-palette.ts:28-31`) - when the colour
changes, `$12`/`$92` around a reverse run, and the character byte. It never
emits `$02`, so an imported logo inherits the session's background, which is
what a logo composited into a record wants.

**Two byte-level traps, both from the research, both carried into the tests:**

1. **The exporter does not clear its own reverse state after `$0D`.** `appendCR`
   emits `bytes.push(currev ? 0x0d : 0x8d)` and leaves `currev` set. On a real
   C64 - and in our machine, `petscii-machine.ts:140` - `$0D` cancels reverse,
   so the first reversed cell of the NEXT row comes out un-reversed. Predictable
   and avoidable: ask for art whose row ends are not reversed. The pack's
   byte-identity test carries a fixture whose last cell on a row is reversed and
   asserts our machine's reading of it, so the trap is documented as an
   executable fact rather than as advice.
2. **Screen code `$5E` (pi) is exported as `$FF` where we would write `$DE`.**
   Both decode back to screen code `$5E` through `printablePetsciiToScreenCode`,
   so it is an equivalent encoding and not a bug - but **the byte-identity test
   over a Petmate round trip must accept both**, and it says so in the test
   file rather than in a comment nobody reads.

### The pack

```
Screens/groups/
  <KEY>.seq        40-column PETSCII art, raw C64 bytes           (the C64 logo)
  <KEY>.txt        80-column ANSI art                             (optional)
  GROUPS.MAP       sysop corrections, one rule per line           (optional)
```

`Screens/` is the board's existing screens directory, reached through
`BbsPathsUtil` - the same place `.seq` art already lives, resolved
case-insensitively through `amigafs`, on the data volume the sysop already
edits. **Adding a logo is dropping `PDX.seq` into that directory.** No code, no
tooltype, no restart: the directory listing is cached behind an mtime guard,
the same pattern `revalidateBbsCommandsIfChanged()` uses for `Commands/`.

**The image ships NO `.seq` and NO `GROUPS.MAP` under `Screens/groups/`** -
only a `README.md` explaining the Petmate workflow above. This is a hard rule,
and it is the corrected Risk 5: `Screens/` is in the entrypoint's
always-overwrite tar sync (`docker-entrypoint.sh:605`), so a `GROUPS.MAP`
shipped in the image would clobber the sysop's corrections on **every** deploy.
Extraction only writes paths the archive contains, so a file the image does not
ship is a file the sync cannot touch. A sample lives beside the README as
`GROUPS.MAP.example`, which the sync may overwrite freely because nobody edits
it.

### The key, and its normalisation

```
normaliseGroupKey(name):
  1. fold Latin-1 accents to their ASCII base letter
  2. uppercase
  3. delete every character outside [A-Z0-9]
  4. clip to 20 characters
  empty result -> no key, and therefore no logo
```

| Group as written | Key | File |
|---|---|---|
| `Outlaws` | `OUTLAWS` | `OUTLAWS.seq` |
| `New Order` | `NEWORDER` | `NEWORDER.seq` |
| `/X-POWER` | `XPOWER` | `XPOWER.seq` |
| `5D` | `5D` | `5D.seq` |
| `Mystic!` | `MYSTIC` | `MYSTIC.seq` |
| `TRSI` | `TRSI` | `TRSI.seq` |

Spaces and punctuation are deleted rather than replaced, so a key is always a
legal AmigaDOS filename with no quoting. Two different groups CAN normalise to
one key (`The Company` and `Thecompany`); that is accepted, and `GROUPS.MAP`
is the fix when it ever happens.

### The resolver - one function, every caller

```ts
resolveGroupLogo(group: string, opts: { columns: 40 | 80 }):
  | { kind: 'seq';  bytes: Buffer }     // 40, a .seq exists
  | { kind: 'ansi'; text: string }      // 80, a .txt exists
  | { kind: 'name'; line: string }      // neither: the group name, uppercased,
                                        // clipped to `columns`, no decoration
```

Unchanged from the 2026-09-03 draft. It never returns nothing: an unknown group
with no file still gets its name on one line, which is why the caller never
needs a branch. Rules:

- **Height cap.** A `.seq` with more than 10 rows is REFUSED and the `name`
  form is used instead, with one line in `logs/backend.log` naming the group -
  once per group per boot. A 20-row logo in a file view would eat the screen,
  and silently truncating art is the thing this whole spec exists to stop.
- **`.seq` bytes are raw.** They go out on the PETSCII byte path exactly as
  every other `.seq` does; they are not transduced, not wrapped, not MCI-
  substituted, and they are NOT a `~F_*` field. Raw C64 bytes cannot travel
  through a text template without an escape mechanism this design does not
  want, so the caller prints the logo BEFORE the `[RECORD]` block rather than
  from inside it.
- **`.txt` is never used by a file surface.** Decision 4 freezes every
  80-column file format, listing and single record alike, so the `.txt` half of
  the pack exists purely for the other consumers below - the ones that adopt
  the resolver later and have no frozen bytes.

### Consumers

| Consumer | Uses | In this spec's scope |
|---|---|---|
| A file record in a LIST at 40 (both paths) | **nothing at all** | yes - see below |
| A single file record at 40 (`FI <n>`, search hit, upload/download announcement) | `seq`, falling back to `name` | yes |
| ANY file surface at 80 | nothing at all - decision 4 | n/a |
| DOORREPO browsing (`Doors/DoorRepo`, `Doors/door-manager`) | `seq` / `ansi` | adopts it |
| Conference and area screens | `seq` / `ansi` | adopts it |
| The achievement door (`docs/superpowers/specs/2026-09-03-global-achievements-design.md`) | `seq` / `ansi` | adopts it |

**In the hybrid layout the group has NO place in the list at all** - not the
art, and not the name row the 2026-09-03 draft's decision 11 - the group-run
header - gave it. Under
decision 2 a list row is identity fields at fixed columns, and a group header
interleaved between runs of records breaks the column grid a fixed-column
listing exists to provide. The group belongs to the single-record view, which
is also where the caller is actually asking "what is this release".

That change also removes the 2026-09-03 draft's most awkward requirement - "the
run is tracked within ONE listing pass, and on the adapter path within one
rendered frame, so a record that opens a frame reprints it" - which was two
different behaviours on the two paths and therefore a standing threat to
decision 11. It is gone, and decision 11 is stronger for it.

The two reasons art is not in a list stand unchanged and are recorded because
they also bound any future request to put it back:

1. A `.seq` is raw PETSCII bytes. The adapter renders a frame DIFF; raw PETSCII
   arriving mid-stream drops the diff baseline and forces a full repaint (it
   says so at `web/backend/src/server/c64-door-adapter.ts`, the raw-PETSCII
   clause). One full repaint per record makes a listing unusable.
2. Six-row art per record on a 25-row screen leaves room for three records.

Rendering `.seq` art INTO adapter frame cells - so it could ride the diff - is
a real option and is deferred, not refused (see "Explicitly out of scope").

### `GROUPS.MAP`

Plain text, next to the logos, on the data volume. One rule per line, first
match wins, top to bottom:

```
# filename glob = group name
OTL-*    = Outlaws
FLT-*    = Fairlight
PDX*     = Paradox
LSD*     = LSD
```

`#` starts a comment. The glob is matched case-insensitively against the
filename only. A rule beats every derived source (decision 9), so a release
whose DIZ names no group still gets its logo. The file is re-read on mtime
change, like the directory listing.

This is the sysop-correction UI, and it is deliberately a text file rather than
an admin page: the board's configuration is disk-based (RULES.md 10), the
sysop is already in that directory to drop the `.seq` in, and a database column
with no editor would be a field nobody could correct.

(`GROUPS.MAP` uses `#` for comments and `Prompts/FILEVIEW.40` uses `;`. That is
not an inconsistency to tidy: `#` is the first printable character of the file
view's own header row, so a `#` comment marker in the template file would be
ambiguous against real content, while a filename glob can never begin with `#`.
Each file uses the marker its own content cannot collide with.)

## The adapter's stack rung and the byte-identity requirement

### The rung

`sdk/petscii/frame/adapt.ts` gains ONE option and ONE rule name:

```ts
export type AdaptRule = 'crop' | 'deindent' | 'gutter' | 'narrow' | 'reflow'
                      | 'split' | 'squeeze' | 'stack';

export interface AdaptOptions {
  cols?: number;
  rows?: number;
  regions?: RegionPin[];
  /** Consulted at each source row BEFORE chooseRule. Answers with the rows to
   *  emit and how many source rows they replace, or null to fall through to
   *  the ladder. Pure: the SDK never learns what a file record is. */
  blockRenderer?: (frame: Frame, y: number) => { rows: Cell[][]; consumed: number } | null;
}
```

`adaptRows` calls `blockRenderer(src, y)` first; on an answer it appends the
rows with `rule: 'stack'` and advances `y` by `consumed`. A pinned region may
name `'stack'` the way it names any other rule, and an EXPLICIT pin (anything
but `'auto'`) wins over the hook - a pin is a deliberate override and the hook
is a default. The two new rule names arrive with their own sub-projects:
`'stack'` with SP6, `'squeeze'` with SP7; neither waits for the other. The
cursor map for a consumed block sends every source column to the block's FIRST
output row at column 0 - a record row is never the row a door leaves the cursor
on (that is the prompt row, which no renderer claims), and if it ever were, the
cursor lands somewhere visible and stable rather than inside a field that no
longer exists.

**It is still a BLOCK hook, not a row hook, even though a list record is now
one row out.** A record's description arrives as its CONTINUATION rows -
`readDirFile`'s grammar and AquaScan's own output both put the DIZ on the rows
after the header at indent 33 - and those rows must be CONSUMED by the record
rather than adapted a second time on their own. Under decision 2 they are
consumed and DISCARDED for a list row rather than rendered; discarding them is
still consuming them, and `consumed` is still greater than one. This is the
main thing decision 2 changes about the rung: `rows.length` is now 1 while
`consumed` may be 1..n, where before both grew together.

### The closure the backend passes

In `web/backend/src/server/c64-door-adapter.ts`, per adapted frame:

1. `getFileViewLayout()` ONCE, at the top of the frame - the snapshot rule.
2. `parseFileRecordRow(rowText)` - the express.e DIR grammar, shared with
   `dir-file-reader.util.ts`'s `isNewFileEntry` / `readDirFile` (that grammar
   moves into the shared pure module and `dir-file-reader` calls it, so there
   is ONE grammar): filename in the first 12 columns, a status marker of
   `P`/`F`/`N`/`D`, a size, a date, a description tail. Anything that does not
   match returns null and the row falls through to today's ladder untouched.
3. Consume following rows whose first 33 columns are blank as the description
   block.
4. Look the filename up in `file_index` for the session's conference, through
   a per-door-run `Map` cache so a repeated filename costs nothing. A miss, or
   the ambiguity rule above, means the record renders from the PARSED row
   alone - which already carries filename, marker, size, date and the printed
   description tail. **The rung is therefore useful before the index exists at
   all**, and the index only ever ADDS. Under decision 2 a LIST row needs
   nothing from the index at all, so this step is skipped entirely for a list.
5. Call `renderFileRow(record, layout)`, incrementing the frame's ordinal.
6. Convert the strings to cells, each row inheriting the foreground colour of
   the source row's first non-blank cell, so a coloured listing stays coloured
   - EXCEPT where the template set a colour of its own, which wins.

Cost per frame is a prepared `SELECT` on an indexed key per distinct filename,
inside the 30 ms `C64_ADAPT_TICK_MS` budget - and under decision 2 a list frame
does no `SELECT` at all.

### Marks

Once the rung and the interpreter are in, `F`, `FR` and `N` get `C64_ADAPT=40`
in `Commands/BBSCmd/{f,fr,n}.info`, written with `applyTooltypes()` (bytes,
never an editor), and they show `[C64]` in the doors list. All three are
AquaScan under three registrations, so all three are proven by the same
captures - but each is marked separately, because the claim is per registration
and not per executable (the `RTW` precedent from Phase 3).

## The DIZ fallback ladder

For a record with no metadata and no group - the DIZ art is all there is. This
is the SINGLE-record path only; a list row has no room for a DIZ and never
reaches the ladder.

### Order

1. **SQUEEZE** - runs of 2+ spaces collapse to one, ONLY on rows
   `classifyRow()` calls `'prose'`.
2. **REFLOW** - prose still wider than 40 after squeezing is word-wrapped
   through `wrapLineToWidth`, as today.
3. **CROP** - art keeps its left edge and loses its right, marked with `>`.

### What the measurement says about squeeze, honestly

Modelled as a pre-pass in front of the existing ladder over every real
`FILE_ID.DIZ` in this tree
(`.superpowers/sdd/2026-09-03-c64-door-marks/progress.md`):

**SQUEEZE FIRES ZERO TIMES.** Every DIZ row too wide for 40 classifies `art` or
`bordered`; every row the classifier calls `prose` - six rows, across two files
- is already 38 columns or narrower. Row for row, the proposed ladder and
today's ladder produce IDENTICAL output on all seven files. That is a
measurement, not an assumption, and it is in the record because the rung must
not be sold as fixing something it does not touch.

The rung is still built, in the place where it pays: **the description text of
a record** - which is prose, is padded by the door that printed it, and today
never reaches a rung that could use it because `narrow` eats the whole record
row first. The `~F_DESC|` field squeezes before wrapping, and the ladder rung
covers the DIZ case that this board does not happen to contain today.

It stays gated on `prose` for the reason the same capture shows:

```
  DIZ art, FILE_ID.DIZ row 2 (44 columns, classified 'art')
    "|NEW    ____________   ____________  BRINGS|"
  squeezed
    "|NEW ____________ ____________ BRINGS|"
  - 37 columns, it fits, and the picture is destroyed.
```

### The art switch

Art wider than 40 loses its right edge, and that is accepted (decision 15). A
sysop who would rather see nothing than half a picture sets `DIZ_ART_SKIP=YES`
on the command's `.info`; the block is then replaced by one line:

```
[ART - SKIPPED]
```

Uppercase ASCII, the same shape as the board's existing
`[80-COLUMN ANSI SCREEN - SKIPPED]` token. The tooltype states the RESTRICTION
and defaults to absent-means-off, so every existing `.info` keeps today's
behaviour (the codified rule: a tooltype boolean cannot default to true).

## Testing

Per `.claude/skills/door-three-screens/SKILL.md`: every test drives a real
entry point, and every claim about bytes is a pin, not an inspection.

The skill's three screens map onto this work as TWO: these surfaces are BBS
listings, not a door UI with a growable layout, and the backend clamps ANSI
prose to `max(80, reported)` - so the responsive tier and the fixed 80-column
tier are the same bytes here, covered by test 1. Test 2 is the 40-column
screen, and test 10 is its PETSCII oracle.

**1. 80-column identity - untouched.**
- The existing `web/backend/tests/handlers/narrow-tables.test.ts` 80-column
  literals stay green with no edit.
- `tests/handlers/mci-dispatch-ansi-pin.test.ts` stays green after `~t` lands.
  It is the gate on the one MCI change that can reach an ANSI caller.
- A new byte pin on `F`/`FR` at 80: the DIR raw lines the listing emits for a
  fixture conference, captured before the change and asserted after.
- The adapter corpus e2e
  (`web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts`, 123
  cases) stays green: no rule assignment on a NON-record row may change.
- An ANSI session opening `F` after the marks land emits byte-identical output
  to an ANSI session opening it before.

**2. The 40-column LIST row.** Table-driven against `renderFileRow` with the
built-in default layout: the row is <= 40 columns; each field lands on the
column the map above states; the size is `ceil(bytes/1024)+'K'`; the date is
verbatim and starts at column 31 for both the 8- and the 9-character forms; the
marker is present; the filename is never shortened; the new-file flag is `*`
for a record newer than the caller's new-since date and a space otherwise. Both
worked examples are fixtures, asserted character for character.

**3. The 40-column SINGLE record.** Table-driven against `renderFileBlock`:
description first; the GROUP line dropped when the group is unknown; the DESC
line dropped when there is none; the description capped at two rows; three rows
when there is no group, four with one. Worked examples 1 and 2 are fixtures.

**4. Pagination.** A PETSCII session drives the real `F` handler over a fixture
DIR file of 60 entries and gets exactly 23 records before the first pause and
exactly 25 before the second, with the header printed once and not reprinted
after a pause, and with no record counter anywhere but `flagPause()`. Prove RED
by reprinting the header per page, and again by rolling a per-record counter.

**5. The layout language.**
- `~t<nn>|`: pads to the target column; emits nothing when already at or past
  it; emits nothing for `nn >= 40`; counts a pen byte as zero width; resets
  after a `~CR|`.
- The `~F_*` family: every code in the field table resolves; a width prefix
  clips; `~16F_NAME|` reproduces C*Base's 16-character cap; an unknown `~F_*`
  makes its section malformed.
- The all-empty-line drop rule; `~F_DESC|` wrapping and capping at two rows in
  `[RECORD]`; and `~F_DESC|` CLIPPING rather than wrapping in `[ROW]`, so a
  list row is one row whatever the template says.
- `~F_NAME|` and friends resolve to NOTHING outside a record render (the scoped
  dispatch is not global).
- **Layout independence:** the same record through the same interpreter with
  two different fixture layouts produces two different, individually-asserted
  row sets. This is what proves the interpreter reads the data.

**6. The layout loader.**
- The file absent -> the built-in default, with `sha1` equal to the default's.
- **The drift test:** the committed `Prompts/FILEVIEW.40` is byte-identical to
  the built-in default constant. Prove RED by editing one byte of either.
- A missing `[FOOTER]` -> that section falls back, the other three are the
  sysop's, and `fellBack` names it.
- Each of the three malformed conditions -> that section refused whole, the
  others honoured, one log line naming the section and the token.
- An unrecognised `[SECTION]` header -> the whole default, one log line.
- The mtime guard picks up an edit made while the board runs, with no restart,
  and does NOT re-read an untouched file.
- The snapshot rule: a layout edited between two `getFileViewLayout()` calls
  inside one pass does not change the pass.

**7. The side-by-side pin.** ONE test, the point of decision 11: the same
record - `CB4!ST13.LHA` from the captured AquaScan frame, and the same record
in a fixture DIR file - is driven through
(a) the internal listing handler with a stub session at 40x25 `petsciiMode`,
(b) `adaptFrame` with the backend's `blockRenderer` over the captured frame,
and the two string arrays must be equal, AND their layout `sha1` must be equal,
AND the whole test must be re-run with a second fixture layout that changes the
output on both paths identically. Prove RED three ways: give one path its own
size formatter (a fails); give one path a stale snapshot (b fails); hardcode
the default in one path (c fails).

**8. The extractor drift test.** As specified above: the mirror equals
`renderMirror(contract/describe.ts)` when the sibling checkout is present
(skipped, not faked, when absent), `DESCRIBE_CONTRACT_VERSION` matches, and the
committed `describe-fixtures.json` corpus produces identical output in both
repos. The eight measured rows in this spec are fixtures in it.

**9. The resolver and the pack.** The normalisation table above, case by case;
a `.seq` found; a `.txt` found at 80; neither found -> the `name` line, clipped;
an 11-row `.seq` refused and logged once; a `GROUPS.MAP` rule beating a derived
group; a malformed `GROUPS.MAP` line ignored without taking the file down; the
mtime guard picking up a logo dropped in while the board runs (no restart).
Plus the two Petmate traps as executable facts: a fixture `.seq` whose last cell
on a row is reversed, asserted against our machine's `$0D`-cancels-reverse
reading; and a round-trip fixture containing screen code `$5E`, where BOTH
`$FF` and `$DE` are accepted.

**10. PETSCII oracle.** The rendered 40-column rows - list and single record -
go through `AnsiToPetsciiTransducer` into a `PetsciiMachine` and every glyph
drawn must be on the glass - no `?` - following
`web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts`. The
header's `▔` rule is in this test explicitly, because it is the one non-ASCII
glyph the default layout uses. `.seq` logo bytes are excluded by construction
(they never enter the frame model).

**11. A fixture DIZ per fallback rule.** Three rules have real DIZ on this board
and are fixtures from the measured corpus: `crop` and `narrow` (board root
`FILE_ID.DIZ`, 10 rows in, 10 out, 3 marked), `split` (`Doors/5DPAGER`, 11 rows
in, 12 out), and the all-`prose` case that needs no rung at all
(`Doors/ACCV105`). `deindent`, `squeeze` and `reflow` are reached by NO real
DIZ on this board, so their fixtures are synthetic and are LABELLED synthetic
in the test file, each with a comment pointing at the measurement - so nobody
later reads them as evidence that a real DIZ needs them.

**12. Gate reachability.** `F`, `FR`, `N` and the new `FI` are added to
`web/backend/tests/doors/compact-40/marked-doors-launch-on-c64.test.ts`: a
PETSCII session launches each through the real `executeDoor` and gets adapted
frames; an ANSI session launches each byte-identically.

**13. Index behaviour, through the real entry points.** An upload walk writes an
index row with the right description and version; a DIR file edited on disk is
re-indexed on the next listing (mtime guard) and NOT re-indexed when untouched;
a bumped `DESCRIBE_CONTRACT_VERSION` invalidates rows; the ambiguity rule
returns null for two disagreeing DIRs; a missing index row still renders a
complete `FI <n>` record from the parsed row, and a complete LIST row (which
never needed the index).

**14. Prove RED.** Remove the `prose` gate from squeeze - the art fixture must
fail. Remove the block hook - the side-by-side test must fail. Put a second
size formatter in one path - the side-by-side test must fail. Revert the
description cap - the single-record test must fail. Make `~t` a cursor move
instead of spaces - the internal-listing test must fail, because it has no
machine to move.

## Risks

1. **A non-record row that looks like a record.** The `stack` rung recognises
   rows by a grammar, and a false positive would rewrite a row that was not a
   file record. Mitigated by using the SAME grammar express.e uses (12-column
   name, marker at column 13, size, date) and by falling through on any
   mismatch; pinned by the 123-case corpus e2e, in which no non-record row may
   change rule. Residual: a door whose own table happens to match the grammar
   gets its rows restyled. It would still be readable, and it would show up as
   a corpus diff.
2. **A sysop breaks his own listing.** Layout-as-data means a sysop can write a
   template that puts the date on top of the filename, and no test will catch
   it because it is his board. Mitigated by the three malformed conditions
   being refused whole rather than half-rendered, by the built-in default being
   one deletion away (`rm Prompts/FILEVIEW.40` restores it), and by
   `sync_tracked` remembering that he edited it so a deploy never surprises him
   with a different layout. NOT mitigated: a template that is well-formed and
   ugly renders exactly as written. That is the deal.
3. **Group misattribution.** Prefix tags are 1-5 characters (`SR`, `HF`, `AD`
   are real tags on this board), so two groups can collide and a record can get
   the wrong logo. Cosmetic, never destructive - no field is lost - and one
   `GROUPS.MAP` line fixes it. `group_source` says which rule answered. Under
   decision 2 the blast radius shrank: a wrong group now shows on one
   single-record screen instead of over a run of list rows.
4. **Index staleness.** A DIR file edited outside the BBS, a contract bump, a
   corpus change. Mitigated by the mtime guard, `diz_sha1`, `tags_sha1` and
   `extractor_ver`; and a stale or missing row degrades to the parsed row,
   never to a broken listing. A LIST row does not read the index at all.
5. **Drift when the sibling checkout is absent.** The mirror test skips, so the
   fixture corpus is what actually guards CI. If someone edits the mirror by
   hand AND regenerates the fixtures to match, drift ships. Accepted: the
   header says GENERATED, and the door server's own copy of the fixtures fails
   in that repo's CI.
6. **The volume, corrected.** `Screens/` is in the entrypoint's
   always-overwrite tar sync (`docker-entrypoint.sh:605`), so anything the
   image ships there lands on the sysop's copy on every deploy. Two
   consequences, both designed for: the image ships no `.seq` and no
   `GROUPS.MAP` under `Screens/groups/`, and the layout templates live in a
   tracked `Prompts/` tree instead. The remaining sharp edge is
   `FORCE_REINIT_SCREENS=1`, which does `rm -rf` on the volume's `Screens`
   before re-copying and would DELETE a logo pack and its `GROUPS.MAP`. The
   pack's sysop documentation says so in the same paragraph that tells them
   where to put the files. `Prompts/` is not touched by that switch.
7. **Row budget - resolved, and inverted.** The 2026-09-03 draft accepted six
   records per C64 screen against ten to twelve today. Decision 2 gives 23 on
   the first page and 25 after it, which is BETTER than today, and the
   descriptions the change removes from the list are one `FI <n>` away. This
   risk is closed.
8. **A database read on the emit path.** The adapter's frame flush is on a
   30 ms tick. Mitigated by a prepared statement, an indexed key, and a
   per-door-run `Map`; and by the miss path being cheap and correct. Under
   decision 2 a list frame does no read at all, so the exposure is the
   single-record surfaces, which are not on a tick.
9. **`file_entries` looks like the right source and is not.** Measured: zero of
   1508 rows carries a description. The indexer reads DIR files; a later change
   that "simplifies" it onto the database would silently empty every
   description on the board. Called out in the service's own header comment.
10. **`~t` reaches every screen file.** It is a global MCI code, so an existing
    screen containing a literal `~t04` changes bytes the day it lands. Pre-flight
    is a grep of the shipped screens and the live volume's `Screens/`; the gate
    is the ANSI pin test. The upside is the reason it is global: every other
    40-column table on this board becomes expressible as data too.

## Explicitly out of scope

- **Any change to the 80-column view.** Not the DIR raw lines, not the search
  format, not the new-files format, not the adapter's non-installation for
  ANSI callers. There is no `Prompts/FILEVIEW.80` and the loader refuses to
  look for one.
- **A `.petmate` importer.** Petmate exports `.seq` natively, so the pack needs
  no code at all. If a friend one day delivers `.petmate` and will not export,
  the research costs it at 120-150 lines plus tests
  (`2026-09-06_cbase-petscii-viewer.md` section 2) - a separate, later
  decision, and it must be written from the format facts rather than copied
  from the GPL-2.0 viewer.
- **The other 27 C\*Base MCI codes.** `~t` is adopted because a fixed-column
  table needs it. `£cp`/`£cq` (reverse video) and the eight missing colours are
  the research's next two recommendations and are a separate, small piece of
  work. `£b` (branch), `£v` (variables) and `£@:<BASIC expression>:` are
  refused outright: an expression evaluator in a sysop-editable file on a live
  board is a much larger decision than this spec is making.
- **A C\*Base-compatibility pre-pass** for `$88` soft line breaks or the
  F1/F3/F5 colour-register substitution. Both are C*Base conventions rather
  than KERNAL behaviour; we would need them only to ingest C*Base art, which
  nothing here does.
- **Re-encoding DIZ art.** No ASCII-to-PETSCII art conversion, no redrawing, no
  "smart" 45-to-40 art fitting. The art is skipped or cropped; that is the
  whole set of options.
- **Inventing metadata the DIZ does not contain.** If the extractor answers
  nothing, the field is absent. No guessing a group from a description, no
  synthesising a version from a date.
- **Scraping anything beyond the existing door-repo catalog.** No Demozoo call
  from the board, no HTTP at index time. The catalog rows the board already
  has are the whole enrichment.
- **Rendering `.seq` logo art into adapter frame cells** so it could ride the
  frame diff. Deferred, and the hook for it is `blockRenderer` - a later pack
  can answer with cells instead of text.
- **A C\*Base-style `$TRIAD*` group FILTER.** The research names it as the
  cheap interaction a C64 user already knows, and it is a genuinely good idea -
  but it is a change to what `F` and `FR` ACCEPT, not to what they print, and
  this spec is about the record. Deferred, named here so it is not lost.
- **An admin UI for the file base or for the layout.** `GROUPS.MAP` and
  `Prompts/FILEVIEW.40` are the sysop surfaces.
- **Changing the DIR file format**, the express.e continuation convention, or
  anything a real Amiga would read.
- **The telnet door family** (`telnet`, `bbslink`, `bbslinkwall`,
  `telnet-front`) and pan keys / the adapter viewport. Both stay where the
  Phase 3 handoff left them.
- **`file_entries` schema changes.** The index is a separate table; nothing in
  the existing files schema moves.

## Where C*Base and this board genuinely cannot be reconciled

Three, recorded rather than papered over.

1. **The pause prompt.** C*Base aborts a listing on `A` at
   `[Press A Key / A To Abort]`. Our pause is express.e's
   `(Pause)...(f)lags, More(Y/n/ns)?`, whose bytes are parity-pinned and whose
   `(f)` - flag a file for download from the pause - is a real AmiExpress
   feature with no C*Base equivalent and no room in C*Base's prompt. We keep
   ours. A caller arriving from a C*Base board presses `A` and gets nothing.
2. **The size unit.** C*Base counts 254-byte 1541 blocks and prints a bare
   integer; a C64 caller reads that column as blocks by habit. We print `K`,
   because blocks are meaningless for a file that never touches a 1541. The
   reconciliation is the `K` SUFFIX - it is what tells the eye this is not a
   block count - plus `~F_BLOCKS|` as an option a sysop can switch to. The two
   conventions cannot both be the default; ours is.
3. **Layout as data has a floor.** C*Base's prompt language has a branch (`£b`)
   and a BASIC expression evaluator (`£@:`), so its layout can express
   conditionals. Ours has exactly one conditional - drop an all-empty line -
   and will not grow more. Anything a sysop wants that needs a real condition
   is a code change here, where it is a prompt edit there. That is a deliberate
   floor, not an oversight: the alternative is an evaluator running on a live
   board out of a file the sysop edits, and the board's byte-identity
   requirement would not survive it.

## Decomposition

Seven sub-projects. Each gets its own plan.

**SP1 - the shared extractor.** Move `src/describe.ts` to
`contract/describe.ts` in amiexpress-doorserver (re-export left behind), add
`DESCRIBE_CONTRACT_VERSION`, add the `DESCRIBE_ORIGIN` to the existing
generator, generate `contract/describe-fixtures.json` from the existing test
corpus, and land the mirror plus both drift tests in amiexpress-web. Nothing
else consumes it yet. Touches two repos; changes no behaviour.

**SP2 - the logo pack and its resolver.** `Screens/groups/`, the key
normalisation, `resolveGroupLogo`, `GROUPS.MAP`, the mtime guard, the height
cap, the sysop README carrying the Petmate SEQ-export workflow and the
`FORCE_REINIT_SCREENS` warning, and the tests including the two Petmate byte
traps. No importer. Independent of everything else and immediately useful to
DOORREPO and the achievement door.

**SP3 - the layout language.** `~t<nn>|` in the global MCI prefix dispatch, the
scoped `~F_*` family and its field table, the `Prompts/FILEVIEW.40` format, the
built-in default constant and the script that generates the file from it, the
drift test, `file-layout.service.ts` with its mtime guard and frozen snapshot,
the three malformed conditions, and `Prompts` added to the entrypoint's tracked
sync. Needs nothing but the existing MCI system. **This is the sub-project the
2026-09-06 revision adds, and it is the one with the most new surface.**

**SP4 - the file index.** The `file_index` table, `file-index.service.ts`, the
four group sources, the upload and import hooks, `build-file-index.ts`, and the
freshness rules. Needs SP1 (the extractor) and SP2 (for `GROUPS.MAP`, which is
group source 1).

**SP5 - the record interpreter and the internal listing.** The pure module in
`sdk/petscii/frame/file-record.ts` (parse grammar moved out of
`dir-file-reader.util.ts`, `renderFileRow`, `renderFileBlock`, `squeezeProse`,
`formatNarrowSize`), the re-export from `table-format.util.ts`, the LIST row on
F/FR/N, the header and its rule, the new-file flag, pagination through
`flagPause()`, the SINGLE-record block on search and on the upload/download
announcements, the new `FI <n>` command and its `.info`, and the retirement of
`narrowFileLines`. This is the REFERENCE IMPLEMENTATION. Needs SP2, SP3 and
SP4.

**SP6 - the adapter's `stack` rung and the marks.** `blockRenderer` in the SDK
ladder, the closure in `c64-door-adapter.ts`, the side-by-side pin with all
three of its assertions, the corpus re-run, and `C64_ADAPT=40` on `f.info`,
`fr.info`, `n.info`. Needs SP5.

**SP7 - the DIZ fallback ladder.** The `squeeze` LADDER rung gated on `prose`,
its place in `chooseRule`, the `DIZ_ART_SKIP` tooltype, and the fixture set
(three measured, three labelled-synthetic). The description squeeze is NOT
here - it is `squeezeProse` inside the interpreter and ships with SP5, which is
the place the measurement says it pays. SP7 is independent of SP4-SP6 and only
decides what happens to a block that has no metadata behind it at all.

**Suggested order.** SP1, SP2 and SP3 in parallel (different repos or
different files, no shared file) -> SP4 -> SP5 -> SP6. SP7 may run at any point
after SP5 and is the natural filler while SP6's captures are being re-taken.

**Sequencing note.** Nothing before SP5 changes a single byte for any caller
who is not on a PETSCII session - with one exception to watch: SP3's `~t` is a
global MCI code, and Risk 10 is its pre-flight. SP6 is the only sub-project
that opens a door that is closed today. `F`, `FR` and `N` stay refused with
`THIS DOOR NEEDS AN 80 COLUMN SCREEN` until SP6 lands, which is the honest
state of affairs and not a regression to fix in the meantime.
