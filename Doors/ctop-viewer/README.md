# CTOP - Conference Top Uploaders

The conference upload table, ported from the Amiga door **Conftop-II** by
REbEL/QTX (`Doors/Conftop/ctop`, source in
`Documentation/7-Reference Sources/AmiExpressEDoorSources/Conftop-II/ctop.e`).

## Why it was ported

The 68K door was served to a C64 caller through the board's frame adapter
(`C64_ADAPT=40`). A table is its columns, and the corpus manifest's own note on
the `ctop` capture called the header unfixable at forty columns: six labels over
five fields, no adapter rung able to put a label above the column it names. The
sysop asked for the treatment GL got - "add a proper c64 view to conftop"
(2026-09-22) - so the door now draws its own forty-column screen.

## The three screens

| Width | What it draws |
|---|---|
| 80 | byte for byte what the 68K painted, pinned to a capture of the real binary |
| >80 | the same table, the surplus spent on the handle and the location - the two fields the Amiga cut |
| 40 | its own layout: rank, handle, files, bytes, then totals and both record holders |

## It also ends the period

Nothing else on this board rolls a conference's week. Uploads append records
(`web/backend/src/utils/ctop-updater.util.ts`); the door reads the reset date,
names the period's winner, updates the all-time record, mails the final table to
`MAILUSER`, writes `BULLFILE`, and rewrites the header without the records -
which is the reset. See `src/reset.ts`.

## Configuration

Tooltypes, exactly as the Amiga door read them, in
`<conference>/Conftop.info` - and that file's PRESENCE is the switch: without
it the door says the table is not installed in this conference.

| Tooltype | Meaning |
|---|---|
| `DAYS` | `WEEKLY`, `MONTHLY`, or a number of days |
| `ROWS` | how many places the table lists (default 10) |
| `MAILUSER` | who gets the final table by mail at each reset |
| `BULLFILE` | where the final table is written as a bulletin |
| `SUBJECT` | the subject of that mail |
| `DATAFILE` | the data file's name (default `ctop.data`) |
| `MIN_LIMIT` | an uploader under this many bytes is not listed |
| `SKIP_EMPTY_LINES` | draw a short table instead of padding it with empty places |
| `SHOW_RESETDATE` | name the day the period ends instead of counting days left |
| `CONFNAME` | override the conference's name on the screen |

Board-wide defaults may be put in `Doors/conftop.info`; the conference's file
wins.

## Art

`<conference>/Conftop.header` and `Conftop.tailer` are spliced in verbatim, and
a C64 caller gets `Conftop.header_C64` where the sysop drew one. An
eighty-column drawing is left out of the forty-column screen whole rather than
folded.

## Tests

`web/backend/tests/doors/ctop/` - the 80-column capture parity, the 40-column
layout, and the door driven through its own `execute` with a real conference
directory. `Doors/Conftop/` keeps the 68K binary; it is no longer registered.

The command's registration is `Commands/BBSCmd/ctop.info`:
`LOCATION=Doors/ctop-viewer`, `TYPE=TS`, `MIN_COLUMNS=40`.
