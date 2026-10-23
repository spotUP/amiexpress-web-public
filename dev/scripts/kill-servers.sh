#!/bin/bash

# Resolve project root (two levels up from this script)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "-> Killing AmiExpress servers (project: $PROJECT_ROOT)..."

# Remove stale lockfile
rm -f /tmp/amiexpress-servers.lock

# Don't kill our own process tree. When start-servers.sh invokes us, our
# parent PID ($PPID) is the start-servers.sh that just spawned us; killing
# it would terminate the script that's about to start fresh servers.
SELF_PID="$$"
PARENT_PID="${PPID:-0}"
SKIP_PIDS=" $SELF_PID $PARENT_PID "

# Detect if we're running inside the amiexpress tmux session (used to
# skip killing sibling panes and the session itself).
CURRENT_TMUX_SESSION=""
if [ -n "${TMUX:-}" ]; then
  CURRENT_TMUX_SESSION="$(tmux display-message -p '#S' 2>/dev/null)"
fi

# Helper: kill processes matching a pattern, but ONLY if their command line
# contains our project root. This prevents killing processes from other
# projects (e.g., DEViLBOX) that match the same generic patterns.
kill_project_procs() {
  local pattern="$1"
  local label="$2"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null | while read pid; do
    # Skip self and parent. Use POSIX parameter expansion instead of `case`
    # (case inside a subshell from $(... | while ...) trips macOS bash 3.2).
    # SKIP_PIDS has spaces around every pid (" 123 456 "); if " $pid " is
    # found anywhere, the %% strip changes the value.
    if [ "${SKIP_PIDS%% $pid *}" != "$SKIP_PIDS" ]; then
      continue
    fi
    # Check if this process belongs to our project
    if ps -p "$pid" -o args= 2>/dev/null | grep -q "$PROJECT_ROOT"; then
      echo "$pid"
    fi
  done)
  if [ -n "$pids" ]; then
    local count=$(echo "$pids" | wc -l | tr -d ' ')
    echo "-> Found $count $label, cleaning..."
    echo "$pids" | xargs kill -9 2>/dev/null
  fi
}

# Kill only OUR project's processes
kill_project_procs "jest-worker" "stuck jest workers"
kill_project_procs "watch-doors.ts" "watch-doors processes"
kill_project_procs "tsx.*src/index.ts" "backend tsx processes"
kill_project_procs "build-wasm" "build-wasm scripts"

# Only kill start-servers instances and console TUI / status strip when
# called from OUTSIDE the tmux session. When called from pane 0 during
# startup, start-servers.sh is our own parent and the TUI is a sibling pane.
if [ "$CURRENT_TMUX_SESSION" != "amiexpress" ]; then
  kill_project_procs "start-servers.sh" "old start-servers instances"
  kill_project_procs "dev/console/dist/src/index.js" "console TUI"
  kill_project_procs "dev/console/dist/strip/strip.js" "status strip"
fi

# Tear down the tmux session that start-servers.sh creates.
# Skip if we're running INSIDE the amiexpress tmux session (e.g., when
# start-servers.sh calls us from pane 0 during startup — killing the session
# we're inside would immediately terminate everything).
if command -v tmux >/dev/null 2>&1 && tmux has-session -t amiexpress 2>/dev/null; then
  if [ "$CURRENT_TMUX_SESSION" = "amiexpress" ]; then
    echo "-> Skipping tmux kill (running inside 'amiexpress' session)"
  else
    echo "-> Killing tmux session 'amiexpress'..."
    # Clean up global F-key bindings before killing the session
    tmux unbind-key -n F1 2>/dev/null
    tmux unbind-key -n F2 2>/dev/null
    tmux unbind-key -n F3 2>/dev/null
    tmux unbind-key -n F4 2>/dev/null
    tmux unbind-key -n F5 2>/dev/null
    tmux unbind-key -n F10 2>/dev/null
    tmux kill-session -t amiexpress 2>/dev/null
  fi
fi

# Kill by port - only processes of THIS checkout on its ports.
# Under the unified-deploy flow the frontends are built once and served by
# the backend from 3001; vite dev servers on 5173/5174/5175 are NOT spawned
# by start-servers.sh. Don't touch those ports — they may belong to other
# projects running on the dev machine.
# SDK preview port: one source, SDK_PREVIEW_PORT (default 8080).
PREVIEW_PORT="${SDK_PREVIEW_PORT:-8080}"

# Does this pid belong to THIS checkout? Its command line names the repo, or
# its working directory is inside it (tsx/node started with a relative path
# from web/backend shows only "src/index.ts" in args).
pid_is_ours() {
  local pid="$1" cwd
  if ps -p "$pid" -o args= 2>/dev/null | grep -qF "$PROJECT_ROOT"; then
    return 0
  fi
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p' | head -1)
  case "$cwd" in
    "$PROJECT_ROOT"|"$PROJECT_ROOT"/*) return 0 ;;
  esac
  return 1
}

# Pids listening on a port that belong to this checkout. A process from another
# checkout or another project on the same port is never touched.
project_pids_on_port() {
  local pid
  for pid in $(lsof -ti:"$1" 2>/dev/null); do
    if pid_is_ours "$pid"; then echo "$pid"; fi
  done
}

kill_project_port() {
  local port="$1" label="$2" pids
  pids=$(project_pids_on_port "$port")
  if [ -n "$pids" ]; then
    echo "-> Killing $label on port $port..."
    echo "$pids" | xargs kill -9 2>/dev/null
  fi
  # Something else holds the port: say so, do not kill it.
  if [ -n "$(lsof -ti:"$port" 2>/dev/null)" ] && [ -z "$(project_pids_on_port "$port")" ]; then
    echo "[INFO] Port $port is held by a process outside $PROJECT_ROOT - left alone"
  fi
}

kill_project_port 3001 "backend (HTTP + WebSocket)"
kill_project_port "$PREVIEW_PORT" "SDK preview backend"
# The Text-TV sidecar: a SEPARATE process the backend spawns (the TEXTTV door
# must not fetch from the process running it). A SIGKILLed backend cannot kill
# its own child, so the sidecar outlived every restart, kept port 3002, and
# each new board burned its restart budget failing to bind (2026-09-13).
kill_project_port 3002 "Text-TV sidecar"

# Wait for ports to be free
sleep 2

# Verify
BACKEND=$(project_pids_on_port 3001 | wc -l | tr -d ' ')
PREVIEW=$(project_pids_on_port "$PREVIEW_PORT" | wc -l | tr -d ' ')
SIDECAR=$(project_pids_on_port 3002 | wc -l | tr -d ' ')

if [ "$BACKEND" -eq 0 ] && [ "$PREVIEW" -eq 0 ] && [ "$SIDECAR" -eq 0 ]; then
  echo "[OK] All servers killed"
  exit 0
else
  echo "[ERROR] Some servers still running (backend: $BACKEND, preview: $PREVIEW, texttv sidecar: $SIDECAR)"
  exit 1
fi
