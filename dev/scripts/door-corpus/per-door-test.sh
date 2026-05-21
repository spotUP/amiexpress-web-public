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
#   per-door-test.sh --retry N <args>               — re-run any FAILed door up
#                                                     to N times (serial,
#                                                     -j 1) before final
#                                                     verdict. Default 0
#                                                     (no retry).
#
# Output: per-door pass/fail (interleaved when -j>1) + final tally.
# Exit code: 0 if all pass+skip; 1 if any door FAILs after retries.

set -u

# Resolve --list relative to the caller's cwd BEFORE we cd.
CAPTURE=""
JOBS=2
RETRY=0
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
    --retry)
      shift
      RETRY="$1"
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

# Retry any FAILed doors serially (-j 1) up to $RETRY times. A
# door is re-run if it FAILed; on pass during retry, its line in
# the results is replaced with the retry result. State pollution
# is the dominant fail mode and per-door retry sidesteps it.
if [[ "$RETRY" -gt 0 ]]; then
  for attempt in $(seq 1 "$RETRY"); do
    # Collect doors still failing (FAIL but not SKIP).
    fail_ids=$(grep "FAIL" "$RESULTS_FILE" \
               | awk -F: '{print $1}' | sed 's/^ *//' | sort -u)
    [[ -z "$fail_ids" ]] && break
    echo "[per-door] retry attempt $attempt: $(echo "$fail_ids" | wc -l | tr -d ' ') doors" >&2
    RETRY_FILE=$(mktemp -t per-door-retry-XXXXXX)
    printf '%s\n' $fail_ids | xargs -P 1 -I{} bash -c 'run_one "$@"' _ {} \
      > "$RETRY_FILE"
    # Merge: drop the old FAIL line for each retried id, append new.
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      id=$(echo "$line" | awk -F: '{print $1}' | sed 's/^ *//')
      # Delete old line for this id from results, add new one.
      grep -v "^  ${id}:" "$RESULTS_FILE" > "$RESULTS_FILE.tmp" || true
      echo "$line" >> "$RESULTS_FILE.tmp"
      mv "$RESULTS_FILE.tmp" "$RESULTS_FILE"
    done < "$RETRY_FILE"
    rm -f "$RETRY_FILE"
  done
fi

# Sort results so the log is reproducible (parallel runs naturally
# interleave by completion order; sort by door id).
sort -k1,1 "$RESULTS_FILE"

PASS=$(grep -c "pass" "$RESULTS_FILE" || true)
FAIL_TIMEOUT=$(grep -c "timed out" "$RESULTS_FILE" || true)
FAIL_OTHER=$(grep -c "FAIL" "$RESULTS_FILE" || true)
SKIP=$(grep -c "SKIP" "$RESULTS_FILE" || true)
FAIL_NON_TIMEOUT=$((FAIL_OTHER - FAIL_TIMEOUT))
echo "[per-door] jobs=$JOBS retry=$RETRY pass=$PASS fail=$FAIL_OTHER (timeouts=$FAIL_TIMEOUT, other=$FAIL_NON_TIMEOUT) skip=$SKIP"

# Exit non-zero if any door FAILed after retries.
if [[ "$FAIL_OTHER" -gt 0 ]]; then
  exit 1
fi
