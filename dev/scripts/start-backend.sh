#!/bin/bash

# AmiExpress Backend Startup Script

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "→ Starting backend server..."

# Kill any existing backend (don't exit on error)
EXISTING_PIDS=$(lsof -ti:3001 2>/dev/null || true)
if [ -n "$EXISTING_PIDS" ]; then
    echo "  Killing existing backend on port 3001..."
    echo "$EXISTING_PIDS" | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Start backend
cd "$PROJECT_ROOT/web/backend" || { echo "  ✗ Failed to change to backend directory"; exit 1; }

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "  Installing backend dependencies..."
    npm install > /dev/null 2>&1
fi

# Start backend in background
npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start (longer timeout for slower systems)
echo "  Waiting for backend to start..."
for i in {1..15}; do
    sleep 1
    if lsof -ti:3001 >/dev/null 2>&1; then
        break
    fi
done

# Verify backend is running
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "  ✓ Backend started on port 3001 (PID: $BACKEND_PID)"
    echo "  ✓ Logs: tail -f /tmp/backend.log"
else
    echo "  ✗ Backend failed to start"
    echo "  ✗ Check logs: tail -f /tmp/backend.log"
    echo ""
    echo "Recent log output:"
    tail -20 /tmp/backend.log
    exit 1
fi
