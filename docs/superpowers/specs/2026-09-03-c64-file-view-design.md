---
date: 2026-09-03
topic: The 40-column file record - structured fields, a shared description extractor, and a release-group logo pack
tags: [c64, petscii, 40-col, files, file_id.diz, doorserver, contract, adapter, architecture, umbrella]
status: draft
---

# The C64 file view - design

This is the UMBRELLA spec for what a file record looks like on a 40-column
screen, on BOTH paths that can print one: the board's own file listing and a
68K file-lister running through the C64 door adapter. It fixes the data model,
the extractor contract, the layout and the decomposition; it is not itself an
implementation plan. Six sub-projects follow (section "Decomposition").

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

Two more measurements shape the design:

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

## What is being built

At 40 columns a file record is RENDERED FROM STRUCTURED FIELDS, not from DIZ
art. At 80 columns nothing changes at all.

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
  logo is dropping a file in a directory.
- **One record renderer**, pure and shared, that both the board's own listing
  and the adapter's new `stack` rung call, so the two paths produce the same
  forty columns by construction and not by coincidence.
- **A DIZ fallback ladder** for records that carry no metadata at all.

## Settled decisions

Settled with the sysop on 2026-09-03. A sub-project that believes one is wrong
escalates; it does not quietly diverge.

| # | Decision |
|---|---|
| 1 | **At 40 columns a file record renders from FIELDS.** The release group's 40-column logo when the group is known, then the DESCRIPTION (the sysop's explicit order: description first), then filename, version, size, date. The DIZ art is not folded, squeezed or cropped into the record. |
| 2 | **At 80 columns nothing changes.** The DIR raw lines still go out verbatim, the search and new-files formats keep their literal strings, and the adapter is still not installed for an ANSI session. Every existing byte pin stays green. |
| 3 | **ONE extractor, shared, not copied.** `describe.ts` moves to the door server's `contract/` and is mirrored into amiexpress-web by `renderMirror`, with a drift test on both sides. It is pure text processing with no imports, which is what makes this possible. |
| 4 | **The board keeps its own file index** over its whole file base, built by running the shared extractor over each file's recorded DIZ. Doors are ENRICHED from the door-repo catalog (author, releaseGroup, category); nothing else is fetched from anywhere. |
| 5 | **Reliability is stated per field.** Description, version and BBS requirement are reliable. Author and group are best-effort. Category exists only for doors. The UI never presents a best-effort field as a fact. |
| 6 | **Group name is SYSOP-CORRECTABLE**, so a release whose DIZ never names its group still gets a logo. |
| 7 | **A logo pack keyed by a normalised group name**, resolved by ONE resolver used by every caller. Adding a logo is dropping a file in - no code, no restart. |
| 8 | **Both paths produce the same 40 columns for the same record.** The board's internal listing is the reference implementation; the adapter gains a `stack` rung that matches it row for row, and a side-by-side test pins it. |
| 9 | **The DIZ ladder is the FALLBACK** - no metadata, no logo. Order: SQUEEZE runs of 2+ spaces on rows the classifier calls `prose` (never on art), then REFLOW prose still too wide, then CROP art with the `>` marker. |
| 10 | **Art wider than 40 loses its right edge**, and that is accepted. A sysop switch may skip the block with a one-line note instead. |
| 11 | **DERIVED, not settled in conversation:** in a LIST the group identity is the group NAME on one row, printed once per run of same-group records; the logo ART is printed on the SINGLE-record surfaces. Two hard reasons, both in "The logo pack and its resolver": raw `.seq` bytes drop the adapter's frame-diff baseline, and six rows of art per record leaves three records on a 25-row screen. Escalate if the sysop wants art in the list - the option is costed there, not refused. |

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
                                              |  sdk/petscii/frame/file-record  |
                                              |    parseFileRecordRow()         |
                                              |    renderFileRecord()  <- THE   |
                                              |                        renderer |
                                              |         /                \      |
                                              |  internal listing      adapter  |
                                              |  (file-listing,        'stack'  |
                                              |   search, new files)     rung   |
                                              +--------------------------------+
```

One renderer with one input shape, two callers. Byte identity between the two
paths is a property of that arrangement, not something a test has to police
after the fact - the test exists to keep the arrangement from being undone.

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

### Component 4: the record renderer (SDK, pure)

`sdk/petscii/frame/file-record.ts`, exported through the existing
`@amiexpress/bbs-door-sdk/petscii/frame` subpath the backend already imports
(`web/backend/src/server/c64-door-adapter.ts`). It is pure TypeScript with no
Node imports, the same rule the rest of `sdk/petscii/frame` follows, and
`web/backend/src/utils/table-format.util.ts` re-exports it the way
`ascii-art.util.ts` re-exports the frozen detectors - so the board's handlers
reach it without a second copy.

### Component 5: the adapter's `stack` rung (SDK ladder + backend hook)

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

This table is the evidence for decision 5. The extractor ANSWERED on 8 of 8,
and two of those answers (`Workdir`, `1 Minor update`) are exactly as good as
the DIZ behind them, which says nothing about the file - the extractor does not
invent, and decision 5's promise is that a field is reliable, not that it is
interesting. Version: 6 of 8. BBS requirement: 6 of 8. **Author: 0 of 8** -
which is why author and group are BEST-EFFORT and why decision 6 exists. Scene
DIZ carry the group as ART, not as text, and no text rule will read a picture.

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

**Ambiguity rule.** A lookup is `(conf_id, filename)` because the adapter
cannot know which DIR the door is printing. If two DIRs in one conference hold
the same filename and their index rows AGREE on description, version and group,
the lookup answers; if they DISAGREE, the lookup answers null and the record
renders from the parsed row alone. Guessing the wrong description is worse than
showing none.

### Group, four sources, in trust order

1. **`Screens/groups/GROUPS.MAP`** - the sysop's own line (decision 6).
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

### The layout

Four kinds of row, in this order. All widths are exact; a CRLF-terminated row
may use all 40 columns (the PETSCII transducer latches the wrap), which is why
these are 40 and not 39 - a trailing PROMPT is the only thing built to 39.

```
  1  GROUP    the group identity, one row, printed once per RUN of consecutive
              records from the same group; omitted when the group is unknown.
              The run is tracked within ONE listing pass, and on the
              adapter path within one rendered frame - that is all the
              adapter can see - so a record that opens a frame reprints it
  2  DESC     the description, squeezed and word-wrapped to 40, at most 2 rows;
              omitted when the index has none
  3  IDENT    "<filename> <version>"     - version omitted when unknown
  4  FACTS    "<size> <marker>" left, "<date>" flush right at column 40
```

Between two and four rows per record. The field ORDER is the sysop's:
description first, then filename, version, size, date.

Rules that make the layout honest:

- **Identity fields are never shortened.** A DIR filename is at most 12
  columns by express.e's own grammar, so `filename + ' ' + version` fits 40
  unless the version is absurd; when it does not fit, the version moves to the
  head of the FACTS row rather than the filename losing a character. Nothing is
  ever marked with `>` in a structured record - `>` belongs to the fallback
  ladder alone.
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
- **The status marker is kept.** `P`, `F`, `N`, `D` - one column after the
  size. Losing it is exactly the regression the measurement caught.
- **The version is printed as `v<version>`** - `analyseDoor` returns `1.3`,
  not `v1.3` - and a version that already begins with `v` or `V` is not given a
  second one.
- **The description is capped at 2 rows.** From the index that cap never binds:
  `analyseDoor` caps its own output at 60 characters, which is at most two
  40-column rows, so no ellipsis is needed and none is added. On the adapter's
  index-miss path the description is the tail the door printed, which can be
  longer; anything past the second row is dropped. A description is not an
  identity field, and the two rows that survive are the ones the reader looks
  at.

### Worked example 1 - the measured record, group unknown

Source, 80 columns, unchanged by any of this:

```
CB4!ST13.LHA N 119214  01-21-26  Strip`n`Add T N G v1.3m
```

What the adapter does today (the bug):

```
0123456789012345678901234567890123456789
CB4!ST13.LHA N> 01-21-26 Strip`n`Add T >
```

Rendered from fields (description and version are the measured `analyseDoor`
output for this record's DIZ block; the group is unknown, so no GROUP row):

```
0123456789012345678901234567890123456789
The Best Multisystem Checker/Stripper/Ad
CB4!ST13.LHA v1.3
117K N                          01-21-26
```

Three rows. The description is exactly 40 columns and needs no second row;
`117K` is `ceil(119214/1024)`; `01-21-26` ends at column 40.

### Worked example 2 - a real record with a known group

`Conf2/DIR1`, `OTL-RQ21.LHA`, 96759 bytes, status `P`, `21-Jan-70`, its DIZ
block a ten-row ASCII box. The prefix `OTL` is a group tag, so the GROUP row
appears:

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

the same record reads:

```
0123456789012345678901234567890123456789
OUTLAWS
the best requester ever
OTL-RQ21.LHA v2.1
95K P                          21-Jan-70
```

That one line is decision 6 doing its whole job: the DIZ never says "Outlaws"
in text (the door's own banner does - `AquaScan v1.0 by Aquarius/Outlaws` - but
that is a picture caption, not a field), and no rule was going to read it.

### The 80-column view - unchanged, and pinned

- `F` / `FR` (`web/backend/src/handlers/file/file-listing.handler.ts`) emits the
  DIR file's RAW lines through `getDisplayLines()`. Untouched.
- `FM S` (`buildFileSearchLines`) and new files (`buildNewFileLines`) keep their
  literal 80-column format strings, already pinned by
  `web/backend/tests/handlers/narrow-tables.test.ts`.
- The adapter is not installed for a non-PETSCII session, so a 68K lister's
  bytes are what they were.

The renderer is reached ONLY through `isNarrow(session)`, which can only answer
true for `petsciiMode === true` (`sessionColumns()` floors every other session
at 80). A phone in portrait keeps the express.e bytes.

### What this replaces

`narrowFileLines()` in `web/backend/src/utils/table-format.util.ts` is
superseded by the record renderer and is removed, not left beside it. Its two
callers (`buildFileSearchLines`, `buildNewFileLines`) move over, and the F/FR
listing - which has NO 40-column layout today - gains one. One narrow shape for
a file record, on every surface that prints one.

## The logo pack and its resolver

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

It never returns nothing: an unknown group with no file still gets its name on
one line, which is why the caller never needs a branch. Rules:

- **Height cap.** A `.seq` with more than 10 rows is REFUSED and the `name`
  form is used instead, with one line in `logs/backend.log` naming the group -
  once per group per boot. A 20-row logo in a file listing would eat the
  screen, and silently truncating art is the thing this whole spec exists to
  stop.
- **`.seq` bytes are raw.** They go out on the PETSCII byte path exactly as
  every other `.seq` does; they are not transduced, not wrapped, not MCI-
  substituted.
- **`.txt` is never used by a file surface.** Decision 2 freezes every
  80-column file format, listing and single record alike, so the `.txt` half of
  the pack exists purely for the other consumers below - the ones that adopt
  the resolver later and have no frozen bytes.

### Consumers

| Consumer | Uses | In this spec's scope |
|---|---|---|
| A file record in a LIST at 40 (both paths) | `kind: 'name'` ONLY - see below | yes |
| A single file record at 40 (search hit, upload/download announcement) | `seq`, falling back to `name` | yes |
| ANY file surface at 80 | nothing at all - decision 2 | n/a |
| DOORREPO browsing (`Doors/DoorRepo`, `Doors/door-manager`) | `seq` / `ansi` | adopts it |
| Conference and area screens | `seq` / `ansi` | adopts it |
| The achievement door (`docs/superpowers/specs/2026-09-03-global-achievements-design.md`) | `seq` / `ansi` | adopts it |

**Art logos are NOT printed in a list, on either path** - a list prints the
`name` form as a group header, once per run of consecutive same-group records.
Two reasons, both hard:

1. A `.seq` is raw PETSCII bytes. The adapter renders a frame DIFF; raw PETSCII
   arriving mid-stream drops the diff baseline and forces a full repaint (it
   says so at `web/backend/src/server/c64-door-adapter.ts`, the raw-PETSCII
   clause). One full repaint per record makes a listing unusable.
2. Six-row art per record on a 25-row screen leaves room for three records.

Decision 8 (both paths, row for row) therefore stays literally true: in a list
both paths print the same one-line group header. Art logos are for the
single-record surfaces, where there is one record and no frame diff. Rendering
`.seq` art INTO adapter frame cells - so it could ride the diff - is a real
option and is deferred, not refused (see "Explicitly out of scope").

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
filename only. A rule beats every derived source (decision 6), so a release
whose DIZ names no group still gets its logo. The file is re-read on mtime
change, like the directory listing.

This is the sysop-correction UI, and it is deliberately a text file rather than
an admin page: the board's configuration is disk-based (RULES.md 10), the
sysop is already in that directory to drop the `.seq` in, and a database column
with no editor would be a field nobody could correct.

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
`'stack'` with SP5, `'squeeze'` with SP6; neither waits for the other. The cursor map for a consumed
block sends every source column to the block's FIRST output row at column 0 -
a record row is never the row a door leaves the cursor on (that is the prompt
row, which no renderer claims), and if it ever were, the cursor lands somewhere
visible and stable rather than inside a field that no longer exists.

It has to be a BLOCK hook, not a row hook, because a record's description is
its continuation rows: `readDirFile`'s grammar and AquaScan's own output both
put the DIZ on the rows after the header at indent 33, and those rows must be
consumed by the record, not adapted a second time on their own.

### The closure the backend passes

In `web/backend/src/server/c64-door-adapter.ts`, per adapted frame:

1. `parseFileRecordRow(rowText)` - the express.e DIR grammar, shared with
   `dir-file-reader.util.ts`'s `isNewFileEntry` / `readDirFile` (that grammar
   moves into the shared pure module and `dir-file-reader` calls it, so there
   is ONE grammar): filename in the first 12 columns, a status marker of
   `P`/`F`/`N`/`D`, a size, a date, a description tail. Anything that does not
   match returns null and the row falls through to today's ladder untouched.
2. Consume following rows whose first 33 columns are blank as the description
   block.
3. Look the filename up in `file_index` for the session's conference, through
   a per-door-run `Map` cache so a repeated filename costs nothing. A miss, or
   the ambiguity rule above, means the record renders from the PARSED row
   alone - which already carries filename, marker, size, date and the printed
   description tail. **The rung is therefore useful before the index exists at
   all**, and the index only ever ADDS.
4. Resolve the group header (`kind: 'name'`) and call `renderFileRecord`.
5. Convert the strings to cells, each row inheriting the foreground colour of
   the source row's first non-blank cell, so a coloured listing stays coloured.

Cost per frame is a prepared `SELECT` on an indexed key per distinct filename,
inside the 30 ms `C64_ADAPT_TICK_MS` budget.

### Byte identity, by construction

Both paths call `renderFileRecord(record, opts)` with the same value object and
concatenate the result. There is no second formatter to keep in step: the
board's handlers reach the function through `table-format.util.ts`'s re-export,
and the adapter reaches it directly. The side-by-side test (below) exists to
stop someone re-introducing a second one, not to reconcile two that exist.

### Marks

Once the rung and the renderer are in, `F`, `FR` and `N` get `C64_ADAPT=40` in
`Commands/BBSCmd/{f,fr,n}.info`, written with `applyTooltypes()` (bytes, never
an editor), and they show `[C64]` in the doors list. All three are AquaScan
under three registrations, so all three are proven by the same captures - but
each is marked separately, because the claim is per registration and not per
executable (the `RTW` precedent from Phase 3).

## The DIZ fallback ladder

For a record with no metadata and no group - the DIZ art is all there is.

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
row first. `renderFileRecord` squeezes the description before wrapping it, and
the ladder rung covers the DIZ case that this board does not happen to contain
today.

It stays gated on `prose` for the reason the same capture shows:

```
  DIZ art, FILE_ID.DIZ row 2 (44 columns, classified 'art')
    "|NEW    ____________   ____________  BRINGS|"
  squeezed
    "|NEW ____________ ____________ BRINGS|"
  - 37 columns, it fits, and the picture is destroyed.
```

### The art switch

Art wider than 40 loses its right edge, and that is accepted (decision 10). A
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
screen, and test 7 is its PETSCII oracle.

**1. 80-column identity - untouched.**
- The existing `web/backend/tests/handlers/narrow-tables.test.ts` 80-column
  literals stay green with no edit.
- A new byte pin on `F`/`FR` at 80: the DIR raw lines the listing emits for a
  fixture conference, captured before the change and asserted after.
- The adapter corpus e2e
  (`web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts`, 123
  cases) stays green: no rule assignment on a NON-record row may change.
- An ANSI session opening `F` after the marks land emits byte-identical output
  to an ANSI session opening it before.

**2. The 40-column layout.** Table-driven against `renderFileRecord`: every row
<= 40 columns; two rows when there is no description and no group; four with
both; the description capped at two rows; the size `ceil(bytes/1024)+'K'`; the
date verbatim; the marker present; the filename never shortened; the version
moved to the FACTS row when it does not fit. Both worked examples above are
fixtures, asserted character for character including the column-40 alignment.

**3. The side-by-side pin.** ONE test, the point of decision 8: the same
record - `CB4!ST13.LHA` from the captured AquaScan frame, and the same record
in a fixture DIR file - is driven through
(a) the internal listing handler with a stub session at 40x25 `petsciiMode`,
(b) `adaptFrame` with the backend's `blockRenderer` over the captured frame,
and the two string arrays must be equal. Prove RED by giving one path its own
size formatter.

**4. The extractor drift test.** As specified above: the mirror equals
`renderMirror(contract/describe.ts)` when the sibling checkout is present
(skipped, not faked, when absent), `DESCRIBE_CONTRACT_VERSION` matches, and the
committed `describe-fixtures.json` corpus produces identical output in both
repos. The eight measured rows in this spec are fixtures in it.

**5. The resolver.** The normalisation table above, case by case; a `.seq`
found; a `.txt` found at 80; neither found -> the `name` line, clipped; an
11-row `.seq` refused and logged once; a `GROUPS.MAP` rule beating a derived
group; a malformed `GROUPS.MAP` line ignored without taking the file down; the
mtime guard picking up a logo dropped in while the board runs (no restart).

**6. A fixture DIZ per fallback rule.** Three rules have real DIZ on this board
and are fixtures from the measured corpus: `crop` and `narrow` (board root
`FILE_ID.DIZ`, 10 rows in, 10 out, 3 marked), `split` (`Doors/5DPAGER`, 11 rows
in, 12 out), and the all-`prose` case that needs no rung at all
(`Doors/ACCV105`). `deindent`, `squeeze` and `reflow` are reached by NO real
DIZ on this board, so their fixtures are synthetic and are LABELLED synthetic
in the test file, each with a comment pointing at the measurement - so nobody
later reads them as evidence that a real DIZ needs them.

**7. PETSCII oracle.** The rendered 40-column record rows go through
`AnsiToPetsciiTransducer` into a `PetsciiMachine` and every glyph drawn must be
on the glass - no `?` - following
`web/backend/tests/petscii-frame/c64-door-adapter-corpus-e2e.test.ts`. `.seq`
logo bytes are excluded by construction (they never enter the frame model).

**8. Gate reachability.** `F`, `FR` and `N` are added to
`web/backend/tests/doors/compact-40/marked-doors-launch-on-c64.test.ts`: a
PETSCII session launches each through the real `executeDoor` and gets adapted
frames; an ANSI session launches each byte-identically.

**9. Index behaviour, through the real entry points.** An upload walk writes an
index row with the right description and version; a DIR file edited on disk is
re-indexed on the next listing (mtime guard) and NOT re-indexed when untouched;
a bumped `DESCRIBE_CONTRACT_VERSION` invalidates rows; the ambiguity rule
returns null for two disagreeing DIRs; a missing index row still renders a
complete record from the parsed row.

**10. Prove RED.** Remove the `prose` gate from squeeze - the art fixture must
fail. Remove the block hook - the side-by-side test must fail. Put a second
size formatter in one path - the side-by-side test must fail. Revert the
description cap - the 40-column layout test must fail.

## Risks

1. **A non-record row that looks like a record.** The `stack` rung recognises
   rows by a grammar, and a false positive would rewrite a row that was not a
   file record. Mitigated by using the SAME grammar express.e uses (12-column
   name, marker at column 13, size, date) and by falling through on any
   mismatch; pinned by the 123-case corpus e2e, in which no non-record row may
   change rule. Residual: a door whose own table happens to match the grammar
   gets its rows restyled. It would still be readable, and it would show up as
   a corpus diff.
2. **Group misattribution.** Prefix tags are 1-5 characters (`SR`, `HF`, `AD`
   are real tags on this board), so two groups can collide and a record can get
   the wrong logo. Cosmetic, never destructive - no field is lost - and one
   `GROUPS.MAP` line fixes it. `group_source` says which rule answered.
3. **Index staleness.** A DIR file edited outside the BBS, a contract bump, a
   corpus change. Mitigated by the mtime guard, `diz_sha1`, `tags_sha1` and
   `extractor_ver`; and a stale or missing row degrades to the parsed row,
   never to a broken listing.
4. **Drift when the sibling checkout is absent.** The mirror test skips, so the
   fixture corpus is what actually guards CI. If someone edits the mirror by
   hand AND regenerates the fixtures to match, drift ships. Accepted: the
   header says GENERATED, and the door server's own copy of the fixtures fails
   in that repo's CI.
5. **The logo pack and the volume.** `Screens/` lives on the data volume,
   and `docker-entrypoint.sh` copies a top-level directory out of the image
   ONLY when it is absent from the volume - so a `Screens/groups/` shipped in
   an image never reaches a board that already has a `Screens/`. That is the
   safe direction (a deploy never overwrites a sysop's logos) and it means the
   pack is populated by the sysop, not by a release. The sharp edge is the
   escape hatch: `FORCE_REINIT_SCREENS=1` does `rm -rf` on the volume's
   `Screens` before re-copying, which would DELETE a logo pack and its
   `GROUPS.MAP`. The pack's sysop documentation says so in the same paragraph
   that tells them where to put the files.
6. **Row budget.** Four rows per record is roughly six records per C64 screen,
   against ten to twelve today. Accepted: the pause handler already paginates,
   and a record whose identity fields are wrong is worth nothing however many
   fit.
7. **A database read on the emit path.** The adapter's frame flush is on a
   30 ms tick. Mitigated by a prepared statement, an indexed key, and a
   per-door-run `Map`; and by the miss path being cheap and correct.
8. **`file_entries` looks like the right source and is not.** Measured: zero of
   1508 rows carries a description. The indexer reads DIR files; a later change
   that "simplifies" it onto the database would silently empty every
   description on the board. Called out in the service's own header comment.

## Explicitly out of scope

- **Any change to the 80-column view.** Not the DIR raw lines, not the search
  format, not the new-files format, not the adapter's non-installation for
  ANSI callers.
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
- **An admin UI for the file base.** `GROUPS.MAP` is the sysop surface.
- **Changing the DIR file format**, the express.e continuation convention, or
  anything a real Amiga would read.
- **The telnet door family** (`telnet`, `bbslink`, `bbslinkwall`,
  `telnet-front`) and pan keys / the adapter viewport. Both stay where the
  Phase 3 handoff left them.
- **`file_entries` schema changes.** The index is a separate table; nothing in
  the existing files schema moves.

## Decomposition

Six sub-projects. Each gets its own plan.

**SP1 - the shared extractor.** Move `src/describe.ts` to
`contract/describe.ts` in amiexpress-doorserver (re-export left behind), add
`DESCRIBE_CONTRACT_VERSION`, add the `DESCRIBE_ORIGIN` to the existing
generator, generate `contract/describe-fixtures.json` from the existing test
corpus, and land the mirror plus both drift tests in amiexpress-web. Nothing
else consumes it yet. Touches two repos; changes no behaviour.

**SP2 - the logo pack and its resolver.** `Screens/groups/`, the key
normalisation, `resolveGroupLogo`, `GROUPS.MAP`, the mtime guard, the height
cap, and the tests. Independent of everything else and immediately useful to
DOORREPO and the achievement door.

**SP3 - the file index.** The `file_index` table, `file-index.service.ts`, the
four group sources, the upload and import hooks, `build-file-index.ts`, and the
freshness rules. Needs SP1 (the extractor) and SP2 (for `GROUPS.MAP`, which is
group source 1).

**SP4 - the record renderer and the internal listing.** The pure module in
`sdk/petscii/frame/file-record.ts` (parse grammar moved out of
`dir-file-reader.util.ts`, renderer, `squeezeProse`, `formatNarrowSize`), the
re-export from `table-format.util.ts`, the 40-column layout on F/FR, on search
and on new files, and the retirement of `narrowFileLines`. This is the
REFERENCE IMPLEMENTATION. Needs SP2 and SP3.

**SP5 - the adapter's `stack` rung and the marks.** `blockRenderer` in the SDK
ladder, the closure in `c64-door-adapter.ts`, the side-by-side pin, the corpus
re-run, and `C64_ADAPT=40` on `f.info`, `fr.info`, `n.info`. Needs SP4.

**SP6 - the DIZ fallback ladder.** The `squeeze` LADDER rung gated on `prose`,
its place in `chooseRule`, the `DIZ_ART_SKIP` tooltype, and the fixture set
(three measured, three labelled-synthetic). The description squeeze is NOT
here - it is `squeezeProse` inside the renderer and ships with SP4, which is
the place the measurement says it pays. SP6 is independent of SP3-SP5 and only
decides what happens to a block that has no metadata behind it at all.

**Suggested order.** SP1 and SP2 in parallel (different repos, no shared file)
-> SP3 -> SP4 -> SP5. SP6 may run at any point after SP4 and is the natural
filler while SP5's captures are being re-taken.

**Sequencing note.** Nothing before SP5 changes a single byte for any caller
who is not on a PETSCII session, and SP5 is the only sub-project that opens a
door that is closed today. `F`, `FR` and `N` stay refused with
`THIS DOOR NEEDS AN 80 COLUMN SCREEN` until SP5 lands, which is the honest
state of affairs and not a regression to fix in the meantime.
