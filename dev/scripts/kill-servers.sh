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

# Helper: kill processes matching a pattern, but ONLY if their command line
# contains our project root. This prevents killing processes from other
# projects (e.g., DEViLBOX) that match the same generic patterns.
kill_project_procs() {
  local pattern="$1"
  local label="$2"
  local pids
  pids=$(pgrep -f "$pattern" 2>/dev/null | while read pid; do
    # Skip self and parent
    case "$SKIP_PIDS" in
      *" $pid "*) continue ;;
    esac
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
kill_project_procs "start-servers.sh" "old start-servers instances"
kill_project_procs "watch-doors.ts" "watch-doors processes"
kill_project_procs "tsx.*src/index.ts" "backend tsx processes"
kill_project_procs "dev/console/dist/src/index.js" "console TUI"
kill_project_procs "dev/console/dist/strip/strip.js" "status strip"
kill_project_procs "build-wasm" "build-wasm scripts"

# Tear down the tmux session that start-servers.sh creates (window 0 logs,
# window 1 shell, window 2 console TUI). If it doesn't exist, this is a
# silent no-op. Don't touch sessions for other projects.
if command -v tmux >/dev/null 2>&1 && tmux has-session -t amiexpress 2>/dev/null; then
  echo "-> Killing tmux session 'amiexpress'..."
  tmux kill-session -t amiexpress 2>/dev/null
fi

# Kill by port — only ports actually owned by AmiExpress-Web.
# Under the unified-deploy flow the frontends are built once and served by
# the backend from 3001; vite dev servers on 5173/5174/5175 are NOT spawned
# by start-servers.sh. Don't touch those ports — they may belong to other
# projects running on the dev machine.
lsof -ti:3001 | xargs kill -9 2>/dev/null  # Backend (HTTP + WebSocket)
lsof -ti:8080 | xargs kill -9 2>/dev/null  # SDK Preview backend

# Wait for ports to be free
sleep 2

# Verify
BACKEND=$(lsof -ti:3001 | wc -l | tr -d ' ')
PREVIEW=$(lsof -ti:8080 | wc -l | tr -d ' ')

if [ "$BACKEND" -eq 0 ] && [ "$PREVIEW" -eq 0 ]; then
  echo "[OK] All servers killed"
  exit 0
else
  echo "[ERROR] Some servers still running (backend: $BACKEND, preview: $PREVIEW)"
  exit 1
fi
