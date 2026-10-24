#!/usr/bin/env bash
#
# A THROWAWAY BOARD FOR TESTING WHAT A FRESH INSTALL DOES.
#
# localhost reads data/live, which is a copy of the live board with a sysop
# already in it, so the first-install setup code and the sysop password reset
# (SYSOP_PASSWORD_RESET=1) cannot be tried there without editing real data.
# This starts a second backend from this checkout on its own ports, with its
# own board directory and its own database, seeded the way the Docker image
# seeds a new volume:
#
#   - the board content is `git archive HEAD` of exactly the paths the
#     Dockerfile COPYs into /app/default-data (the Dockerfile stays the one
#     list; nothing here repeats it), so it is what a fresh clone ships
#   - scripts/collapse-default-screens.ts then runs on it, the same step the
#     image build runs on default-data
#
# Nothing outside the sandbox directory is written except logs/ in this
# checkout, which the backend uses for its debug logs.
#
# Usage:
#   dev/scripts/sandbox-board.sh fresh          wipe and reseed, then start (no sysop: prints the setup code)
#   dev/scripts/sandbox-board.sh start          start on the existing sandbox data
#   dev/scripts/sandbox-board.sh start --reset  start with SYSOP_PASSWORD_RESET=1 (prints the reset code)
#   dev/scripts/sandbox-board.sh stop           stop the sandbox backend
#   dev/scripts/sandbox-board.sh status         ports, data directory, and the [SETUP] lines of the log
#
# Ports (override with SANDBOX_PORT / SANDBOX_TELNET_PORT / SANDBOX_SSH_PORT):
#   HTTP 3101, telnet 64228, SSH 31437. FTP is off.
# Data (override with SANDBOX_DIR): $TMPDIR/aew-sandbox
#
# The web terminal on the HTTP port needs web/frontend/dist (npm run build in
# web/frontend); telnet and SSH need nothing extra.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_ROOT="${TMPDIR:-/tmp}"
SANDBOX_DIR="${SANDBOX_DIR:-${TMP_ROOT%/}/aew-sandbox}"
SANDBOX_DIR="${SANDBOX_DIR%/}"
HTTP_PORT="${SANDBOX_PORT:-3101}"
TELNET_PORT_SB="${SANDBOX_TELNET_PORT:-64228}"
SSH_PORT_SB="${SANDBOX_SSH_PORT:-31437}"
MARKER="$SANDBOX_DIR/.aew-sandbox"
LOG="$SANDBOX_DIR/backend.log"

fail() { echo "[FAIL] $*" >&2; exit 1; }

usage() { sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; }

# The sources of every `COPY <src>... /app/default-data/...` line in the
# Dockerfile, top-level paths only (data/amiga-roms/* lands in the ROM
# directory, not the board, and doors here run on AROS from the checkout).
seed_paths() {
  awk '/^COPY / && !/--from=/ && $NF ~ /^\/app\/default-data/ {
         for (i = 2; i < NF; i++) print $i
       }' "$ROOT/Dockerfile" | grep -v '/'
}

stop_sandbox() {
  local pids
  pids="$(lsof -ti tcp:"$HTTP_PORT" -sTCP:LISTEN 2>/dev/null)"
  if [ -n "$pids" ]; then
    # By port, never by name: other boards on this machine run the same tsx.
    kill $pids 2>/dev/null
    for _ in 1 2 3 4 5 6 7 8 9 10; do
      lsof -ti tcp:"$HTTP_PORT" -sTCP:LISTEN >/dev/null 2>&1 || break
      sleep 1
    done
    lsof -ti tcp:"$HTTP_PORT" -sTCP:LISTEN >/dev/null 2>&1 \
      && fail "port $HTTP_PORT is still held after stopping the sandbox"
  fi
  echo "[OK] sandbox stopped"
}

seed_sandbox() {
  if [ -e "$SANDBOX_DIR" ]; then
    # Only ever a directory this script made: a board directory is real data.
    [ -f "$MARKER" ] || fail "$SANDBOX_DIR exists and is not a sandbox (no .aew-sandbox marker). Set SANDBOX_DIR to another path."
    rm -rf "$SANDBOX_DIR"
  fi
  mkdir -p "$SANDBOX_DIR/bbs" "$SANDBOX_DIR/db" || fail "cannot create $SANDBOX_DIR"
  echo "sandbox board made by dev/scripts/sandbox-board.sh" > "$MARKER"

  local paths
  # A glob such as *.info goes to git as a :(glob) pathspec, so it matches
  # tracked top-level files only, as Docker's COPY does, and never what the
  # shell would find in the working tree.
  paths="$(seed_paths | sed 's/^\(.*\*.*\)$/:(glob)\1/' | tr '\n' ' ')"
  [ -n "$paths" ] || fail "no default-data COPY lines found in $ROOT/Dockerfile"
  echo "[INFO] seeding $SANDBOX_DIR/bbs from git HEAD $(git -C "$ROOT" rev-parse --short HEAD)"
  set -f
  # shellcheck disable=SC2086
  git -C "$ROOT" archive --format=tar HEAD -- $paths | tar -x -C "$SANDBOX_DIR/bbs" \
    || fail "git archive of the seed paths failed"
  set +f

  seed_doors

  (cd "$ROOT/web/backend" && npx tsx scripts/collapse-default-screens.ts "$SANDBOX_DIR/bbs" >/dev/null) \
    || fail "collapse-default-screens.ts failed on the sandbox"
  echo "[OK] seeded $(du -sh "$SANDBOX_DIR/bbs" | cut -f1)"
}

# The image takes Doors/ from its doors-builder stage (COPY --from=, which
# seed_paths skips), so it is seeded here the way that stage makes it: the
# tracked Doors/ with each door's committed dist/, door-manager compiled
# against the SDK, then the same entry check. A copy, never a link to the
# checkout's Doors/: doors write their own files and must not write there.
seed_doors() {
  git -C "$ROOT" archive --format=tar HEAD -- Doors | tar -x -C "$SANDBOX_DIR/bbs" \
    || fail "git archive of Doors/ failed"
  [ -d "$ROOT/sdk/dist" ] || fail "sdk/dist is missing: build the SDK first (cd sdk && npm run build)"
  # Dependencies and the SDK link, by the script the image entrypoint runs
  # (production install, as there).
  SETUP_TS_DOORS_TAG="  [Doors]" sh "$ROOT/web/backend/scripts/setup-ts-doors.sh" \
      "$SANDBOX_DIR/bbs/Doors" "$ROOT/sdk" > "$SANDBOX_DIR/setup-ts-doors.log" 2>&1 \
    || fail "setup-ts-doors.sh failed (see $SANDBOX_DIR/setup-ts-doors.log)"
  grep -a 'Warning' "$SANDBOX_DIR/setup-ts-doors.log" >&2
  (cd "$SANDBOX_DIR/bbs/Doors/door-manager" && "$ROOT/web/backend/node_modules/.bin/tsc") >/dev/null \
    || fail "door-manager did not compile in the sandbox"
  sh "$ROOT/docker/verify-door-entries.sh" "$SANDBOX_DIR/bbs/Doors" >/dev/null \
    || fail "a door in the sandbox has no entry file (docker/verify-door-entries.sh)"
}

start_sandbox() {
  local reset="$1"
  [ -f "$MARKER" ] || fail "no sandbox at $SANDBOX_DIR yet. Run: $0 fresh"
  for p in "$HTTP_PORT" "$TELNET_PORT_SB" "$SSH_PORT_SB"; do
    lsof -ti tcp:"$p" -sTCP:LISTEN >/dev/null 2>&1 \
      && fail "port $p is in use. Run '$0 stop', or set SANDBOX_PORT / SANDBOX_TELNET_PORT / SANDBOX_SSH_PORT."
  done

  local reset_env=()
  [ "$reset" -eq 1 ] && reset_env=(SYSOP_PASSWORD_RESET=1)

  echo "[INFO] starting sandbox backend (log: $LOG)"
  # PORT/TELNET_PORT/SSH_PORT/BBS_DATA_DIR/DATABASE_DIR are not in
  # web/backend/.env, so its dotenv override (database.ts) leaves them alone.
  (cd "$ROOT/web/backend" && exec env \
      BBS_DATA_DIR="$SANDBOX_DIR/bbs" \
      DATABASE_DIR="$SANDBOX_DIR/db" \
      PORT="$HTTP_PORT" TELNET_PORT="$TELNET_PORT_SB" SSH_PORT="$SSH_PORT_SB" \
      FTP_ENABLED=0 NODE_ENV=development \
      "${reset_env[@]}" \
      npx tsx src/index.ts) > "$LOG" 2>&1 &
  disown

  local i
  for i in $(seq 1 90); do
    if lsof -ti tcp:"$TELNET_PORT_SB" -sTCP:LISTEN >/dev/null 2>&1; then
      echo "[OK] sandbox up after ${i}s"
      show_status
      return 0
    fi
    sleep 1
  done
  tail -n 20 "$LOG" >&2
  fail "telnet port $TELNET_PORT_SB not listening after 90s"
}

show_status() {
  echo "  data:   $SANDBOX_DIR"
  echo "  web:    http://localhost:$HTTP_PORT/"
  echo "  telnet: telnet localhost $TELNET_PORT_SB"
  echo "  ssh:    ssh -p $SSH_PORT_SB <name>@localhost"
  if [ -f "$LOG" ]; then
    grep -aE '\[SETUP\] (Setup code|Sysop password reset code|Found|SYSOP_PASSWORD_RESET)' "$LOG" | sed 's/^/  /'
  fi
}

CMD="${1:-}"
case "$CMD" in
  fresh)
    stop_sandbox
    seed_sandbox
    start_sandbox 0
    ;;
  start)
    case "${2:-}" in
      --reset) start_sandbox 1 ;;
      "") start_sandbox 0 ;;
      *) echo "[ERROR] unknown argument: $2" >&2; exit 2 ;;
    esac
    ;;
  stop) stop_sandbox ;;
  status) show_status ;;
  -h|--help|"") usage ;;
  *) echo "[ERROR] unknown command: $CMD" >&2; usage; exit 2 ;;
esac
