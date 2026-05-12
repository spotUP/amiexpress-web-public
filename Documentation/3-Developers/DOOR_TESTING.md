# Door Testing — Tools & Workflows

Three complementary tools, pick the one that matches the question you have.

| Question | Tool |
|----------|------|
| "Did anything regress in a door that used to work?" | **Door corpus** — `dev/scripts/door-corpus/` |
| "Why does this new door not work / what does it need?" | **Door probe** — `dev/scripts/door-probe/probe.ts` |
| "What LVOs / XIM ops does the whole universe of doors actually call?" | **Bulk probe** — `dev/scripts/door-probe/bulk-probe.ts` |
| "Run every installed door, see what blows up" | **test-all-doors** — `dev/scripts/test-all-doors.sh` (this doc, below) |

## Door corpus (regression)

CI-runnable, frozen-golden diff for a curated set of doors covering the
top XIM ops + LVOs. 36 doors at time of writing; goldens live at
`dev/scripts/door-corpus/goldens/<id>/{output.txt,trace.txt}`. Jest
wrapper at `web/backend/tests/corpus/door-corpus.test.ts`. Adding a
door = 4 steps; see `dev/scripts/door-corpus/README.md`.

```
npx tsx dev/scripts/door-corpus/run.ts                # diff all
npx tsx dev/scripts/door-corpus/run.ts --only <id>    # one door
npx tsx dev/scripts/door-corpus/run.ts --capture      # refreeze (review first!)
```

Goldens are time-masked at diff time (HH:MM:SS / Dow DD-Mon-YYYY etc.)
so live-clock renderers stay stable.

## Door probe (per-door diagnosis)

Boots a binary under the existing `run-amiga-door.ts` harness and
emits a markdown / JSON report: XIM ops fired, LVOs (real / stub /
missing), errors, recommendations. Turns "stare at logs and guess"
into one shot.

```
npx tsx dev/scripts/door-probe/probe.ts <binary> [--doortype XIM]
                                              [--input-script <file>]
                                              [--out <report.md>] [--json]
```

`dev/scripts/door-probe/README.md` has the workflow.

## Bulk probe (universe scan)

Walks an LHA archive directory, extracts each, runs the per-door probe,
aggregates LVO + XIM op frequency. Drives Phase 2 stub-elimination
prioritisation. Cached results survive interrupts (`--skip-existing`).

```
npx tsx dev/scripts/door-probe/bulk-probe.ts <archive-dir> [--limit N]
                                                          [--out <dir>]
                                                          [--skip-existing]
```

---

# test-all-doors (broad smoke)

Older sweep harness, kept for compatibility. Use the corpus + probe
above for anything new.

- Shell wrapper: `dev/scripts/test-all-doors.sh`
- TypeScript implementation: `dev/scripts/test-all-doors.ts`

## When to Use

- Investigating door crashes or hangs
- Validating door installation
- Comparing behavior across multiple doors
- User asks to "test doors" or "debug doors"

## Features

- Scans all doors in `Doors/`
- Configurable timeout per door (default 5000 ms)
- Captures output, errors, exit codes, signals
- Per-door report: success / failure, timeout detection, crash details, output sample
- Filter by door name pattern

## Usage

```bash
# All doors, defaults (5s timeout each)
./dev/scripts/test-all-doors.sh

# Verbose (shows output and errors)
./dev/scripts/test-all-doors.sh --verbose

# Filter (comma-separated patterns)
./dev/scripts/test-all-doors.sh --filter "WHO,RTW,B"

# Custom timeout + output
./dev/scripts/test-all-doors.sh --timeout 10000 --output /tmp/my-test.txt
```

## Output

- Default location: `dev/scripts/door-test-results.txt`
- Contents:
  - Summary stats (total, passed, failed, timed out)
  - Per-door status + error info
  - Full output capture for failed doors

## Workflow

```bash
# 1. Identify failures
./dev/scripts/test-all-doors.sh

# 2. Re-test failures verbosely
./dev/scripts/test-all-doors.sh --verbose --filter "WHO,RTW"

# 3. Find error patterns
grep -A 10 "FAILED" dev/scripts/door-test-results.txt

# 4. Reproduce individually
node web/backend/dist/scripts/run-amiga-door.js Doors/WHO/WHO 1
```

## Notes

- Requires backend build: `cd web/backend && npm run build`
- Does **not** require BBS server to be running
- Each door runs in an isolated process
- Timeout kills are normal for doors expecting interactive input
- Per-door logs in `/tmp/*.out`
- Compare output against expected behavior from `express.e`
