#!/bin/bash

echo "-> Killing all servers..."

# Remove stale lockfile
rm -f /tmp/amiexpress-servers.lock

# Kill zombie jest workers (these can pile up from interrupted tests)
JEST_COUNT=$(pgrep -f "jest-worker" | wc -l | tr -d ' ')
if [ "$JEST_COUNT" -gt 0 ]; then
  echo "-> Found $JEST_COUNT stuck jest workers, killing..."
  pkill -9 -f "jest-worker" 2>/dev/null
fi

# Kill ALL start-servers.sh instances (including nested/forked ones)
# Use pkill to kill by name pattern, which catches all instances
OLD_SCRIPTS=$(pgrep -f "start-servers.sh" | wc -l | tr -d ' ')
if [ "$OLD_SCRIPTS" -gt 0 ]; then
  echo "-> Found $OLD_SCRIPTS old start-servers instances, cleaning..."
  pkill -9 -f "start-servers.sh" 2>/dev/null
fi

# Kill watch-doors processes (can leak if start-servers is interrupted)
WATCH_DOORS=$(pgrep -f "watch-doors.ts" | wc -l | tr -d ' ')
if [ "$WATCH_DOORS" -gt 0 ]; then
  echo "-> Found $WATCH_DOORS watch-doors processes, cleaning..."
  pkill -9 -f "watch-doors.ts" 2>/dev/null
fi

# Kill any remaining tsx/node processes running backend
TSX_BACKEND=$(pgrep -f "tsx.*src/index.ts" | wc -l | tr -d ' ')
if [ "$TSX_BACKEND" -gt 0 ]; then
  echo "-> Found $TSX_BACKEND backend tsx processes, cleaning..."
  pkill -9 -f "tsx.*src/index.ts" 2>/dev/null
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
