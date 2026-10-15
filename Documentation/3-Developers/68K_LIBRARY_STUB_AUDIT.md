# 68K library-call stub audit (living)

Authoritative answer to "which unimplemented 68K library calls should we build
next?" so it is not re-derived every few weeks. Detailed working:
`thoughts/shared/research/2026-09-08_68k-stub-audit.md`. Last measured
2026-09-08.

## The short version (read this before auditing again)

1. **Do not implement stubs by raw count.** dos.library and exec.library look
   like a big backlog (61 and 40 stubs) but almost all are functions **no
   userland BBS door calls** — exec kernel internals (Dispatch, Schedule,
   Switch, SetSR, semaphore-lists, device/resource registry, Child* process
   ops) and dos packet/CLI/assign/record-lock plumbing. Implementing them
   speculatively is wasted work: each becomes a handler no test drives.
2. **The only trustworthy priority is runtime frequency** — run the corpus with
   `LEDGER=1` and let real doors name the stubs they hit. Tooling already
   exists and is heat-safe: `dev/scripts/door-corpus/ledger-sweep.sh` +
   `web/backend/src/amiga-emulation/instrumentation/library-call-ledger.ts`
   (serial, per-door killpg, `feedback_avoid_parallel_emulator_heat`).
3. **This checkout cannot produce that ranking.** `corpus.json` names 3124 XIM
   binaries; only ~34 exist locally (the rest live in an external corpus tree
   not populated here). Absent binaries fail to load (`ENOENT stat
   'Doors/<x>/<x>'`) and record nothing, so every sweep here shows **all real** —
   NOT because the backlog is empty, but because only the implemented paths of
   the present doors run. Run the sweep where the corpus binaries exist.

## Static coverage (2026-09-08)

Stub = an LVO in `Documentation/7-Reference Sources/LVOs.i` with no real handler
in `web/backend/src/amiga-emulation/api/library-vectors/*-vectors.ts`.

| library | universe | real | stub | coverage |
|---------|---------:|-----:|-----:|:--------:|
| dos.library | 159 | 98 | 61 | 62% |
| exec.library | 126 | 86 | 40 | 68% |
| intuition.library | 128 | 8 | 120 | 6% (GUI — text doors barely use it; the 8 real are what doors need) |
| icon.library | 19 | 12 | 7 | 63% |
| mathffp.library | 12 | 12 | 0 | 100% |
| utility.library | 38 | 38 | 0 | 100% |
| rexxsyslib.library | 10 | 10 | 0 | 100% |
| dreamdoor.library | — | 0 | all | 0% (whole-library gap; only DreamDoor-framework doors need it; gated on the 2.4KB DreamDoor.Library disassembly) |
| aedoor / fame / amissl / bsdsocket | not in NDK LVOs.i | 20 / 33 / 27 / 46 defined | — | measure against their own headers, not LVOs.i |

## If you must pick speculative targets

Only these dos stubs are even door-plausible, and only implement one when a
door is actually seen to need it: `SetFileDate`, `SetFileSize`, `CompareDates`,
`NameFromFH`, then `ReadItem`/`WriteChars`/`SetVBuf`. icon `GetIcon`/`PutIcon`
if a door reads a `.info`'s tooltypes directly. Everything else waits for a
LEDGER hit.

## Runtime sweep, 2026-09-08 (the 34 present-locally doors)

`ledger-sweep.sh --ids <34>`: **64 LVOs seen, all real, 0 backlog** — confirms
the present doors need nothing we lack. Hottest: aedoor `WriteStr` (365k), exec
`GetMsg`/`ReplyMsg` (167k each), `AllocMem`, `WaitPort`, `Forbid` — the door
message loop, all implemented. 0 backlog here is the missing corpus, not a
complete emulator.

## How to redo this properly

1. In a corpus-populated environment: `dev/scripts/door-corpus/ledger-sweep.sh N`
   (or `--ids a,b`), which writes `dev/scripts/door-corpus/triage/library-call-ledger.{json,md}`.
2. The `.md` is the ranked implement-me backlog (missing+stub first, by call
   count, with the doors that hit each).
3. Prior single-library deep-dives: `DOS_LVO_AUDIT_2026-01-29.md`,
   `../6-Progress/archive/2025-12/EXEC_LVO_AUDIT_REPORT.md`.
