#!/usr/bin/env bash
#
# Deploy origin/main when it moves, and not otherwise.
#
# GitHub Actions stopped running for this repository on 2026-09-08 (a billing
# failure), so nothing was left to notice a push. This is that half: a timer
# ticks, this asks two questions, and `deploy/deploy.sh` does the work.
#
# THE ORDER OF THE TWO QUESTIONS IS THE POINT.
#
# `deploy.sh` builds the image BEFORE it consults the caller guard, deliberately
# - a refused deploy leaves the image ready for the moment the board empties.
# That is right for a human running it once. Under a timer it is not: with one
# caller online for an hour, a two-minute tick would build the same image thirty
# times, each about eight minutes of CPU on a box that also runs the BBS. So the
# watcher asks the guard FIRST and does nothing at all until the board is clear.
# `deploy.sh` still asks again for itself; this is the cheap check, not the
# authority.
set -euo pipefail

DEPLOY_ROOT="${DEPLOY_ROOT:-/app/amiexpress}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3001/health}"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-$DEPLOY_ROOT/deploy/deploy.sh}"

# shellcheck source=caller-guard.sh
. "$DEPLOY_ROOT/deploy/caller-guard.sh"

# What to do, given what the BOARD IS RUNNING, what the repo has, and who is on.
#
# The first argument is deliberately the running revision and not the checkout's
# HEAD. They are different questions and I got it wrong first: the host's
# checkout was reset to a5f8b7d8b while the container still served 5a0e4852d,
# so a watcher comparing the checkout said "up-to-date" about a board running
# older code - for ever, since nothing would move the checkout again. What the
# timer is for is "is the board running main", and /health answers exactly that.
#
# Printed as one word so a test can drive it without a host, a docker or a
# network: `up-to-date`, `callers`, or `deploy`.
deploy_decision() {
  RUNNING_SHA=${1:-}
  REMOTE_SHA=${2:-}
  HEALTH=${3:-}

  if [ -z "$REMOTE_SHA" ]; then
    # A fetch that answered nothing is not a reason to deploy anything.
    echo "up-to-date"
    return 0
  fi
  if [ "$RUNNING_SHA" = "$REMOTE_SHA" ]; then
    echo "up-to-date"
    return 0
  fi

  OTHERS=$(callers_to_protect "$HEALTH" "${DEPLOY_IGNORE_CALLERS:-spot sysop discord-bridge}")
  if [ "${OTHERS:-0}" -gt 0 ] 2>/dev/null; then
    echo "callers"
    return 0
  fi

  echo "deploy"
}

# Sourced by the test, run by the timer.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cd "$DEPLOY_ROOT"
  GIT_TERMINAL_PROMPT=0 git fetch --prune origin main >/dev/null 2>&1 || {
    echo "watch: could not fetch origin/main" >&2
    exit 0   # a network blip is not a failure worth alarming systemd about
  }

  REMOTE=$(git rev-parse origin/main)
  HEALTH=$(curl -s --max-time 5 "$HEALTH_URL" || echo '')
  # What the CONTAINER is serving, which is the only thing that answers "is the
  # board running main". A board that does not answer has no revision, and that
  # reads as a cold start below.
  RUNNING=$(printf '%s' "$HEALTH" | sed -n 's/.*"revision":"\([0-9a-f]*\)".*/\1/p')

  case "$(deploy_decision "$RUNNING" "$REMOTE" "$HEALTH")" in
    up-to-date)
      exit 0 ;;
    callers)
      echo "watch: ${REMOTE:0:9} is waiting - somebody is on the board"
      exit 0 ;;
    deploy)
      echo "watch: deploying ${REMOTE:0:9} (board is on ${RUNNING:0:9})"
      exec "$DEPLOY_SCRIPT" ;;
  esac
fi
