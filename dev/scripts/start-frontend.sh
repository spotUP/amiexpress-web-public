#!/bin/bash

# AmiExpress Frontend Startup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "→ Starting frontend server..."

# Kill any existing frontend
if lsof -ti:5173 >/dev/null 2>&1; then
    echo "  Killing existing frontend on port 5173..."
    lsof -ti:5173 | xargs kill -9 2>/dev/null
    sleep 2
fi

# Start frontend
cd "$PROJECT_ROOT/web/frontend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "  Installing frontend dependencies..."
    npm install > /dev/null 2>&1
fi
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start
sleep 3

# Verify frontend is running
if lsof -ti:5173 >/dev/null 2>&1; then
    echo "  ✓ Frontend started on port 5173 (PID: $FRONTEND_PID)"
else
    echo "  ✗ Frontend failed to start"
    echo "  Check logs: tail -f /tmp/frontend.log"
    exit 1
fi
