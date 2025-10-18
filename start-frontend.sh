#!/bin/bash

# AmiExpress Frontend Startup Script
# Ensures only ONE frontend server runs on port 5173

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Starting AmiExpress Frontend"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Kill all processes on port 5173
echo "→ Killing any existing servers on port 5173..."
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Wait for port to be free
echo "→ Waiting for port to be released..."
sleep 3

# Verify port is free
if lsof -ti:5173 >/dev/null 2>&1; then
    echo "✗ ERROR: Port 5173 is still in use!"
    echo "  Run: lsof -ti:5173 | xargs kill -9"
    exit 1
fi

# Change to frontend directory
cd "$(dirname "$0")/frontend"

# Start the server
echo "→ Starting frontend server on port 5173..."
npm run dev 2>&1 &

# Wait for server to start
sleep 4

# Verify server is running
if lsof -ti:5173 >/dev/null 2>&1; then
    # Count only node/vite processes (not browser connections)
    NODE_COUNT=$(lsof -ti:5173 | xargs ps -p | grep -c "node\|vite" || true)
    if curl -s http://localhost:5173/ | grep -q "<!doctype html"; then
        echo "✓ Frontend server started successfully"
        echo "  → Vite responding correctly"
        echo "  → Node processes on port: $NODE_COUNT"
    else
        echo "⚠ WARNING: Port 5173 occupied but server not responding correctly"
    fi
else
    echo "✗ ERROR: Server failed to start on port 5173"
    exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Frontend ready at http://localhost:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
