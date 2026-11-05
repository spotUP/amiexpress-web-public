#!/usr/bin/env bash
#
# ONE COMMAND TO MAKE LOCALHOST THE SAME CODE AS origin/main.
#
# The sysop deployed to live for every small test because the documented
# localhost ran from the shared checkout, which trails origin/main by
# hundreds of commits and carries other sessions' uncommitted work. This runs
# from a DEDICATED MIRROR worktree instead:
#
#   ~/Code/AmiExpress/aew-local   (branch local/main-mirror)
#
# The mirror is a pure copy of origin/main. Nothing is ever committed there
# and nothing accumulates there - work goes through a feature worktree, lands
# on origin/main, and this brings it here. Its node_modules are per-entry
# symlinks into the shared checkout's (no second install, ~600 MB not 2 GB),
# with @amiexpress/bbs-door-sdk pointing at the mirror's own sdk/.
#
# Usage (from the mirror):
#   dev/scripts/local-refresh.sh               fast-forward, rebuild what changed, restart, check the shas
#   dev/scripts/local-refresh.sh --pull-live   the same, after re-pulling board content from LIVE
#   dev/scripts/local-refresh.sh --stop        stop the local stack and do nothing else
#
# Exit 0 = PASS (HEAD == origin/main and the running board reports that sha),
# 1 = FAIL.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT" || exit 1

MIRROR_BRANCH="local/main-mirror"
STAMP="$ROOT/.local-built-sha"
LIVE_HEALTH="${LIVE_HEALTH_URL:-https://bbs.uprough.net/health}"
LOCAL_HEALTH="http://localhost:3001/health"
LOGS="$ROOT/logs"

PULL_LIVE=0
STOP_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --pull-live) PULL_LIVE=1 ;;
    --stop) STOP_ONLY=1 ;;
    -h|--help) sed -n '2,25p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "[ERROR] unknown argument: $arg" >&2; exit 2 ;;
  esac
done

fail() { echo "[FAIL] $*" >&2; exit 1; }

# The sha out of a /health JSON body, blank when the board is not answering.
revision_of() {
  curl -s -m 8 "$1" 2>/dev/null | sed -n 's/.*"revision":"\([^"]*\)".*/\1/p'
}

# The shared checkout (the main worktree). Its node_modules back the mirror's.
SHARED="$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")"

stop_stack() {
  ./dev/scripts/kill-servers.sh >/dev/null 2>&1
  # A stack started from the shared checkout holds the same ports, and the
  # mirror's kill-servers.sh leaves it alone (it only kills its own root).
  # Localhost runs from the mirror, so that stack is an orphan: stop it with
  # the shared checkout's own kill-servers.sh, which is scoped to that root.
  if [ "$SHARED" != "$ROOT" ] && [ -x "$SHARED/dev/scripts/kill-servers.sh" ]; then
    "$SHARED/dev/scripts/kill-servers.sh" >/dev/null 2>&1
  fi
  local left
  left="$(lsof -ti:3001 -ti:${SDK_PREVIEW_PORT:-8080} -ti:3002 2>/dev/null | wc -l | tr -d ' ')"
  [ "$left" = "0" ] || fail "ports 3001/8080/3002 are still held after kill-servers.sh ($left pids)"
}

# Only ever the mirror. This script fast-forwards and rebuilds, and in the
# shared checkout that would run over other sessions' uncommitted work.
BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
[ "$BRANCH" = "$MIRROR_BRANCH" ] \
  || fail "this is branch '$BRANCH', not '$MIRROR_BRANCH'. Run it from the mirror worktree (aew-local), never the shared checkout."

if [ "$STOP_ONLY" -eq 1 ]; then
  stop_stack
  echo "[OK] local stack stopped"
  exit 0
fi

# TRACKED changes only: the running board writes untracked files into the
# mirror (Doors/SUBS/SUBS.cfg and similar) and those are not drift.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short --untracked-files=no | head -10 >&2
  fail "the mirror has tracked changes. It must stay a pure copy of origin/main; revert them, do not commit here."
fi

echo "[INFO] fetching origin..."
git fetch -q origin || fail "git fetch origin failed"
git merge --ff-only -q origin/main || fail "cannot fast-forward the mirror to origin/main"

HEAD_SHA="$(git rev-parse HEAD)"

# The node_modules links into the shared checkout. Nothing else makes them,
# and a build below fails on a missing module without them.
./dev/scripts/local-mirror-links.sh "$SHARED" "$ROOT" || fail "cannot link the mirror's node_modules into $SHARED"

# --- rebuild only the bundles whose sources changed since the last build ----
#
# sdk -> terminal -> frontend and admin, because each builds against the one
# before it; a changed sdk therefore rebuilds all four. The stamp holds the
# sha the bundles in dist/ were built from.
LAST=""
[ -f "$STAMP" ] && LAST="$(cat "$STAMP")"
if [ -n "$LAST" ] && git cat-file -e "$LAST^{commit}" 2>/dev/null; then
  CHANGED="$(git diff --name-only "$LAST" HEAD)"
  WHY="since ${LAST:0:9}"
else
  CHANGED=""
  WHY="no usable stamp: building everything"
fi

# A here-string, not a pipe: under pipefail grep -q exits early, printf takes
# SIGPIPE on a long diff and the test reads false.
touched() { [ -z "$LAST" ] || grep -q "^$1" <<<"$CHANGED"; }

BUILD_SDK=0; BUILD_TERMINAL=0; BUILD_FRONTEND=0; BUILD_ADMIN=0
touched "sdk/" && BUILD_SDK=1
{ [ "$BUILD_SDK" = 1 ] || touched "packages/terminal/"; } && BUILD_TERMINAL=1
{ [ "$BUILD_TERMINAL" = 1 ] || touched "web/frontend/"; } && BUILD_FRONTEND=1
{ [ "$BUILD_TERMINAL" = 1 ] || touched "web/config-app/"; } && BUILD_ADMIN=1
# A missing dist is a bundle to build whatever the diff says.
[ -d sdk/dist ] || BUILD_SDK=1
[ -d packages/terminal/dist ] || BUILD_TERMINAL=1
[ -d web/frontend/dist ] || BUILD_FRONTEND=1
[ -d web/config-app/dist ] || BUILD_ADMIN=1

# The mirror's node_modules are the shared checkout's. A dependency change
# upstream is not installed by this script.
if grep -qE '(^|/)package(-lock)?\.json$' <<<"$CHANGED"; then
  echo "[WARN] a package.json or lockfile changed ($WHY). node_modules are symlinks into the shared checkout and are NOT updated here; if a build below fails on a missing module, run npm install in the shared checkout's matching directory."
fi

mkdir -p "$LOGS"
build() { # name, dir
  local name="$1" dir="$2" log="$LOGS/local-refresh-$1.log"
  printf '[INFO] building %s ... ' "$name"
  if timeout 900 npm --prefix "$dir" run build >"$log" 2>&1; then
    echo "[OK]"
  else
    echo "[FAIL]"
    tail -15 "$log" >&2
    fail "$name build failed (full log: $log)"
  fi
}

echo "[INFO] bundles to rebuild ($WHY): sdk=$BUILD_SDK terminal=$BUILD_TERMINAL frontend=$BUILD_FRONTEND admin=$BUILD_ADMIN"
[ "$BUILD_SDK" = 1 ] && build sdk sdk
[ "$BUILD_TERMINAL" = 1 ] && build terminal packages/terminal
[ "$BUILD_FRONTEND" = 1 ] && build frontend web/frontend
[ "$BUILD_ADMIN" = 1 ] && build admin web/config-app
echo "$HEAD_SHA" > "$STAMP"

if [ "$PULL_LIVE" -eq 1 ]; then
  echo "[INFO] pulling board content from LIVE (read-only)..."
  ./dev/scripts/pull-live-content.sh --apply >"$LOGS/local-refresh-pull-live.log" 2>&1 \
    || { tail -10 "$LOGS/local-refresh-pull-live.log" >&2; fail "pull-live-content.sh failed"; }
  tail -3 "$LOGS/local-refresh-pull-live.log"
fi

# --- restart. A dev backend keeps running the code it was started with. ----
#
# --quick skips start-servers.sh's own dependency checks and builds (this
# script just did the ones that matter). stdout is not a terminal, so it does
# not open the tmux console. TMPDIR is left alone on purpose: a long TMPDIR
# makes tsx's IPC socket path exceed the unix-socket limit and the backend
# dies at boot.
stop_stack
echo "[INFO] starting the dev stack (backend boot takes 60-120 s)..."
nohup ./dev/scripts/start-servers.sh --quick --bbs-only </dev/null >"$LOGS/local-refresh-start.log" 2>&1 &

RUNNING=""
for _ in $(seq 1 36); do
  sleep 5
  RUNNING="$(revision_of "$LOCAL_HEALTH")"
  [ -n "$RUNNING" ] && break
done

ORIGIN_SHA="$(git rev-parse origin/main)"
LIVE_SHA="$(revision_of "$LIVE_HEALTH")"

echo
echo "HEAD         ${HEAD_SHA:0:9}  (this mirror)"
echo "origin/main  ${ORIGIN_SHA:0:9}"
echo "local /health ${RUNNING:0:9}  (what is running now)"
echo "live /health ${LIVE_SHA:0:9}  (what live runs; behind origin/main until the next deploy lands)"
echo
echo "board   http://localhost:3001/    admin http://localhost:3001/admin/    telnet localhost 64128"

if [ "$HEAD_SHA" != "$ORIGIN_SHA" ]; then
  echo "[FAIL] HEAD != origin/main"
  exit 1
fi
if [ -z "$RUNNING" ]; then
  echo "[FAIL] the local board is not answering on :3001 (see $LOGS/local-refresh-start.log and $LOGS/backend.log)"
  exit 1
fi
if [ "$RUNNING" != "$HEAD_SHA" ]; then
  echo "[FAIL] the running board reports ${RUNNING:0:9}, not HEAD"
  exit 1
fi
echo "[PASS] localhost runs origin/main"
