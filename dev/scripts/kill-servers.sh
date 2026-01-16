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

# Kill by port
lsof -ti:3001 | xargs kill -9 2>/dev/null  # Backend
lsof -ti:5173 | xargs kill -9 2>/dev/null  # BBS Frontend
lsof -ti:5174 | xargs kill -9 2>/dev/null  # BBS Frontend (alt port)
lsof -ti:5175 | xargs kill -9 2>/dev/null  # Config App
lsof -ti:8080 | xargs kill -9 2>/dev/null  # SDK Preview

# Wait for ports to be free
sleep 2

# Verify
BACKEND=$(lsof -ti:3001 | wc -l | tr -d ' ')
FRONTEND=$(lsof -ti:5173 | wc -l | tr -d ' ')
FRONTEND_ALT=$(lsof -ti:5174 | wc -l | tr -d ' ')
CONFIG=$(lsof -ti:5175 | wc -l | tr -d ' ')
PREVIEW=$(lsof -ti:8080 | wc -l | tr -d ' ')

if [ "$BACKEND" -eq 0 ] && [ "$FRONTEND" -eq 0 ] && [ "$FRONTEND_ALT" -eq 0 ] && [ "$CONFIG" -eq 0 ] && [ "$PREVIEW" -eq 0 ]; then
  echo "[OK] All servers killed"
  exit 0
else
  echo "[ERROR] Some servers still running (backend: $BACKEND, frontend: $FRONTEND/$FRONTEND_ALT, config: $CONFIG, preview: $PREVIEW)"
  exit 1
fi
