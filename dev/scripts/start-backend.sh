#!/bin/bash

# AmiExpress Backend Startup Script

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "→ Starting backend server..."

# Kill any existing backend
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "  Killing existing backend on port 3001..."
    lsof -ti:3001 | xargs kill -9 2>/dev/null
    sleep 2
fi

# Start backend
cd "$PROJECT_ROOT/web/backend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "  Installing backend dependencies..."
    npm install > /dev/null 2>&1
fi
npm run dev > /tmp/backend.log 2>&1 &
BACKEND_PID=$!

# Wait for backend to start
sleep 3

# Verify backend is running
if lsof -ti:3001 >/dev/null 2>&1; then
    echo "  ✓ Backend started on port 3001 (PID: $BACKEND_PID)"
else
    echo "  ✗ Backend failed to start"
    echo "  Check logs: tail -f /tmp/backend.log"
    exit 1
fi
