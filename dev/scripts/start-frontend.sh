#!/bin/bash

# AmiExpress Frontend Startup Script

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "→ Starting frontend server..."

# Kill any existing frontend (don't exit on error)
EXISTING_PIDS=$(lsof -ti:5173 2>/dev/null || true)
if [ -n "$EXISTING_PIDS" ]; then
    echo "  Killing existing frontend on port 5173..."
    echo "$EXISTING_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start frontend
cd "$PROJECT_ROOT/web/frontend" || { echo "  ✗ Failed to change to frontend directory"; exit 1; }

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "  Installing frontend dependencies..."
    npm install > /dev/null 2>&1
fi

# Start frontend in background
npm run dev > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

# Wait for frontend to start (longer timeout for slower systems)
echo "  Waiting for frontend to start..."
for i in {1..15}; do
    sleep 1
    if lsof -ti:5173 >/dev/null 2>&1; then
        break
    fi
done

# Verify frontend is running
if lsof -ti:5173 >/dev/null 2>&1; then
    echo "  ✓ Frontend started on port 5173 (PID: $FRONTEND_PID)"
    echo "  ✓ Logs: tail -f /tmp/frontend.log"
else
    echo "  ✗ Frontend failed to start"
    echo "  ✗ Check logs: tail -f /tmp/frontend.log"
    echo ""
    echo "Recent log output:"
    tail -20 /tmp/frontend.log
    exit 1
fi
