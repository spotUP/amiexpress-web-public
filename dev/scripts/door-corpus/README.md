# Door corpus

Regression test corpus for shipped 68K + AREXX doors. Each entry boots
under the same `web/backend/src/scripts/run-amiga-door.ts` harness real
sysop debugging uses, captures stdout (rendered ANSI output the user
sees) + a normalised trap-call trace, and diffs against frozen goldens.

A door's golden trace is the trip-wire: any emulator change that breaks
the door produces an actionable diff in CI before a sysop catches it.

## Files

```
dev/scripts/door-corpus/
├── corpus.json          # manifest — one entry per door
├── run.ts               # runner: spawns harness, captures, diffs
├── goldens/
│   └── <id>/
│       ├── output.txt   # rendered ANSI output (ESC sequences stripped)
│       ├── trace.txt    # XIM/ExecLibrary/exec-vectors traps, hex-normalised
│       └── .got/        # written on diff failure — inspect to update
└── README.md            # this file
```

## Usage

```
# Run all doors, fail on any diff:
npx tsx dev/scripts/door-corpus/run.ts

# Capture goldens for the whole corpus (first-time setup or after a
# legitimate behaviour change — REVIEW BEFORE COMMITTING):
npx tsx dev/scripts/door-corpus/run.ts --capture

# Capture / verify a single door:
npx tsx dev/scripts/door-corpus/run.ts --capture sent_fe
npx tsx dev/scripts/door-corpus/run.ts --only sent_fe

# Override per-door timeout:
npx tsx dev/scripts/door-corpus/run.ts --timeout 30000
```

CI run via Jest: `web/backend/tests/corpus/door-corpus.test.ts`. Skips
if the runner or `corpus.json` aren't visible (e.g. minimal sandboxes).
Force-skip with `SKIP_DOOR_CORPUS=1`.

## Adding a door

1. Drop the binary into `Doors/<Name>/` and register its `.info` under
   the appropriate `Commands/` directory (same as the normal install
   flow).
2. Add an entry to `corpus.json`:
   ```json
   {
     "id": "your_door",
     "name": "YourDoor",
     "category": "XIM-BBSCmd",
     "binary": "Doors/YourDoor/YourDoor",
     "doorType": "XIM",
     "command": "YourDoor",
     "timeoutMs": 15000,
     "notes": "What the door does + verified date + any quirks."
   }
   ```
3. `npx tsx dev/scripts/door-corpus/run.ts --capture your_door`.
4. Review `goldens/your_door/output.txt` + `trace.txt`. Make sure they
   match what you saw on screen.
5. Commit the two golden files together with the manifest edit.
6. `npx tsx dev/scripts/door-corpus/run.ts --only your_door` to verify
   the diff loop closes.

## How the trace is normalised

`trace.txt` keeps only lines matching `[XIM]`, `[ExecLibrary]`,
`[exec-vectors]`, `[LibraryTraps]`, `[HUNK]` (the structural events).
Inside those lines, hex addresses (`0x...`) and 4+-digit decimals (cycle
counts, sizes) are replaced with `0x?` / `?` so timing/layout jitter
doesn't produce false diffs while real semantic differences (different
LVO firing, wrong opcode order, missing trap) still surface.

If a door's normalised trace is unstable across runs (e.g. legitimately
varies on a random seed), document it in `notes` and either widen the
normaliser or skip the trace check on that entry (TODO: per-entry
`skipTrace: true` flag).

## Refreezing goldens after a legitimate change

If a fix or feature deliberately changes a door's output, refreezing the
golden is the right move — but the diff that proves it deliberate
should land in the same commit. Workflow:

1. Land the code change.
2. `npx tsx dev/scripts/door-corpus/run.ts` — observe which doors
   diff (`.got/` directories are written under each).
3. Read each diff (`diff goldens/<id>/output.txt goldens/<id>/.got/output.txt`).
4. If correct: `npx tsx dev/scripts/door-corpus/run.ts --capture <id>`.
5. Commit the new golden alongside the code change with a message that
   explains the behavioural delta.

Never auto-accept on a green-everything-now basis without reviewing the
text diff first.
