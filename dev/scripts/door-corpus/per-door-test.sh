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
#   per-door-test.sh <id1> [<id2> ...]         — test these IDs
#   per-door-test.sh --capture <id1> [...]     — capture mode
#   per-door-test.sh --list FILE [--capture]   — read IDs from FILE
#
# Output: per-door pass/fail + final tally.

set -u
cd "$(dirname "$0")/../../.."

CAPTURE=""
IDS=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --capture)
      CAPTURE="--capture"
      shift
      ;;
    --list)
      shift
      while IFS= read -r line; do
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        IDS+=("$line")
      done < "$1"
      shift
      ;;
    *)
      IDS+=("$1")
      shift
      ;;
  esac
done

if [[ ${#IDS[@]} -eq 0 ]]; then
  echo "usage: per-door-test.sh [--capture] [--list FILE] <id> [<id>...]" >&2
  exit 2
fi

PASS=0
FAIL=0
TIMEOUT=0
for id in "${IDS[@]}"; do
  out=$(cd web/backend && npx tsx src/scripts/corpus-integration-runner.ts \
        --concurrency 1 $CAPTURE --only "$id" 2>&1 \
        | grep -aE "^  $id: (pass|FAIL|captured)" | head -1)
  echo "$out"
  if echo "$out" | grep -q "pass"; then PASS=$((PASS+1))
  elif echo "$out" | grep -q "timed out"; then
    FAIL=$((FAIL+1)); TIMEOUT=$((TIMEOUT+1))
  elif echo "$out" | grep -q "FAIL"; then FAIL=$((FAIL+1))
  fi
done
echo "[per-door] pass=$PASS fail=$FAIL (of which timeouts=$TIMEOUT)"
