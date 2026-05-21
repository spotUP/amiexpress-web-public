#!/bin/bash
#
# per-door-test.sh — run each corpus door in its own tsx process.
#
# The in-process runner (`corpus-integration-runner.ts`) accumulates
# state across doors when run back-to-back, even with --concurrency 1.
# Symptom: doors that pass in isolation start timing out after ~8 doors.
# Root cause sits somewhere in AmigaDoorSession / shared globals; not
# trivially fixable without unwinding several layers.
#
# This wrapper sidesteps the bug by spawning a fresh tsx for every
# door — slower (~3 s overhead per door) but reliable.
#
# Usage:
#   per-door-test.sh <id1> [<id2> ...]              — test these IDs
#   per-door-test.sh --capture <id1> [...]          — capture mode
#   per-door-test.sh --list FILE [--capture]        — read IDs from FILE
#   per-door-test.sh -j N <args>                    — N parallel subprocesses
#                                                     (default 2; cap honors
#                                                     "no more than 2 parallel
#                                                     68K emulators")
#
# Output: per-door pass/fail (interleaved when -j>1) + final tally.

set -u

# Resolve --list relative to the caller's cwd BEFORE we cd.
CAPTURE=""
JOBS=2
IDS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --capture)
      CAPTURE="--capture"
      shift
      ;;
    -j|--jobs)
      shift
      JOBS="$1"
      shift
      ;;
    --list)
      shift
      list="$1"
      [[ "$list" != /* ]] && list="$PWD/$list"
      while IFS= read -r line; do
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        IDS+=("$line")
      done < "$list"
      shift
      ;;
    *)
      IDS+=("$1")
      shift
      ;;
  esac
done

cd "$(dirname "$0")/../../.."

if [[ ${#IDS[@]} -eq 0 ]]; then
  echo "usage: per-door-test.sh [-j N] [--capture] [--list FILE] <id> [<id>...]" >&2
  exit 2
fi

# Cap parallelism at 2 — the project's standing rule
# (feedback_avoid_parallel_emulator_heat) is that sustained
# concurrency above 2 spins fans and degrades all doors.
[[ "$JOBS" -gt 2 ]] && JOBS=2

# Single output stream — each subshell prints its one result line
# to stdout (line-atomic on POSIX since lines are well under
# PIPE_BUF / 4 KB). We capture everything to a tempfile, sort by
# id for reproducibility, then tally.
RESULTS_FILE=$(mktemp -t per-door-results-XXXXXX)
trap 'rm -f "$RESULTS_FILE"' EXIT

run_one() {
  local id="$1"
  cd web/backend && \
    npx tsx src/scripts/corpus-integration-runner.ts \
        --concurrency 1 $CAPTURE --only "$id" 2>&1 \
      | grep -aE "^  $id: (pass|FAIL|SKIP|captured)" | head -1
}
export -f run_one
export CAPTURE

printf '%s\n' "${IDS[@]}" | \
  xargs -P "$JOBS" -I{} bash -c 'run_one "$@"' _ {} \
  > "$RESULTS_FILE"

# Sort results so the log is reproducible (parallel runs naturally
# interleave by completion order; sort by door id).
sort -k1,1 "$RESULTS_FILE"

PASS=$(grep -c "pass" "$RESULTS_FILE" || true)
FAIL_TIMEOUT=$(grep -c "timed out" "$RESULTS_FILE" || true)
FAIL_OTHER=$(grep -c "FAIL" "$RESULTS_FILE" || true)
SKIP=$(grep -c "SKIP" "$RESULTS_FILE" || true)
FAIL_NON_TIMEOUT=$((FAIL_OTHER - FAIL_TIMEOUT))
echo "[per-door] jobs=$JOBS pass=$PASS fail=$FAIL_OTHER (timeouts=$FAIL_TIMEOUT, other=$FAIL_NON_TIMEOUT) skip=$SKIP"
