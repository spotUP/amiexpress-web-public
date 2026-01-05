#!/bin/bash

echo "-> Killing all servers..."

# Kill zombie jest workers (these can pile up from interrupted tests)
JEST_COUNT=$(pgrep -f "jest-worker" | wc -l | tr -d ' ')
if [ "$JEST_COUNT" -gt 0 ]; then
  echo "-> Found $JEST_COUNT stuck jest workers, killing..."
  pkill -9 -f "jest-worker" 2>/dev/null
fi

# Kill old start-servers.sh instances (but not the current one)
OLD_SCRIPTS=$(pgrep -f "start-servers.sh" | grep -v $$ | wc -l | tr -d ' ')
if [ "$OLD_SCRIPTS" -gt 1 ]; then
  echo "-> Found $OLD_SCRIPTS old start-servers instances, cleaning..."
  pgrep -f "start-servers.sh" | grep -v $$ | xargs kill -9 2>/dev/null
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
