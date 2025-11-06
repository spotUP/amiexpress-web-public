#!/bin/bash

echo "→ Killing all servers..."

# Kill by port
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:5173 | xargs kill -9 2>/dev/null

# Wait for ports to be free
sleep 2

# Verify
BACKEND=$(lsof -ti:3001 | wc -l | tr -d ' ')
FRONTEND=$(lsof -ti:5173 | wc -l | tr -d ' ')

if [ "$BACKEND" -eq 0 ] && [ "$FRONTEND" -eq 0 ]; then
  echo "✓ All servers killed"
  exit 0
else
  echo "✗ Some servers still running (backend: $BACKEND, frontend: $FRONTEND)"
  exit 1
fi
