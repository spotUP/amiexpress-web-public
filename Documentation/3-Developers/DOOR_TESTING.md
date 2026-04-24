# Door Testing Script

Automated testing of all installed 68K Amiga doors for debugging and validation.

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
